'use client';
// ============================================================
// CITY RECEPCIÓN - Item Card de recepción
// Muestra un producto con controles completos de recepción:
// +1 Caja, -1 Caja, Recibir Todo, Cantidad Manual e Incidencias/Notas
// ============================================================
import { useState, useTransition } from 'react';
import {
  Minus,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
  Hash,
  CheckCheck,
  Edit3,
  MessageSquareWarning,
  X,
  Check,
} from 'lucide-react';
import { registerBoxReception, createIncidentAction } from '@/features/reception/actions';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ShipmentItem, ItemStatus } from '@/types';

interface ItemCardProps {
  item: ShipmentItem;
  shipmentId: string;
  onUpdate: (updatedItem: Partial<ShipmentItem> & { id: string }) => void;
}

const statusConfig: Record<
  ItemStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  pending: {
    label: 'PENDIENTE',
    icon: <Clock className="w-3.5 h-3.5" aria-hidden="true" />,
    className: 'badge-pending',
  },
  partial: {
    label: 'PARCIAL',
    icon: <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />,
    className: 'badge-partial',
  },
  complete: {
    label: 'COMPLETO',
    icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />,
    className: 'badge-complete',
  },
  excess: {
    label: 'EXCESO',
    icon: <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />,
    className: 'badge-excess',
  },
};

export default function ItemCard({ item, shipmentId, onUpdate }: ItemCardProps) {
  const [isPending, startTransition] = useTransition();
  const [showManual, setShowManual] = useState(false);
  const [manualQty, setManualQty] = useState(item.received_boxes.toString());
  const [showIncident, setShowIncident] = useState(false);
  const [incidentNote, setIncidentNote] = useState('');

  const status = (item.status as ItemStatus) ?? 'pending';
  const config = statusConfig[status];
  const diff = item.received_boxes - item.expected_boxes;
  const canReceiveAll = item.received_boxes < item.expected_boxes;
  const canDecrease = item.received_boxes > 0;
  const isDisabled = isPending;

  // Registrar acción (+1, -1, corrección o directo)
  async function executeReception(
    action: 'receive' | 'correction' | 'reset',
    quantity: number,
    notes?: string
  ) {
    startTransition(async () => {
      const result = await registerBoxReception(
        item.id,
        action,
        quantity,
        shipmentId,
        notes
      );

      if (result.success) {
        onUpdate({
          id: item.id,
          received_boxes: result.new_quantity!,
          status: result.status!,
        });

        if (result.status === 'complete') {
          toast({
            title: '✅ Producto completo',
            description: `${item.code_original} — ${result.new_quantity} de ${item.expected_boxes} cajas`,
            variant: 'success',
          });
        } else if (result.status === 'excess') {
          toast({
            title: '🚨 Exceso registrado',
            description: `${item.code_original}: ${result.new_quantity} cajas (esperadas: ${item.expected_boxes})`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Cajas actualizadas',
            description: `${item.code_original}: ${result.new_quantity} de ${item.expected_boxes}`,
            variant: 'default',
          });
        }
      } else {
        toast({
          title: 'Error al registrar',
          description: result.error ?? 'Error desconocido',
          variant: 'destructive',
        });
      }
    });
  }

  // Delta +1 / -1
  async function handleDelta(delta: number) {
    if (delta > 0 && item.received_boxes + delta > item.expected_boxes) {
      const confirmed = window.confirm(
        `⚠️ Vas a registrar ${item.received_boxes + delta} cajas para "${item.product_name}".\n` +
          `Lo esperado es ${item.expected_boxes}.\n\n¿Confirmas el exceso?`
      );
      if (!confirmed) return;
    }
    await executeReception('receive', delta);
  }

  // Recibir Todo (1 click para completar lo esperado)
  async function handleReceiveAll() {
    await executeReception('correction', item.expected_boxes, 'Recibido completo en un click');
  }

  // Guardar cantidad manual
  async function handleSaveManual() {
    const parsed = parseInt(manualQty, 10);
    if (isNaN(parsed) || parsed < 0) {
      toast({
        title: 'Cantidad inválida',
        description: 'Ingresa un número entero mayor o igual a 0',
        variant: 'destructive',
      });
      return;
    }

    if (parsed > item.expected_boxes) {
      const confirmed = window.confirm(
        `⚠️ Vas a registrar ${parsed} cajas para "${item.product_name}".\n` +
          `Lo esperado es ${item.expected_boxes}.\n\n¿Confirmas el exceso?`
      );
      if (!confirmed) return;
    }

    await executeReception('correction', parsed);
    setShowManual(false);
  }

  // Guardar reporte de incidencia
  async function handleSaveIncident() {
    if (!incidentNote.trim()) {
      toast({
        title: 'Nota vacía',
        description: 'Escribe una observación para este producto',
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      const result = await createIncidentAction({
        shipmentId,
        shipmentItemId: item.id,
        type: 'other',
        description: incidentNote.trim(),
      });

      if (result.success) {
        onUpdate({ id: item.id, observations: [...(item.observations ?? []), incidentNote.trim()] });
        setIncidentNote('');
        setShowIncident(false);
        toast({
          title: 'Observación guardada',
          description: 'Guardada para este producto; aparecerá en PDF y Excel.',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Error al registrar',
          description: result.error ?? 'Error desconocido',
          variant: 'destructive',
        });
      }
    });
  }

  return (
    <article id={`item-${item.id}`}
      className={cn(
        'card-base p-4 transition-all duration-200 slide-up',
        status === 'complete' && 'border-emerald-800/50 bg-emerald-950/10',
        status === 'excess' && 'border-purple-800/50 bg-purple-950/10',
        status === 'partial' && 'border-amber-800/30 bg-amber-950/5',
        isPending && 'opacity-75'
      )}
      aria-label={`${item.code_original} - ${item.product_name}`}
    >
      {/* Header del item */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          {/* Código */}
          <div className="flex items-center gap-2 mb-1">
            <div className="flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" aria-hidden="true" />
              <span className="font-mono font-bold text-blue-300 text-sm tracking-wider">
                {item.code_original}
              </span>
            </div>
          </div>

          {/* Nombre del producto */}
          <p className="font-semibold text-white text-base leading-snug">
            {item.product_name}
          </p>

          {/* Proveedor */}
          {item.supplier && (
            <p className="flex items-center gap-1 text-xs text-slate-400 mt-1">
              <Building2 className="w-3 h-3" aria-hidden="true" />
              {item.supplier}
            </p>
          )}
        </div>

        {/* Status badge */}
        <span
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0',
            config.className
          )}
          aria-label={`Estado: ${config.label}`}
        >
          {config.icon}
          {config.label}
        </span>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 text-center">
          <p className="text-xs text-slate-500 mb-0.5">Esperadas</p>
          <p className="text-2xl font-bold text-slate-200 tabular-nums">
            {item.expected_boxes}
          </p>
        </div>
        <div
          className={cn(
            'rounded-xl p-3 border text-center transition-colors',
            status === 'complete'
              ? 'bg-emerald-950/40 border-emerald-800/50'
              : status === 'excess'
                ? 'bg-purple-950/40 border-purple-800/50'
                : status === 'partial'
                  ? 'bg-amber-950/30 border-amber-800/30'
                  : 'bg-slate-900/80 border-slate-800'
          )}
        >
          <p className="text-xs text-slate-500 mb-0.5">Recibidas</p>
          <p
            className={cn(
              'text-2xl font-bold tabular-nums',
              status === 'complete'
                ? 'text-emerald-400'
                : status === 'excess'
                  ? 'text-purple-400'
                  : status === 'partial'
                    ? 'text-amber-400'
                    : 'text-slate-400'
            )}
          >
            {item.received_boxes}
          </p>
        </div>
      </div>

      {/* Mensaje de estado */}
      <div className="mb-3 text-sm text-center font-medium">
        {status === 'complete' && (
          <span className="text-emerald-400">✅ COMPLETO</span>
        )}
        {status === 'excess' && (
          <span className="text-purple-400 font-bold">
            🚨 {Math.abs(diff)} CAJA{Math.abs(diff) !== 1 ? 'S' : ''} EXTRA
          </span>
        )}
        {status === 'partial' && (
          <span className="text-amber-400">
            ⚠️ Falta{diff * -1 !== 1 ? 'n' : ''} {Math.abs(diff)} caja{Math.abs(diff) !== 1 ? 's' : ''}
          </span>
        )}
        {status === 'pending' && (
          <span className="text-slate-500">Sin cajas registradas ({item.expected_boxes} pendientes)</span>
        )}
      </div>

      {/* Controles Principales: [-] [n] [+] */}
      <div className="flex items-center gap-3 mb-3" role="group" aria-label="Controles de recepción">
        <button
          id={`btn-decrease-${item.id}`}
          onClick={() => handleDelta(-1)}
          disabled={isDisabled || !canDecrease}
          className={cn(
            'flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center',
            'text-2xl font-bold transition-all duration-150 active:scale-95',
            'disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100',
            'bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600',
            'text-slate-200'
          )}
          aria-label="Reducir 1 caja"
          title="Restar 1 caja"
        >
          <Minus className="w-6 h-6" aria-hidden="true" />
        </button>

        <div className="flex-1 text-center py-2 bg-slate-900/60 rounded-xl border border-slate-800">
          {isPending ? (
            <Loader2
              className="w-6 h-6 animate-spin text-blue-400 mx-auto"
              aria-label="Procesando..."
            />
          ) : (
            <div className="flex flex-col items-center">
              <span
                className="text-2xl font-bold text-white tabular-nums leading-none"
                aria-live="polite"
                aria-atomic="true"
              >
                {item.received_boxes}
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                de {item.expected_boxes}
              </span>
            </div>
          )}
        </div>

        <button
          id={`btn-increase-${item.id}`}
          onClick={() => handleDelta(1)}
          disabled={isDisabled}
          className={cn(
            'flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center',
            'text-2xl font-bold transition-all duration-150 active:scale-95',
            'disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100',
            status === 'complete' || status === 'excess'
              ? 'bg-amber-600 hover:bg-amber-500 border border-amber-500 text-white'
              : 'bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white shadow-lg shadow-blue-900/30'
          )}
          aria-label="Agregar 1 caja"
          title="Sumar 1 caja"
        >
          <Plus className="w-6 h-6" aria-hidden="true" />
        </button>
      </div>

      {/* Botones de acción rápida secundaria */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
        {canReceiveAll ? (
          <button
            type="button"
            onClick={handleReceiveAll}
            disabled={isDisabled}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 text-emerald-300 text-xs font-semibold transition-colors disabled:opacity-50"
            title="Registrar todas las cajas faltantes en 1 toque"
          >
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Recibir Todo ({item.expected_boxes})</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => executeReception('reset', 0, 'Reseteado a 0')}
            disabled={isDisabled || item.received_boxes === 0}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors disabled:opacity-30"
            title="Poner en 0 (Admin)"
          >
            <span>Resetear a 0</span>
          </button>
        )}

        <div className="flex gap-1.5 justify-end">
          <button
            type="button"
            onClick={() => {
              setManualQty(item.received_boxes.toString());
              setShowManual((v) => !v);
              setShowIncident(false);
            }}
            disabled={isDisabled}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors',
              showManual
                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
            )}
            title="Ingresar cantidad exacta"
          >
            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Manual</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowIncident((v) => !v);
              setShowManual(false);
            }}
            disabled={isDisabled}
            className={cn(
              'p-2 rounded-lg border text-xs font-medium transition-colors',
              showIncident
                ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200'
            )}
            title="Agregar observación"
            aria-label="Agregar observación"
          >
            <MessageSquareWarning className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" /> Agregar observación</button>
        </div>
      </div>

      {!!item.observations?.length && <div className="mt-3 p-3 rounded-xl bg-fuchsia-950/30 border border-fuchsia-800/50">
        <p className="text-sm font-semibold text-fuchsia-200">Con observación ({item.observations.length})</p>
        {item.observations.map((note, index) => <p key={index} className="text-sm text-slate-200 whitespace-pre-wrap break-words mt-1">{note}</p>)}
      </div>}
      {/* Panel desplegable: Entrada Manual */}
      {showManual && (
        <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-blue-500/30 fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-blue-300">
              Ingresar cantidad recibida directa:
            </span>
            <button
              onClick={() => setShowManual(false)}
              className="text-slate-500 hover:text-slate-300 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={manualQty}
              onChange={(e) => setManualQty(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-base focus:outline-none focus:border-blue-500"
              placeholder="Ej. 20"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveManual}
              disabled={isDisabled}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Guardar</span>
            </button>
          </div>
        </div>
      )}

      {/* Panel desplegable: Reportar Incidencia */}
      {showIncident && (
        <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-300 flex items-center gap-1">
              <MessageSquareWarning className="w-3.5 h-3.5" />
              Agregar observación
            </span>
            <button
              onClick={() => setShowIncident(false)}
              className="text-slate-500 hover:text-slate-300 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <textarea aria-label="Observación del producto" maxLength={2000} rows={3} value={incidentNote}
              onChange={(e) => setIncidentNote(e.target.value)}
              placeholder="Ej. Caja dañada, embalaje abierto…"
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-base text-white placeholder-slate-400 min-w-0 focus:outline-none focus:border-amber-500"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveIncident}
              disabled={isDisabled}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
