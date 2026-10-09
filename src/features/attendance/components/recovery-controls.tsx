"use client";
import { useRef, useState } from "react";
import {
  generateEmployeeRecovery,
  sendEmployeeRecoveryEmail,
} from "@/features/auth/recovery-actions";
import {
  recoveryAfterEmail,
  whatsappRecovery,
  type RecoveryResult,
} from "@/features/auth/recovery";
import type { Employee } from "../types";
export default function RecoveryControls({
  employee,
  onBusy,
}: {
  employee: Employee;
  onBusy: (busy: boolean) => void;
}) {
  const [result, setResult] = useState<RecoveryResult>({}),
    [busy, setBusy] = useState<"link" | "email" | null>(null),
    [copied, setCopied] = useState("");
  const lock = useRef(false);
  async function request(method: "link" | "email") {
    if (lock.current) return;
    lock.current = true;
    setBusy(method);
    onBusy(true);
    setCopied("");
    try {
      const response =
        method === "link"
          ? await generateEmployeeRecovery(employee.id)
          : await sendEmployeeRecoveryEmail(employee.id);
      setResult((previous) =>
        method === "email"
          ? recoveryAfterEmail(previous, response)
          : response.error
            ? { ...previous, error: response.error, message: undefined }
            : response,
      );
    } catch {
      setResult((previous) => ({
        ...previous,
        error: "No se pudo completar la solicitud. Intenta más tarde.",
      }));
    } finally {
      lock.current = false;
      setBusy(null);
      onBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 border-t border-purple-400/20 pt-4"
      aria-label="Recuperación de contraseña"
    >
      <h3 className="font-bold text-sm text-purple-200">Seguridad</h3>
      <p className="text-sm">¿El empleado olvidó su contraseña?</p>
      <button
        type="button"
        className="btn-primary w-full"
        disabled={!!busy || !employee.active}
        onClick={() => void request("link")}
      >
        {busy === "link"
          ? "Generando…"
          : "🔑 Generar enlace para cambiar contraseña"}
      </button>
      {result.actionLink && (
        <div className="space-y-3 card-base p-4">
          <h4 className="font-bold">🔑 Enlace de recuperación creado</h4>
          <p className="text-sm">
            Este enlace permite al empleado crear una nueva contraseña.
          </p>
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={!!busy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.actionLink!);
                setCopied("Enlace copiado.");
              } catch {
                setCopied("Selecciona el enlace y cópialo manualmente.");
              }
            }}
          >
            📋 Copiar enlace
          </button>
          <label className="block text-sm">
            Enlace personal temporal
            <input
              readOnly
              className="import-input"
              value={result.actionLink}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          {employee.phone ? (
            <a
              href={whatsappRecovery(employee, result.actionLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full bg-emerald-700"
              aria-disabled={!!busy}
              onClick={(event) => {
                if (busy) event.preventDefault();
              }}
            >
              🟢 Enviar por WhatsApp
            </a>
          ) : (
            <p className="text-sm text-slate-400">
              Agrega un teléfono al empleado para compartir por WhatsApp.
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        className="btn-ghost w-full"
        disabled={!!busy || !employee.active}
        onClick={() => void request("email")}
      >
        {busy === "email" ? "Enviando…" : "✉️ Enviar recuperación por correo"}
      </button>
      {result.message && (
        <p role="status" className="text-sm text-purple-200">
          {result.message}
        </p>
      )}
      {result.error && (
        <p role="alert" className="text-sm text-red-300">
          {result.error}
        </p>
      )}
      {copied && (
        <p role="status" className="text-sm text-purple-200">
          {copied}
        </p>
      )}
      <p className="text-xs text-slate-400">
        El administrador nunca conoce la contraseña del empleado. Este enlace es
        personal y temporal; no lo compartas con nadie.
      </p>
    </section>
  );
}
