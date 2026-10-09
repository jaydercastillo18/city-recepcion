"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import CityBrand from "@/components/layout/city-brand";
import { forgotPassword, FORGOT_MESSAGE } from "../recovery";
import { getRecoveryClient } from "../recovery-client";
export default function ForgotPasswordForm() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="card-base max-w-md w-full p-6 sm:p-8 space-y-5">
        <CityBrand large />
        <h1 className="text-2xl font-bold">¿Olvidaste tu contraseña?</h1>
        <p className="text-slate-400 text-sm">
          Te enviaremos instrucciones para recuperar el acceso a tu cuenta.
        </p>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (lock.current) return;
            const email = String(
              new FormData(event.currentTarget).get("email") ?? "",
            );
            lock.current = true;
            setBusy(true);
            setMessage("");
            try {
              setMessage(
                await forgotPassword(
                  email,
                  window.location.origin,
                  async (address, redirectTo) => {
                    const result =
                      await getRecoveryClient().auth.resetPasswordForEmail(
                        address,
                        { redirectTo },
                      );
                    return { error: result.error ?? undefined };
                  },
                ),
              );
            } catch {
              setMessage(FORGOT_MESSAGE);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm">
            Correo electrónico
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              className="import-input mt-2"
            />
          </label>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Enviando…" : "Enviar enlace de recuperación"}
          </button>
        </form>
        {message && (
          <p role="status" className="text-purple-200 text-sm">
            {message}
          </p>
        )}
        <Link href="/login" className="btn-ghost w-full">
          Volver al login
        </Link>
      </div>
    </main>
  );
}
