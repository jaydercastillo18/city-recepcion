import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Shipment, ShipmentItem, ShipmentStats, Incident } from '@/types';
import { formatDate } from '@/lib/utils';
import { detailRows, reportDate, shipmentReportStatus, finalizationRows } from './report-rows';
import { cityLogo } from './city-logo';

export interface ReportData {
  shipment: Shipment;
  items: ShipmentItem[];
  stats: ShipmentStats;
  incidents: Incident[];
  generatedAt: string;
  responsible: string;
}

export function generateShipmentPdf(data: ReportData): Uint8Array {
  const { shipment, items, stats, incidents, generatedAt, responsible } = data;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  let y = 39;
  doc.setFillColor(91, 33, 182);
  doc.roundedRect(12, 10, width - 24, 24, 3, 3, 'F');
  doc.addImage(cityLogo, 'PNG', 17, 12, 35, 19.74);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.text('RECEPCIÓN DE MERCADERÍA', 65, 21);
  doc.setFontSize(9); doc.text(shipment.status === 'completed' ? 'REPORTE FINAL' : 'REPORTE PARCIAL', width - 18, 24, { align: 'right' });

  function table(title: string, head: string[], body: (string | number)[][], fontSize = 8) {
    if (y > height - 38) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(91, 33, 182);
    doc.text(title, 12, y); y += 4;
    autoTable(doc, { startY: y, head: [head], body, theme: 'grid',
      margin: { top: 16, bottom: 16, left: 12, right: 12 },
      styles: { fontSize, cellPadding: 2, overflow: 'linebreak', textColor: [30, 25, 45] },
      headStyles: { fillColor: [91, 33, 182], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [250, 245, 255] },
      rowPageBreak: 'avoid',
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  }
  table('DATOS DEL ENVÍO', ['Envío', 'Destino', 'Fecha de envío', 'Estado'], [[shipment.shipment_number, shipment.destination, formatDate(shipment.shipment_date, 'long'), shipmentReportStatus(shipment)]], 9);
  table('RESPONSABLE Y EMISIÓN', ['Responsable de emisión (sesión activa)', 'Fecha y hora'], [[responsible, generatedAt]], 9);
  table('RESUMEN GENERAL', ['Esperadas', 'Recibidas', 'Faltantes', 'Completos', 'Parciales', 'Pendientes', 'Excesos', 'Observaciones / incidencias'], [[stats.total_expected, stats.total_received, stats.boxes_missing, stats.total_complete, stats.total_partial, stats.total_pending, stats.total_excess, incidents.length]]);
  const closing = finalizationRows(shipment);
  if (closing.length) table('AUDITORÍA DEL CIERRE', ['Concepto', 'Valor'], closing, 9);
  const headers = ['Proveedor', 'Código', 'Producto', 'Esperadas', 'Recibidas', 'Diferencia*', 'Estado', 'Observación / incidencia'];
  const rows = (list: ShipmentItem[]) => detailRows(list, incidents).map(row => Object.values(row));
  table('DETALLE COMPLETO · *Diferencia = recibidas - esperadas', headers, rows(items));
  const missing = items.filter(item => item.expected_boxes > item.received_boxes);
  table('FALTANTES · Incluye pendientes y parciales', headers, missing.length ? rows(missing) : [['Sin cajas faltantes', '', '', '', '', '', '', '']]);
  const notes = incidents.map(incident => {
    const item = items.find(item => item.id === incident.shipment_item_id);
    return [item?.supplier || '-', item?.code_original || '-', item?.product_name || 'General del envío', incident.type === 'other' ? 'Observación' : incident.type, incident.description, reportDate(incident.created_at), incident.resolved_at ? 'Resuelto' : 'Abierto'];
  });
  table('OBSERVACIONES / INCIDENCIAS', ['Proveedor', 'Código', 'Producto', 'Tipo', 'Descripción', 'Fecha y hora', 'Estado'], notes.length ? notes : [['Sin observaciones ni incidencias', '', '', '', '', '', '']]);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 90, 110);
    doc.text('City Ofertas · Control de almacén · ' + shipment.shipment_number, 12, height - 7);
    doc.text(page + ' / ' + pages, width - 12, height - 7, { align: 'right' });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
