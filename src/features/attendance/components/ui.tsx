import type { LucideIcon } from "lucide-react";
import { initials, employeeState } from "../personnel";
import type { Employee } from "../types";
export function EmployeeAvatar({ name }: { name: string }) {
  return (
    <span className="attendance-avatar" aria-hidden="true">
      {initials(name)}
    </span>
  );
}
export const EMPLOYEE_STATES = {
  activated: { label: "Cuenta activada", tone: "green" },
  pending: { label: "Invitación pendiente", tone: "amber" },
  no_access: { label: "Sin acceso", tone: "neutral" },
  suspended: { label: "Suspendido", tone: "red" },
  inactive: { label: "Inactivo", tone: "neutral" },
  archived: { label: "Archivado", tone: "neutral" },
};
export function EmployeeStatusBadge({ employee }: { employee: Employee }) {
  const state = EMPLOYEE_STATES[employeeState(employee)];
  return (
    <span className={`attendance-badge ${state.tone}`}>
      <span aria-hidden="true" className="attendance-dot" />
      {state.label}
    </span>
  );
}
export function AttendanceKpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  tone = "violet",
}: {
  label: string;
  value: number | string;
  subtitle: string;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <article className={`attendance-kpi ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-widest text-slate-300 font-semibold">
          {label}
        </p>
        <span className="attendance-icon">
          <Icon size={19} aria-hidden="true" />
        </span>
      </div>
      <p className="text-3xl font-bold tracking-tight mt-3">{value}</p>
      <p className="text-xs text-slate-400 mt-2">{subtitle}</p>
    </article>
  );
}
export function AttendanceToolbar({ children }: { children: React.ReactNode }) {
  return <div className="attendance-toolbar">{children}</div>;
}
export function AttendanceEmpty({ children }: { children: React.ReactNode }) {
  return <div className="attendance-empty">{children}</div>;
}
