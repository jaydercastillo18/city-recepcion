import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { limaDate } from "./domain";
import type { AttendanceData } from "./types";
export async function attendanceSession(adminOnly = false) {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("Inicia sesión para continuar.");
  const { data: profile } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (
    !profile ||
    (adminOnly
      ? profile.role !== "admin"
      : !["admin", "employee"].includes(profile.role))
  )
    throw new Error("No tienes permiso para este módulo.");
  return { client, user, profile };
}
export function dateRange(from: string, to: string) {
  const valid = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(`${v}T12:00:00Z`)) &&
    new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
  if (
    !valid(from) ||
    !valid(to) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 366 * 86400000
  )
    throw new Error("Selecciona un período válido de hasta un año.");
}
export async function getAttendanceData(
  from?: string,
  to?: string,
  employeeId?: string,
): Promise<AttendanceData> {
  const { client } = await attendanceSession();
  const clock = await client.rpc("attendance_server_now");
  if (clock.error || !clock.data)
    throw new Error(
      "Aplica la migración de asistencia para habilitar el módulo.",
    );
  const today = limaDate(new Date(clock.data));
  const start = from ?? `${today.slice(0, 7)}-01`,
    end = to ?? today;
  dateRange(start, end);
  const [employees, schedules, records, settings] = await Promise.all([
    readAllRows((a, b) => {
      let q = client.from("employees").select("*").order("employee_code");
      if (employeeId) q = q.eq("id", employeeId);
      return q.range(a, b);
    }),
    readAllRows((a, b) => {
      let q = client
        .from("attendance_schedules")
        .select("*")
        .gte("work_date", start)
        .lte("work_date", end)
        .order("work_date")
        .order("id");
      if (employeeId) q = q.eq("employee_id", employeeId);
      return q.range(a, b);
    }),
    readAllRows((a, b) => {
      let q = client
        .from("attendance_records")
        .select("*")
        .gte("work_date", start)
        .lte("work_date", end)
        .order("work_date")
        .order("id");
      if (employeeId) q = q.eq("employee_id", employeeId);
      return q.range(a, b);
    }),
    client.from("attendance_settings").select("*").eq("id", 1).single(),
  ]);
  for (const result of [employees, schedules, records, settings])
    if (result.error)
      throw new Error(
        "No se pudo cargar asistencia. Verifica la migración y tus permisos.",
      );
  if (!employees.data || !schedules.data || !records.data || !settings.data)
    throw new Error("No se pudo cargar el módulo completo.");
  return {
    employees: employees.data,
    schedules: schedules.data,
    records: records.data,
    settings: settings.data,
    serverNow: clock.data,
    from: start,
    to: end,
  };
}
