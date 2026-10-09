import { scheduleChange } from "@/features/attendance/domain";
import { randomUUID } from "node:crypto";
import { attendanceSession } from "@/features/attendance/server";
import { parseAttendanceExcel } from "@/features/attendance/parser";
import { isSameOriginRequest } from "@/lib/security/request-origin";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import type { Json } from "@/types/database";
import { revalidatePath } from "next/cache";
import {
  ATTENDANCE_FILE_LIMIT,
  ATTENDANCE_PAYLOAD_LIMIT,
} from "@/features/attendance/limits";
export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json(
      { error: "Origen de solicitud no permitido." },
      { status: 403 },
    );
  try {
    const { client } = await attendanceSession(true);
    if (
      Number(request.headers.get("content-length") ?? 0) >
      ATTENDANCE_PAYLOAD_LIMIT
    )
      return Response.json(
        { error: "Archivo demasiado grande." },
        { status: 413 },
      );
    const form = await request.formData(),
      file = form.get("file"),
      year = Number(form.get("year"));
    if (
      !(file instanceof File) ||
      file.size > ATTENDANCE_FILE_LIMIT ||
      !/\.xlsx?$/i.test(file.name)
    )
      return Response.json(
        { error: "Selecciona un Excel .xlsx o .xls de hasta 3 MB." },
        { status: 400 },
      );
    const employees = await readAllRows((a, b) =>
      client.from("employees").select("*").order("id").range(a, b),
    );
    if (employees.error || !employees.data)
      throw new Error("No se pudo cargar personal.");
    const preview = parseAttendanceExcel(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
      year,
      employees.data,
      String(form.get("target_date") ?? "") || null,
    );
    const dates = preview.rows.map((r) => r.workDate).sort();
    const schedules = dates.length
      ? await readAllRows((a, b) =>
          client
            .from("attendance_schedules")
            .select("*")
            .gte("work_date", dates[0])
            .lte("work_date", dates.at(-1)!)
            .order("id")
            .range(a, b),
        )
      : { data: [], error: null };
    if (schedules.error)
      throw new Error("No se pudieron cargar los horarios anteriores.");
    if (form.get("confirm") !== "true") {
      const body = JSON.stringify({
        preview,
        employees: employees.data,
        schedules: schedules.data,
      });
      if (Buffer.byteLength(body) > ATTENDANCE_PAYLOAD_LIMIT)
        return Response.json(
          {
            error:
              "La vista previa es demasiado grande. Divide el archivo por períodos.",
          },
          { status: 413 },
        );
      return new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    if (
      !preview.targetDate ||
      preview.errors.length ||
      preview.rows.some((r) => r.error)
    )
      return Response.json(
        { error: "Corrige el Excel antes de confirmar." },
        { status: 400 },
      );
    if (String(form.get("file_hash")) !== preview.fileHash)
      throw new Error("El archivo cambió. Vuelve a generar la vista previa.");
    const choices = JSON.parse(String(form.get("choices"))) as Record<
      string,
      { employeeId: string; version: string | null }
    >;
    const seen = new Set<string>();
    let replacements = false;
    const rows = preview.rows.map((r) => {
      const choice = choices[r.key],
        employeeId = choice?.employeeId;
      if (
        !employeeId ||
        !employees.data!.some((e) => e.id === employeeId && e.active)
      )
        throw new Error("Elige un empleado activo para cada fila.");
      const key = `${employeeId}:${r.workDate}:${r.shift}`;
      if (seen.has(key))
        throw new Error(
          "Hay horarios duplicados para un empleado y fecha. Corrige el archivo o la selección.",
        );
      seen.add(key);
      const old = schedules.data?.find(
        (s) =>
          s.employee_id === employeeId &&
          s.work_date === r.workDate &&
          s.shift === r.shift,
      );
      if (scheduleChange(r, old) === "ACTUALIZAR") replacements = true;
      return {
        employee_id: employeeId,
        work_date: r.workDate,
        shift: r.shift,
        scheduled_time: r.time,
        is_day_off: r.dayOff,
        previous_version: choice.version,
      };
    });
    if (replacements && form.get("accept_updates") !== "true")
      throw new Error(
        "Confirma expresamente la actualización de horarios existentes.",
      );
    const reason = String(form.get("reason") ?? "").trim();
    if (reason.length < 3)
      throw new Error("Indica el motivo de la importación.");
    const requestId = String(form.get("request_id") ?? randomUUID());
    const result = await client.rpc("attendance_admin_command", {
      p_action: "import",
      p_data: {
        rows,
        target_date: preview.targetDate,
        file_name: preview.fileName,
        file_hash: preview.fileHash,
        warnings: preview.warnings,
        reason,
        request_id: requestId,
      } as Json,
    });
    if (result.error) throw new Error(result.error.message);
    revalidatePath("/admin/asistencia", "layout");
    revalidatePath("/asistencia");
    return Response.json({ success: true, result: result.data });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "No se pudo importar.",
      },
      { status: 400 },
    );
  }
}
