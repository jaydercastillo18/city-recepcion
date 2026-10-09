"use client";
import { useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import type { AttendanceRow } from "../types";
import { STATUS, ROW_STATUS, limaTime, shiftLabel } from "../domain";
import { correctAttendance } from "../actions";
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
}: {
  rows: AttendanceRow[];
  admin?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const visible = rows.filter(
    (row) =>
      (status === "all" || row.status === status) &&
      `${row.employee.full_name} ${row.employee.employee_code}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1">
          Buscar empleado
          <input
            className="import-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Estado
          <select
            className="import-input"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Todos</option>
            {Object.entries(ROW_STATUS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visible.map((row) => (
        <article
          key={row.schedule.id}
          className="card-base p-5 flex flex-col sm:flex-row justify-between gap-4"
        >
          <div>
            <p className="text-xs text-fuchsia-300">
              {row.schedule.work_date} · {shiftLabel(row.schedule.shift)} ·{" "}
              {row.employee.employee_code}
            </p>
            <h3 className="font-bold">{row.employee.full_name}</h3>
            <p className="text-sm text-slate-400">
              {row.employee.position} · Programado{" "}
              {row.schedule.scheduled_time?.slice(0, 5) ?? "Descanso"}
              {row.schedule.shift === "day" && (
                <> · Entrada {limaTime(row.record?.check_in_at ?? null)}</>
              )}
            </p>
            <p
              className={`text-sm font-semibold mt-2 ${ROW_STATUS[row.status].color}`}
            >
              {ROW_STATUS[row.status].icon} {ROW_STATUS[row.status].label}
              {row.minutesLate > 0 ? ` · ${row.minutesLate} min` : ""}
            </p>
            {row.record && (
              <p className="text-xs text-purple-200 mt-1">
                Tolerancia aplicada: {row.record.tolerance_minutes_applied}{" "}
                minutos
              </p>
            )}
            {row.record?.notes && (
              <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">
                {row.record.notes}
              </p>
            )}
            {row.status === "absent" && !row.record && (
              <p className="text-xs text-slate-500 mt-1">
                Hora límite superada; pendiente de cierre administrativo.
              </p>
            )}
          </div>
          <div className="flex gap-2 items-start flex-wrap">
            {row.record?.photo_storage_path && (
              <Evidence recordId={row.record.id} />
            )}
            {admin && row.schedule.shift === "day" && <Correction row={row} />}
          </div>
        </article>
      ))}
      {!visible.length && (
        <p className="card-base p-8 text-slate-400">
          No hay registros para este período y filtro.
        </p>
      )}
    </div>
  );
}
