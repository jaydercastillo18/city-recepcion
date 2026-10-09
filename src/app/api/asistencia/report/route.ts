import {
  getAttendanceData,
  attendanceSession,
} from "@/features/attendance/server";
import { attendanceExcel, attendancePdf } from "@/features/attendance/reports";
import { ATTENDANCE_PAYLOAD_LIMIT } from "@/features/attendance/limits";
export async function GET(request: Request) {
  try {
    const { profile } = await attendanceSession();
    const url = new URL(request.url),
      format = url.searchParams.get("format"),
      employee = url.searchParams.get("employee") ?? undefined;
    if (format !== "pdf" && format !== "excel")
      return Response.json({ error: "Formato inválido." }, { status: 400 });
    if (employee && !/^[a-f\d-]{36}$/i.test(employee))
      return Response.json({ error: "Empleado inválido." }, { status: 400 });
    const data = await getAttendanceData(
      url.searchParams.get("from") ?? undefined,
      url.searchParams.get("to") ?? undefined,
      employee,
    );
    if (!data.employees.length)
      return Response.json(
        { error: "Empleado no encontrado." },
        { status: 404 },
      );
    const responsible = profile.full_name ?? "Usuario autenticado";
    const bytes =
      format === "pdf"
        ? attendancePdf(data, responsible)
        : attendanceExcel(data, responsible);
    if (bytes.byteLength > ATTENDANCE_PAYLOAD_LIMIT)
      return Response.json(
        {
          error:
            "El reporte es demasiado grande. Reduce el período o selecciona un empleado.",
        },
        { status: 413 },
      );
    return new Response(bytes, {
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="asistencia-${data.from}-${data.to}.${format === "pdf" ? "pdf" : "xlsx"}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo generar el reporte.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}
