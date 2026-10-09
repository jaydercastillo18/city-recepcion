import { connection } from "next/server";
import { notFound } from "next/navigation";
import AttendanceAdminPage from "@/features/attendance/components/admin-page";
export const instant = false;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { section } = await params,
    search = await searchParams;
  if (
    ![
      "personal",
      "horarios",
      "importar",
      "historial",
      "reportes",
      "configuracion",
    ].includes(section)
  )
    notFound();
  return (
    <AttendanceAdminPage section={section} from={search.from} to={search.to} />
  );
}
