import * as XLSX from 'xlsx';
import { createHash } from 'node:crypto';
import { normalizeHeader, parseShipmentDate, validShipmentDate } from './format';
import { normalizeCode } from '@/lib/search/normalize';
import type { ImportItem, ImportPreview, ImportWarning, PreviewRow } from './types';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10000;
export const MAX_IMPORT_PRODUCTS = 5000;
const MAX_SHEET_ROWS = MAX_IMPORT_ROWS + 100;
const MAX_COLUMNS = 100;
const MAX_BOXES = 2147483647;

const aliases: Record<keyof ImportItem, string[]> = {
  supplier: ['PROVEEDOR MARCA', 'PROVEEDOR', 'MARCA', 'PROVEEDOR O MARCA'],
  code_original: ['CODIGO', 'COD', 'CODIGO PRODUCTO', 'CODIGO DE PRODUCTO', 'CODIGO ORIGINAL'],
  product_name: ['PRODUCTO', 'NOMBRE PRODUCTO', 'NOMBRE DEL PRODUCTO', 'DESCRIPCION', 'DESCRIPCION DEL PRODUCTO'],
  expected_boxes: ['CAJAS ENVIADAS', 'CAJAS ENVIADA', 'CAJA ENVIADA', 'CJS ENVIADAS'],
};
const ignoredHeaders = new Set(['CAJAS DISTRIBUIDAS', 'CAJAS PENDIENTES', 'CAJAS RECIBIDAS', 'NO LLEGO']);
const summaryLabels = new Set([
  'NUMERO DE CAJAS', 'SUMA AUTOMATICA', 'TOTAL', 'TOTAL CAJAS', 'CAJAS SUMA',
  'CONTADAS Y ENVIADAS', 'CONTADAS Y RECIBIDAS', 'ALMACEN CENTRAL',
]);
type Header = { row: number; columns: Partial<Record<keyof ImportItem, number>>; names: string[]; ambiguous: boolean };

function text(cell?: XLSX.CellObject): string {
  if (!cell || cell.t === 'e') return '';
  // Displayed text preserves number formats such as 000000, and CSV is read with raw:true.
  return cell.w ?? String(cell.v ?? '');
}
function cellAt(sheet: XLSX.WorkSheet, row: number, column: number) {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined;
}

function rangeOf(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1');
  if (range.e.r >= MAX_SHEET_ROWS || range.e.c >= MAX_COLUMNS) {
    throw new Error('La hoja supera 10 000 filas de datos o 100 columnas. Divide el archivo antes de importar.');
  }
  return range;
}

function findHeader(sheet: XLSX.WorkSheet): Header | null {
  const range = rangeOf(sheet);
  for (let row = range.s.r; row <= Math.min(range.e.r, 79); row++) {
    const names = Array.from({ length: range.e.c + 1 }, (_, column) => text(cellAt(sheet, row, column)));
    const columns: Header['columns'] = {};
    let ambiguous = false;
    names.forEach((name, column) => {
      const header = normalizeHeader(name);
      for (const field of Object.keys(aliases) as (keyof ImportItem)[]) {
        if (aliases[field].includes(header)) {
          if (columns[field] !== undefined) ambiguous = true;
          columns[field] = column;
        }
      }
    });
    if (columns.code_original !== undefined && columns.product_name !== undefined && columns.expected_boxes !== undefined) {
      return { row, columns, names, ambiguous };
    }
  }
  return null;
}

function readQuantity(cell?: XLSX.CellObject): number | null {
  if (!cell || cell.t === 'e' || cell.v === undefined || cell.v === null || cell.v === '') return null;
  if (typeof cell.v === 'string' && !/^\d+$/.test(cell.v.trim())) return null;
  if (typeof cell.v !== 'number' && typeof cell.v !== 'string') return null;
  const quantity = Number(cell.v);
  return Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= MAX_BOXES ? quantity : null;
}

export function parseShipmentFile(bytes: Uint8Array, fileName: string, selectedSheet?: string): ImportPreview {
  if (!/\.(xlsx|xls|csv)$/i.test(fileName) || fileName.length > 255) throw new Error('Selecciona un archivo .xlsx, .xls o .csv. No se acepta PDF.');
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('El archivo debe contener datos y pesar como máximo 5 MB.');
  const extension = fileName.split('.').pop()!.toLowerCase();
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if ((extension === 'xlsx' && !isZip) || (extension === 'xls' && !isOle && !isZip)) throw new Error('El contenido no coincide con un archivo Excel válido.');
  if (extension === 'csv' && (isZip || isOle || Buffer.from(bytes.subarray(0, 4)).toString() === '%PDF')) throw new Error('El archivo no contiene CSV válido.');
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: 'array', raw: true, cellText: true, cellDates: false,
      cellFormula: true, sheetRows: MAX_SHEET_ROWS + 1 });
  } catch { throw new Error('No se pudo leer el archivo. Revisa que sea válido y no tenga contraseña.'); }
  if (workbook.SheetNames.length > 20) throw new Error('El archivo supera el límite de 20 hojas.');
  const sheets = workbook.SheetNames.map(name => ({ name, importable: Boolean(findHeader(workbook.Sheets[name])) }));
  const sheetName = selectedSheet || sheets.find(sheet => sheet.importable)?.name;
  if (!sheetName || !workbook.Sheets[sheetName]) throw new Error('No se encontraron CÓDIGO, PRODUCTO y CAJAS ENVIADAS en las primeras 80 filas.');
  const sheet = workbook.Sheets[sheetName];
  const header = findHeader(sheet);
  if (!header) throw new Error('Esta hoja no contiene CÓDIGO, PRODUCTO y CAJAS ENVIADAS.');
  if (header.ambiguous) throw new Error('Hay varias columnas para un mismo campo. Deja una sola columna de código, producto, proveedor y cajas enviadas.');
  const range = rangeOf(sheet);
  const warnings = new Map<string, ImportWarning>();
  const errors: string[] = [];
  function warn(code: string, message: string, row?: number) {
    const warning = warnings.get(code) ?? { code, message, count: 0, rows: [] };
    warning.count++;
    if (row && warning.rows.length < 30) warning.rows.push(row);
    warnings.set(code, warning);
  }
  if (sheets.length > 1) warn('sheets', `Se importará únicamente la hoja «${sheetName}». Las otras hojas no se mezclan.`);
  if (header.columns.supplier === undefined) warn('supplier_column', 'No se encontró una columna de proveedor/marca; se guardará vacía.');
  const recognized = new Set(Object.values(header.columns));
  header.names.forEach((name, index) => {
    if (name.trim() && !recognized.has(index) && !ignoredHeaders.has(normalizeHeader(name))) {
      warn('unknown_columns', `Columnas no reconocidas: ${header.names.filter((n, c) => n.trim() && !recognized.has(c) && !ignoredHeaders.has(normalizeHeader(n))).join(', ')}. Se omiten.`);
    }
  });
  if (header.names.some(name => ignoredHeaders.has(normalizeHeader(name)))) warn('ignored_columns', 'Distribuidas, pendientes, recibidas y NO LLEGÓ se omiten. La nueva recepción comienza en 0.');

  const dates = new Set<string>();
  let detectedDestination: string | null = null;
  for (let row = range.s.r; row < header.row; row++) {
    const cells = Array.from({ length: range.e.c + 1 }, (_, c) => cellAt(sheet, row, c));
    const values = cells.map(text);
    const rowText = values.join(' ');
    if (/\bFECHA\b/.test(normalizeHeader(rowText))) {
      const date = parseShipmentDate(rowText);
      if (date) dates.add(date);
      else {
        const label = values.findIndex(value => /\bFECHA\b/.test(normalizeHeader(value)));
        const dateCell = cells.slice(label + 1).find(cell => cell?.t === 'n' && typeof cell.v === 'number');
        if (dateCell) {
          const parsed = XLSX.SSF.parse_date_code(Number(dateCell.v), { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) });
          if (parsed) {
            const candidate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
            if (validShipmentDate(candidate)) dates.add(candidate);
          }
        }
      }
    }
    values.forEach((value, column) => {
      if (/^(DESTINO|SUCURSAL)(\s|:|$)/.test(normalizeHeader(value))) {
        const destination = value.replace(/^\s*(destino|sucursal)\s*:?\s*/i, '').trim() || values.slice(column + 1).find(v => v.trim())?.trim();
        if (destination) detectedDestination = destination;
      }
    });
  }
  if (!dates.size) warn('date', 'No se detectó una fecha de envío. Ingresa la fecha antes de confirmar.');
  if (dates.size > 1) warn('date', 'Se detectaron varias fechas; selecciona la fecha correcta del envío.');

  const groups = new Map<string, PreviewRow>();
  const rejected: PreviewRow[] = [];
  let rowsDetected = 0;
  for (let row = header.row + 1; row <= range.e.r; row++) {
    const read = (field: keyof ImportItem) => header.columns[field] === undefined ? undefined : cellAt(sheet, row, header.columns[field]!);
    const supplier = text(read('supplier'));
    const code = text(read('code_original'));
    const product = text(read('product_name'));
    const quantityCell = read('expected_boxes');
    const rowLabels = Array.from({ length: range.e.c + 1 }, (_, column) => normalizeHeader(text(cellAt(sheet, row, column))));
    // City Ofertas places auxiliary tables below this marker, even with product-like rows.
    if (/\bNUMERO DE CAJAS SUMA AUTOMATICA\b/.test(rowLabels.join(' '))) {
      warn('footer', 'Fila resumen omitida. Desde esta fila se omiten el footer y sus tablas auxiliares.', row + 1);
      break;
    }
    // A supplier/product may legitimately have a similar name. Other labels only omit
    // summary-shaped rows; they never end the detail or discard an identified product.
    const codeLabel = normalizeHeader(code);
    const productLabel = normalizeHeader(product);
    if ((!code.trim() && /^(SUBTOTAL|TOTAL|TOTALES)(\s|$)/.test(normalizeHeader(product || supplier)))
      || ((!code.trim() || summaryLabels.has(codeLabel)) && (!product.trim() || summaryLabels.has(productLabel))
        && rowLabels.some(label => summaryLabels.has(label)))) {
      warn('summary', 'Fila resumen omitida.', row + 1);
      continue;
    }
    if (!code.trim() && !product.trim() && (quantityCell?.v === undefined || quantityCell.v === '')) continue;
    if (aliases.code_original.includes(normalizeHeader(code)) && aliases.product_name.includes(normalizeHeader(product))
      && aliases.expected_boxes.includes(normalizeHeader(text(quantityCell)))) continue;
    rowsDetected++;
    if (rowsDetected > MAX_IMPORT_ROWS) throw new Error('Se permiten como máximo 10 000 filas de datos por importación.');
    const quantity = readQuantity(quantityCell);
    const previewRow: PreviewRow = { supplier, code_original: code, product_name: product, expected_boxes: quantity ?? 0,
      sourceRows: [row + 1], validation: 'ready', messages: [] };
    if (quantity === 0) {
      warn('zero', 'Filas con CAJAS ENVIADAS = 0 omitidas.', row + 1);
      previewRow.validation = 'omitted'; previewRow.messages.push('No se importa: 0 cajas'); rejected.push(previewRow); continue;
    }
    if (quantity === null) previewRow.messages.push('CAJAS ENVIADAS debe ser un entero válido mayor que 0');
    if (!product.trim()) { previewRow.messages.push('Producto sin nombre'); warn('missing_name', 'Productos sin nombre: corrige el archivo antes de confirmar.', row + 1); }
    if (code.length > 120 || supplier.length > 200 || product.length > 500) previewRow.messages.push('Texto demasiado largo (código 120, proveedor 200, producto 500 caracteres)');
    if (previewRow.messages.length) {
      previewRow.validation = 'error'; rejected.push(previewRow);
      if (errors.length < 30) errors.push(`Fila ${row + 1}: ${previewRow.messages.join('. ')}.`);
      continue;
    }
    if (!code.trim()) { warn('empty_code', 'Códigos vacíos: se conservan y se reciben mediante búsqueda por producto.', row + 1); previewRow.messages.push('Código vacío'); }
    if (code.trim() === '000000') { warn('placeholder_code', 'Códigos 000000: los productos diferentes se conservan separados.', row + 1); previewRow.messages.push('Código 000000'); }
    if (quantityCell?.f) { warn('formulas', 'Cantidades con fórmulas: se usa el valor guardado por Excel. Revisa las cantidades en la vista previa.', row + 1); previewRow.messages.push('Cantidad calculada en Excel'); }
    const key = JSON.stringify([supplier, code, product]);
    const existing = groups.get(key);
    if (existing) {
      existing.expected_boxes += quantity!;
      existing.sourceRows.push(row + 1);
      existing.validation = 'warning';
      if (!existing.messages.includes('Filas idénticas agrupadas')) existing.messages.push('Filas idénticas agrupadas');
      warn('grouped', 'Filas idénticas agrupadas por proveedor + código + producto, solo en esta hoja.', row + 1);
    } else {
      previewRow.validation = previewRow.messages.length ? 'warning' : 'ready'; groups.set(key, previewRow);
    }
  }
  const readyRows = [...groups.values()];
  const byCode = new Map<string, PreviewRow[]>();
  for (const row of readyRows) {
    const normalized = normalizeCode(row.code_original);
    const sameCode = byCode.get(normalized) ?? []; sameCode.push(row); byCode.set(normalized, sameCode);
  }
  for (const [code, duplicates] of byCode) {
    if (duplicates.length < 2 || !code.trim()) continue;
    warn('duplicate_code', 'Códigos repetidos en productos/proveedores diferentes: no se unen; el escáner pedirá elegir el producto.');
    for (const row of duplicates) { row.validation = 'warning'; row.messages.push('Código compartido: producto separado'); }
  }
  const items: ImportItem[] = readyRows.map(({ supplier, code_original, product_name, expected_boxes }) => ({ supplier, code_original, product_name, expected_boxes }));
  const totalBoxes = items.reduce((sum, item) => sum + item.expected_boxes, 0);
  if (!items.length) errors.push('No hay productos con cajas enviadas mayores que 0.');
  if (items.length > MAX_IMPORT_PRODUCTS) errors.push('Se permiten como máximo 5000 productos por envío.');
  if (!Number.isSafeInteger(totalBoxes) || totalBoxes > MAX_BOXES) errors.push('El total de cajas supera el límite del sistema.');
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  const fingerprint = createHash('sha256').update(JSON.stringify({ fileHash, sheetName, items })).digest('hex');
  return { fileName, fileHash, fingerprint, sheetName, sheets, headerRow: header.row + 1,
    columns: Object.entries(header.columns).map(([field, column]) => ({ field, header: header.names[column!] })),
    detectedDate: dates.size === 1 ? [...dates][0] : null, detectedDestination, rowsDetected,
    productCount: items.length, totalBoxes, warnings: [...warnings.values()], errors,
    rows: [...readyRows, ...rejected].sort((a, b) => a.sourceRows[0] - b.sourceRows[0]), items };
}
