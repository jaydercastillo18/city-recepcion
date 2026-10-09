import {
  CalendarDays,
  UserRoundCheck,
  Clock3,
  AlarmClock,
  UserRoundX,
  Coffee,
  CheckCheck,
  FileCheck,
} from "lucide-react";
import { attendanceSummary } from "../domain";
import type { AttendanceRow } from "../types";
import { AttendanceKpiCard } from "./ui";
export default function Summary({
  rows,
  compact = false,
}: {
  rows: AttendanceRow[];
  compact?: boolean;
}) {
  const s = attendanceSummary(rows);
  return (
    <div className="attendance-kpis mb-6">
      {[
        {
          label: "Programados",
          value: s.scheduled,
          icon: CalendarDays,
          tone: "violet",
        },
        {
          label: "Asistidos",
          value: s.attended,
          icon: UserRoundCheck,
          tone: "green",
        },
        {
          label: "Puntuales",
          value: s.on_time,
          icon: CheckCheck,
          tone: "green",
        },
        { label: "Tardanzas", value: s.late, icon: Clock3, tone: "amber" },
        {
          label: "Pendientes",
          value: s.pending,
          icon: AlarmClock,
          tone: "violet",
        },
        { label: "Faltas", value: s.absent, icon: UserRoundX, tone: "red" },
        { label: "Descansos", value: s.day_off, icon: Coffee, tone: "violet" },
        {
          label: "Justificados",
          value: s.justified,
          icon: FileCheck,
          tone: "violet",
        },
      ]
        .filter(
          (c) => !compact || !["Asistidos", "Justificados"].includes(c.label),
        )
        .map((c) => (
          <AttendanceKpiCard
            key={c.label}
            {...c}
            subtitle="Solo horarios del turno día"
          />
        ))}
    </div>
  );
}
