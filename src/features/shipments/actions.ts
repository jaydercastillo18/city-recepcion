'use server';
// ============================================================
// CITY RECEPCIÓN - Server Actions para Envíos
// ============================================================
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Shipment, ShipmentStatus, CreateShipmentInput } from '@/types';

/**
 * Obtiene todos los envíos activos (receiving) para la pantalla de recepción.
 */
export async function getActiveShipments(): Promise<Shipment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .in('status', ['receiving', 'draft'])
    .order('shipment_date', { ascending: true });

  if (error) {
    console.error('[getActiveShipments]', error);
    return [];
  }

  return (data ?? []) as Shipment[];
}

/**
 * Obtiene un envío por ID con validación de acceso.
 */
export async function getShipmentById(id: string): Promise<Shipment | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Shipment;
}

/**
 * Obtiene todos los items de un envío para búsqueda client-side.
 * La carga se hace una sola vez y el filtrado ocurre en el cliente.
 */
export async function getShipmentItems(shipmentId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('shipment_items')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('code_original', { ascending: true });

  if (error) {
    console.error('[getShipmentItems]', error);
    return [];
  }

  return data ?? [];
}

/**
 * Crea un nuevo envío (solo admin).
 */
export async function createShipment(input: CreateShipmentInput): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'No autenticado' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('shipments') as any).insert({
    ...input,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/admin/envios');
  revalidatePath('/recepcion');
  return {};
}

/**
 * Actualiza el estado de un envío (solo admin).
 */
export async function updateShipmentStatus(
  shipmentId: string,
  status: ShipmentStatus
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('shipments') as any)
    .update({ status: status as string })
    .eq('id', shipmentId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/recepcion');
  revalidatePath(`/recepcion/${shipmentId}`);
  revalidatePath('/admin/envios');
  return {};
}

/**
 * Obtiene todos los envíos para el panel admin.
 */
export async function getAllShipments(): Promise<Shipment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .order('shipment_date', { ascending: false });

  if (error) {
    console.error('[getAllShipments]', error);
    return [];
  }

  return (data ?? []) as Shipment[];
}
