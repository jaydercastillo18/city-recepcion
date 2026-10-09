"use server";
import { recoveryPorts } from "./recovery-server";
import { requestEmployeeRecovery, type RecoveryResult } from "./recovery";
export async function generateEmployeeRecovery(
  id: string,
): Promise<RecoveryResult> {
  try {
    return await requestEmployeeRecovery(await recoveryPorts(), id, "link");
  } catch {
    return {
      error:
        "No se pudo generar la recuperación. Verifica tus permisos y la configuración del sistema.",
    };
  }
}
export async function sendEmployeeRecoveryEmail(
  id: string,
): Promise<RecoveryResult> {
  try {
    return await requestEmployeeRecovery(await recoveryPorts(), id, "email");
  } catch {
    return {
      error:
        "No se pudo enviar la recuperación. Verifica tus permisos e intenta más tarde.",
    };
  }
}
