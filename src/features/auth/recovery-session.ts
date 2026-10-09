import { EXPIRED_MESSAGE } from "./recovery";
export interface RecoveryAuth {
  setSession: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{ error: unknown }>;
  exchangeCodeForSession: (code: string) => Promise<{ error: unknown }>;
  getUser: () => Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
  updateUser: (data: { password: string }) => Promise<{ error: unknown }>;
}
export async function openRecoverySession(auth: RecoveryAuth, href: string) {
  try {
    const url = new URL(href),
      hash = new URLSearchParams(url.hash.slice(1));
    if (
      [hash, url.searchParams].some(
        (params) =>
          params.has("error") ||
          params.has("error_code") ||
          params.has("error_description"),
      )
    )
      return EXPIRED_MESSAGE;
    if (hash.has("type") && hash.get("type") !== "recovery")
      return EXPIRED_MESSAGE;
    if (hash.has("access_token") || hash.has("refresh_token")) {
      const access_token = hash.get("access_token"),
        refresh_token = hash.get("refresh_token");
      if (!access_token || !refresh_token) return EXPIRED_MESSAGE;
      const result = await auth.setSession({ access_token, refresh_token });
      if (result.error) return EXPIRED_MESSAGE;
    } else if (url.searchParams.has("code")) {
      const code = url.searchParams.get("code");
      if (!code || (await auth.exchangeCodeForSession(code)).error)
        return EXPIRED_MESSAGE;
    }
    const result = await auth.getUser();
    return result.error || !result.data.user ? EXPIRED_MESSAGE : null;
  } catch {
    return EXPIRED_MESSAGE;
  }
}
export async function saveRecoveryPassword(
  auth: RecoveryAuth,
  password: string,
  confirmation: string,
) {
  if (password.length < 8)
    return "La contraseña debe tener al menos 8 caracteres.";
  if (password !== confirmation) return "Las contraseñas no coinciden.";
  try {
    const user = await auth.getUser();
    if (user.error || !user.data.user) return EXPIRED_MESSAGE;
    const result = await auth.updateUser({ password });
    if (!result.error) return null;
    const error = result.error as { code?: string; status?: number };
    if (/session|token|jwt/.test(error.code ?? "") || error.status === 401)
      return EXPIRED_MESSAGE;
    if (error.code === "same_password")
      return "Elige una contraseña diferente a la actual.";
    if (error.code === "weak_password")
      return "Elige una contraseña más segura, con letras, números y símbolos.";
    return "No se pudo actualizar la contraseña. Intenta nuevamente más tarde.";
  } catch {
    return "No se pudo actualizar la contraseña. Intenta nuevamente más tarde.";
  }
}
export function recoveryDestination(role?: string | null) {
  return role === "employee" ? "/asistencia" : "/";
}
