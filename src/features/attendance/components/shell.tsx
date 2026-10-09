"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Users,
  Clock3,
  Upload,
  History,
  ChartNoAxesCombined,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import ShipmentBackdrop from "@/components/layout/shipment-backdrop";
const sections = [
  ["", "Hoy", CalendarDays],
  ["personal", "Personal", Users],
  ["horarios", "Horarios", Clock3],
  ["importar", "Importar Excel", Upload],
  ["historial", "Historial", History],
  ["reportes", "Reportes", ChartNoAxesCombined],
  ["configuracion", "Configuración", Settings2],
] as const;
export function AttendanceTabs() {
  const pathname = usePathname();
  return (
    <nav className="attendance-tabs" aria-label="Administración de asistencia">
      {sections.map(([path, label, Icon]) => {
        const href = `/admin/asistencia${path ? `/${path}` : ""}`;
        return (
          <Link
            key={path}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
export function AttendanceHero() {
  return (
    <section className="attendance-hero">
      <div>
        <p className="text-[11px] font-semibold tracking-[.24em] text-fuchsia-300 mb-3">
          CITY OFERTAS · CHIMBOTE
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Control de asistencia
        </h1>
        <p className="text-sm text-slate-300 mt-3">
          Gestión de personal y asistencia en tiempo real
        </p>
      </div>
      <span className="attendance-hero-label">
        <ShieldCheck size={16} aria-hidden="true" />
        Control del turno día
      </span>
    </section>
  );
}
export function AttendanceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="attendance-shell shipment-scene">
      <ShipmentBackdrop />
      <AttendanceHero />
      <AttendanceTabs />
      <div className="attendance-content">{children}</div>
    </div>
  );
}
