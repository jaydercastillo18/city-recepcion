"use client";
// ============================================================
// DANGER ZONE — Limpieza de datos de prueba de asistencia
// Solo role=admin. Uso exclusivo previo a producción.
// ============================================================
import { useState, useTransition, useActionState, useEffect } from "react";
import {
  AlertTriangle,
  Trash2,
  X,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  Eye,
} from "lucide-react";
import {
  cleanTestDataAction,
  getTestDataCounts,
  type TestDataCounts,
  type CleanResult,
} from "../actions";

const CONFIRMATION_PHRASE = "LIMPIAR ASISTENCIA";

const INITIAL: CleanResult = {};

export default function DangerZone() {
  const [open, setOpen] = useState(false);
  // Cuando open cambia a true, resetear el estado de carga directamente
  // (la inicialización ocurre fuera del effect body para evitar el lint react-hooks/set-state-in-effect)
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [counts, setCounts] = useState<TestDataCounts | null>(null);
  const [countsError, setCountsError] = useState("");
  const [typed, setTyped] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, dispatch, isActing] = useActionState(
    cleanTestDataAction,
    INITIAL,
  );
  const busy = isPending || isActing;
  const confirmed = typed === CONFIRMATION_PHRASE;

  // Cargar conteos al abrir el modal.
  // Usamos una ref para que el useEffect sea puro: no llama setState de forma síncrona.
  useEffect(() => {
    if (!open) return;
    // Lanzar la transición asíncrona; los setState ocurren dentro del callback,
    // no en el cuerpo síncrono del effect.
    startTransition(async () => {
      setLoadingCounts(true);
      setCountsError("");
      setCounts(null);
      const r = await getTestDataCounts();
      if ("error" in r) setCountsError(r.error);
      else setCounts(r.counts);
      setLoadingCounts(false);
    });
  }, [open]);

  function handleClose() {
    if (busy) return;
    setOpen(false);
    setTyped("");
    setCountsError("");
    setCounts(null);
  }

  return (
    <>
      {/* ── Sección Zona Peligrosa ── */}
      <section
        aria-labelledby="danger-zone-title"
        className="mt-10 border border-rose-500/30 rounded-xl p-6 bg-rose-950/20"
      >
        <div className="flex items-start gap-3 mb-4">
          <ShieldAlert
            className="text-rose-400 shrink-0 mt-0.5"
            size={20}
            aria-hidden="true"
          />
          <div>
            <h2
              id="danger-zone-title"
              className="text-rose-300 font-bold text-base"
            >
              Zona peligrosa
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Las acciones de esta sección son <strong>irreversibles</strong>.
              Úsalas únicamente para eliminar datos de prueba antes de
              producción.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-rose-500/20">
          <div>
            <p className="text-sm font-semibold text-slate-200">
              Limpiar datos de prueba
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Elimina empleados, horarios, marcaciones, importaciones y fotos
              del módulo de asistencia.
            </p>
          </div>
          <button
            id="btn-open-danger-zone"
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                       border border-rose-500/50 text-rose-300 bg-rose-950/30
                       hover:bg-rose-500/20 hover:border-rose-400/70
                       focus-visible:outline-2 focus-visible:outline-rose-400
                       transition-colors shrink-0"
          >
            <Trash2 size={15} aria-hidden="true" />
            Limpiar datos de prueba
          </button>
        </div>
      </section>

      {/* ── Modal de confirmación ── */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-danger-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-lg bg-[#1a0f2e] border border-rose-500/40 rounded-2xl shadow-2xl p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-rose-900/40">
                  <AlertTriangle
                    className="text-rose-400"
                    size={20}
                    aria-hidden="true"
                  />
                </span>
                <h3
                  id="modal-danger-title"
                  className="text-rose-200 font-bold text-lg"
                >
                  Limpiar datos de prueba
                </h3>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                aria-label="Cerrar"
                className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            {/* Descripción */}
            {!result.success && (
              <p className="text-sm text-slate-300">
                Esta acción eliminará{" "}
                <span className="text-rose-300 font-semibold">
                  empleados, horarios, marcaciones, importaciones y evidencia
                </span>{" "}
                de prueba del módulo de asistencia. Esta operación{" "}
                <strong>no se puede deshacer</strong>.
              </p>
            )}

            {/* Conteos */}
            {!result.success && (
              <div className="rounded-lg bg-black/30 border border-purple-900/30 p-4">
                <p className="text-xs font-semibold text-slate-400 flex items-center gap-2 mb-3">
                  <Eye size={13} aria-hidden="true" />
                  Registros que se eliminarán
                </p>
                {loadingCounts ? (
                  <p className="text-xs text-slate-400 flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin" />
                    Consultando…
                  </p>
                ) : countsError ? (
                  <p className="text-xs text-rose-300">{countsError}</p>
                ) : counts ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    {(
                      [
                        ["Empleados", counts.employees],
                        ["Horarios", counts.schedules],
                        ["Marcaciones", counts.records],
                        ["Importaciones", counts.imports],
                        ["Fotos", counts.photos],
                      ] as [string, number][]
                    ).map(([label, n]) => (
                      <div key={label} className="flex justify-between">
                        <dt className="text-slate-400">{label}:</dt>
                        <dd className="font-bold text-slate-200">{n}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            )}

            {/* Resultado exitoso */}
            {result.success && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-emerald-300 bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-4">
                  <CheckCircle2 size={20} aria-hidden="true" />
                  <p className="text-sm font-semibold">
                    Datos de prueba eliminados correctamente.
                  </p>
                </div>

                {(result.warnings ?? []).length > 0 && (
                  <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-4 space-y-1">
                    <p className="text-xs font-semibold text-amber-300 mb-2">
                      Advertencias:
                    </p>
                    {result.warnings!.map((w, i) => (
                      <p key={i} className="text-xs text-amber-200">
                        · {w}
                      </p>
                    ))}
                  </div>
                )}

                {(result.orphanAuthAccounts ?? []).length > 0 && (
                  <div className="bg-purple-950/30 border border-purple-500/30 rounded-lg p-4">
                    <p className="text-xs font-semibold text-purple-300 mb-2">
                      Cuentas de acceso (auth.users) que quedaron activas —
                      revísalas y elimínalas manualmente desde Supabase Auth si
                      ya no son necesarias:
                    </p>
                    <ul className="space-y-1">
                      {result.orphanAuthAccounts!.map((acc) => (
                        <li
                          key={acc.id}
                          className="text-xs text-slate-300 font-mono break-all"
                        >
                          {acc.email ?? "(sin email)"}{" "}
                          <span className="text-slate-500">· {acc.id}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(result.orphanAuthAccounts ?? []).length === 0 && (
                  <p className="text-xs text-slate-400">
                    No se encontraron cuentas de auth.users vinculadas a
                    empleados.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleClose}
                  className="btn-primary w-full"
                >
                  Cerrar
                </button>
              </div>
            )}

            {/* Formulario de confirmación */}
            {!result.success && (
              <form
                action={dispatch}
                onSubmit={(e) => {
                  if (!confirmed || busy) e.preventDefault();
                }}
              >
                <input type="hidden" name="confirmation" value={typed} />

                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs text-slate-400 mb-1 block">
                      Escribe{" "}
                      <code className="text-rose-300 font-bold bg-rose-950/40 px-1 rounded">
                        {CONFIRMATION_PHRASE}
                      </code>{" "}
                      para habilitar la acción:
                    </span>
                    <input
                      id="input-danger-confirmation"
                      type="text"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      disabled={busy}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={CONFIRMATION_PHRASE}
                      className="import-input w-full font-mono"
                      aria-describedby="confirmation-hint"
                    />
                  </label>

                  {result.error && (
                    <p role="alert" className="text-xs text-rose-300">
                      {result.error}
                    </p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={busy}
                      className="btn-ghost flex-1"
                    >
                      Cancelar
                    </button>
                    <button
                      id="btn-confirm-clean"
                      type="submit"
                      disabled={!confirmed || busy}
                      className="flex-1 flex items-center justify-center gap-2
                                 px-4 py-2 rounded-lg text-sm font-semibold
                                 bg-rose-600 text-white
                                 hover:bg-rose-500
                                 disabled:opacity-40 disabled:cursor-not-allowed
                                 focus-visible:outline-2 focus-visible:outline-rose-400
                                 transition-colors"
                    >
                      {busy ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          Limpiando…
                        </>
                      ) : (
                        <>
                          <Trash2 size={15} />
                          Eliminar datos de prueba
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
