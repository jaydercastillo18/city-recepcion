"use client";
import { useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  UserRound,
  FileDown,
  Sheet,
} from "lucide-react";
import type { AttendanceData } from "../types";
import { attendanceRows, limaDate } from "../domain";
import Summary from "./summary";
export default function ReportDashboard({
  data,
  dailyData = data,
}: {
  data: AttendanceData;
  dailyData?: AttendanceData;
}) {
  const [mode, setMode] = useState("period"),
    [employee, setEmployee] = useState("");
  const today = limaDate(new Date(data.serverNow));
  const from = mode === "day" ? today : data.from,
    to = mode === "day" ? today : data.to;
  const rows = attendanceRows(mode === "day" ? dailyData : data).filter(
    (r) =>
      r.schedule.work_date >= from &&
      r.schedule.work_date <= to &&
      (!employee || r.employee.id === employee),
  );
  const href = (format: string) =>
    `/api/asistencia/report?${new URLSearchParams({ format, from, to, ...(employee ? { employee } : {}) })}`;
  return (
    <section>
      <h2 className="text-xl font-bold mb-2">Centro de reportes</h2>
      <p className="text-sm text-slate-400 mb-6">
        Revisa el resumen antes de descargar. El turno noche es informativo.
      </p>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {[
          ["day", "Reporte diario", CalendarDays],
          ["period", "Mensual / período", CalendarRange],
          ["employee", "Por empleado", UserRound],
        ].map(([key, label, icon]) => {
          const Icon = icon as typeof CalendarDays;
          return (
            <button
              key={key as string}
              className={`attendance-panel p-5 text-left ${mode === key ? "!border-fuchsia-400/60" : ""}`}
              onClick={() => {
                setMode(key as string);
                setEmployee("");
              }}
              aria-pressed={mode === key}
            >
              <Icon className="text-fuchsia-300 mb-3" size={23} />
              <span className="text-sm font-semibold">{label as string}</span>
            </button>
          );
        })}
      </div>
      {mode === "employee" && (
        <label className="block mb-5">
          Empleado
          <select
            className="import-input"
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
          >
            <option value="">Seleccionar empleado</option>
            {data.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_code} · {e.full_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Summary rows={rows} />
      <div className="attendance-panel p-6">
        <p className="text-sm text-slate-300 mb-4">
          {from} — {to} ·{" "}
          {employee
            ? data.employees.find((e) => e.id === employee)?.full_name
            : "Todo el personal"}
        </p>
        {mode === "employee" && !employee ? (
          <p className="text-sm text-amber-200">
            Selecciona un empleado para habilitar la descarga.
          </p>
        ) : (
          <div className="flex gap-3 flex-wrap">
            <a className="btn-primary" href={href("pdf")}>
              <FileDown size={18} />
              Descargar PDF
            </a>
            <a className="btn-ghost" href={href("excel")}>
              <Sheet size={18} />
              Descargar Excel
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
