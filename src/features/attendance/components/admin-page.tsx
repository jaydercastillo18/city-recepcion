import { getAttendanceData, attendanceSession } from "../server";
import AdminPanel from "./admin-panel";
import type { AttendanceData, AuditLog } from "../types";
export default async function AttendanceAdminPage({
  section,
  from,
  to,
}: {
  section: string;
  from?: string;
  to?: string;
}) {
  let data: AttendanceData | null = null,
    entries: AuditLog[] = [],
    message = "";
  try {
    await attendanceSession(true);
    data = await getAttendanceData(from, to);
    const { client } = await attendanceSession(true);
    if (section === "personal") {
      const statuses = await client.rpc("attendance_admin_command", {
        p_action: "access_statuses",
        p_data: { reason: "Consultar estados de acceso de personal" },
      });
      if (statuses.error)
        throw new Error("No se pudieron consultar los estados de acceso.");
      const states = statuses.data as Record<
        string,
        import("../invitations").AccountState
      >;
      data.employees = data.employees.map((e) => ({
        ...e,
        access_status: states[e.id] ?? "no_access",
      }));
    }
    const audit =
      section === "historial"
        ? await client
            .from("attendance_audit_log")
            .select("*")
            .gte("created_at", `${data.from}T00:00:00-05:00`)
            .lte("created_at", `${data.to}T23:59:59.999-05:00`)
            .order("created_at", { ascending: false })
            .limit(200)
        : { data: [], error: null };
    if (audit.error) throw new Error("No se pudo cargar la auditoría.");
    entries = audit.data ?? [];
  } catch (error) {
    message =
      error instanceof Error ? error.message : "No se pudo cargar asistencia.";
  }
  if (!data || message)
    return (
      <div className="card-base p-6 text-amber-200" role="alert">
        {message}
      </div>
    );
  return <AdminPanel section={section} data={data} audit={entries} />;
}
