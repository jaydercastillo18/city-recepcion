"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Employee, Schedule, SchedulePreview } from "../types";
import { EmployeeEditor } from "./personal";
import { limaDate, shiftLabel, scheduleChange } from "../domain";
import { ATTENDANCE_FILE_LIMIT, ATTENDANCE_PAYLOAD_LIMIT } from "../limits";
async function importRequest(form: FormData) {
  const request = new Request(
    new URL("/api/asistencia/import", window.location.origin),
    { method: "POST", body: form },
  );
  if ((await request.clone().blob()).size > ATTENDANCE_PAYLOAD_LIMIT)
    throw new Error(
      "El archivo y sus selecciones exceden el tamaño permitido. Divide el período en archivos más pequeños.",
    );
  const response = await fetch(request);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "No se pudo procesar el archivo.");
  return result;
}
export default function ScheduleImport() {
  const [file, setFile] = useState<File | null>(null),
    [availableDates, setAvailableDates] = useState<string[]>([]),
    [targetDate, setTargetDate] = useState(limaDate()),
    [year, setYear] = useState(new Date().getFullYear()),
    [preview, setPreview] = useState<SchedulePreview | null>(null),
    [employees, setEmployees] = useState<Employee[]>([]),
    [schedules, setSchedules] = useState<Schedule[]>([]),
    [selection, setSelection] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [accept, setAccept] = useState(false),
    [reason, setReason] = useState("Importación de horario Excel"),
    [page, setPage] = useState(0),
    [requestId, setRequestId] = useState("");
  const router = useRouter();
  async function load() {
    if (!file) return;
    setBusy(true);
    setError("");
    setSuccess("");
    setPreview(null);
    setAccept(false);
    setPage(0);
    try {
      if (file.size > ATTENDANCE_FILE_LIMIT)
        throw new Error("Selecciona un Excel de hasta 3 MB.");
      const form = new FormData();
      form.set("file", file);
      form.set("year", String(year));
      form.set("target_date", targetDate);
      const result = await importRequest(form);
      setPreview(result.preview);
      setAvailableDates(result.preview.availableDates);
      setEmployees(result.employees);
      setSchedules(result.schedules);
      setSelection(
        Object.fromEntries(
          result.preview.rows.map(
            (r: { key: string; employeeId: string | null }) => [
              r.key,
              r.employeeId ?? "",
            ],
          ),
        ),
      );
      setRequestId(crypto.randomUUID());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo leer el archivo.",
      );
    } finally {
      setBusy(false);
    }
  }
  const oldSchedule = (key: string, date: string, shift: string) =>
    schedules.find(
      (s) =>
        s.employee_id === selection[key] &&
        s.work_date === date &&
        s.shift === shift,
    );
  const replacements =
    preview?.rows.filter((r) => {
      const old = oldSchedule(r.key, r.workDate, r.shift);
      return scheduleChange(r, old) === "ACTUALIZAR";
    }).length ?? 0;
  const unresolved =
    preview?.rows.filter((r) => !selection[r.key] || r.error).length ?? 0;
  const duplicateKeys =
    preview?.rows.map((r) => `${selection[r.key]}:${r.workDate}:${r.shift}`) ??
    [];
  const duplicates = new Set(duplicateKeys).size !== duplicateKeys.length;
  async function confirm() {
    if (!preview || !file || busy) return;
    setBusy(true);
    setError("");
    try {
      const choices = Object.fromEntries(
        preview.rows.map((r) => [
          r.key,
          {
            employeeId: selection[r.key],
            version:
              oldSchedule(r.key, r.workDate, r.shift)?.updated_at ?? null,
          },
        ]),
      );
      const form = new FormData();
      form.set("file", file);
      form.set("year", String(year));
      form.set("target_date", targetDate);
      form.set("file_hash", preview.fileHash);
      form.set("confirm", "true");
      form.set("choices", JSON.stringify(choices));
      form.set("accept_updates", String(accept));
      form.set("reason", reason);
      form.set("request_id", requestId);
      const result = await importRequest(form);
      setSuccess(
        `${result.result.count ?? 0} horarios creados o actualizados · ${result.result.unchanged ?? 0} sin cambios.`,
      );
      setPreview(null);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo importar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card-base p-5 space-y-5">
      <h2 className="text-lg font-bold">Importar horario de personal</h2>
      <p className="text-sm text-slate-400">
        Columnas NOMBRE, FUNCIÓN y fechas (6-Oct, 7-Oct…). Se aceptan 09:00,
        9:00 a. m., horas de Excel y DESCANSO. Las celdas vacías se omiten.
        Excel de hasta 3 MB.
      </p>
      <div className="grid sm:grid-cols-[1fr_8rem] gap-4">
        <label>
          Excel
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={busy}
            className="import-input"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setAvailableDates([]);
              setPreview(null);
              setSuccess("");
            }}
          />
        </label>
        <label>
          Año
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            disabled={busy}
            className="import-input"
            onChange={(event) => {
              setYear(Number(event.target.value));
              setAvailableDates([]);
              setPreview(null);
            }}
          />
        </label>
      </div>
      <label className="block">
        Fecha objetivo de importación
        <input
          type="date"
          className="import-input"
          value={targetDate}
          required
          disabled={busy}
          onChange={(event) => {
            setTargetDate(event.target.value);
            setPreview(null);
            setAccept(false);
          }}
        />
      </label>
      {availableDates.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Fechas detectadas en el Excel"
        >
          {availableDates.map((date) => (
            <button
              key={date}
              type="button"
              disabled={busy}
              aria-pressed={date === targetDate}
              className="btn-ghost"
              onClick={() => {
                setTargetDate(date);
                setPreview(null);
                setAccept(false);
              }}
            >
              {date}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-purple-200">
        Solo se importará esta fecha. Para cargar un día anterior, selecciónalo
        expresamente y genera una nueva vista previa.
      </p>
      <button
        className="btn-primary"
        disabled={!file || busy || !targetDate}
        onClick={() => void load()}
      >
        {busy ? "Procesando…" : "Generar vista previa"}
      </button>
      {preview && (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Fechas detectadas: {preview.availableDates.join(" · ") || "Ninguna"}
            . Fecha objetivo: {preview.targetDate ?? "Seleccionar"}.
          </p>
          <p className="text-purple-200">
            {preview.rows.length} horarios · {unresolved} filas por resolver ·{" "}
            {replacements} horarios existentes
          </p>
          {preview.warnings.map((v) => (
            <p key={v} className="text-amber-200 text-sm">
              {v}
            </p>
          ))}
          {preview.errors.map((v) => (
            <p key={v} className="text-red-300 text-sm">
              {v}
            </p>
          ))}
          {duplicates && (
            <p role="alert" className="text-red-300">
              Hay filas duplicadas para un mismo empleado, fecha y turno.
              Corrige el Excel o la selección.
            </p>
          )}
          <EmployeeEditor
            label="Crear empleado no encontrado"
            onSaved={() => void load()}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-purple-200">
                  <th className="p-2">Nombre del Excel / empleado</th>
                  <th className="p-2">Fecha / turno</th>
                  <th className="p-2">Anterior</th>
                  <th className="p-2">Nuevo</th>
                  <th className="p-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(page * 50, page * 50 + 50).map((row) => {
                  const old = oldSchedule(row.key, row.workDate, row.shift);
                  return (
                    <tr key={row.key} className="border-t border-purple-900">
                      <td className="p-2">
                        <p>{row.name}</p>
                        <select
                          aria-label={`Empleado para ${row.name}, ${row.workDate}`}
                          className="import-input"
                          disabled={busy}
                          value={selection[row.key] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setSelection((previous) => ({
                              ...previous,
                              ...Object.fromEntries(
                                preview.rows
                                  .filter((r) => r.name === row.name)
                                  .map((r) => [r.key, value]),
                              ),
                            }));
                            setAccept(false);
                          }}
                        >
                          <option value="">
                            {row.candidates.length > 1
                              ? "Coincidencia ambigua: elegir"
                              : "Empleado no encontrado: elegir"}
                          </option>
                          {employees
                            .filter((e) => e.active)
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.employee_code} · {e.full_name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="p-2">
                        {row.workDate}
                        <p>{shiftLabel(row.shift)}</p>
                      </td>
                      <td className="p-2">
                        {old
                          ? old.is_day_off
                            ? "DESCANSO"
                            : old.scheduled_time?.slice(0, 5)
                          : "—"}
                      </td>
                      <td className="p-2">
                        {row.error ? (
                          <span className="text-red-300">{row.error}</span>
                        ) : row.dayOff ? (
                          "DESCANSO"
                        ) : (
                          row.time?.slice(0, 5)
                        )}
                      </td>
                      <td
                        className={`p-2 ${old ? "text-amber-200" : "text-emerald-300"}`}
                      >
                        {!selection[row.key]
                          ? "ERROR"
                          : scheduleChange(row, old)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center">
            <button
              className="btn-ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span className="text-sm">
              Página {page + 1} /{" "}
              {Math.max(1, Math.ceil(preview.rows.length / 50))}
            </span>
            <button
              className="btn-ghost"
              disabled={(page + 1) * 50 >= preview.rows.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
          {replacements > 0 && (
            <label className="flex gap-3 text-amber-200">
              <input
                type="checkbox"
                checked={accept}
                onChange={(event) => setAccept(event.target.checked)}
                className="w-5 h-5 shrink-0"
              />
              Confirmo actualizar los horarios existentes indicados en la vista
              previa. Los días con marcaciones requieren corrección
              administrativa.
            </label>
          )}
          <label className="block">
            Motivo
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="import-input"
              minLength={3}
              maxLength={2000}
            />
          </label>
          <button
            className="btn-primary w-full"
            onClick={() => void confirm()}
            disabled={
              busy ||
              unresolved > 0 ||
              duplicates ||
              preview.errors.length > 0 ||
              !preview.targetDate ||
              preview.rows.length === 0 ||
              (replacements > 0 && !accept) ||
              reason.trim().length < 3
            }
          >
            Confirmar importación de horarios
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-emerald-300">
          {success}
        </p>
      )}
    </section>
  );
}
