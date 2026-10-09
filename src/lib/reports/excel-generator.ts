import * as XLSX from 'xlsx';
import type { ReportData } from './pdf-generator';
import { formatDate } from '@/lib/utils';
import { detailRows, reportDate, shipmentReportStatus, finalizationRows } from './report-rows';

export type { ReportData } from './pdf-generator';

export function generateShipmentExcel(data: ReportData): Uint8Array {
  const { shipment, items, stats, incidents, generatedAt, responsible } = data;
  const wb = XLSX.utils.book_new();
  const summary = [
    ['Sistema', 'CITY OFERTAS · RECEPCIÓN'], ['Envío', shipment.shipment_number], ['Destino', shipment.destination],
    ['Fecha de envío', formatDate(shipment.shipment_date, 'long')], ['Estado', shipmentReportStatus(shipment)],
    ['Responsable de emisión (sesión activa)', responsible], ['Fecha / hora', generatedAt],
    ['Cajas esperadas', stats.total_expected], ['Cajas recibidas', stats.total_received], ['Cajas faltantes', stats.boxes_missing],
    ['Productos', items.length], ['Completos', stats.total_complete], ['Parciales', stats.total_partial],
    ['Pendientes', stats.total_pending], ['Con exceso', stats.total_excess], ['Observaciones / incidencias', incidents.length],
    ['Diferencia', 'Recibidas - esperadas; negativo indica faltante'],
    ...finalizationRows(shipment),
  ];
  const ws = XLSX.utils.aoa_to_sheet([['Concepto', 'Valor'], ...summary]);
  ws['!cols'] = [{ wch: 42 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen');
  const headers = ['Proveedor', 'Código', 'Producto', 'Esperadas', 'Recibidas', 'Diferencia', 'Estado', 'Observación / incidencia'];
  function append(name: string, rows: Record<string, string | number>[], columns: string[], widths: number[]) {
    const sheet = XLSX.utils.json_to_sheet(rows, { header: columns });
    sheet['!cols'] = widths.map(wch => ({ wch }));
    sheet['!autofilter'] = { ref: sheet['!ref']! };
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  append('Detalle', detailRows(items, incidents), headers, [24, 20, 45, 12, 12, 12, 14, 70]);
  append('Faltantes', detailRows(items.filter(i => i.expected_boxes > i.received_boxes), incidents), headers, [24, 20, 45, 12, 12, 12, 14, 70]);
  append('Observaciones-Incidencias', incidents.map(incident => {
    const item = items.find(i => i.id === incident.shipment_item_id);
    return { Proveedor: item?.supplier || '-', Código: item?.code_original || '-', Producto: item?.product_name || 'General del envío',
      Tipo: incident.type === 'other' ? 'Observación' : incident.type, Descripción: incident.description,
      'Fecha / hora': reportDate(incident.created_at), Estado: incident.resolved_at ? 'Resuelto' : 'Abierto' };
  }), ['Proveedor', 'Código', 'Producto', 'Tipo', 'Descripción', 'Fecha / hora', 'Estado'], [24, 20, 45, 20, 70, 30, 14]);
  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
