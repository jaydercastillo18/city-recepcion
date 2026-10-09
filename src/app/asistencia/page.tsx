import { connection } from "next/server";
import { getAttendanceData } from "@/features/attendance/server";
import {
  attendanceRows,
  limaDate,
  ROW_STATUS as STATUS,
  shiftLabel,
} from "@/features/attendance/domain";
import Summary from "@/features/attendance/components/summary";
import CheckIn from "@/features/attendance/components/check-in";
import AttendanceList from "@/features/attendance/components/attendance-list";
import type { AttendanceData } from "@/features/attendance/types";
import RefreshClock from "@/features/attendance/components/refresh-clock";
export const instant = false;
export default async function MyAttendance({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  let data: AttendanceData | null = null,
    daily: AttendanceData | null = null,
    message = "";
  try {
    const search = await searchParams;
    data = await getAttendanceData(search.from, search.to);
    const today = limaDate(new Date(data.serverNow));
    daily =
      data.from <= today && data.to >= today
        ? data
        : await getAttendanceData(today, today);
  } catch (error) {
    message =
      error instanceof Error ? error.message : "No se pudo cargar asistencia.";
  }
  if (!data || !daily)
    return (
      <div className="card-base p-6 text-amber-200" role="alert">
        {message}
      </div>
    );
  const today = limaDate(new Date(data.serverNow)),
    employee = data.employees[0],
    rows = attendanceRows(data);
  if (!employee)
    return (
      <div className="card-base p-8">
        <h1 className="text-xl font-bold">Mi asistencia</h1>
        <p className="text-slate-400 mt-3">
          Tu cuenta aún no está vinculada a personal. Solicita al administrador
          que complete la vinculación.
        </p>
      </div>
    );
  const todayRows = attendanceRows(daily).filter(
    (r) => r.schedule.work_date === today,
  );
  return (
    <div className="space-y-6">
      <RefreshClock />
      <div>
        <h1 className="text-2xl font-bold">
          Hola, {employee.full_name.split(" ")[0]} 👋
        </h1>
        <p className="text-slate-400">
          {new Intl.DateTimeFormat("es-PE", {
            timeZone: "America/Lima",
            dateStyle: "full",
          }).format(new Date(data.serverNow))}
        </p>
      </div>
      <p className="text-purple-200">
        Tu tolerancia actual: {employee.late_tolerance_minutes} minutos
      </p>
      {!todayRows.length && (
        <p className="card-base p-6">No tienes horario asignado hoy.</p>
      )}
      {todayRows.map((row) => {
        if (row.schedule.shift === "night")
          return (
            <section key={row.schedule.id} className="card-base p-6 space-y-3">
              <h2 className="text-xl font-bold">Turno noche</h2>
              <p className="text-3xl font-bold">
                {row.schedule.is_day_off
                  ? "Descanso"
                  : row.schedule.scheduled_time?.slice(0, 5)}
              </p>
              <p className="text-slate-400">Sin control de asistencia</p>
            </section>
          );
        const blocked =
          !employee.active ||
          row.schedule.is_day_off ||
          Boolean(row.record && row.record.status !== "pending") ||
          row.status === "absent";
        return (
          <section key={row.schedule.id} className="card-base p-6 space-y-4">
            <p className="text-fuchsia-300">
              HORARIO DE HOY · {shiftLabel(row.schedule.shift)}
            </p>
            <p className="text-4xl font-bold">
              {row.schedule.is_day_off
                ? "Descanso"
                : row.schedule.scheduled_time?.slice(0, 5)}
            </p>
            <p className={STATUS[row.status].color}>
              {STATUS[row.status].icon} {STATUS[row.status].label}
            </p>
            {row.record && (
              <p className="text-sm text-slate-400">
                Tolerancia aplicada: {row.record.tolerance_minutes_applied}{" "}
                minutos
              </p>
            )}
            <CheckIn
              scheduleId={row.schedule.id}
              disabled={blocked}
              explanation={
                !employee.active
                  ? "Tu ficha está inactiva."
                  : row.schedule.is_day_off
                    ? "Este turno es descanso."
                    : row.record && row.record.status !== "pending"
                      ? "Tu registro de este turno ya existe."
                      : row.status === "absent"
                        ? "La hora límite pasó. Solicita revisión administrativa."
                        : "Foto privada de evidencia; no se usa reconocimiento facial."
              }
            />
          </section>
        );
      })}
      <form className="card-base p-4 flex flex-wrap gap-3 items-end">
        <label>
          Desde
          <input
            type="date"
            name="from"
            defaultValue={data.from}
            required
            className="import-input"
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            name="to"
            defaultValue={data.to}
            required
            className="import-input"
          />
        </label>
        <button className="btn-ghost">Consultar mi historial / horario</button>
      </form>
      <section>
        <h2 className="text-lg font-bold mb-4">Resumen del período</h2>
        <Summary rows={rows} />
      </section>
      <section>
        <h2 className="text-lg font-bold mb-4">Historial y horario propio</h2>
        <AttendanceList rows={[...rows].reverse()} />
      </section>
      <a
        className="btn-ghost w-full"
        href={`/api/asistencia/report?format=excel&from=${data.from}&to=${data.to}`}
      >
        Descargar mi reporte del mes
      </a>
    </div>
  );
}
