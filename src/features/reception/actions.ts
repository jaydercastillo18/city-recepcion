'use server';
// ============================================================
// CITY RECEPCIÓN - Server Actions para Recepción
// ============================================================
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { RegisterBoxReceptionResult, ShipmentStats, ReceptionAction, IncidentType } from '@/types';

/**
 * Llama al RPC transaccional endurecido para registrar cajas recibidas.
 * La lógica de bloqueo FOR UPDATE y auditoría ocurre completamente en la BD.
 */
export async function registerBoxReception(
  shipmentItemId: string,
  action: ReceptionAction,
  quantity: number,
  shipmentId: string,
  notes?: string
): Promise<RegisterBoxReceptionResult> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('register_box_reception', {
    p_shipment_item_id: shipmentItemId,
    p_action: action,
    p_quantity: quantity,
    p_notes: notes ?? null,
  });

  if (error) {
    console.error('[registerBoxReception] RPC error:', error);
    return { success: false, error: error.message };
  }

  const result = data as RegisterBoxReceptionResult;

  if (result.success) {
    revalidatePath(`/recepcion/${shipmentId}`);
    revalidatePath('/recepcion');
  }

  return result;
}

/**
 * Registra una incidencia formal en la tabla public.incidents.
 */
export async function createIncidentAction(input: {
  shipmentId: string;
  shipmentItemId?: string;
  type: IncidentType;
  description: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'No autenticado' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('incidents') as any).insert({
    shipment_id: input.shipmentId,
    shipment_item_id: input.shipmentItemId ?? null,
    user_id: user.id,
    type: input.type,
    description: input.description,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/recepcion/${input.shipmentId}`);
  return { success: true };
}

/**
 * Obtiene estadísticas calculadas en BD para el dashboard de un envío.
 */
export async function getShipmentStats(shipmentId: string): Promise<ShipmentStats | null> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('get_shipment_stats', {
    p_shipment_id: shipmentId,
  });

  if (error) {
    console.error('[getShipmentStats]', error);
    return null;
  }

  return data as ShipmentStats;
}
