// ============================================================
// CITY RECEPCIÓN - Generador de Reporte PDF Profesional
// Compatible con Next.js 16 (Turbopack) y Vercel Serverless
// ============================================================
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Shipment, ShipmentItem, ShipmentStats, Incident } from '@/types';
import { formatDate, getItemStatusLabel, getShipmentStatusLabel } from '@/lib/utils';

export interface ReportData {
  shipment: Shipment;
  items: ShipmentItem[];
  stats: ShipmentStats;
  incidents: Incident[];
  generatedAt: string;
}

type RGB = [number, number, number];

const COLOR_SLATE_TEXT: RGB = [71, 85, 105];
const COLOR_DARK_TEXT: RGB = [15, 23, 42];
const COLOR_WHITE_TEXT: RGB = [255, 255, 255];
const COLOR_RED_TEXT: RGB = [185, 28, 28];
const COLOR_PURPLE_TEXT: RGB = [126, 34, 206];

const BG_DARK_HEADER: RGB = [15, 23, 42];
const BG_NAVY_HEADER: RGB = [30, 41, 59];
const BG_RED_HEADER: RGB = [220, 38, 38];
const BG_PURPLE_HEADER: RGB = [126, 34, 206];
const BG_AMBER_HEADER: RGB = [217, 119, 6];
const BG_ALTERNATE_ROW: RGB = [248, 250, 252];

export function generateShipmentPdf(data: ReportData): Uint8Array {
  const { shipment, items, stats, incidents, generatedAt } = data;
  const isCompleted = shipment.status === 'completed';

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 14;

  // --- 1. ENCABEZADO INSTITUCIONAL ---
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(14, currentY, pageWidth - 28, 22, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('CITY RECEPCIÓN', 18, currentY + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('CONTROL Y RECEPCIÓN DE MERCADERÍA - ALMACÉN', 18, currentY + 14);

  // Badge Estado del Reporte (Parcial / Final)
  const reportTypeBadge = isCompleted ? 'REPORTE FINAL' : 'REPORTE PARCIAL';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  if (isCompleted) {
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setFillColor(59, 130, 246); // blue-500
    doc.setTextColor(255, 255, 255);
  }
  doc.roundedRect(pageWidth - 58, currentY + 6, 40, 9, 2, 2, 'F');
  doc.text(reportTypeBadge, pageWidth - 38, currentY + 12, { align: 'center' });

  currentY += 27;

  // --- 2. DATOS DEL ENVÍO ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('DATOS GENERALES DEL ENVÍO', 14, currentY);

  currentY += 3;

  const infoTable = [
    [
      { content: 'N° Envío:', styles: { fontStyle: 'bold' as const, textColor: COLOR_SLATE_TEXT } },
      { content: shipment.shipment_number },
      { content: 'Destino:', styles: { fontStyle: 'bold' as const, textColor: COLOR_SLATE_TEXT } },
      { content: shipment.destination },
    ],
    [
      { content: 'Fecha de Envío:', styles: { fontStyle: 'bold' as const, textColor: COLOR_SLATE_TEXT } },
      { content: formatDate(shipment.shipment_date, 'long') },
      { content: 'Estado:', styles: { fontStyle: 'bold' as const, textColor: COLOR_SLATE_TEXT } },
      { content: getShipmentStatusLabel(shipment.status) },
    ],
    [
      { content: 'Fecha/Hora Generación:', styles: { fontStyle: 'bold' as const, textColor: COLOR_SLATE_TEXT } },
      { content: generatedAt },
      { content: 'Total Productos:', styles: { fontStyle: 'bold' as const, textColor: COLOR_SLATE_TEXT } },
      { content: `${items.length} ítems` },
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    body: infoTable,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1.5,
    },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 50 },
      2: { cellWidth: 35 },
      3: { cellWidth: 55 },
    },
    margin: { left: 14, right: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentY = (doc as any).lastAutoTable.finalY + 6;

  // --- 3. RESUMEN DE CONTROL & TOTALES ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('RESUMEN DE RECEPCIÓN Y BALANCES', 14, currentY);

  currentY += 3;

  const pct = stats.total_expected > 0
    ? ((stats.total_received / stats.total_expected) * 100).toFixed(1)
    : '0.0';

  const kpiTable = [
    [
      'Total Esperado',
      'Total Recibido',
      'Avance',
      'Completos',
      'Parciales',
      'Pendientes',
      'Excesos',
      'Incidencias',
    ],
    [
      `${stats.total_expected} cjs`,
      `${stats.total_received} cjs`,
      `${pct}%`,
      `${stats.total_complete}`,
      `${stats.total_partial}`,
      `${stats.total_pending}`,
      `${stats.total_excess}`,
      `${incidents.length}`,
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [kpiTable[0]],
    body: [kpiTable[1]],
    theme: 'grid',
    headStyles: {
      fillColor: BG_NAVY_HEADER,
      textColor: COLOR_WHITE_TEXT,
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      textColor: COLOR_DARK_TEXT,
    },
    margin: { left: 14, right: 14 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentY = (doc as any).lastAutoTable.finalY + 8;

  // --- 4. SECCIÓN FALTANTES ---
  const missingItems = items.filter((item) => item.received_boxes < item.expected_boxes);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(185, 28, 28); // red-700
  doc.text(`FALTANTES (${missingItems.length} productos con faltante)`, 14, currentY);

  currentY += 2;

  if (missingItems.length > 0) {
    const missingRows = missingItems.map((item) => [
      item.supplier || '-',
      item.code_original,
      item.product_name,
      item.expected_boxes,
      item.received_boxes,
      item.expected_boxes - item.received_boxes,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Proveedor', 'Código', 'Producto', 'Esperadas', 'Recibidas', 'Faltante']],
      body: missingRows,
      theme: 'striped',
      headStyles: {
        fillColor: BG_RED_HEADER,
        textColor: COLOR_WHITE_TEXT,
        fontSize: 8,
      },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 28 },
        2: { cellWidth: 68 },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 18, halign: 'center', fontStyle: 'bold', textColor: COLOR_RED_TEXT },
      },
      margin: { left: 14, right: 14 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = (doc as any).lastAutoTable.finalY + 8;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(22, 101, 52); // emerald-800
    doc.text('✓ Sin faltantes registrados. Toda la mercadería esperada ha sido recibida.', 14, currentY + 3);
    currentY += 9;
  }

  // --- 5. SECCIÓN EXCESOS ---
  const excessItems = items.filter((item) => item.received_boxes > item.expected_boxes);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(126, 34, 206); // purple-700
  doc.text(`EXCESOS (${excessItems.length} productos con cajas extra)`, 14, currentY);

  currentY += 2;

  if (excessItems.length > 0) {
    const excessRows = excessItems.map((item) => [
      item.supplier || '-',
      item.code_original,
      item.product_name,
      item.expected_boxes,
      item.received_boxes,
      item.received_boxes - item.expected_boxes,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Proveedor', 'Código', 'Producto', 'Esperadas', 'Recibidas', 'Exceso']],
      body: excessRows,
      theme: 'striped',
      headStyles: {
        fillColor: BG_PURPLE_HEADER,
        textColor: COLOR_WHITE_TEXT,
        fontSize: 8,
      },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 28 },
        2: { cellWidth: 68 },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 18, halign: 'center', fontStyle: 'bold', textColor: COLOR_PURPLE_TEXT },
      },
      margin: { left: 14, right: 14 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = (doc as any).lastAutoTable.finalY + 8;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Sin excesos registrados en este envío.', 14, currentY + 3);
    currentY += 9;
  }

  // --- 6. SECCIÓN INCIDENCIAS ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(217, 119, 6); // amber-600
  doc.text(`INCIDENCIAS (${incidents.length} reportadas)`, 14, currentY);

  currentY += 2;

  if (incidents.length > 0) {
    const incidentRows = incidents.map((inc) => [
      inc.type.toUpperCase(),
      inc.description,
      inc.created_at ? formatDate(inc.created_at, 'short') : '-',
      inc.resolved_at ? 'Resuelta' : 'Abierta',
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Tipo', 'Descripción', 'Fecha', 'Estado']],
      body: incidentRows,
      theme: 'striped',
      headStyles: {
        fillColor: BG_AMBER_HEADER,
        textColor: COLOR_WHITE_TEXT,
        fontSize: 8,
      },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 100 },
        2: { cellWidth: 28, halign: 'center' },
        3: { cellWidth: 26, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentY = (doc as any).lastAutoTable.finalY + 8;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Sin incidencias reportadas en este envío.', 14, currentY + 3);
    currentY += 9;
  }

  // --- 7. TABLA DETALLADA COMPLETA ---
  // Si queda poco espacio en la página actual, forzar nueva página
  if (currentY > 230) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('DETALLE COMPLETO DE PRODUCTOS', 14, currentY);

  currentY += 3;

  const detailRows = items.map((item) => {
    const diff = item.received_boxes - item.expected_boxes;
    const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
    return [
      item.supplier || '-',
      item.code_original,
      item.product_name,
      item.expected_boxes,
      item.received_boxes,
      diffLabel,
      getItemStatusLabel(item.status),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Proveedor', 'Código', 'Producto', 'Esperadas', 'Recibidas', 'Dif.', 'Estado']],
    body: detailRows,
    theme: 'striped',
    headStyles: {
      fillColor: BG_DARK_HEADER,
      textColor: COLOR_WHITE_TEXT,
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: 1.5,
    },
    alternateRowStyles: {
      fillColor: BG_ALTERNATE_ROW,
    },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 25 },
      2: { cellWidth: 65 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 16, halign: 'center' },
    },
    margin: { left: 14, right: 14, bottom: 15 },
  });

  // --- 8. PIE DE PÁGINA (Paginación en todas las hojas) ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `CITY RECEPCIÓN • ${shipment.shipment_number} (${shipment.destination}) • Página ${i} de ${totalPages}`,
      14,
      290
    );
    doc.text(`Impreso: ${generatedAt}`, pageWidth - 14, 290, { align: 'right' });
  }

  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}
