import { attendanceSummary, STATUS } from "../domain";
import type { AttendanceRow } from "../types";
export default function Summary({ rows }: { rows: AttendanceRow[] }) {
  const summary = attendanceSummary(rows);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div className="card-base p-4">
        <p className="text-2xl font-bold">{summary.scheduled}</p>
        <p className="text-xs text-slate-400">Días programados</p>
      </div>
      <div className="card-base p-4">
        <p className="text-2xl font-bold">{summary.attended}</p>
        <p className="text-xs text-slate-400">Asistidos</p>
      </div>
      {Object.entries(STATUS).map(([status, value]) => (
        <div key={status} className="card-base p-4">
          <p className={`text-2xl font-bold ${value.color}`}>
            {summary[status as keyof typeof STATUS]}
          </p>
          <p className="text-xs text-slate-400">
            {value.icon} {value.label}
          </p>
        </div>
      ))}
    </div>
  );
}
