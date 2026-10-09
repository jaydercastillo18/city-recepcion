import type { Incident, ShipmentItem, Shipment } from '@/types';
import { getItemStatusLabel, getShipmentStatusLabel } from '@/lib/utils';

export function shipmentReportStatus(shipment: Shipment) {
  return shipment.status === 'completed' && shipment.finalized_with_shortage
    ? 'Finalizado con faltantes' : getShipmentStatusLabel(shipment.status);
}

export function finalizationRows(shipment: Shipment): [string, string | number][] {
  if (!shipment.finalized_at) return [];
  return [
    ['Estado del cierre', shipmentReportStatus(shipment)],
    ['Faltantes al cierre', shipment.missing_boxes_at_finalization ?? 0],
    ['Motivo', shipment.finalization_notes || 'No indicado'],
    ['Finalizado por', shipment.finalized_by_name || shipment.finalized_by || 'No registrado'],
    ['Fecha/hora de cierre', reportDate(shipment.finalized_at)],
  ];
}

export function observationText(item: ShipmentItem, incidents: Incident[]) {
  return incidents.filter(i => i.shipment_item_id === item.id)
    .map(i => `${i.description}${i.resolved_at ? ' (resuelto)' : ''}`).join('\n');
}

export function detailRows(items: ShipmentItem[], incidents: Incident[]) {
  return items.map(item => ({
    Proveedor: item.supplier || 'N/A', Código: item.code_original, Producto: item.product_name,
    Esperadas: item.expected_boxes, Recibidas: item.received_boxes,
    Diferencia: item.received_boxes - item.expected_boxes,
    Estado: getItemStatusLabel(item.status), 'Observación / incidencia': observationText(item, incidents),
  }));
}

export function reportDate(date: string) {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(date)) + ' (Lima)';
}
