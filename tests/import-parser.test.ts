import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseShipmentFile } from '../src/features/shipments/import/parser';
import { normalizeHeader, parseShipmentDate, suggestShipmentNumber } from '../src/features/shipments/import/format';

const headers = ['PROVEEDOR/MARCA', 'CÓDIGO', 'PRODUCTO', 'CAJAS DISTRIBUIDAS', 'CAJAS ENVIADAS', 'CAJAS RECIBIDAS'];
function excel(rows: unknown[][], bookType: 'xlsx' | 'biff8' = 'xlsx') {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['FECHA DE ENVÍO: martes, 6 de octubre de 2026'], ['DESTINO: CHIMBOTE'], headers, ...rows]);
  XLSX.utils.book_append_sheet(book, sheet, 'Envío');
  return XLSX.write(book, { type: 'buffer', bookType });
}

test('encabezados con tildes, saltos, espacios y prioridad de CAJAS ENVIADAS', () => {
  assert.equal(normalizeHeader('  CaJaS\n Enviádas  '), 'CAJAS ENVIADAS');
  const preview = parseShipmentFile(excel([['Marca', 'KD-5238', 'Producto', 99, 7, 30]]), 'envio.xlsx');
  assert.equal(preview.totalBoxes, 7);
  assert.equal(preview.detectedDate, '2026-10-06');
  assert.equal(preview.detectedDestination, 'CHIMBOTE');
  assert.equal(preview.errors.length, 0);
  assert.ok(preview.warnings.some(w => w.code === 'ignored_columns'));
  assert.equal(suggestShipmentNumber('Chimbote', '2026-10-14'), 'CHIMBOTE-20261014');
  const repeated = parseShipmentFile(excel([headers, ['A', 'CODIGO', 'PRODUCTO', 9, 2, 0]]), 'encabezados.xlsx');
  assert.equal(repeated.rowsDetected, 1);
  assert.equal(repeated.totalBoxes, 2);
});

test('dos archivos independientes no comparten agrupación; filas idénticas se suman solo en cada archivo', () => {
  const first = parseShipmentFile(excel([['A', 'KD-5238', 'Producto', 10, 2, 0], ['A', 'KD-5238', 'Producto', 20, 3, 0]]), '06.xlsx');
  const second = parseShipmentFile(excel([['A', 'KD-5238', 'Producto', 1, 9, 0]]), '14.xlsx');
  assert.equal(first.productCount, 1); assert.equal(first.totalBoxes, 5);
  assert.equal(second.totalBoxes, 9); assert.equal(first.totalBoxes, 5);
  assert.deepEqual(first.rows[0].sourceRows, [4, 5]);
});

test('000000 en diez productos, código compartido con otro proveedor y códigos vacíos se conservan', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ['A', '000000', `Producto ${i}`, 1, 1, 0]);
  rows.push(['B', '000000', 'Producto 0', 1, 2, 0], ['A', '', 'Sin código', 1, 3, 0]);
  const preview = parseShipmentFile(excel(rows), 'duplicados.xlsx');
  assert.equal(preview.productCount, 12); assert.equal(preview.totalBoxes, 15);
  assert.ok(preview.warnings.some(w => w.code === 'duplicate_code'));
  assert.ok(preview.warnings.some(w => w.code === 'placeholder_code'));
  assert.ok(preview.warnings.some(w => w.code === 'empty_code'));
});

test('código original conserva formato numérico, espacios y ceros iniciales', () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ['A', 123, 'Producto', 0, 4, 0], ['A', ' kd-5238 ', 'Otro', 0, 2, 0]]);
  sheet.B2.z = '000000';
  XLSX.utils.book_append_sheet(book, sheet, 'Datos');
  const preview = parseShipmentFile(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'ceros.xlsx');
  assert.equal(preview.items[0].code_original, '000123');
  assert.equal(preview.items[1].code_original, ' kd-5238 ');
});

test('cajas 0 se omiten; fracciones, negativos, nombres ausentes y fórmulas sin valor bloquean', () => {
  const preview = parseShipmentFile(excel([['A', 'ZERO', '', 0, 0, 0], ['A', 'BAD', 'Fracción', 1, 1.5, 0], ['A', 'NEG', 'Negativo', 1, -1, 0], ['A', 'EMPTY', '', 1, 2, 0], ['A', 'OK', 'Válido', 1, 3, 0]]), 'errores.xlsx');
  assert.equal(preview.productCount, 1); assert.equal(preview.totalBoxes, 3);
  assert.equal(preview.rows.filter(r => r.validation === 'error').length, 3);
  assert.equal(preview.rows.filter(r => r.validation === 'omitted').length, 1);
  assert.equal(preview.errors.length, 3);
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ['A', 'X', 'Fórmula', 1]]);
  sheet.E2 = { t: 'n', f: 'SUM(A1:A5)' };
  XLSX.utils.book_append_sheet(book, sheet, 'Datos');
  assert.ok(parseShipmentFile(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'formula.xlsx').errors.length);
});

test('CSV preserva códigos de texto y XLS real se lee', () => {
  const csv = '\uFEFFproveedor/marca;código;producto;cajas enviadas\r\nMarca;0000123;Producto;5\r\nMarca;000000;Otro;2';
  const preview = parseShipmentFile(Buffer.from(csv), 'archivo.csv');
  assert.equal(preview.items[0].code_original, '0000123'); assert.equal(preview.totalBoxes, 7);
  assert.equal(parseShipmentFile(excel([['A', '000000', 'XLS', 2, 4, 0]], 'biff8'), 'archivo.xls').totalBoxes, 4);
});

test('fechas de texto, numéricas y calendario inválido', () => {
  assert.equal(parseShipmentDate('FECHA DE ENVÍO: martes, 6 de octubre de 2026'), '2026-10-06');
  assert.equal(parseShipmentDate('14/10/2026'), '2026-10-14');
  assert.equal(parseShipmentDate('2026-10-14'), '2026-10-14');
  assert.equal(parseShipmentDate('31 de febrero de 2026'), null);
  const book = XLSX.utils.book_new();
  // Excel almacena días de calendario, sin zona horaria. No usar Date local en la fixture.
  const serial = (Date.UTC(2026, 9, 14) - Date.UTC(1899, 11, 30)) / 86_400_000;
  const sheet = XLSX.utils.aoa_to_sheet([['FECHA DE ENVÍO', serial], headers, ['A', 'X', 'Producto', 1, 1, 0]]);
  sheet.B1.z = 'dd/mm/yyyy';
  XLSX.utils.book_append_sheet(book, sheet, 'Datos');
  assert.equal(parseShipmentFile(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'fecha.xlsx').detectedDate, '2026-10-14');
  book.Workbook = { WBProps: { date1904: true } };
  sheet.B1.v = serial - 1462;
  assert.equal(parseShipmentFile(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'fecha-1904.xlsx').detectedDate, '2026-10-14');
});

test('hojas se eligen sin mezclar; columnas desconocidas se advierten', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Título sin mercadería']]), 'Portada');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[...headers, 'OBSERVACIONES INTERNAS'], ['A', 'KD', 'Primero', 1, 3, 0, 'nota']]), 'Primero');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ['A', 'KD', 'Segundo', 1, 8, 0]]), 'Segundo');
  const bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  const first = parseShipmentFile(bytes, 'varias.xlsx');
  assert.equal(first.totalBoxes, 3); assert.ok(first.warnings.some(w => w.code === 'unknown_columns'));
  assert.equal(parseShipmentFile(bytes, 'varias.xlsx', 'Segundo').totalBoxes, 8);
  assert.throws(() => parseShipmentFile(bytes, 'varias.xlsx', 'Portada'), /CAJAS ENVIADAS/);
});

test('no se acepta PDF, columnas enviadas ausentes o ambiguas ni filas truncadas', () => {
  assert.throws(() => parseShipmentFile(Buffer.from('%PDF'), 'archivo.pdf'), /PDF/);
  assert.throws(() => parseShipmentFile(Buffer.from('%PDF'), 'archivo.xlsx'), /Excel válido/);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['CÓDIGO', 'PRODUCTO', 'CAJAS DISTRIBUIDAS'], ['X', 'P', 1]]), 'Datos');
  assert.throws(() => parseShipmentFile(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'archivo.xlsx'), /CAJAS ENVIADAS/);
  book.Sheets.Datos = XLSX.utils.aoa_to_sheet([['CÓDIGO', 'PRODUCTO', 'CAJAS ENVIADAS', 'CAJAS\nENVIADAS'], ['X', 'P', 1, 2]]);
  assert.throws(() => parseShipmentFile(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'archivo.xlsx'), /varias columnas/);
  book.Sheets.Datos = XLSX.utils.aoa_to_sheet([headers]);
  book.Sheets.Datos.A11000 = { t: 's', v: 'Fuera de límite' }; book.Sheets.Datos['!ref'] = 'A1:F11000';
  assert.throws(() => parseShipmentFile(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'grande.xlsx'), /supera/);
});

const cityDetail = [
  ['Marca', 'KD-5238', 'Producto KD-5238', 99, 2, 0],
  ['Marca', 'EP-8045', 'Producto EP-8045', 99, 1, 0],
  ['Marca', '02ORLV118', 'Producto 02ORLV118', 99, 3, 0],
  ['Marca', '02ORAM004', 'Producto 02ORAM004', 99, 2, 0],
  ['Marca', '000000', 'LIMPIATODO 1LT', 99, 4, 0],
  ['Marca', '000000', 'JABON LIQUIDO 1LT', 99, 2, 0],
  ['Marca', '02ORLT101', 'Producto 02ORLT101', 99, 2, 0],
  ['Marca', 'TEST-000', 'Prueba cero', 99, 0, 0],
];

test('footer NÚMERO DE CAJAS (Suma automática): siete productos y 16 cajas sin error de nombre', () => {
  for (const label of ['NÚMERO DE CAJAS (Suma automática)', '  número   de\n cajas (suma   AUTOMÁTICA)  ', 'NUMERO DE CAJAS (SUMA AUTOMATICA)']) {
    const preview = parseShipmentFile(excel([...cityDetail, [label, '', '', 99, 16, 0]]), 'city.xlsx');
    assert.equal(preview.productCount, 7); assert.equal(preview.totalBoxes, 16);
    assert.equal(preview.rowsDetected, 8);
    assert.deepEqual(preview.items.map(item => [item.code_original, item.expected_boxes]), [
      ['KD-5238', 2], ['EP-8045', 1], ['02ORLV118', 3], ['02ORAM004', 2], ['000000', 4], ['000000', 2], ['02ORLT101', 2],
    ]);
    assert.deepEqual(preview.items.filter(item => item.code_original === '000000').map(item => item.product_name), ['LIMPIATODO 1LT', 'JABON LIQUIDO 1LT']);
    assert.deepEqual(preview.errors, []);
    assert.ok(!preview.warnings.some(warning => warning.code === 'missing_name'));
    assert.ok(preview.warnings.some(warning => warning.code === 'footer' && warning.message.includes('Fila resumen omitida')));
    assert.equal(preview.rows.find(row => row.code_original === 'TEST-000')?.validation, 'omitted');
    assert.ok(!preview.rows.some(row => row.supplier.includes('NÚMERO DE CAJAS')));
  }
});

test('tablas debajo del footer nunca se importan, aunque tengan código/nombre/cajas válidos', () => {
  const preview = parseShipmentFile(excel([...cityDetail,
    ['NÚMERO DE CAJAS (Suma automática)', '', '', 0, 16, 0],
    ['Proveedor resumen', 'AUX-001', 'Resumen que parece producto', 0, 500, 0],
    headers,
    ['ALMACÉN CENTRAL', '', '', 0, 16, 0],
    ['Observaciones', 'AUX-002', '', 0, 'cantidad inválida', 0],
  ]), 'tablas.xlsx');
  assert.equal(preview.productCount, 7); assert.equal(preview.totalBoxes, 16);
  assert.deepEqual(preview.errors, []);
  assert.ok(!preview.items.some(item => item.code_original.startsWith('AUX')));
});

test('sin marcador footer conserva todo el detalle, fecha, cantidades y filas cero', () => {
  const preview = parseShipmentFile(excel(cityDetail), 'sin-footer.xlsx');
  assert.equal(preview.productCount, 7); assert.equal(preview.totalBoxes, 16);
  assert.equal(preview.detectedDate, '2026-10-06');
  assert.equal(preview.detectedDestination, 'CHIMBOTE');
  assert.deepEqual(preview.errors, []);
  assert.ok(!preview.warnings.some(warning => warning.code === 'footer'));
});

test('total con fórmula, con y sin resultado guardado, se omite antes de validar cantidad/nombre', () => {
  for (const label of ['NÚMERO DE CAJAS (Suma automática)', 'TOTAL CAJAS']) {
    for (const cached of [true, false]) {
      const book = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...cityDetail, [label, '', '', 0]]);
      sheet.E10 = cached ? { t: 'n', f: 'SUM(E2:E9)', v: 16 } : { t: 'n', f: 'SUM(E2:E9)' };
      XLSX.utils.book_append_sheet(book, sheet, 'Datos');
      const preview = parseShipmentFile(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'total-formula.xlsx');
      assert.equal(preview.productCount, 7); assert.equal(preview.totalBoxes, 16);
      assert.deepEqual(preview.errors, []);
      assert.ok(!preview.warnings.some(warning => warning.code === 'missing_name' || warning.code === 'formulas'));
    }
  }
});

test('marcadores de resumen normalizados se omiten sin cortar productos posteriores', () => {
  for (const marker of ['NÚMERO DE CAJAS', 'NUMERO DE CAJAS', 'SUMA AUTOMÁTICA', 'SUMA AUTOMATICA', 'TOTAL', 'TOTAL CAJAS', 'CAJAS(SUMA)', 'CAJAS (SUMA)', 'CONTADAS Y ENVIADAS', 'CONTADAS Y RECIBIDAS', 'ALMACÉN CENTRAL', 'ALMACEN CENTRAL']) {
    const preview = parseShipmentFile(excel([
      ['Marca', 'ANTES', 'Producto antes', 0, 2, 0],
      [marker.toLowerCase().replace(/ /g, '  '), '', '', 0, 99, 0],
      ['Marca', 'DESPUES', 'Producto después', 0, 3, 0],
    ]), 'marcadores.xlsx');
    assert.equal(preview.productCount, 2, marker); assert.equal(preview.totalBoxes, 5, marker);
    assert.deepEqual(preview.errors, [], marker);
    assert.ok(preview.warnings.some(warning => warning.code === 'summary'), marker);
  }
});

test('nombres de proveedor/producto similares y códigos vacíos legítimos siguen siendo productos', () => {
  const preview = parseShipmentFile(excel([
    ['ALMACÉN CENTRAL', 'REAL-001', 'TOTAL CAJAS', 0, 2, 0],
    ['ALMACÉN CENTRAL', '', 'Producto sin código válido', 0, 3, 0],
    ['Marca', 'REAL-002', 'CAJAS (SUMA)', 0, 4, 0],
  ]), 'productos-reales.xlsx');
  assert.equal(preview.productCount, 3); assert.equal(preview.totalBoxes, 9);
  assert.deepEqual(preview.errors, []);
});

test('una fila real sin nombre antes del footer sigue bloqueando la importación', () => {
  const preview = parseShipmentFile(excel([
    ['Marca', 'SIN-NOMBRE', '', 0, 2, 0],
    ...cityDetail,
    ['NÚMERO DE CAJAS (Suma automática)', '', '', 0, 18, 0],
  ]), 'error-real.xlsx');
  assert.ok(preview.errors.some(error => error.includes('Producto sin nombre')));
  assert.equal(preview.rows.filter(row => row.validation === 'error').length, 1);
});
