// ============================================================
// CITY RECEPCIÓN - Supabase: Tipo de base de datos generado
// ============================================================
// En producción, este archivo se genera con: supabase gen types typescript
// Para la Fase 1 lo definimos manualmente.

import type {
  Employee,
  Schedule,
  AttendanceRecord,
  AttendanceSettings,
  AttendanceImport,
  AuditLog,
} from "@/features/attendance/types";
type AttendanceTable<T> = {
  Row: { [K in keyof T]: T[K] };
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};
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
      employees: AttendanceTable<Employee>;
      attendance_schedules: AttendanceTable<Schedule>;
      attendance_records: AttendanceTable<AttendanceRecord>;
      attendance_settings: AttendanceTable<AttendanceSettings>;
      attendance_imports: AttendanceTable<AttendanceImport>;
      attendance_audit_log: AttendanceTable<AuditLog>;
      profiles: {
        Relationships: [];
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
        Relationships: [];
        Row: {
          finalized_at: string | null;
          finalized_by: string | null;
          finalized_by_name: string | null;
          finalized_with_shortage: boolean;
          finalization_notes: string | null;
          missing_boxes_at_finalization: number;
          source_file_name: string | null;
          source_file_sha256: string | null;
          imported_at: string | null;
          imported_by: string | null;
          import_request_id: string | null;
          import_payload_hash: string | null;
          import_rows: number | null;
          import_warnings: Json | null;
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
          source_file_name?: string | null;
          finalized_at?: string | null;
          finalized_by?: string | null;
          finalized_by_name?: string | null;
          finalized_with_shortage?: boolean;
          finalization_notes?: string | null;
          missing_boxes_at_finalization?: number;
          source_file_sha256?: string | null;
          imported_at?: string | null;
          imported_by?: string | null;
          import_request_id?: string | null;
          import_payload_hash?: string | null;
          import_rows?: number | null;
          import_warnings?: Json | null;
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
          source_file_name?: string | null;
          finalized_at?: string | null;
          finalized_by?: string | null;
          finalized_by_name?: string | null;
          finalized_with_shortage?: boolean;
          finalization_notes?: string | null;
          missing_boxes_at_finalization?: number;
          source_file_sha256?: string | null;
          imported_at?: string | null;
          imported_by?: string | null;
          import_request_id?: string | null;
          import_payload_hash?: string | null;
          import_rows?: number | null;
          import_warnings?: Json | null;
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
    Views: Record<string, never>;
    Functions: {
      attendance_admin_command: {
        Args: { p_action: string; p_data: Json };
        Returns: Json;
      };
      register_attendance_check_in: {
        Args: { p_photo_path: string; p_schedule_id?: string | null };
        Returns: Json;
      };
      attendance_employee_command: {
        Args: { p_action: string; p_data: Json };
        Returns: Json;
      };
      attendance_server_now: { Args: Record<string, never>; Returns: string };
      finalize_shipment_admin: {
        Args: {
          p_shipment_id: string;
          p_confirm_shortage?: boolean;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      delete_shipment_admin: {
        Args: { p_shipment_id: string; p_confirmation: string };
        Returns: Json;
      };
      import_shipment_excel: {
        Args: {
          p_destination: string;
          p_shipment_date: string;
          p_shipment_number: string;
          p_source_file_name: string;
          p_source_file_sha256: string;
          p_import_rows: number;
          p_warnings: Json;
          p_items: Json;
          p_request_id: string;
        };
        Returns: Json;
      };
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
