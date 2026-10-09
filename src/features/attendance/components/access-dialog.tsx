"use client";
import { useRef, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { inviteEmployee, sendInvitationEmail } from "../actions";
import {
  accessAfterEmail,
  whatsappInvitation,
  type AccessResult,
  type EmailState,
} from "../invitations";
import type { Employee } from "../types";
export const ACCOUNT_LABEL = {
  no_access: "Sin acceso",
  pending: "Invitación pendiente",
  activated: "Cuenta activada",
};
export const EMAIL_LABEL: Record<EmailState, string> = {
  not_sent: "No enviado",
  sent: "Enviado",
  rate_limited: "Límite temporal alcanzado",
  error: "Error de envío",
};
export default function AccessDialog({
  employee,
  initial,
  onClose,
}: {
  employee: Employee;
  initial?: AccessResult;
  onClose: () => void;
}) {
  const [access, setAccess] = useState<AccessResult>(
    initial ?? {
      accountState:
        employee.access_status ??
        (employee.profile_id ? "pending" : "no_access"),
      emailState: employee.invitation_email_status,
    },
  );
  const [operation, setOperation] = useState<"link" | "email" | null>(null);
  const [confirm, setConfirm] = useState(false),
    [copyMessage, setCopyMessage] = useState("");
  const [busy, start] = useTransition();
  const lock = useRef(false);
  const router = useRouter();
  const account =
    access.accountState ??
    employee.access_status ??
    (employee.profile_id ? "pending" : "no_access");
  async function generate() {
    if (lock.current) return;
    lock.current = true;
    setOperation("link");
    start(async () => {
      try {
        const result = await inviteEmployee(employee.id);
        setAccess(result);
        setConfirm(false);
        setCopyMessage("");
        router.refresh();
      } catch {
        setAccess((previous) => ({
          ...previous,
          error: "No se pudo generar el enlace. Intenta más tarde.",
        }));
      } finally {
        lock.current = false;
        setOperation(null);
      }
    });
  }
  function send() {
    if (lock.current) return;
    lock.current = true;
    setOperation("email");
    start(async () => {
      try {
        const result = await sendInvitationEmail(employee.id);
        setAccess((previous) => accessAfterEmail(previous, result));
        router.refresh();
      } catch {
        setAccess((previous) => ({
          ...previous,
          error:
            "El correo no pudo enviarse. Puedes compartir el acceso por WhatsApp.",
        }));
      } finally {
        lock.current = false;
        setOperation(null);
      }
    });
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto card-base p-6 space-y-4"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <Dialog.Title className="text-xl font-bold">
            {account === "no_access" ? "Crear acceso" : "✅ Acceso creado"}
          </Dialog.Title>
          <Dialog.Description>
            Comparte el acceso personal para que el empleado cree su contraseña.
          </Dialog.Description>
          <div>
            <h2 className="font-bold text-lg">{employee.full_name}</h2>
            <p>{employee.position || "Sin cargo"}</p>
            <p>Correo: {employee.email || "Sin correo"}</p>
            <p>Teléfono: {employee.phone || "Sin teléfono"}</p>
          </div>
          <div className="text-sm">
            <p>Estado de cuenta: {ACCOUNT_LABEL[account]}</p>
            <p>
              Estado del correo:{" "}
              {
                EMAIL_LABEL[
                  access.emailState ??
                    employee.invitation_email_status ??
                    "not_sent"
                ]
              }
            </p>
          </div>
          {access.message && (
            <p role="status" className="text-purple-200 text-sm">
              {access.message}
            </p>
          )}
          {access.error && (
            <p role="alert" className="text-red-300 text-sm">
              {access.error}
            </p>
          )}
          {(access.emailState === "rate_limited" ||
            access.emailState === "error") && (
            <p className="text-amber-200">
              El correo no pudo enviarse. Puedes compartir el acceso por
              WhatsApp.
            </p>
          )}
          {access.actionLink && (
            <div className="space-y-3">
              <button
                type="button"
                className="btn-primary w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(access.actionLink!);
                    setCopyMessage("Enlace copiado.");
                  } catch {
                    setCopyMessage(
                      "No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.",
                    );
                  }
                }}
              >
                📋 Copiar enlace
              </button>
              <label className="block text-sm">
                Enlace personal temporal
                <input
                  readOnly
                  value={access.actionLink}
                  className="import-input"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <a
                className="btn-primary w-full bg-emerald-700"
                href={whatsappInvitation(employee, access.actionLink)}
                target="_blank"
                rel="noopener noreferrer"
              >
                🟢 Enviar por WhatsApp
              </a>
              <p className="text-xs text-slate-400">
                Este enlace es personal. No lo compartas con otras personas.
              </p>
            </div>
          )}
          {copyMessage && (
            <p role="status" className="text-sm text-purple-200">
              {copyMessage}
            </p>
          )}
          {account !== "activated" && (
            <div className="space-y-3">
              {account !== "no_access" && (
                <button
                  type="button"
                  className="btn-ghost w-full"
                  disabled={busy}
                  onClick={send}
                >
                  {busy && operation === "email"
                    ? "Enviando..."
                    : "✉️ Enviar por correo"}
                </button>
              )}
              {access.emailSent && !access.actionLink && (
                <p className="text-sm text-slate-400">
                  El correo contiene un nuevo enlace válido. Generar otro enlace
                  reemplazará el enviado por correo.
                </p>
              )}
              <button
                type="button"
                className="btn-ghost w-full"
                disabled={busy}
                onClick={() => {
                  if (account === "pending") setConfirm(true);
                  else void generate();
                }}
              >
                {busy
                  ? "Procesando..."
                  : account === "pending"
                    ? "Generar nuevo enlace"
                    : "Guardar acceso y generar enlace"}
              </button>
              {confirm && (
                <div className="card-base p-4 space-y-3">
                  <p>
                    ¿Generar un nuevo enlace de activación para{" "}
                    {employee.full_name}?
                  </p>
                  <p className="text-xs text-slate-400">
                    El enlace anterior dejará de funcionar.
                  </p>
                  <button
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => void generate()}
                  >
                    Confirmar nuevo enlace
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
          <Dialog.Close className="btn-ghost w-full" disabled={busy}>
            Cerrar
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
