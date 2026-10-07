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

export interface FinalizeSummary {
  expectedBoxes: number;
  receivedBoxes: number;
  missingBoxes: number;
  extraBoxes: number;
  pendingCount: number;
  partialCount: number;
  completeCount: number;
  excessCount: number;
  incidentsCount: number;
  itemsCount: number;
  canFinalize: boolean;
}

/**
 * Obtiene el resumen para validación previa al cierre de recepción.
 */
export async function getShipmentFinalizeSummary(
  shipmentId: string
): Promise<{ summary?: FinalizeSummary; error?: string }> {
  const supabase = await createClient();

  const [itemsRes, incidentsRes] = await Promise.all([
    supabase
      .from('shipment_items')
      .select('expected_boxes, received_boxes, status')
      .eq('shipment_id', shipmentId),
    supabase
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .eq('shipment_id', shipmentId),
  ]);

  if (itemsRes.error || !itemsRes.data) {
    return { error: 'Error al consultar productos del envío' };
  }

  interface ShipmentItemSummary {
    expected_boxes: number;
    received_boxes: number;
    status: string;
  }

  const items = (itemsRes.data ?? []) as ShipmentItemSummary[];
  let expectedBoxes = 0;
  let receivedBoxes = 0;
  let missingBoxes = 0;
  let extraBoxes = 0;
  let pendingCount = 0;
  let partialCount = 0;
  let completeCount = 0;
  let excessCount = 0;

  for (const item of items) {
    expectedBoxes += item.expected_boxes;
    receivedBoxes += item.received_boxes;
    if (item.received_boxes < item.expected_boxes) {
      missingBoxes += item.expected_boxes - item.received_boxes;
    } else if (item.received_boxes > item.expected_boxes) {
      extraBoxes += item.received_boxes - item.expected_boxes;
    }

    if (item.status === 'pending') pendingCount++;
    else if (item.status === 'partial') partialCount++;
    else if (item.status === 'complete') completeCount++;
    else if (item.status === 'excess') excessCount++;
  }

  const canFinalize = missingBoxes === 0 && pendingCount === 0 && partialCount === 0;

  return {
    summary: {
      expectedBoxes,
      receivedBoxes,
      missingBoxes,
      extraBoxes,
      pendingCount,
      partialCount,
      completeCount,
      excessCount,
      incidentsCount: incidentsRes.count ?? 0,
      itemsCount: items.length,
      canFinalize,
    },
  };
}

/**
 * Finaliza formalmente la recepción del envío (solo admin y sin faltantes).
 */
export async function finalizeShipmentAction(
  shipmentId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'No autenticado.' };
  }

  // Verificar perfil admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string } | null };

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Solo los administradores pueden finalizar la recepción.' };
  }

  // Verificar productos
  const { data: itemsData, error: itemsError } = await supabase
    .from('shipment_items')
    .select('expected_boxes, received_boxes, status')
    .eq('shipment_id', shipmentId);

  if (itemsError || !itemsData) {
    return { success: false, error: 'Error al consultar productos del envío.' };
  }

  const items = itemsData as unknown as { expected_boxes: number; received_boxes: number; status: string }[];

  const hasIncomplete = items.some(
    (item) => item.status === 'pending' || item.status === 'partial' || item.received_boxes < item.expected_boxes
  );

  if (hasIncomplete) {
    return {
      success: false,
      error: 'No se puede finalizar la recepción: existen productos pendientes o con cajas faltantes.',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase.from('shipments') as any)
    .update({ status: 'completed' })
    .eq('id', shipmentId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  revalidatePath('/recepcion');
  revalidatePath(`/recepcion/${shipmentId}`);
  revalidatePath('/admin/envios');

  return { success: true };
}

