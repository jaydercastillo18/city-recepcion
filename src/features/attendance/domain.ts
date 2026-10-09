import type {
  AttendanceData,
  AttendanceRow,
  AttendanceStatus,
  ParsedSchedule,
  Schedule,
} from "./types";
export const STATUS: Record<
  AttendanceStatus,
  { label: string; color: string; icon: string }
> = {
  pending: { label: "Pendiente", color: "text-slate-300", icon: "⚪" },
  on_time: { label: "Puntual", color: "text-emerald-300", icon: "✅" },
  late: { label: "Tarde", color: "text-amber-300", icon: "⏰" },
  absent: { label: "Falta", color: "text-red-300", icon: "❌" },
  day_off: { label: "Descanso", color: "text-yellow-200", icon: "🟡" },
  justified: { label: "Justificado", color: "text-blue-300", icon: "🔵" },
};
export const ROW_STATUS = {
  ...STATUS,
  informational: {
    label: "Sin control de asistencia",
    color: "text-slate-400",
    icon: "ℹ️",
  },
};
export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}
export function limaDate(instant = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
export function limaTime(instant: string | null) {
  return instant
    ? new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(instant))
    : "—";
}
export function attendanceRows(data: AttendanceData): AttendanceRow[] {
  const people = new Map(data.employees.map((e) => [e.id, e]));
  const records = new Map(data.records.map((r) => [r.schedule_id, r]));
  const rows: AttendanceRow[] = [];
  for (const schedule of data.schedules) {
    const employee = people.get(schedule.employee_id);
    if (!employee) continue;
    if (schedule.shift === "night") {
      rows.push({
        employee,
        schedule,
        record: null,
        status: "informational",
        minutesLate: 0,
      });
      continue;
    }
    const record = records.get(schedule.id) ?? null;
    const cutoff = schedule.scheduled_time
      ? new Date(
          `${schedule.work_date}T${schedule.scheduled_time}-05:00`,
        ).getTime() +
        data.settings.absence_cutoff_minutes * 60_000
      : Infinity;
    const computedStatus = schedule.is_day_off
      ? "day_off"
      : new Date(data.serverNow).getTime() >= cutoff
        ? "absent"
        : "pending";
    const status =
      record && record.status !== "pending" ? record.status : computedStatus;
    rows.push({
      employee,
      schedule,
      record,
      status,
      minutesLate: record?.minutes_late ?? 0,
    });
  }
  return rows;
}
export function attendanceSummary(rows: AttendanceRow[]) {
  rows = rows.filter((r) => r.schedule.shift === "day");
  return {
    scheduled: rows.filter((r) => !r.schedule.is_day_off).length,
    attended: rows.filter((r) => r.record?.check_in_at).length,
    ...(Object.fromEntries(
      Object.keys(STATUS).map((status) => [
        status,
        rows.filter((r) => r.status === status).length,
      ]),
    ) as Record<AttendanceStatus, number>),
  };
}

export function shiftLabel(shift: string) {
  return shift === "night" ? "Turno Noche" : "Turno Día";
}

export function scheduleChange(
  row: Pick<ParsedSchedule, "time" | "dayOff" | "error">,
  old?: Schedule,
) {
  if (row.error) return "ERROR";
  if (!old) return "NUEVO";
  return old.is_day_off === row.dayOff &&
    old.scheduled_time?.slice(0, 5) === row.time?.slice(0, 5)
    ? "SIN CAMBIOS"
    : "ACTUALIZAR";
}
