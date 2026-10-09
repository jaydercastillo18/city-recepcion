import type { Employee } from "../attendance/types";
import {
  AccessOperationError,
  type InviteAccount,
} from "../attendance/invitations";

export const RECOVERY_PATH = "/auth/restablecer";
export const FORGOT_MESSAGE =
  "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer tu contraseña.";
export const EXPIRED_MESSAGE =
  "Este enlace ya venció o ya fue utilizado. Solicita un nuevo enlace de recuperación.";
export const RECOVERY_EMAIL_LIMIT =
  "Se alcanzó temporalmente el límite de correos. Puedes copiar el enlace o enviarlo por WhatsApp.";
export interface RecoveryResult {
  actionLink?: string;
  message?: string;
  error?: string;
  emailSent?: boolean;
}
export interface RecoveryPorts {
  requireAdmin: () => Promise<void>;
  employee: (id: string) => Promise<Employee>;
  lookup: (email: string) => Promise<InviteAccount | null>;
  siteOrigin: string;
  generateLink: (params: {
    type: "recovery";
    email: string;
    options: { redirectTo: string };
  }) => Promise<{ userId?: string; actionLink?: string; error?: unknown }>;
  sendEmail: (
    email: string,
    redirectTo: string,
  ) => Promise<{ error?: unknown }>;
  audit: (employeeId: string) => Promise<void>;
}
export function isEmailRateLimit(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string };
  return (
    value?.status === 429 ||
    /rate_limit/.test(value?.code ?? "") ||
    /rate.?limit|too many requests/i.test(value?.message ?? "")
  );
}
async function recoveryContext(ports: RecoveryPorts, id: string) {
  await ports.requireAdmin();
  const employee = await ports.employee(id);
  if (!employee.active || employee.archived_at)
    throw new AccessOperationError(
      "El empleado debe estar activo para recuperar su contraseña.",
    );
  if (!employee.profile_id || !employee.email)
    throw new AccessOperationError(
      "El empleado todavía no tiene una cuenta vinculada.",
    );
  const account = await ports.lookup(employee.email);
  if (
    !account ||
    account.id !== employee.profile_id ||
    account.role !== "employee" ||
    !account.activated
  )
    throw new AccessOperationError(
      "La recuperación requiere una cuenta de empleado activada y vinculada a este correo.",
    );
  return employee;
}
export async function requestEmployeeRecovery(
  ports: RecoveryPorts,
  id: string,
  method: "link" | "email",
): Promise<RecoveryResult> {
  try {
    const employee = await recoveryContext(ports, id);
    // Record only the request, before producing a credential. No secrets reach audit.
    await ports.audit(employee.id);
    const redirectTo = `${new URL(ports.siteOrigin).origin}${RECOVERY_PATH}`;
    if (method === "email") {
      let result: { error?: unknown };
      try {
        result = await ports.sendEmail(employee.email!, redirectTo);
      } catch (error) {
        result = { error };
      }
      if (result.error)
        return {
          emailSent: false,
          message: isEmailRateLimit(result.error)
            ? RECOVERY_EMAIL_LIMIT
            : "El correo no pudo enviarse. Puedes copiar el enlace o enviarlo por WhatsApp.",
        };
      return {
        emailSent: true,
        message:
          "Correo de recuperación enviado. El correo contiene un nuevo enlace; los anteriores pueden dejar de funcionar.",
      };
    }
    const result = await ports.generateLink({
      type: "recovery",
      email: employee.email!,
      options: { redirectTo },
    });
    if (
      result.error ||
      !result.actionLink ||
      result.userId !== employee.profile_id
    )
      return {
        error:
          "No se pudo generar el enlace de recuperación. Intenta nuevamente más tarde.",
      };
    return {
      actionLink: result.actionLink,
      message:
        "Enlace de recuperación creado. Este enlace permite al empleado crear una nueva contraseña.",
    };
  } catch (error) {
    return {
      error:
        error instanceof AccessOperationError
          ? error.message
          : "No se pudo solicitar la recuperación. Verifica tus permisos e intenta más tarde.",
    };
  }
}
export function recoveryAfterEmail(
  previous: RecoveryResult,
  result: RecoveryResult,
): RecoveryResult {
  return {
    ...previous,
    ...result,
    error: result.error,
    actionLink: result.emailSent ? undefined : previous.actionLink,
  };
}
export function whatsappRecovery(
  employee: Pick<Employee, "full_name" | "phone">,
  link: string,
) {
  let phone = (employee.phone ?? "").replace(/\D/g, "");
  if (phone.length === 9) phone = `51${phone}`;
  const message = `Hola ${employee.full_name.split(" ")[0]} 👋\n\nSe generó un enlace para cambiar tu contraseña del sistema de asistencia de CITY OFERTAS.\n\nCrea una nueva contraseña aquí:\n\n${link}\n\nEste enlace es personal y temporal.\nNo lo compartas con nadie.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
export async function forgotPassword(
  email: string,
  origin: string,
  send: RecoveryPorts["sendEmail"],
) {
  // The response is identical for nonexistent accounts, provider errors and limits.
  try {
    const value = email.trim();
    if (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      await send(value, `${new URL(origin).origin}${RECOVERY_PATH}`);
  } catch {
    /* Intentionally do not expose provider details or account existence. */
  }
  return FORGOT_MESSAGE;
}
