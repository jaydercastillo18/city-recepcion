import "server-only";
import { createClient } from "@supabase/supabase-js";
import { attendanceSession } from "../attendance/server";
import {
  AccessOperationError,
  type InviteAccount,
} from "../attendance/invitations";
import type { Database } from "@/types/database";
import type { RecoveryPorts } from "./recovery";

export async function recoveryPorts(): Promise<RecoveryPorts> {
  const { client, user } = await attendanceSession(true);
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !site)
    throw new AccessOperationError(
      "La recuperación de acceso no está configurada en el servidor.",
    );
  const siteUrl = new URL(site);
  if (!["http:", "https:"].includes(siteUrl.protocol))
    throw new AccessOperationError(
      "La dirección del sistema no está configurada correctamente.",
    );
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  // Admin-triggered email must work on the employee's device, without the admin's PKCE verifier.
  const mail = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        flowType: "implicit",
      },
    },
  );
  return {
    requireAdmin: async () => {
      await attendanceSession(true);
    },
    siteOrigin: siteUrl.origin,
    employee: async (id) => {
      const result = await client
        .from("employees")
        .select("*")
        .eq("id", id)
        .single();
      if (result.error || !result.data)
        throw new AccessOperationError("Empleado no encontrado.");
      return result.data;
    },
    lookup: async (email) => {
      const result = await client.rpc("attendance_admin_command", {
        p_action: "lookup_account",
        p_data: {
          email,
          reason: "Verificar cuenta para recuperación de contraseña",
        },
      });
      if (result.error)
        throw new AccessOperationError(
          "No se pudo verificar la cuenta del empleado.",
        );
      return result.data as InviteAccount | null;
    },
    generateLink: async (params) => {
      const result = await admin.auth.admin.generateLink(params);
      return {
        userId: result.data.user?.id,
        actionLink: result.data.properties?.action_link,
        error: result.error ?? undefined,
      };
    },
    sendEmail: async (email, redirectTo) => {
      const result = await mail.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      return { error: result.error ?? undefined };
    },
    audit: async (employeeId) => {
      // Authenticated clients have SELECT only. The privileged insert is strictly
      // server-side, after admin authorization, with a fixed allowlist of fields.
      const result = await admin
        .from("attendance_audit_log")
        .insert({
          employee_id: employeeId,
          performed_by: user.id,
          action: "employee_password_recovery_requested",
          reason: "Administrador solicitó recuperación de contraseña",
        });
      if (result.error)
        throw new AccessOperationError(
          "No se pudo registrar la solicitud de recuperación. Intenta más tarde.",
        );
    },
  };
}
