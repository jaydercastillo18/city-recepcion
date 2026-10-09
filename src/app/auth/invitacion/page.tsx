"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import CityBrand from "@/components/layout/city-brand";
import { useRouter } from "next/navigation";
export default function InvitationPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function open() {
      try {
        const client = getSupabaseBrowserClient(),
          hash = new URLSearchParams(window.location.hash.slice(1)),
          code = new URLSearchParams(window.location.search).get("code");
        if (hash.get("error_description"))
          throw new Error(hash.get("error_description")!);
        if (hash.get("access_token") && hash.get("refresh_token")) {
          const r = await client.auth.setSession({
            access_token: hash.get("access_token")!,
            refresh_token: hash.get("refresh_token")!,
          });
          if (r.error) throw r.error;
        } else if (code) {
          const r = await client.auth.exchangeCodeForSession(code);
          if (r.error) throw r.error;
        }
        window.history.replaceState(null, "", "/auth/invitacion");
        const {
          data: { user },
          error,
        } = await client.auth.getUser();
        if (error || !user)
          throw new Error(
            "Invitación inválida o vencida. Solicita una nueva al administrador.",
          );
        if (active) setReady(true);
      } catch (error) {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "No se pudo abrir la invitación.",
          );
      }
    }
    void open();
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="card-base max-w-md w-full p-8">
        <CityBrand large />
        <h1 className="text-xl font-bold mt-6">Crea tu propia contraseña</h1>
        <p className="text-sm text-slate-400 mt-2 mb-5">
          Tu contraseña es privada. Nadie en administración necesita conocerla.
        </p>
        {ready && (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const form = new FormData(event.currentTarget),
                password = String(form.get("password"));
              if (password !== form.get("confirmation")) {
                setError("Las contraseñas no coinciden.");
                return;
              }
              setBusy(true);
              setError("");
              const result = await getSupabaseBrowserClient().auth.updateUser({
                password,
              });
              if (result.error) {
                setError(result.error.message);
                setBusy(false);
              } else {
                router.replace("/");
                router.refresh();
              }
            }}
          >
            <label className="block">
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="import-input"
              />
            </label>
            <label className="block">
              Repetir contraseña
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="import-input"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy ? "Guardando…" : "Guardar y entrar"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="text-red-300 mt-4">
            {error}
          </p>
        )}
        {!ready && !error && <p role="status">Verificando invitación…</p>}
      </div>
    </main>
  );
}
