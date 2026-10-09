"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CityBrand from "@/components/layout/city-brand";
import { getRecoveryClient } from "../recovery-client";
import {
  openRecoverySession,
  saveRecoveryPassword,
  recoveryDestination,
} from "../recovery-session";
import { EXPIRED_MESSAGE, RECOVERY_PATH } from "../recovery";
export default function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false);
  const opening = useRef<Promise<string | null> | null>(null),
    lock = useRef(false);
  const destination = useRef("/");
  useEffect(() => {
    let active = true;
    if (!opening.current) {
      const href = window.location.href;
      // Remove credentials even if validation fails. They never enter UI/telemetry.
      window.history.replaceState(null, "", RECOVERY_PATH);
      opening.current = openRecoverySession(getRecoveryClient().auth, href);
    }
    void opening.current.then((failure) => {
      if (active) {
        setError(failure ?? "");
        setReady(!failure);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      router.replace(destination.current);
      router.refresh();
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [success, router]);
  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="card-base max-w-md w-full p-6 sm:p-8 space-y-5">
        <CityBrand large />
        <h1 className="text-2xl font-bold">Restablecer contraseña</h1>
        <p className="text-sm text-slate-400">
          Elige una nueva contraseña para tu cuenta.
        </p>
        {!ready && !error && <p role="status">Verificando enlace…</p>}
        {ready && !success && (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (lock.current) return;
              const formElement = event.currentTarget,
                form = new FormData(formElement);
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                const client = getRecoveryClient();
                const failure = await saveRecoveryPassword(
                  client.auth,
                  String(form.get("password") ?? ""),
                  String(form.get("confirmation") ?? ""),
                );
                if (failure) {
                  setError(failure);
                  if (failure === EXPIRED_MESSAGE) setReady(false);
                  return;
                }
                formElement.reset();
                const {
                  data: { user },
                } = await client.auth.getUser();
                const profile = user
                  ? await client
                      .from("profiles")
                      .select("role")
                      .eq("id", user.id)
                      .single()
                  : null;
                destination.current = recoveryDestination(profile?.data?.role);
                setSuccess(true);
              } catch {
                setError(
                  "No se pudo completar el cambio. Intenta nuevamente más tarde.",
                );
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <label className="block text-sm">
              Nueva contraseña
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="import-input mt-2"
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              Confirmar contraseña
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="import-input mt-2"
                disabled={busy}
              />
            </label>
            <p className="text-xs text-slate-400">
              Mínimo 8 caracteres. Tu contraseña es privada.
            </p>
            <button disabled={busy} className="btn-primary w-full">
              {busy ? "Guardando…" : "Guardar nueva contraseña"}
            </button>
          </form>
        )}
        {success && (
          <p role="status" className="text-emerald-300">
            Contraseña actualizada correctamente.
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-300 text-sm">
            {error}
          </p>
        )}
        {!ready && error && (
          <div className="space-y-3">
            <Link href="/auth/recuperar" className="btn-primary w-full">
              Solicitar otro enlace
            </Link>
            <Link href="/login" className="btn-ghost w-full">
              Volver al login
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
