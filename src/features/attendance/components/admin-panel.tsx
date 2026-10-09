import Link from "next/link";
import Settings from "./settings";
import ReportDashboard from "./report-dashboard";
import RefreshClock from "./refresh-clock";
import type { AttendanceData, AuditLog } from "../types";
import { attendanceRows, limaDate } from "../domain";
import Summary from "./summary";
import AttendanceList from "./attendance-list";
import Personal from "./personal";
import ScheduleImport from "./schedule-import";
import MutationForm from "./mutation-form";
import { saveSchedule, closeAttendanceDay } from "../actions";
export function PeriodFilter({ from, to }: { from: string; to: string }) {
  return (
    <form className="flex flex-wrap items-end gap-3 mb-6">
      <label>
        Desde
        <input
          type="date"
          name="from"
          defaultValue={from}
          required
          className="import-input"
        />
      </label>
      <label>
        Hasta
        <input
          type="date"
          name="to"
          defaultValue={to}
          required
          className="import-input"
        />
      </label>
      <button className="btn-ghost">Consultar período</button>
    </form>
  );
}
export default function AdminPanel({
  section,
  data,
  audit = [],
  dailyData,
}: {
  section: string;
  data: AttendanceData;
  audit?: AuditLog[];
  dailyData?: AttendanceData;
}) {
  const today = limaDate(new Date(data.serverNow)),
    rows = attendanceRows(data);
  if (section === "personal")
    return (
      <Personal
        employees={data.employees}
        attendedToday={
          new Set(
            rows
              .filter(
                (r) =>
                  r.schedule.work_date === today &&
                  r.schedule.shift === "day" &&
                  ["on_time", "late"].includes(r.status),
              )
              .map((r) => r.employee.id),
          ).size
        }
      />
    );
  if (section === "importar") return <ScheduleImport />;
  if (section === "configuracion") return <Settings settings={data.settings} />;
  if (section === "reportes")
    return (
      <div>
        <PeriodFilter from={data.from} to={data.to} />
        <ReportDashboard data={data} dailyData={dailyData} />
      </div>
    );
  if (section === "horarios")
    return (
      <div className="space-y-6">
        <PeriodFilter from={data.from} to={data.to} />
        <details className="card-base p-5">
          <summary className="font-bold cursor-pointer py-2">
            Agregar o actualizar un horario
          </summary>
          <div className="max-w-xl mt-4">
            <MutationForm action={saveSchedule}>
              <label className="block">
                Turno
                <select name="shift" className="import-input">
                  <option value="day">Turno Día</option>
                  <option value="night">Turno Noche</option>
                </select>
              </label>
              <label className="block">
                Empleado
                <select name="employee_id" required className="import-input">
                  <option value="">Seleccionar</option>
                  {data.employees
                    .filter((e) => e.active)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.employee_code} · {e.full_name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                Fecha
                <input
                  name="work_date"
                  type="date"
                  defaultValue={today}
                  required
                  className="import-input"
                />
              </label>
              <label className="block">
                Hora
                <input
                  name="scheduled_time"
                  type="time"
                  defaultValue="10:00"
                  className="import-input"
                />
              </label>
              <label className="flex gap-3">
                <input name="is_day_off" type="checkbox" className="w-5 h-5" />
                Descanso
              </label>
              <label className="block">
                Motivo
                <input
                  name="reason"
                  required
                  minLength={3}
                  maxLength={2000}
                  className="import-input"
                />
              </label>
              <p className="text-xs text-slate-400">
                Cada fecha es independiente. Si el día ya tiene un registro, usa
                Corregir en Historial.
              </p>
            </MutationForm>
          </div>
        </details>
        <AttendanceList rows={rows} admin mode="schedule" />
      </div>
    );
  if (section === "historial")
    return (
      <div className="space-y-6">
        <PeriodFilter from={data.from} to={data.to} />
        <Summary rows={rows} />
        <AttendanceList rows={rows.toReversed()} admin mode="history" />
        <details className="card-base p-5">
          <summary className="font-bold cursor-pointer">
            Auditoría de cambios
          </summary>
          <p className="text-xs text-slate-400 mt-2">
            Se muestran los últimos 200 cambios del período.
          </p>
          {audit.map((entry) => (
            <div
              key={entry.id}
              className="border-t border-purple-900 py-3 mt-3 text-sm"
            >
              <p className="text-purple-200">
                {entry.action} ·{" "}
                {new Intl.DateTimeFormat("es-PE", {
                  timeZone: "America/Lima",
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(entry.created_at))}
              </p>
              <p>Motivo: {entry.reason}</p>
              <p className="text-xs text-slate-500">
                Responsable: {entry.performed_by}
              </p>
              <details>
                <summary className="cursor-pointer text-xs text-slate-400 py-2">
                  Ver antes y después
                </summary>
                <pre className="whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(
                    { antes: entry.before_data, despues: entry.after_data },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          ))}
        </details>
      </div>
    );
  const daily = rows.filter((row) => row.schedule.work_date === today);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-lg">Asistencia de hoy · {today}</h2>
        <RefreshClock />
      </div>
      <Summary rows={daily} compact />
      <AttendanceList rows={daily} admin />
      <details className="card-base p-5">
        <summary className="font-bold cursor-pointer text-amber-200 py-2">
          Cerrar asistencia del día
        </summary>
        <p className="text-sm text-slate-400 my-3">
          Las entradas existentes se conservan. Los pendientes se registrarán
          como falta y los descansos como descanso. Esta acción queda auditada.
        </p>
        <div className="max-w-xl">
          <MutationForm
            action={closeAttendanceDay}
            button="Cerrar día y registrar pendientes"
          >
            <label className="block">
              Fecha
              <input
                name="work_date"
                type="date"
                defaultValue={today}
                max={today}
                required
                className="import-input"
              />
            </label>
            <label className="block">
              Motivo
              <input
                name="reason"
                required
                minLength={3}
                maxLength={2000}
                className="import-input"
              />
            </label>
            <label className="flex gap-3">
              <input
                type="checkbox"
                name="confirm"
                required
                className="w-5 h-5"
              />
              Confirmo que los pendientes del día pasarán a falta.
            </label>
          </MutationForm>
        </div>
      </details>
      <Link
        href="/admin/asistencia/horarios"
        className="text-purple-300 underline"
      >
        Consultar horarios por fecha
      </Link>
    </div>
  );
}
