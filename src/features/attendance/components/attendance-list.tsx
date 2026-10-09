"use client";
import { useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import type { AttendanceRow } from "../types";
import { STATUS, ROW_STATUS, limaTime, shiftLabel } from "../domain";
import { correctAttendance } from "../actions";
import { EmployeeAvatar, AttendanceToolbar } from "./ui";
import { normalizeName } from "../domain";
import MutationForm from "./mutation-form";
export function Evidence({ recordId }: { recordId: string }) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  async function load() {
    setUrl("");
    setError("");
    try {
      const response = await fetch(
        `/api/asistencia/photo?record=${encodeURIComponent(recordId)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUrl(data.url);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo cargar la foto.",
      );
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void load();
        else setUrl("");
      }}
    >
      <Dialog.Trigger className="btn-ghost text-sm">Ver foto</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-auto card-base p-5">
          <Dialog.Title className="font-bold">Evidencia privada</Dialog.Title>
          <Dialog.Description className="text-xs text-slate-400 mb-4">
            Acceso temporal de 60 segundos, según permisos.
          </Dialog.Description>
          {url ? (
            <Image
              unoptimized
              width={1280}
              height={960}
              src={url}
              alt="Foto de evidencia de entrada"
              className="w-full rounded-lg max-h-[65dvh] object-contain"
            />
          ) : (
            <p role="status">{error || "Cargando…"}</p>
          )}
          <Dialog.Close className="btn-ghost mt-4 w-full">Cerrar</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Correction({ row }: { row: AttendanceRow }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn-ghost text-sm">Corregir</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto card-base p-6">
          <Dialog.Title className="text-xl font-bold">
            Corregir asistencia
          </Dialog.Title>
          <Dialog.Description className="text-sm text-slate-400 mb-4">
            {row.employee.full_name} · {row.schedule.work_date} ·{" "}
            {shiftLabel(row.schedule.shift)}. El motivo y los valores anteriores
            se guardarán en auditoría. Tolerancia aplicada:{" "}
            {row.record?.tolerance_minutes_applied ??
              row.employee.late_tolerance_minutes}{" "}
            minutos.
          </Dialog.Description>
          <MutationForm
            action={correctAttendance}
            onSuccess={() => setOpen(false)}
          >
            <input type="hidden" name="schedule_id" value={row.schedule.id} />
            <input
              type="hidden"
              name="work_date"
              value={row.schedule.work_date}
            />
            <label className="block">
              Horario programado
              <input
                type="time"
                name="scheduled_time"
                defaultValue={row.schedule.scheduled_time?.slice(0, 5) ?? ""}
                className="import-input"
              />
            </label>
            <label className="flex gap-3">
              <input
                type="checkbox"
                name="is_day_off"
                defaultChecked={row.schedule.is_day_off}
                className="w-5 h-5"
              />
              Descanso
            </label>
            <label className="block">
              Entrada corregida (hora Perú)
              <input
                type="time"
                name="check_in_time"
                defaultValue={
                  row.record?.check_in_at
                    ? limaTime(row.record.check_in_at)
                    : ""
                }
                className="import-input"
              />
            </label>
            <label className="block">
              Estado
              <select
                name="status"
                defaultValue={row.status}
                className="import-input"
              >
                {Object.entries(STATUS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-400">
              Puntual y tarde se recalculan según la hora corregida y la
              tolerancia.
            </p>
            <label className="block">
              Observación
              <textarea
                name="notes"
                defaultValue={row.record?.notes ?? ""}
                maxLength={2000}
                className="import-input"
              />
            </label>
            <label className="block">
              Motivo obligatorio
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={2000}
                className="import-input"
              />
            </label>
          </MutationForm>
          <Dialog.Close className="btn-ghost w-full mt-3">
            Cancelar
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export default function AttendanceList({
  rows,
  admin = false,
  mode = "attendance",
}: {
  rows: AttendanceRow[];
  admin?: boolean;
  mode?: "attendance" | "schedule" | "history";
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [shift, setShift] = useState("all"),
    [date, setDate] = useState("");
  const visible = rows.filter(
    (row) =>
      (status === "all" || row.status === status) &&
      (shift === "all" || row.schedule.shift === shift) &&
      (!date || row.schedule.work_date === date) &&
      normalizeName(
        `${row.employee.full_name} ${row.employee.employee_code}`,
      ).includes(normalizeName(query)),
  );
  const badge = (row: AttendanceRow) => (
    <span
      className={`attendance-badge ${row.status === "on_time" ? "green" : row.status === "late" ? "amber" : row.status === "absent" ? "red" : "neutral"}`}
    >
      {ROW_STATUS[row.status].label}
    </span>
  );
  const actions = (row: AttendanceRow) => (
    <div className="flex gap-2 flex-wrap">
      {row.record?.photo_storage_path && <Evidence recordId={row.record.id} />}{" "}
      {admin && row.schedule.shift === "day" && mode !== "schedule" && (
        <Correction row={row} />
      )}
    </div>
  );
  return (
    <div>
      <AttendanceToolbar>
        <label>
          Buscar empleado
          <input
            placeholder="Nombre o código…"
            className="import-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Fecha
          <input
            type="date"
            className="import-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Turno
          <select
            className="import-input"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="day">Turno día</option>
            <option value="night">Turno noche</option>
          </select>
        </label>
        <label>
          Estado
          <select
            className="import-input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos</option>
            {Object.entries(ROW_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </AttendanceToolbar>
      <div className="attendance-table-wrap attendance-desktop">
        <table
          className={`attendance-table attendance-list-table mode-${mode}`}
        >
          <caption className="sr-only">
            {mode === "schedule"
              ? "Horarios del personal"
              : "Registros de asistencia"}
          </caption>
          <thead>
            <tr>
              {[
                "Empleado",
                "Fecha / turno",
                "Horario",
                ...(mode === "schedule" ? [] : ["Llegada", "Tolerancia"]),
                "Estado",
                ...(mode === "history" ? ["Min. tarde", "Observación"] : []),
                ...(mode === "schedule" ? [] : ["Foto / acciones"]),
              ].map((x) => (
                <th scope="col" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.schedule.id}>
                <td>
                  <div className="flex gap-3 items-center">
                    <EmployeeAvatar name={row.employee.full_name} />
                    <div>
                      <p className="font-semibold">{row.employee.full_name}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {row.employee.employee_code}
                      </p>
                    </div>
                  </div>
                </td>
                <td>
                  <p>{row.schedule.work_date}</p>
                  <p className="text-[10px] text-purple-300 mt-1">
                    {row.schedule.shift === "night"
                      ? "☾ Turno noche"
                      : "Turno día"}
                  </p>
                </td>
                <td>
                  {row.schedule.scheduled_time?.slice(0, 5) ?? "Descanso"}
                </td>
                {mode !== "schedule" && (
                  <>
                    <td>
                      {row.schedule.shift === "day"
                        ? limaTime(row.record?.check_in_at ?? null)
                        : "—"}
                    </td>
                    <td>
                      {row.schedule.shift === "day"
                        ? `${row.record?.tolerance_minutes_applied ?? row.employee.late_tolerance_minutes} min`
                        : "—"}
                    </td>
                  </>
                )}
                <td>{badge(row)}</td>
                {mode === "history" && (
                  <>
                    <td>
                      {row.schedule.shift === "day" ? row.minutesLate : "—"}
                    </td>
                    <td className="max-w-40 break-words">
                      {row.record?.notes || "—"}
                    </td>
                  </>
                )}
                {mode !== "schedule" && <td>{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="attendance-mobile">
        {visible.map((row) => (
          <article className="attendance-panel p-5" key={row.schedule.id}>
            <div className="flex items-center gap-3">
              <EmployeeAvatar name={row.employee.full_name} />
              <div>
                <h3 className="font-semibold">{row.employee.full_name}</h3>
                <p className="text-xs text-slate-400">
                  {row.employee.employee_code}
                </p>
              </div>
            </div>
            <p className="text-xs text-purple-300 my-3">
              {row.schedule.work_date} · {shiftLabel(row.schedule.shift)}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <p className="text-slate-400">
                Programado
                <br />
                <strong className="text-slate-200">
                  {row.schedule.scheduled_time?.slice(0, 5) ?? "Descanso"}
                </strong>
              </p>
              {mode !== "schedule" && row.schedule.shift === "day" && (
                <p className="text-slate-400">
                  Entrada
                  <br />
                  <strong className="text-slate-200">
                    {limaTime(row.record?.check_in_at ?? null)}
                  </strong>
                </p>
              )}
            </div>
            {badge(row)}
            {row.schedule.shift === "day" && mode !== "schedule" && (
              <p className="text-xs text-slate-400 my-3">
                Tolerancia aplicada:{" "}
                {row.record?.tolerance_minutes_applied ??
                  row.employee.late_tolerance_minutes}{" "}
                min · Tarde: {row.minutesLate} min
              </p>
            )}
            {row.record?.notes && (
              <p className="text-sm my-3">{row.record.notes}</p>
            )}
            {mode !== "schedule" && <div className="mt-4">{actions(row)}</div>}
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="attendance-empty">
          No hay registros para este período y filtro.
        </p>
      )}
    </div>
  );
}
