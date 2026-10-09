"use server";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { attendanceSession } from "./server";
import {
  createEmployeeAccess,
  sendEmployeeInvitationEmail,
  AccessOperationError,
  type InvitationPorts,
  type InviteAccount,
  type AccessResult,
} from "./invitations";
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
async function invitationPorts() {
  const { client } = await attendanceSession(true);
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !site)
    throw new AccessOperationError(
      "Configura APP_URL y la clave administrativa del servidor para crear accesos.",
    );
  let siteUrl: URL;
  try {
    siteUrl = new URL(site);
  } catch {
    throw new AccessOperationError(
      "La dirección del sistema no está configurada correctamente.",
    );
  }
  if (!["http:", "https:"].includes(siteUrl.protocol))
    throw new AccessOperationError(
      "La dirección del sistema debe usar HTTP o HTTPS.",
    );
  const authAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const ports: InvitationPorts = {
    requireAdmin: async () => {
      await attendanceSession(true);
    },
    siteOrigin: siteUrl.origin,
    employee: async (id) => {
      const r = await client
        .from("employees")
        .select("*")
        .eq("id", id)
        .single();
      if (r.error || !r.data)
        throw new AccessOperationError("Empleado no encontrado.");
      return r.data;
    },
    lookup: async (email) => {
      const r = await client.rpc("attendance_admin_command", {
        p_action: "lookup_account",
        p_data: { email, reason: "Consultar cuenta para acceso" },
      });
      if (r.error)
        throw new AccessOperationError(
          "No se pudo consultar la cuenta del empleado.",
        );
      return r.data as InviteAccount | null;
    },
    link: async (id, userId) => {
      const r = await mutate("link", {
        id,
        profile_id: userId,
        reason: "Crear acceso y vincular cuenta employee",
      });
      if (r.error)
        throw new AccessOperationError(
          "La cuenta existe pero no pudo vincularse. Vuelve a crear el acceso para completar la vinculación.",
        );
    },
    recordEmail: async (id, status) => {
      const r = await mutate("invitation_email", {
        id,
        status,
        reason:
          status === "not_sent"
            ? "Generación de enlace de acceso sin correo"
            : "Envío de invitación solicitado por admin",
      });
      if (r.error)
        throw new AccessOperationError(
          "No se pudo guardar el estado del correo. Consulta el estado antes de reintentar.",
        );
    },
    generateLink: async (params) => {
      const r = await authAdmin.auth.admin.generateLink(params);
      return {
        userId: r.data.user?.id,
        actionLink: r.data.properties?.action_link,
        error: r.error ?? undefined,
      };
    },
    sendEmail: async (email, redirectTo) => {
      const r = await authAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      return { error: r.error ?? undefined };
    },
  };
  return ports;
}
export async function inviteEmployee(
  employeeId: string,
): Promise<AccessResult> {
  try {
    const result = await createEmployeeAccess(
      await invitationPorts(),
      employeeId,
    );
    if (result.actionLink && !result.error) {
      const { client } = await attendanceSession(true);
      const audit = await client.rpc("attendance_employee_command", {
        p_action: "access_generated",
        p_data: {
          id: employeeId,
          reason: "Generación administrativa de acceso",
        },
      });
      if (audit.error)
        return {
          ...result,
          message:
            "El acceso se generó y puedes compartirlo. No se pudo registrar la auditoría de generación; verifica la migración de personal antes de continuar administrando accesos.",
        };
    }
    revalidatePath("/admin/asistencia/personal");
    return result;
  } catch (error) {
    return {
      error:
        error instanceof AccessOperationError
          ? error.message
          : "No se pudo crear el acceso. Verifica tus permisos y la configuración del sistema.",
    };
  }
}
export async function sendInvitationEmail(
  employeeId: string,
): Promise<AccessResult> {
  try {
    return await sendEmployeeInvitationEmail(
      await invitationPorts(),
      employeeId,
    );
  } catch (error) {
    return {
      error:
        error instanceof AccessOperationError
          ? error.message
          : "No se pudo enviar el correo. Verifica tus permisos e intenta más tarde.",
    };
  }
}

export async function employeeLifecycle(form: FormData) {
  try {
    const { client } = await attendanceSession(true);
    const action = text(form, "action");
    if (!["suspend", "reactivate", "archive"].includes(action))
      return { error: "Acción no permitida." };
    const result = await client.rpc("attendance_employee_command", {
      p_action: action,
      p_data: {
        id: text(form, "id"),
        reason: text(form, "reason"),
        confirmation: text(form, "confirmation"),
      },
    });
    if (result.error)
      return {
        error:
          result.error.code === "PGRST202"
            ? "Aplica la migración incremental de personal para habilitar esta acción."
            : result.error.message,
      };
    revalidatePath("/admin/asistencia", "layout");
    revalidatePath("/asistencia");
    return { success: true };
  } catch {
    return {
      error:
        "No se pudo actualizar el empleado. Verifica tus permisos e intenta nuevamente.",
    };
  }
}
