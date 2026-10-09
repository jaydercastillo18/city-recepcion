import { randomUUID } from "node:crypto";
import { isSameOriginRequest } from "@/lib/security/request-origin";
import { attendanceSession } from "@/features/attendance/server";
import { limaDate } from "@/features/attendance/domain";
export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json(
      { error: "Origen de solicitud no permitido." },
      { status: 403 },
    );
  try {
    const { client, user, profile } = await attendanceSession();
    if (profile.role !== "employee")
      return Response.json(
        { error: "Esta marcación corresponde al empleado autenticado." },
        { status: 403 },
      );
    if (Number(request.headers.get("content-length") ?? 0) > 2300000)
      return Response.json(
        { error: "La foto debe pesar menos de 2 MB." },
        { status: 413 },
      );
    const form = await request.formData(),
      photo = form.get("photo");
    const { data: employee } = await client
      .from("employees")
      .select("*")
      .eq("profile_id", user.id)
      .eq("active", true)
      .single();
    if (!employee)
      return Response.json(
        { error: "No tienes un empleado activo vinculado." },
        { status: 403 },
      );
    const { data: clock, error: clockError } = await client.rpc(
      "attendance_server_now",
    );
    if (clockError || !clock)
      return Response.json(
        { error: "No se pudo consultar el reloj del servidor." },
        { status: 503 },
      );
    const date = limaDate(new Date(clock));
    const scheduleId = String(form.get("schedule_id") ?? "") || null;
    let scheduleQuery = client
      .from("attendance_schedules")
      .select("id,shift")
      .eq("employee_id", employee.id)
      .eq("work_date", date);
    if (scheduleId) scheduleQuery = scheduleQuery.eq("id", scheduleId);
    const { data: schedules, error: scheduleError } = await scheduleQuery;
    if (scheduleError) throw new Error("No se pudo consultar el horario.");
    const schedule =
      schedules?.find((s) => s.shift === "day") ?? schedules?.[0];
    if (schedule?.shift === "night")
      return Response.json(
        { error: "El turno noche no requiere marcación de asistencia." },
        { status: 400 },
      );
    if (!schedule)
      return Response.json(
        { error: "No tienes horario programado para hoy." },
        { status: 400 },
      );
    if (
      !(photo instanceof File) ||
      photo.type !== "image/jpeg" ||
      photo.size > 2097152 ||
      photo.size < 100
    )
      return Response.json(
        { error: "Envía una foto JPEG válida de hasta 2 MB." },
        { status: 400 },
      );
    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
      return Response.json(
        { error: "El contenido no es una imagen JPEG." },
        { status: 400 },
      );
    const path = `attendance/${date.replace(/-/g, "/")}/${employee.employee_code}/${randomUUID()}.jpg`;
    const upload = await client.storage
      .from("attendance-evidence")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (upload.error)
      return Response.json(
        {
          error:
            "No se pudo guardar la foto privada. Revisa Storage y vuelve a intentar.",
        },
        { status: 400 },
      );
    const result = await client.rpc("register_attendance_check_in", {
      p_photo_path: path,
      p_schedule_id: String(form.get("schedule_id") ?? "") || null,
    });
    if (result.error) {
      await client.storage.from("attendance-evidence").remove([path]);
      return Response.json({ error: result.error.message }, { status: 400 });
    }
    return Response.json(
      { success: true, record: result.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo registrar la entrada.",
      },
      { status: 403 },
    );
  }
}
