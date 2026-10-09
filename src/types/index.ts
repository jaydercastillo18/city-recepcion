// ============================================================
// CITY RECEPCIÓN - Tipos globales del sistema
// ============================================================

// ----------------------------------------------------------------
// Base
// ----------------------------------------------------------------
export type UUID = string;

export type ItemStatus = 'pending' | 'partial' | 'complete' | 'excess';
export type ShipmentStatus = 'draft' | 'receiving' | 'completed' | 'cancelled';
export type UserRole = 'admin' | 'warehouse' | 'employee';
export type ReceptionAction = 'receive' | 'correction' | 'reset';
export type IncidentType = 'missing' | 'extra' | 'damaged' | 'wrong_product' | 'other';

// ----------------------------------------------------------------
// Entidades de Base de Datos
// ----------------------------------------------------------------
export interface Profile {
  id: UUID;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface Shipment {
  finalized_at?: string | null;
  finalized_by?: UUID | null;
  finalized_by_name?: string | null;
  finalized_with_shortage?: boolean;
  finalization_notes?: string | null;
  missing_boxes_at_finalization?: number;
  source_file_name?: string | null;
  source_file_sha256?: string | null;
  imported_at?: string | null;
  imported_by?: string | null;
  import_rows?: number | null;
  import_warnings?: unknown;
  import_request_id?: string | null;
  id: UUID;
  shipment_number: string;
  destination: string;
  shipment_date: string; // ISO date string "YYYY-MM-DD"
  status: ShipmentStatus;
  total_expected_boxes: number;
  total_received_boxes: number;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentItem {
  observations?: string[]; // UI projection of existing incidents, never a database column.
  id: UUID;
  shipment_id: UUID;
  supplier: string | null;
  code_original: string;
  code_normalized: string;
  product_name: string;
  expected_boxes: number;
  received_boxes: number;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
}

export interface ReceptionEvent {
  id: UUID;
  shipment_id: UUID;
  shipment_item_id: UUID;
  user_id: UUID;
  action: ReceptionAction;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  notes: string | null;
  created_at: string;
}

export interface Incident {
  id: UUID;
  shipment_id: UUID;
  shipment_item_id: UUID | null;
  user_id: UUID;
  type: IncidentType;
  description: string;
  photo_path: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: UUID | null;
}

// ----------------------------------------------------------------
// Tipos de respuesta RPC
// ----------------------------------------------------------------
export interface RegisterBoxReceptionResult {
  success: boolean;
  event_id?: UUID;
  item_id?: UUID;
  previous_quantity?: number;
  new_quantity?: number;
  status?: ItemStatus;
  action?: ReceptionAction;
  error?: string;
  code?: string;
}

export interface ShipmentStats {
  total_expected: number;
  total_received: number;
  total_pending: number;
  total_partial: number;
  total_complete: number;
  total_excess: number;
  boxes_missing: number;
  item_count: number;
}

// ----------------------------------------------------------------
// Tipos para UI / búsqueda
// ----------------------------------------------------------------
export type SearchFilter = 'all' | 'missing' | ItemStatus;

export interface SearchResult extends ShipmentItem {
  matchType: 'exact_code' | 'partial_code' | 'product' | 'supplier';
  score: number;
}

// ----------------------------------------------------------------
// Tipos para formularios
// ----------------------------------------------------------------
export interface CreateShipmentInput {
  shipment_number: string;
  destination: string;
  shipment_date: string;
  status: ShipmentStatus;
}

export interface CreateIncidentInput {
  shipment_id: UUID;
  shipment_item_id?: UUID;
  type: IncidentType;
  description: string;
  photo_path?: string;
}
