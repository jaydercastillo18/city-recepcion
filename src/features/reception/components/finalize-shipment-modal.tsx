'use client';
// ============================================================
// CITY RECEPCIÓN - Modal de confirmación para cierre de recepción
// Muestra resumen detallado antes de marcar como completed
// ============================================================
import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  getShipmentFinalizeSummary,
  finalizeShipmentAction,
  type FinalizeSummary,
} from '@/features/shipments/actions';

interface FinalizeShipmentModalProps {
  shipmentId: string;
  shipmentNumber: string;
  destination: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function FinalizeShipmentModal({
  shipmentId,
  shipmentNumber,
  destination,
  isOpen,
  onClose,
  onSuccess,
}: FinalizeShipmentModalProps) {
  if (!isOpen) return null;

  return (
    <FinalizeShipmentModalContent
      shipmentId={shipmentId}
      shipmentNumber={shipmentNumber}
      destination={destination}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function FinalizeShipmentModalContent({
  shipmentId,
  shipmentNumber,
  destination,
  onClose,
  onSuccess,
}: Omit<FinalizeShipmentModalProps, 'isOpen'>) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<FinalizeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getShipmentFinalizeSummary(shipmentId)
      .then((res) => {
        if (!isMounted) return;
        if (res.error) {
          setError(res.error);
        } else if (res.summary) {
          setSummary(res.summary);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Error al cargar el resumen del envío';
        setError(msg);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [shipmentId]);

  async function handleConfirmFinalize() {
    if (!summary?.canFinalize || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await finalizeShipmentAction(shipmentId);
      if (!res.success) {
        setError(res.error || 'No se pudo finalizar la recepción');
        setSubmitting(false);
        return;
      }

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al finalizar recepción';
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finalize-modal-title"
    >
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="finalize-modal-title" className="text-lg font-bold text-white">
                Finalizar Recepción
              </h2>
              <p className="text-xs text-slate-400">
                {shipmentNumber} • {destination}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <p className="text-sm">Analizando estado de los productos...</p>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="font-medium">Atención</p>
                <p className="text-xs text-red-300/90 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {!loading && summary && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-xs text-slate-400 block mb-1">Cajas esperadas</span>
                  <span className="text-xl font-bold text-white tabular-nums">
                    {summary.expectedBoxes}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-xs text-slate-400 block mb-1">Cajas recibidas</span>
                  <span className="text-xl font-bold text-blue-400 tabular-nums">
                    {summary.receivedBoxes}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-xs text-slate-400 block mb-1">Faltantes</span>
                  <span
                    className={`text-xl font-bold tabular-nums ${
                      summary.missingBoxes > 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {summary.missingBoxes}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-xs text-slate-400 block mb-1">Cajas extras</span>
                  <span
                    className={`text-xl font-bold tabular-nums ${
                      summary.extraBoxes > 0 ? 'text-purple-400' : 'text-slate-300'
                    }`}
                  >
                    {summary.extraBoxes}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-xs text-slate-400 block mb-1">Incidencias</span>
                  <span
                    className={`text-xl font-bold tabular-nums ${
                      summary.incidentsCount > 0 ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    {summary.incidentsCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-xs text-slate-400 block mb-1">Total ítems</span>
                  <span className="text-xl font-bold text-slate-200 tabular-nums">
                    {summary.itemsCount}
                  </span>
                </div>
              </div>

              {/* Status summary breakdown */}
              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs text-slate-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>Productos completos:</span>
                  <span className="font-semibold text-emerald-400 tabular-nums">
                    {summary.completeCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Productos parciales:</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      summary.partialCount > 0 ? 'text-amber-400' : 'text-slate-300'
                    }`}
                  >
                    {summary.partialCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Productos pendientes:</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      summary.pendingCount > 0 ? 'text-red-400' : 'text-slate-300'
                    }`}
                  >
                    {summary.pendingCount}
                  </span>
                </div>
                {summary.excessCount > 0 && (
                  <div className="flex justify-between">
                    <span>Productos con exceso:</span>
                    <span className="font-semibold text-purple-400 tabular-nums">
                      {summary.excessCount}
                    </span>
                  </div>
                )}
              </div>

              {/* Verification alert */}
              {!summary.canFinalize ? (
                <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/50 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-200 space-y-1">
                    <p className="font-semibold text-red-300">
                      No es posible finalizar el envío con productos faltantes
                    </p>
                    <p className="text-red-300/80">
                      Aún restan {summary.missingBoxes} caja(s) por recibir distribuidas en{' '}
                      {summary.pendingCount + summary.partialCount} producto(s). La recepción solo
                      puede completarse formalmente cuando todas las cajas esperadas hayan sido
                      ingresadas.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/50 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-200 space-y-1">
                    <p className="font-semibold text-emerald-300">
                      Listo para el cierre de recepción
                    </p>
                    <p className="text-emerald-300/80">
                      Todos los productos han cumplido con las cantidades esperadas. Al confirmar,
                      el envío pasará permanentemente a estado{' '}
                      <strong className="text-white">COMPLETADO</strong>.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 p-5 bg-slate-950/80 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-sm font-medium"
          >
            Cancelar
          </button>

          {!loading && summary && (
            <button
              type="button"
              onClick={handleConfirmFinalize}
              disabled={!summary.canFinalize || submitting}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all ${
                summary.canFinalize
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Finalizando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar y Finalizar</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
