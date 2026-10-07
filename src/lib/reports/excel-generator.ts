// ============================================================
// CITY RECEPCIÓN - Generador de Reporte Excel (.xlsx)
// Compatible con Next.js 16 y Vercel Serverless
// ============================================================
import * as XLSX from 'xlsx';
import type { Shipment, ShipmentItem, ShipmentStats, Incident } from '@/types';
import { formatDate, getItemStatusLabel, getShipmentStatusLabel } from '@/lib/utils';

export interface ReportData {
  shipment: Shipment;
  items: ShipmentItem[];
  stats: ShipmentStats;
  incidents: Incident[];
  generatedAt: string;
}

export function generateShipmentExcel(data: ReportData): Uint8Array {
  const { shipment, items, stats, incidents, generatedAt } = data;

  const wb = XLSX.utils.book_new();

  // --- HOJA 1: Detalle ---
  // Columnas exactas requeridas:
  // Proveedor | Código | Producto | Esperadas | Recibidas | Diferencia | Estado
  const detailRows = items.map((item) => {
    const diff = item.received_boxes - item.expected_boxes;
    return {
      Proveedor: item.supplier || 'N/A',
      Código: item.code_original,
      Producto: item.product_name,
      Esperadas: item.expected_boxes,
      Recibidas: item.received_boxes,
      Diferencia: diff,
      Estado: getItemStatusLabel(item.status),
    };
  });

  const wsDetail = XLSX.utils.json_to_sheet(detailRows);

  // Auto ancho de columnas para la hoja Detalle
  wsDetail['!cols'] = [
    { wch: 22 }, // Proveedor
    { wch: 18 }, // Código
    { wch: 45 }, // Producto
    { wch: 12 }, // Esperadas
    { wch: 12 }, // Recibidas
    { wch: 12 }, // Diferencia
    { wch: 14 }, // Estado
  ];

  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle');

  // --- HOJA 2: Resumen ---
  const pct = stats.total_expected > 0
    ? Number(((stats.total_received / stats.total_expected) * 100).toFixed(1))
    : 0;

  const summaryRows = [
    { Parámetro: 'Sistema', Valor: 'CITY RECEPCIÓN' },
    { Parámetro: 'Número de Envío', Valor: shipment.shipment_number },
    { Parámetro: 'Destino', Valor: shipment.destination },
    { Parámetro: 'Fecha de Envío', Valor: formatDate(shipment.shipment_date, 'long') },
    { Parámetro: 'Estado de Recepción', Valor: getShipmentStatusLabel(shipment.status) },
    { Parámetro: 'Fecha / Hora de Generación', Valor: generatedAt },
    { Parámetro: '----------------------------------------', Valor: '--------------------' },
    { Parámetro: 'Total Cajas Esperadas', Valor: stats.total_expected },
    { Parámetro: 'Total Cajas Recibidas', Valor: stats.total_received },
    { Parámetro: 'Porcentaje de Avance (%)', Valor: `${pct}%` },
    { Parámetro: 'Total Productos Distintos', Valor: items.length },
    { Parámetro: 'Productos Completos', Valor: stats.total_complete },
    { Parámetro: 'Productos Parciales', Valor: stats.total_partial },
    { Parámetro: 'Productos Pendientes', Valor: stats.total_pending },
    { Parámetro: 'Productos con Exceso', Valor: stats.total_excess },
    { Parámetro: 'Cajas Faltantes', Valor: stats.boxes_missing },
    { Parámetro: 'Total Incidencias Registradas', Valor: incidents.length },
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 35 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

  // --- HOJA 3: Incidencias ---
  const incidentRows = incidents.length > 0
    ? incidents.map((inc, idx) => ({
        Nro: idx + 1,
        Tipo: inc.type.toUpperCase(),
        Descripción: inc.description,
        Fecha: inc.created_at ? formatDate(inc.created_at, 'short') : '-',
        Estado: inc.resolved_at ? 'Resuelto' : 'Abierto',
      }))
    : [
        {
          Nro: 1,
          Tipo: 'SIN INCIDENCIAS',
          Descripción: 'No se han registrado incidencias para este envío',
          Fecha: '-',
          Estado: 'N/A',
        },
      ];

  const wsIncidents = XLSX.utils.json_to_sheet(incidentRows);
  wsIncidents['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 55 },
    { wch: 15 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsIncidents, 'Incidencias');

  // Generar buffer XLSX
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Uint8Array(buffer);
}
