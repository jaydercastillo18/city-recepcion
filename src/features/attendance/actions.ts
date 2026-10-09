"use server";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { attendanceSession } from "./server";
import type { Json } from "@/types/database";
function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}
async function mutate(action: string, data: Json) {
  try {
    const { client } = await attendanceSession(true);
    const result = await client.rpc("attendance_admin_command", {
      p_action: action,
      p_data: data,
    });
    if (result.error) return { error: result.error.message };
    revalidatePath("/admin/asistencia", "layout");
    revalidatePath("/asistencia");
    return { success: true, data: result.data };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo guardar.",
    };
  }
}
export async function saveEmployee(form: FormData) {
  const name = text(form, "full_name"),
    email = text(form, "email");
  if (
    name.length < 2 ||
    name.length > 200 ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    return { error: "Revisa el nombre y correo del empleado." };
  const tolerance = Number(text(form, "late_tolerance_minutes"));
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 120)
    return { error: "La tolerancia debe ser un entero entre 0 y 120 minutos." };
  return mutate("employee", {
    id: text(form, "id") || null,
    full_name: name,
    position: text(form, "position"),
    email: email || null,
    phone: text(form, "phone"),
    active: form.get("active") === "on",
    late_tolerance_minutes: tolerance,
    reason: text(form, "reason"),
  });
}
export async function saveSchedule(form: FormData) {
  return mutate("schedule", {
    employee_id: text(form, "employee_id"),
    work_date: text(form, "work_date"),
    shift: text(form, "shift") || "day",
    scheduled_time:
      form.get("is_day_off") === "on" ? null : text(form, "scheduled_time"),
    is_day_off: form.get("is_day_off") === "on",
    reason: text(form, "reason"),
  });
}
export async function saveAttendanceSettings(form: FormData) {
  return mutate("settings", {
    absence_cutoff_minutes: Number(text(form, "absence_cutoff_minutes")),
    reason: text(form, "reason"),
  });
}
export async function closeAttendanceDay(form: FormData) {
  if (form.get("confirm") !== "on")
    return {
      error:
        "Confirma que deseas cerrar el día y registrar las faltas pendientes.",
    };
  return mutate("close", {
    work_date: text(form, "work_date"),
    reason: text(form, "reason"),
  });
}
export async function correctAttendance(form: FormData) {
  const day = text(form, "work_date"),
    time = text(form, "check_in_time");
  return mutate("correct", {
    schedule_id: text(form, "schedule_id"),
    status: text(form, "status"),
    scheduled_time:
      form.get("is_day_off") === "on" ? null : text(form, "scheduled_time"),
    is_day_off: form.get("is_day_off") === "on",
    check_in_at: time ? `${day}T${time}:00-05:00` : null,
    notes: text(form, "notes"),
    reason: text(form, "reason"),
  });
}
export async function inviteEmployee(employeeId: string) {
  try {
    const { client } = await attendanceSession(true);
    const { data: employee, error } = await client
      .from("employees")
      .select("*")
      .eq("id", employeeId)
      .single();
    if (error || !employee || !employee.active || !employee.email)
      return { error: "El empleado debe estar activo y tener correo." };
    if (employee.profile_id)
      return { error: "El empleado ya tiene una cuenta vinculada." };
    const lookup = await client.rpc("attendance_admin_command", {
      p_action: "lookup_account",
      p_data: {
        email: employee.email,
        reason: "Comprobar cuenta para invitación",
      },
    });
    if (lookup.error) return { error: lookup.error.message };
    const existing = lookup.data as { id: string; role: string } | null;
    let id = existing?.id;
    if (existing && existing.role !== "employee")
      return {
        error:
          "Ese correo pertenece a una cuenta admin/warehouse. Usa un correo de empleado; no se cambiará su rol.",
      };
    if (!id) {
      const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const site = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
      if (!secret || !site)
        return {
          error:
            "Configura SUPABASE_SERVICE_ROLE_KEY (solo servidor) y APP_URL para enviar invitaciones.",
        };
      const siteUrl = new URL(site);
      if (!["http:", "https:"].includes(siteUrl.protocol))
        return { error: "APP_URL debe ser un origen HTTP(S) válido." };
      const authAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        secret,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const invited = await authAdmin.auth.admin.inviteUserByEmail(
        employee.email,
        {
          redirectTo: `${siteUrl.origin}/auth/invitacion`,
          data: { full_name: employee.full_name },
        },
      );
      if (invited.error || !invited.data.user)
        return {
          error: invited.error?.message ?? "No se pudo enviar la invitación.",
        };
      id = invited.data.user.id;
    }
    const linked = await mutate("link", {
      id: employee.id,
      profile_id: id,
      reason: existing
        ? "Vinculación de cuenta employee existente"
        : "Invitación por correo y vinculación de cuenta employee",
    });
    if (linked.error)
      return {
        error: `La cuenta existe, pero no se pudo vincular: ${linked.error}. Reintenta para completar la vinculación.`,
      };
    return {
      success: true,
      message: existing
        ? "Cuenta existente vinculada; el empleado usa su contraseña actual."
        : "Invitación enviada. El empleado elegirá su propia contraseña.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo invitar.",
    };
  }
}
