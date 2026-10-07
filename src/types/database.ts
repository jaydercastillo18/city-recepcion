// ============================================================
// CITY RECEPCIÓN - Supabase: Tipo de base de datos generado
// ============================================================
// En producción, este archivo se genera con: supabase gen types typescript
// Para la Fase 1 lo definimos manualmente.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: string;
          created_at?: string;
        };
      };
      shipments: {
        Row: {
          id: string;
          shipment_number: string;
          destination: string;
          shipment_date: string;
          status: string;
          total_expected_boxes: number;
          total_received_boxes: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shipment_number: string;
          destination: string;
          shipment_date: string;
          status?: string;
          total_expected_boxes?: number;
          total_received_boxes?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shipment_number?: string;
          destination?: string;
          shipment_date?: string;
          status?: string;
          total_expected_boxes?: number;
          total_received_boxes?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      shipment_items: {
        Row: {
          id: string;
          shipment_id: string;
          supplier: string | null;
          code_original: string;
          code_normalized: string;
          product_name: string;
          expected_boxes: number;
          received_boxes: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shipment_id: string;
          supplier?: string | null;
          code_original: string;
          code_normalized: string;
          product_name: string;
          expected_boxes: number;
          received_boxes?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shipment_id?: string;
          supplier?: string | null;
          code_original?: string;
          code_normalized?: string;
          product_name?: string;
          expected_boxes?: number;
          received_boxes?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      reception_events: {
        Row: {
          id: string;
          shipment_id: string;
          shipment_item_id: string;
          user_id: string;
          action: string;
          quantity: number;
          previous_quantity: number;
          new_quantity: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shipment_id: string;
          shipment_item_id: string;
          user_id: string;
          action: string;
          quantity: number;
          previous_quantity: number;
          new_quantity: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shipment_id?: string;
          shipment_item_id?: string;
          user_id?: string;
          action?: string;
          quantity?: number;
          previous_quantity?: number;
          new_quantity?: number;
          notes?: string | null;
          created_at?: string;
        };
      };
      incidents: {
        Row: {
          id: string;
          shipment_id: string;
          shipment_item_id: string | null;
          user_id: string;
          type: string;
          description: string;
          photo_path: string | null;
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          shipment_id: string;
          shipment_item_id?: string | null;
          user_id: string;
          type: string;
          description: string;
          photo_path?: string | null;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          id?: string;
          shipment_id?: string;
          shipment_item_id?: string | null;
          user_id?: string;
          type?: string;
          description?: string;
          photo_path?: string | null;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
      };
    };
    Functions: {
      register_box_reception: {
        Args: {
          p_shipment_item_id: string;
          p_action: string;
          p_quantity: number;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      get_shipment_stats: {
        Args: { p_shipment_id: string };
        Returns: Json;
      };
      get_my_role: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
  };
}
