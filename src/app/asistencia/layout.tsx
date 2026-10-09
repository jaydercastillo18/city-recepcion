import "@/features/attendance/attendance.css";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/actions";
import AppHeader from "@/components/layout/app-header";
import ShipmentBackdrop from "@/components/layout/shipment-backdrop";
export const instant = false;
export const metadata = { title: "Mi asistencia | City Ofertas" };
export default async function AttendanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const auth = await getCurrentUser();
  if (!auth) redirect("/login");
  if (auth.profile?.role === "admin") redirect("/admin/asistencia");
  if (auth.profile?.role === "warehouse") redirect("/recepcion");
  if (!auth.profile || !["employee", "admin"].includes(auth.profile.role))
    redirect("/login");
  return (
    <div className="min-h-dvh">
      <AppHeader
        userEmail={auth.user.email ?? ""}
        userName={auth.profile.full_name ?? ""}
        userRole={auth.profile.role}
      />
      <main className="max-w-4xl mx-auto p-4 py-6 shipment-scene attendance-shell">
        <ShipmentBackdrop />
        {children}
      </main>
    </div>
  );
}
