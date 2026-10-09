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

// ============================================================
// ZONA PELIGROSA — Limpieza de datos de prueba
// Solo role=admin. Uso exclusivo previo a producción.
// ============================================================

export interface TestDataCounts {
  employees: number;
  schedules: number;
  records: number;
  imports: number;
  photos: number;
}

export interface CleanResult {
  success?: boolean;
  orphanAuthAccounts?: Array<{ id: string; email: string | null }>;
  warnings?: string[];
  error?: string;
}

/** Lee cantidades actuales SIN modificar nada. Solo admin. */
export async function getTestDataCounts(): Promise<
  { error: string } | { counts: TestDataCounts }
> {
  try {
    const { client } = await attendanceSession(true);
    const [empR, schR, recR, impR, photoR] = await Promise.all([
      client.from("employees").select("id", { count: "exact", head: true }),
      client
        .from("attendance_schedules")
        .select("id", { count: "exact", head: true }),
      client
        .from("attendance_records")
        .select("id", { count: "exact", head: true }),
      client
        .from("attendance_imports")
        .select("id", { count: "exact", head: true }),
      client
        .from("attendance_records")
        .select("photo_storage_path")
        .not("photo_storage_path", "is", null),
    ]);
    for (const r of [empR, schR, recR, impR, photoR]) {
      if (r.error) return { error: r.error.message };
    }
    return {
      counts: {
        employees: empR.count ?? 0,
        schedules: schR.count ?? 0,
        records: recR.count ?? 0,
        imports: impR.count ?? 0,
        photos: (photoR.data ?? []).length,
      },
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "No se pudieron leer los conteos.",
    };
  }
}

/**
 * Elimina en orden seguro los datos de prueba del módulo de asistencia.
 * Requiere confirmación textual exacta "LIMPIAR ASISTENCIA".
 * NO toca shipments, recepciones, mercadería, ni usuarios admin/warehouse.
 * NO elimina auth.users automáticamente; devuelve lista de cuentas orphan.
 */
export async function cleanTestDataAction(
  _prev: CleanResult,
  form: FormData,
): Promise<CleanResult> {
  const CONFIRMATION_PHRASE = "LIMPIAR ASISTENCIA";
  const warnings: string[] = [];

  // — 1. Verificar rol admin
  let adminClient: Awaited<ReturnType<typeof attendanceSession>>["client"];
  try {
    const session = await attendanceSession(true);
    adminClient = session.client;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "No tienes permiso para esta operación.",
    };
  }

  // — 2. Validar frase de confirmación
  const typed = String(form.get("confirmation") ?? "").trim();
  if (typed !== CONFIRMATION_PHRASE) {
    return {
      error: `Escribe exactamente "${CONFIRMATION_PHRASE}" para confirmar.`,
    };
  }

  // — 3. Construir cliente admin con service role (para Auth + Storage)
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    return {
      error:
        "Falta SUPABASE_SERVICE_ROLE_KEY. Configura la variable de entorno del servidor.",
    };
  }
  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // — 4. Leer rutas de fotos ANTES de borrar los records
  const photosR = await adminClient
    .from("attendance_records")
    .select("photo_storage_path")
    .not("photo_storage_path", "is", null);
  if (photosR.error) {
    warnings.push(
      `No se pudieron listar fotos: ${photosR.error.message}. Elimínalas manualmente desde el bucket.`,
    );
  }
  const photoPaths = (photosR.data ?? [])
    .map((r) => r.photo_storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  // — 5. Leer profile_ids de employees para el informe orphan
  const empR = await adminClient.from("employees").select("id, profile_id");
  if (empR.error) {
    return { error: `No se pudo leer empleados: ${empR.error.message}` };
  }
  const profileIds = empR.data
    .map((e) => e.profile_id)
    .filter((id): id is string => typeof id === "string");

  // — 6. Borrar en orden seguro (respetando FKs)
  const tables = [
    "attendance_audit_log",
    "attendance_records",
    "attendance_schedules",
    "attendance_imports",
    "employees",
  ] as const;

  for (const table of tables) {
    // neq("id","") equivale a "borrar todo" porque ningún id es la cadena vacía
    const del = await adminSupabase.from(table).delete().neq("id", "");
    if (del.error) {
      return {
        error: `Error al borrar ${table}: ${del.error.message}`,
        warnings,
      };
    }
  }

  // — 7. Eliminar objetos del bucket attendance-evidence (Supabase Storage API)
  if (photoPaths.length > 0) {
    const CHUNK = 999; // límite de la API
    for (let i = 0; i < photoPaths.length; i += CHUNK) {
      const chunk = photoPaths.slice(i, i + CHUNK);
      const { error: storErr } = await adminSupabase.storage
        .from("attendance-evidence")
        .remove(chunk);
      if (storErr) {
        warnings.push(
          `Algunas fotos no se eliminaron del bucket (lote ${Math.floor(i / CHUNK) + 1}): ${storErr.message}`,
        );
      }
    }
  }

  // — 8. Identificar cuentas auth orphan (employee) para revisión manual
  const orphanAuthAccounts: Array<{ id: string; email: string | null }> = [];
  if (profileIds.length > 0) {
    let page = 1;
    const authUsers: Array<{ id: string; email: string | null }> = [];
    while (true) {
      const { data, error } = await adminSupabase.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error || !data) break;
      authUsers.push(
        ...data.users.map((u) => ({ id: u.id, email: u.email ?? null })),
      );
      if (data.users.length < 1000) break;
      page++;
    }
    for (const uid of profileIds) {
      const found = authUsers.find((u) => u.id === uid);
      if (found) {
        const profileR = await adminClient
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        if (!profileR.error && profileR.data?.role === "employee") {
          orphanAuthAccounts.push({ id: found.id, email: found.email });
        }
      }
    }
  }

  revalidatePath("/admin/asistencia", "layout");

  return { success: true, warnings, orphanAuthAccounts };
}
