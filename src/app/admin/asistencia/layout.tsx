import Link from "next/link";
import ShipmentBackdrop from "@/components/layout/shipment-backdrop";
export const metadata = { title: "Control de asistencia | City Ofertas" };
const sections = [
  ["", "Hoy"],
  ["personal", "Personal"],
  ["horarios", "Horarios"],
  ["importar", "Importar Excel"],
  ["historial", "Historial"],
  ["reportes", "Reportes"],
  ["configuracion", "Configuración"],
];
export default function AttendanceAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="shipment-scene">
      <ShipmentBackdrop />
      <div className="mb-6">
        <p className="text-fuchsia-300 text-xs tracking-widest">
          CITY OFERTAS · CHIMBOTE
        </p>
        <h1 className="text-2xl font-bold mt-1">Control de asistencia</h1>
      </div>
      <nav
        aria-label="Administración de asistencia"
        className="flex flex-wrap gap-2 mb-6"
      >
        {sections.map(([path, label]) => (
          <Link
            key={path}
            href={`/admin/asistencia${path ? `/${path}` : ""}`}
            className="card-base px-4 py-3 text-sm text-purple-200 hover:border-fuchsia-400"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
