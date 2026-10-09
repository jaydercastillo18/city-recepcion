import { connection } from "next/server";
import AttendanceAdminPage from "@/features/attendance/components/admin-page";
export const instant = false;
export default async function Page() {
  await connection();
  return <AttendanceAdminPage section="hoy" />;
}
