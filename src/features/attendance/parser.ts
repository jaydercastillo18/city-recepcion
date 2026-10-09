import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { normalizeName } from "./domain";
import type { Employee, SchedulePreview, ParsedSchedule } from "./types";
const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
export function parseScheduleTime(
  value: unknown,
): { time: string | null; dayOff: boolean } | null {
  if (typeof value === "string" && normalizeName(value) === "DESCANSO")
    return { time: null, dayOff: true };
  if (typeof value === "number" && value >= 0 && value < 1) {
    const minute = Math.round(value * 1440);
    if (minute >= 1440) return null;
    return {
      time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`,
      dayOff: false,
    };
  }
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "");
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23))
    return null;
  if (match[3]) hour = (hour % 12) + (match[3] === "pm" ? 12 : 0);
  return {
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
    dayOff: false,
  };
}
export function parseScheduleDate(
  value: unknown,
  year: number,
  date1904 = false,
): string | null {
  let y = year,
    m = 0,
    d = 0;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!parsed) return null;
    y = parsed.y;
    m = parsed.m;
    d = parsed.d;
  } else {
    const text = normalizeName(String(value ?? "")).toLowerCase();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const match = text.match(
      /^(\d{1,2})[-/ ]([a-z]+|\d{1,2})(?:[-/ ](\d{2,4}))?$/,
    );
    if (iso) {
      y = Number(iso[1]);
      m = Number(iso[2]);
      d = Number(iso[3]);
    } else if (match) {
      d = Number(match[1]);
      m = /^\d+$/.test(match[2])
        ? Number(match[2])
        : MONTHS.indexOf(match[2].slice(0, 3)) + 1;
      if (match[3]) y = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
    } else return null;
  }
  const result = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return m >= 1 &&
    y >= 2020 &&
    y <= 2100 &&
    m <= 12 &&
    d >= 1 &&
    d <= 31 &&
    new Date(`${result}T12:00:00Z`).toISOString().slice(0, 10) === result
    ? result
    : null;
}
export function parseAttendanceExcel(
  bytes: Uint8Array,
  fileName: string,
  year: number,
  employees: Employee[],
  targetDate: string | null = null,
): SchedulePreview {
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    throw new Error("Indica el año del horario (2020–2100).");
  if (targetDate && parseScheduleDate(targetDate, year) !== targetDate)
    throw new Error("Fecha objetivo inválida.");
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const warnings: string[] = [],
    errors: string[] = [],
    rows: ParsedSchedule[] = [];
  const available = new Set<string>();
  const active = employees.filter((e) => e.active);
  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
    });
    let nameColumn = -1,
      positionColumn = -1;
    let shift: "day" | "night" = /NOCHE/.test(normalizeName(sheetName))
      ? "night"
      : "day";
    let dates: { col: number; date: string }[] = [];
    for (let index = 0; index < grid.length; index++) {
      const row = grid[index];
      const title = normalizeName(row.map((v) => String(v ?? "")).join(" "));
      if (/TURNO\s+NOCHE/.test(title)) {
        shift = "night";
        nameColumn = -1;
      } else if (/TURNO\s+DIA/.test(title)) {
        shift = "day";
        nameColumn = -1;
      }
      const headerName = row.findIndex(
        (v) => normalizeName(String(v)) === "NOMBRE",
      );
      if (headerName >= 0) {
        nameColumn = headerName;
        positionColumn = row.findIndex((v) =>
          ["FUNCION", "CARGO"].includes(normalizeName(String(v))),
        );
        dates = row
          .map((v, col) => ({
            col,
            date: parseScheduleDate(
              v,
              year,
              Boolean(wb.Workbook?.WBProps?.date1904),
            ),
          }))
          .filter((v): v is { col: number; date: string } => Boolean(v.date));
        dates.forEach((v) => available.add(v.date));
        continue;
      }
      if (nameColumn < 0) continue;
      const name = String(row[nameColumn] ?? "").trim();
      if (!name || /^(TOTAL|RESUMEN)(\s|$)/.test(normalizeName(name))) continue;
      const candidates = active.filter(
        (e) => e.normalized_name === normalizeName(name),
      );
      for (const { col, date } of dates) {
        if (date !== targetDate) continue;
        const value = row[col];
        if (value === "" || value == null) continue;
        const parsed = parseScheduleTime(value);
        rows.push({
          key: `${sheetName}:${index}:${col}`,
          sourceRow: index + 1,
          name,
          position: String(row[positionColumn] ?? "").trim(),
          workDate: date,
          shift,
          time: parsed?.time ?? null,
          dayOff: parsed?.dayOff ?? false,
          employeeId: candidates.length === 1 ? candidates[0].id : null,
          candidates: candidates.map((e) => e.id),
          error: parsed ? null : `Hora inválida: ${String(value)}`,
        });
      }
    }
  }
  const availableDates = [...available].sort();
  if (!availableDates.length)
    errors.push(
      "No se encontraron fechas. Usa NOMBRE, FUNCIÓN y columnas como 8-Oct.",
    );
  if (targetDate && !available.has(targetDate))
    errors.push("La fecha objetivo no existe en el Excel.");
  else if (targetDate && !rows.length)
    errors.push("No hay horarios para la fecha objetivo.");
  if (rows.length > 20000) errors.push("El archivo excede 20 000 horarios.");
  if (rows.some((r) => !r.employeeId))
    warnings.push(
      "Hay nombres sin coincidencia única. Elige o crea el empleado antes de confirmar.",
    );
  return {
    rows,
    warnings,
    errors,
    fileName,
    fileHash: createHash("sha256").update(bytes).digest("hex"),
    availableDates,
    targetDate,
  };
}
