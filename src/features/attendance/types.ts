export type AttendanceStatus =
  | "pending"
  | "on_time"
  | "late"
  | "absent"
  | "day_off"
  | "justified";
export interface Employee {
  id: string;
  profile_id: string | null;
  employee_code: string;
  full_name: string;
  normalized_name: string;
  position: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  suspended_at?: string | null;
  archived_at?: string | null;
  late_tolerance_minutes: number;
  invitation_email_status: import("./invitations").EmailState;
  access_status?: import("./invitations").AccountState;
  created_at: string;
  updated_at: string;
}
export interface Schedule {
  id: string;
  employee_id: string;
  work_date: string;
  shift: string;
  scheduled_time: string | null;
  is_day_off: boolean;
  source_import_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface AttendanceRecord {
  id: string;
  employee_id: string;
  schedule_id: string;
  work_date: string;
  scheduled_time: string | null;
  check_in_at: string | null;
  status: AttendanceStatus;
  minutes_late: number;
  tolerance_minutes_applied: number;
  photo_storage_path: string | null;
  notes: string | null;
  registered_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface AttendanceSettings {
  id: number;
  absence_cutoff_minutes: number;
  updated_at: string;
}
export interface AttendanceImport {
  id: string;
  source_file_name: string;
  file_hash: string;
  period_start: string;
  period_end: string;
  imported_by: string;
  imported_at: string;
  warnings: import("@/types/database").Json;
}
export interface AuditLog {
  id: string;
  attendance_record_id: string | null;
  employee_id: string | null;
  action: string;
  before_data: import("@/types/database").Json;
  after_data: import("@/types/database").Json;
  performed_by: string;
  reason: string;
  created_at: string;
}
export interface AttendanceData {
  employees: Employee[];
  schedules: Schedule[];
  records: AttendanceRecord[];
  settings: AttendanceSettings;
  serverNow: string;
  from: string;
  to: string;
}
export interface AttendanceRow {
  employee: Employee;
  schedule: Schedule;
  record: AttendanceRecord | null;
  status: AttendanceStatus | "informational";
  minutesLate: number;
}
export interface ParsedSchedule {
  key: string;
  sourceRow: number;
  name: string;
  position: string;
  workDate: string;
  shift: "day" | "night";
  time: string | null;
  dayOff: boolean;
  employeeId: string | null;
  candidates: string[];
  error: string | null;
}
export interface SchedulePreview {
  rows: ParsedSchedule[];
  warnings: string[];
  errors: string[];
  fileName: string;
  fileHash: string;
  availableDates: string[];
  targetDate: string | null;
}
