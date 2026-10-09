'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Shipment } from '@/types';

async function adminClient() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error('Inicia sesión para administrar envíos.');
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Solo los administradores pueden eliminar envíos.');
  return client;
}

export interface DeleteShipmentSummary {
  shipment: Shipment;
  itemsCount: number;
  eventsCount: number;
  incidentsCount: number;
}

export async function getShipmentDeleteSummary(shipmentId: string): Promise<{ summary?: DeleteShipmentSummary; error?: string }> {
  try {
    const client = await adminClient();
    const [shipment, items, events, incidents] = await Promise.all([
      client.from('shipments').select('*').eq('id', shipmentId).single(),
      client.from('shipment_items').select('id', { head: true, count: 'exact' }).eq('shipment_id', shipmentId),
      client.from('reception_events').select('id', { head: true, count: 'exact' }).eq('shipment_id', shipmentId),
      client.from('incidents').select('id', { head: true, count: 'exact' }).eq('shipment_id', shipmentId),
    ]);
    if (shipment.error || !shipment.data) return { error: 'Envío no encontrado.' };
    if (items.error || events.error || incidents.error) return { error: 'No se pudo cargar el resumen completo. Reintenta.' };
    return { summary: { shipment: shipment.data as Shipment, itemsCount: items.count ?? 0,
      eventsCount: events.count ?? 0, incidentsCount: incidents.count ?? 0 } };
  } catch (error) { return { error: error instanceof Error ? error.message : 'No se pudo cargar el envío.' }; }
}

export async function deleteShipmentAction(shipmentId: string, confirmation: string): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await adminClient();
    if (typeof confirmation !== 'string' || !confirmation) {
      return { success: false, error: 'Escribe el número exacto del envío.' };
    }
    const { data, error } = await client.rpc('delete_shipment_admin', {
      p_shipment_id: shipmentId, p_confirmation: confirmation,
    });
    if (error) return { success: false, error: error.code === 'PGRST202' || error.code === '42883'
      ? 'Aplica la nueva migración de cierre y eliminación en Supabase para habilitar esta acción.' : error.message };
    if (!(data as { success?: boolean } | null)?.success) return { success: false, error: 'No se pudo confirmar la eliminación.' };
    for (const path of ['/admin', '/admin/envios', '/recepcion', `/recepcion/${shipmentId}`]) revalidatePath(path);
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo eliminar el envío.' }; }
}
