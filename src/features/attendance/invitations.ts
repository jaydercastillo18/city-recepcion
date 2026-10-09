import type { Employee } from "./types";
export type AccountState = "no_access" | "pending" | "activated";
export type EmailState = "not_sent" | "sent" | "rate_limited" | "error";
export interface AccessResult {
  error?: string;
  message?: string;
  actionLink?: string;
  accountState?: AccountState;
  emailState?: EmailState;
  emailSent?: boolean;
}
export const EMAIL_LIMIT_MESSAGE =
  "Se alcanzó temporalmente el límite de correos de invitación. Puedes copiar el enlace o enviarlo por WhatsApp e intentar el correo más tarde.";
export function invitationError(error: unknown) {
  const value = error as { code?: string; message?: string; status?: number };
  const code = value?.code ?? "";
  const message = value?.message ?? "";
  if (
    value?.status === 429 ||
    /rate_limit|over_email_send_rate_limit|over_request_rate_limit/.test(
      code,
    ) ||
    /rate.?limit|too many requests/i.test(message)
  )
    return EMAIL_LIMIT_MESSAGE;
  if (
    /email_address_invalid|validation_failed/.test(code) ||
    /invalid email|email.*invalid/i.test(message)
  )
    return "El correo del empleado no es válido.";
  if (
    /email_exists|user_already_exists/.test(code) ||
    /already.*registered|already.*exists/i.test(message)
  )
    return "Este correo ya tiene una cuenta. Se utilizará la cuenta existente; vuelve a consultar su acceso.";
  return "No se pudo completar la operación de acceso. Intenta nuevamente más tarde.";
}
export interface InviteAccount {
  id: string;
  role: string;
  activated: boolean;
  email_confirmed: boolean;
}
export interface InvitationPorts {
  requireAdmin: () => Promise<void>;
  employee: (id: string) => Promise<Employee>;
  lookup: (email: string) => Promise<InviteAccount | null>;
  link: (employeeId: string, userId: string) => Promise<void>;
  recordEmail: (employeeId: string, state: EmailState) => Promise<void>;
  generateLink: (params: {
    type: "invite" | "recovery";
    email: string;
    options: { redirectTo: string; data: { full_name: string } };
  }) => Promise<{ userId?: string; actionLink?: string; error?: unknown }>;
  sendEmail: (
    email: string,
    redirectTo: string,
  ) => Promise<{ error?: unknown }>;
  siteOrigin: string;
}
async function context(ports: InvitationPorts, id: string) {
  await ports.requireAdmin();
  const employee = await ports.employee(id);
  if (!employee.active)
    throw new AccessOperationError("El empleado debe estar activo.");
  if (!employee.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email))
    throw new AccessOperationError("El correo del empleado no es válido.");
  const account = await ports.lookup(employee.email);
  if (account && account.role !== "employee")
    throw new AccessOperationError(
      "Este correo pertenece a una cuenta administrativa y no puede usarse como empleado.",
    );
  if (employee.profile_id && employee.profile_id !== account?.id)
    throw new AccessOperationError(
      "La cuenta vinculada no coincide con el correo del empleado.",
    );
  return { employee, account };
}
export async function createEmployeeAccess(
  ports: InvitationPorts,
  id: string,
): Promise<AccessResult> {
  try {
    const { employee, account } = await context(ports, id);
    if (account?.activated) {
      if (!employee.profile_id) await ports.link(employee.id, account.id);
      return {
        accountState: "activated",
        emailState: employee.invitation_email_status,
        message:
          "Este correo ya tiene una cuenta. Se utilizará la cuenta existente y su contraseña actual.",
      };
    }
    const generated = await ports.generateLink({
      type: account?.email_confirmed ? "recovery" : "invite",
      email: employee.email!,
      options: {
        redirectTo: `${ports.siteOrigin}/auth/invitacion`,
        data: { full_name: employee.full_name },
      },
    });
    if (generated.error) return { error: invitationError(generated.error) };
    if (
      !generated.actionLink ||
      !generated.userId ||
      (account && generated.userId !== account.id)
    )
      return {
        error:
          "No se pudo crear un enlace válido. Vuelve a consultar el acceso.",
      };
    if (!employee.profile_id) await ports.link(employee.id, generated.userId);
    await ports.recordEmail(employee.id, "not_sent");
    return {
      accountState: "pending",
      emailState: "not_sent",
      actionLink: generated.actionLink,
      message:
        "Acceso creado. Comparte el enlace para que el empleado cree su contraseña.",
    };
  } catch (error) {
    return {
      error:
        error instanceof AccessOperationError
          ? error.message
          : "No se pudo crear el acceso. Verifica los datos y la configuración del sistema.",
    };
  }
}
export class AccessOperationError extends Error {}
export async function sendEmployeeInvitationEmail(
  ports: InvitationPorts,
  id: string,
): Promise<AccessResult> {
  try {
    const { employee, account } = await context(ports, id);
    if (!account || !employee.profile_id)
      return { error: "Crea primero el acceso y genera su enlace." };
    if (account.activated)
      return {
        accountState: "activated",
        emailState: employee.invitation_email_status,
        message:
          "La cuenta ya está activada; el empleado utiliza su contraseña actual.",
      };
    // Exactly one explicit send. Never generate a replacement link on failure.
    let result: { error?: unknown };
    try {
      result = await ports.sendEmail(
        employee.email!,
        `${ports.siteOrigin}/auth/invitacion`,
      );
    } catch (error) {
      result = { error };
    }
    const state: EmailState = result.error
      ? invitationError(result.error) === EMAIL_LIMIT_MESSAGE
        ? "rate_limited"
        : "error"
      : "sent";
    let saved = true;
    try {
      await ports.recordEmail(employee.id, state);
    } catch {
      saved = false;
    }
    return {
      accountState: "pending",
      emailState: state,
      emailSent: !result.error,
      message: result.error
        ? state === "rate_limited"
          ? EMAIL_LIMIT_MESSAGE
          : "El correo no pudo enviarse. Puedes compartir el acceso por WhatsApp."
        : saved
          ? "Invitación enviada correctamente."
          : "Invitación enviada correctamente. No se pudo actualizar el estado guardado del correo; vuelve a consultar más tarde.",
    };
  } catch (error) {
    return {
      error:
        error instanceof AccessOperationError
          ? error.message
          : "No se pudo comprobar el envío de correo. Conserva el enlace y revisa el estado antes de volver a intentar.",
    };
  }
}
export function whatsappInvitation(
  employee: Pick<Employee, "full_name" | "phone">,
  link: string,
) {
  let phone = (employee.phone ?? "").replace(/\D/g, "");
  if (phone.length === 9) phone = `51${phone}`;
  const message = `Hola ${employee.full_name.split(" ")[0]} 👋\n\nSe creó tu acceso al sistema de asistencia de CITY OFERTAS.\n\nActiva tu cuenta y crea tu contraseña aquí:\n\n${link}\n\nEste enlace es personal. No lo compartas.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function accessAfterEmail(
  previous: AccessResult,
  result: AccessResult,
): AccessResult {
  return {
    ...previous,
    ...result,
    actionLink: result.emailSent ? undefined : previous.actionLink,
  };
}
