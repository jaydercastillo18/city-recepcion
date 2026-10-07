// ============================================================
// CITY RECEPCIÓN - Consulta consolidada y segura para reportes
// Carga eficiente en paralelo con validación de sesión
// ============================================================
import { createClient } from '@/lib/supabase/server';
import type { Shipment, ShipmentItem, ShipmentStats, Incident } from '@/types';
import type { ReportData } from './pdf-generator';

export type FetchReportResult =
  | { success: true; data: ReportData }
  | { success: false; error: string; status: number };

export async function fetchReportData(shipmentId: string): Promise<FetchReportResult> {
  const supabase = await createClient();

  // 1. Validar autenticación
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: 'No autorizado. Se requiere una sesión activa para acceder a los reportes.',
      status: 401,
    };
  }

  // 2. Consulta paralela optimizada
  const shipmentPromise = supabase.from('shipments').select('*').eq('id', shipmentId).single();
  const itemsPromise = supabase
    .from('shipment_items')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('code_original', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsPromise = (supabase.rpc as any)('get_shipment_stats', { p_shipment_id: shipmentId });
  const incidentsPromise = supabase
    .from('incidents')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });

  const [shipmentRes, itemsRes, statsRes, incidentsRes] = await Promise.all([
    shipmentPromise,
    itemsPromise,
    statsPromise,
    incidentsPromise,
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sRes = shipmentRes as any;
  if (sRes.error || !sRes.data) {
    return {
      success: false,
      error: 'Envío no encontrado.',
      status: 404,
    };
  }

  const shipment = sRes.data as Shipment;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((itemsRes as any).data ?? []) as ShipmentItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incidents = ((incidentsRes as any).data ?? []) as Incident[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsRpcData = (statsRes as any).data as ShipmentStats | null;

  // Fallback si RPC stats tuviera problemas
  const stats: ShipmentStats = statsRpcData ?? {
    total_expected: shipment.total_expected_boxes,
    total_received: shipment.total_received_boxes,
    total_pending: items.filter((i) => i.status === 'pending').length,
    total_partial: items.filter((i) => i.status === 'partial').length,
    total_complete: items.filter((i) => i.status === 'complete').length,
    total_excess: items.filter((i) => i.status === 'excess').length,
    boxes_missing: Math.max(0, shipment.total_expected_boxes - shipment.total_received_boxes),
    item_count: items.length,
  };

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const generatedAt = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return {
    success: true,
    data: {
      shipment,
      items,
      stats,
      incidents,
      generatedAt,
    },
  };
}
