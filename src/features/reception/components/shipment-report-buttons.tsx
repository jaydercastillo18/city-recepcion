'use client';
// ============================================================
// CITY RECEPCIÓN - Barra de Acciones de Reportes y Cierre
// Botones: Descargar PDF, Descargar Excel, Finalizar Recepción
// ============================================================
import { useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import FinalizeShipmentModal from './finalize-shipment-modal';

interface ShipmentReportButtonsProps {
  shipmentId: string;
  shipmentNumber: string;
  destination: string;
  status: string;
  isAdmin: boolean;
  variant?: 'full' | 'compact';
  onStatusChanged?: () => void;
  finalizedWithShortage?: boolean;
}

export default function ShipmentReportButtons({
  shipmentId,
  shipmentNumber,
  destination,
  status,
  isAdmin,
  variant = 'full',
  onStatusChanged,
  finalizedWithShortage = false,
}: ShipmentReportButtonsProps) {
  const [downloading, setDownloading] = useState<'pdf' | 'excel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);

  const isCompleted = currentStatus === 'completed';

  async function handleDownload(type: 'pdf' | 'excel') {
    if (downloading) return;
    setDownloading(type);
    setError(null);

    try {
      const res = await fetch(`/api/reports/${shipmentId}/${type}`);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `No se pudo generar el archivo ${type.toUpperCase()}`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `Reporte_${shipmentNumber}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error('[handleDownload error]', err);
      const msg = err instanceof Error ? err.message : 'Error al descargar el archivo.';
      setError(msg);
    } finally {
      setDownloading(null);
    }
  }

  function handleSuccessFinalize() {
    setCurrentStatus('completed');
    onStatusChanged?.();
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {error && (
          <div className="text-xs text-red-400 flex items-center gap-1 mr-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="truncate max-w-[120px]">{error}</span>
          </div>
        )}

        {/* Botón PDF compacto */}
        <button
          type="button"
          onClick={() => handleDownload('pdf')}
          disabled={downloading !== null}
          title="Descargar Reporte PDF"
          aria-label="Descargar PDF"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-50"
        >
          {downloading === 'pdf' ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <FileText className="w-4 h-4 text-rose-400" />
          )}
        </button>

        {/* Botón Excel compacto */}
        <button
          type="button"
          onClick={() => handleDownload('excel')}
          disabled={downloading !== null}
          title="Descargar Excel"
          aria-label="Descargar Excel"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-50"
        >
          {downloading === 'excel' ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          )}
        </button>

        {/* Finalizar compacto (solo admin) */}
        {isAdmin && !isCompleted && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            title="Finalizar recepción"
            aria-label="Finalizar recepción"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Finalizar</span>
          </button>
        )}

        <FinalizeShipmentModal
          shipmentId={shipmentId}
          shipmentNumber={shipmentNumber}
          destination={destination}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={handleSuccessFinalize}
        />
      </div>
    );
  }

  // Variant "full" para cabecera de recepción
  return (
    <div className="space-y-2">
      {error && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 hover:text-white rounded"
            aria-label="Cerrar error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800/80">
        {/* Botón PDF */}
        <button
          type="button"
          onClick={() => handleDownload('pdf')}
          disabled={downloading !== null}
          id="btn-download-pdf"
          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all text-xs sm:text-sm font-medium shadow-sm disabled:opacity-50"
        >
          {downloading === 'pdf' ? (
            <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
          ) : (
            <FileText className="w-4 h-4 text-rose-400" aria-hidden="true" />
          )}
          <span>{downloading === 'pdf' ? 'Generando PDF...' : 'Descargar PDF'}</span>
        </button>

        {/* Botón Excel */}
        <button
          type="button"
          onClick={() => handleDownload('excel')}
          disabled={downloading !== null}
          id="btn-download-excel"
          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all text-xs sm:text-sm font-medium shadow-sm disabled:opacity-50"
        >
          {downloading === 'excel' ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          )}
          <span>{downloading === 'excel' ? 'Generando Excel...' : 'Descargar Excel'}</span>
        </button>

        {/* Botón Finalizar Recepción (solo admin) */}
        {isAdmin && (
          <div className="w-full sm:w-auto sm:ml-auto">
            {isCompleted ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs sm:text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {finalizedWithShortage ? 'Finalizado con faltantes' : 'Recepción finalizada'}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                id="btn-finalize-reception"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-md shadow-emerald-950/40 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>FINALIZAR RECEPCIÓN</span>
              </button>
            )}
          </div>
        )}
      </div>

      <FinalizeShipmentModal
        shipmentId={shipmentId}
        shipmentNumber={shipmentNumber}
        destination={destination}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccessFinalize}
      />
    </div>
  );
}
