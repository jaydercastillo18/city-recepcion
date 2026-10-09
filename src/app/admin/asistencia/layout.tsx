import { AttendanceShell } from "@/features/attendance/components/shell";
import "@/features/attendance/attendance.css";
export const metadata = { title: "Control de asistencia | City Ofertas" };
export default function AttendanceAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AttendanceShell>{children}</AttendanceShell>;
}
