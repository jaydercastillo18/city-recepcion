'use client';
// ============================================================
// CITY RECEPCIÓN - QuickReceptionClient
// Modo Recepción Rápida para Pistola de Códigos / Cámara Trasera
// Optimizado para velocidad en almacén con feedback gigante.
// ============================================================
import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ScanLine,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Search,
  Pause,
  Play,
  History,
  Box,
  Check,
  Sparkles,
  Camera,
  Layers,
} from 'lucide-react';
import type { Shipment, ShipmentItem } from '@/types';
import { useScannerSession } from '@/features/reception/hooks/use-scanner-session';
import { receptionStats } from '@/lib/reception';
import { cn } from '@/lib/utils';

interface QuickReceptionClientProps {
  shipment: Shipment;
  initialItems: ShipmentItem[];
  isAdmin?: boolean;
}

export default function QuickReceptionClient({
  shipment,
  initialItems,
  isAdmin: _isAdmin,
}: QuickReceptionClientProps) {
  const [items, setItems] = useState<ShipmentItem[]>(initialItems);
  const [manualInput, setManualInput] = useState('');
  const [activeTab, setActiveTab] = useState<'scanner' | 'history' | 'items'>('scanner');
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Actualización reactiva de items locales
  const handleItemUpdate = (updatedFields: Partial<ShipmentItem> & { id: string }) => {
    setItems(prev =>
      prev.map(item =>
        item.id === updatedFields.id ? { ...item, ...updatedFields } : item
      )
    );
  };

  const {
    videoRef,
    cameraError,
    cameraReady,
    paused,
    pending,
    automatic,
    feedback,
    history,
    arm,
    pause,
    addBox,
    acceptManual,
    selectCandidate,
    setAutoMode,
    readTextOCR,
    clearHistory,
  } = useScannerSession({
    shipmentId: shipment.id,
    items,
    onUpdate: handleItemUpdate,
    defaultAutomatic: true,
  });

  // Estadísticas en vivo
  const stats = useMemo(() => receptionStats(items), [items]);
  const progressPercentage = useMemo(() => {
    if (!stats.total_expected) return 0;
    return Math.min(100, Math.round((stats.total_received / stats.total_expected) * 100));
  }, [stats]);

  // Manejador para escáner físico de pistola / entrada manual
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualInput.trim();
    if (!code) return;
    acceptManual(code);
    setManualInput('');
    manualInputRef.current?.focus();
  };

  // Filtrado de items faltantes o buscados para la pestaña de items
  const filteredItems = useMemo(() => {
    let result = items;
    if (itemSearchQuery.trim()) {
      const q = itemSearchQuery.toLowerCase();
      result = result.filter(
        i =>
          i.code_original.toLowerCase().includes(q) ||
          i.product_name.toLowerCase().includes(q) ||
          (i.supplier ? i.supplier.toLowerCase().includes(q) : false)
      );
    }
    return result;
  }, [items, itemSearchQuery]);

  const missingCount = useMemo(
    () => items.filter(i => i.expected_boxes > i.received_boxes).length,
    [items]
  );

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-12">
      {/* ── Encabezado y Navegación ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/recepcion/${shipment.id}`}
            className="btn-ghost py-2 px-3 text-sm flex items-center gap-1.5 rounded-xl border border-slate-700 hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Volver a recepción normal</span>
            <span className="sm:hidden">Volver</span>
          </Link>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-600/40">
            <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            MODO RÁPIDO
          </span>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-400 font-mono block">
            ENVÍO #{shipment.shipment_number}
          </span>
          <span className="text-sm font-semibold text-white">
            {shipment.destination}
          </span>
        </div>
      </div>

      {/* ── Dashboard de Progreso en Vivo ── */}
      <div className="card-base p-4 sm:p-5 space-y-3 bg-gradient-to-br from-slate-900 via-[#191026] to-[#120a1c] border-purple-900/40 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              Recepción Rápida
              <span className="text-xs font-normal text-slate-400">
                ({items.length} productos)
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Escanea cajas con la cámara o pistola para registrar +1 al instante.
            </p>
          </div>

          <div className="text-right">
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white">
              {stats.total_received}
              <span className="text-slate-500 text-lg font-normal">
                /{stats.total_expected}
              </span>
            </span>
            <p className="text-xs text-purple-300 font-medium">cajas recibidas</p>
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="space-y-1.5">
          <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500 ease-out',
                progressPercentage >= 100
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm shadow-emerald-500/50'
                  : 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500'
              )}
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs font-medium text-slate-400 px-0.5">
            <span>
              Progreso:{' '}
              <strong className="text-white font-mono">{progressPercentage}%</strong>
            </span>
            <span>
              Faltan:{' '}
              <strong className={cn(stats.boxes_missing > 0 ? 'text-amber-400' : 'text-emerald-400', 'font-mono')}>
                {stats.boxes_missing} cajas
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── Navegación de pestañas móvil/escritorio ── */}
      <div className="flex border-b border-slate-800 gap-2 pb-1">
        <button
          onClick={() => setActiveTab('scanner')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
            activeTab === 'scanner'
              ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          )}
        >
          <ScanLine className="w-4 h-4" />
          Escáner en Vivo
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
            activeTab === 'history'
              ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          )}
        >
          <History className="w-4 h-4" />
          Sesión Activa
          {history.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500 text-white font-mono">
              {history.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('items')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
            activeTab === 'items'
              ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          )}
        >
          <Layers className="w-4 h-4" />
          Faltantes ({missingCount})
        </button>
      </div>

      {/* ── PESTAÑA 1: ESCÁNER EN VIVO Y FEEDBACK ── */}
      {activeTab === 'scanner' && (
        <div className="space-y-4">
          {/* Cámara y Visor */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-700/80 bg-black shadow-2xl">
            {/* Viewport de video */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full aspect-[4/3] sm:aspect-video object-cover bg-black"
            />

            {/* Guía visual de escaneo */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <div
                className={cn(
                  'w-4/5 max-w-xs aspect-square rounded-2xl border-2 transition-all duration-300 relative flex items-center justify-center',
                  paused
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-fuchsia-400/70 shadow-[0_0_25px_rgba(217,144,250,0.25)]'
                )}
              >
                {/* Esquinas guía */}
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-fuchsia-300" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-fuchsia-300" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-fuchsia-300" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-fuchsia-300" />

                {!paused && (
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-fuchsia-400 to-transparent animate-pulse" />
                )}
              </div>
            </div>

            {/* Pill de estado flotante */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-slate-700/80 text-xs font-medium">
                {pending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                    <span className="text-purple-200">Registrando caja...</span>
                  </>
                ) : paused ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    <span className="text-amber-200">Pausado para revisión</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-200">Buscando código...</span>
                  </>
                )}
              </div>

              {cameraReady && (
                <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-slate-700/60 text-[11px] text-slate-300">
                  Cámara activa
                </div>
              )}
            </div>

            {/* Error de cámara */}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-10">
                <Camera className="w-12 h-12 text-amber-400 mb-2" />
                <p className="text-sm text-amber-200 max-w-sm mb-3">{cameraError}</p>
                <p className="text-xs text-slate-400 max-w-xs">
                  Puedes utilizar la pistola de código de barras USB/Bluetooth o ingresar los códigos manualmente abajo.
                </p>
              </div>
            )}
          </div>

          {/* ── Controles Rápidos y Switch de Modo Automático ── */}
          <div className="card-base p-3.5 flex flex-wrap items-center justify-between gap-3 bg-slate-900/90">
            {/* Switch de Auto Registrar */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={automatic}
                  onChange={e => setAutoMode(e.target.checked)}
                  disabled={pending}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </div>
              <div className="text-left">
                <span className="text-sm font-semibold text-white block">
                  Auto +1 al escanear
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {automatic
                    ? 'Registra caja inmediatamente al detectar'
                    : 'Pide confirmación antes de registrar'}
                </span>
              </div>
            </label>

            {/* Botones de acción rápida */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={paused ? arm : pause}
                disabled={pending}
                className={cn(
                  'btn-ghost py-2 px-3 text-sm flex items-center gap-1.5 rounded-xl',
                  paused ? 'text-purple-300 border-purple-500/50 bg-purple-950/40' : ''
                )}
              >
                {paused ? (
                  <>
                    <Play className="w-4 h-4 fill-purple-400 text-purple-400" />
                    <span>Reanudar</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 text-slate-400" />
                    <span>Pausar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => void readTextOCR()}
                disabled={pending || !cameraReady}
                title="Leer texto con OCR si el código de barras está roto o borroso"
                className="btn-ghost py-2 px-3 text-sm flex items-center gap-1.5 rounded-xl text-slate-300 border-slate-700"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Leer OCR</span>
              </button>
            </div>
          </div>

          {/* ── FEEDBACK GIGANTE E INMEDIATO ── */}
          <div aria-live="assertive" className="transition-all duration-200">
            {/* Caso 1: Caja Registrada con Éxito */}
            {feedback?.kind === 'registered' && (
              <div className="card-base p-5 bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-950 border-2 border-emerald-500/70 shadow-2xl rounded-2xl animate-in fade-in zoom-in-95 space-y-3">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-500 text-slate-950 uppercase tracking-wider">
                        +1 Registrado
                      </span>
                      <span className="font-mono text-sm text-emerald-300 font-semibold">
                        {feedback.item.code_original}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-white mt-1 truncate">
                      {feedback.item.product_name}
                    </h2>
                    {feedback.item.supplier && (
                      <p className="text-xs text-slate-300 mt-0.5">
                        {feedback.item.supplier}
                      </p>
                    )}
                  </div>
                </div>

                {/* Contador de Cajas del Item */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-emerald-900/50">
                  <span className="text-sm text-slate-300 font-medium">
                    Total recibido para este producto:
                  </span>
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    {feedback.newQty} / {feedback.item.expected_boxes}{' '}
                    <span className="text-xs font-normal text-slate-400">cajas</span>
                  </span>
                </div>

                {/* Botón para siguiente caja */}
                <button
                  type="button"
                  onClick={arm}
                  className="btn-primary w-full py-3.5 text-base font-bold flex items-center justify-center gap-2 rounded-xl"
                >
                  <ScanLine className="w-5 h-5" />
                  Escanear siguiente caja
                </button>
              </div>
            )}

            {/* Caso 2: Vista previa (Manual mode o tras escaneo sin auto) */}
            {feedback?.kind === 'preview' && (
              <div className="card-base p-5 bg-gradient-to-br from-purple-950/80 via-slate-900 to-slate-950 border-2 border-purple-500/70 shadow-2xl rounded-2xl animate-in fade-in space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                    <Box className="w-8 h-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-purple-300 font-semibold uppercase">
                      {feedback.item.code_original}
                    </span>
                    <h2 className="text-xl font-bold text-white mt-0.5">
                      {feedback.item.product_name}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {feedback.item.supplier ? `${feedback.item.supplier} · ` : ''}{feedback.item.received_boxes} de {feedback.item.expected_boxes} cajas recibidas
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void addBox(feedback.item)}
                    className="btn-success flex-1 py-4 text-lg font-extrabold flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-emerald-950/50"
                  >
                    <Check className="w-6 h-6 stroke-[3]" />
                    {pending ? 'Registrando…' : '+1 CAJA (REGISTRAR)'}
                  </button>

                  <button
                    type="button"
                    onClick={arm}
                    disabled={pending}
                    className="btn-ghost px-4 rounded-xl"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Caso 3: Alerta de Exceso Pendiente de Confirmación */}
            {feedback?.kind === 'excess_pending' && (
              <div className="card-base p-5 bg-gradient-to-br from-amber-950/90 via-slate-900 to-slate-950 border-2 border-amber-500 shadow-2xl rounded-2xl animate-in fade-in space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-amber-300">
                      ¡Alerta de Cajas Completas!
                    </h2>
                    <p className="text-sm text-slate-200 mt-1">
                      El producto{' '}
                      <strong className="text-white">{feedback.item.product_name}</strong>{' '}
                      ya alcanzó sus{' '}
                      <span className="font-mono font-bold text-amber-400">
                        {feedback.item.received_boxes} / {feedback.item.expected_boxes}
                      </span>{' '}
                      cajas esperadas.
                    </p>
                    <p className="text-xs text-amber-200/80 mt-1">
                      ¿Confirmas registrar una caja adicional en EXCESO?
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void addBox(feedback.item, true)}
                    className="btn-danger flex-1 py-3.5 text-base font-bold flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    {pending ? 'Registrando exceso…' : 'Sí, registrar caja en exceso'}
                  </button>

                  <button
                    type="button"
                    onClick={arm}
                    disabled={pending}
                    className="btn-ghost py-3.5 px-5 rounded-xl text-slate-300 hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Caso 4: Código No Encontrado */}
            {feedback?.kind === 'not_found' && (
              <div className="card-base p-5 bg-gradient-to-br from-rose-950/80 via-slate-900 to-slate-950 border-2 border-rose-500/60 shadow-2xl rounded-2xl animate-in fade-in space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/40 shrink-0">
                    <XCircle className="w-7 h-7" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-base font-bold text-rose-300">
                      Código no encontrado en este envío
                    </h2>
                    <p className="text-sm text-slate-300 mt-0.5">
                      No hay ningún producto asociado al código:{' '}
                      <span className="font-mono font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {feedback.code}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={arm}
                    className="btn-primary flex-1 py-3 text-sm font-semibold rounded-xl"
                  >
                    Reintentar escaneo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemSearchQuery(feedback.code);
                      setActiveTab('items');
                    }}
                    className="btn-ghost py-3 px-4 text-sm rounded-xl"
                  >
                    Buscar en lista
                  </button>
                </div>
              </div>
            )}

            {/* Caso 5: Coincidencias Múltiples (Códigos ambiguos / repetidos) */}
            {feedback?.kind === 'ambiguous' && (
              <div className="card-base p-5 bg-gradient-to-br from-purple-950/90 via-slate-900 to-slate-950 border-2 border-purple-500 shadow-2xl rounded-2xl animate-in fade-in space-y-3">
                <div className="flex items-center gap-2 text-purple-300">
                  <Layers className="w-5 h-5" />
                  <h2 className="font-bold text-base">
                    Código repetido ({feedback.code}) — Selecciona el producto:
                  </h2>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {feedback.candidates.map(candidate => (
                    <div
                      key={candidate.id}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-between gap-3 hover:border-purple-500 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-white truncate">
                          {candidate.product_name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {candidate.supplier ? `${candidate.supplier} · ` : ''}{candidate.received_boxes} / {candidate.expected_boxes} cajas
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => selectCandidate(candidate)}
                        className="btn-primary py-2 px-3 text-xs font-bold rounded-lg shrink-0"
                      >
                        +1 Caja
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={arm}
                  className="btn-ghost w-full py-2.5 text-xs rounded-xl"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Caso 6: OCR Feedback */}
            {feedback?.kind === 'ocr_match' && (
              <div className="card-base p-4 bg-purple-950/50 border border-purple-500/50 rounded-2xl space-y-3">
                <p className="text-sm font-semibold text-purple-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Texto reconocido por OCR:
                </p>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-700">
                  <p className="font-mono text-xs text-purple-300 font-bold">{feedback.item.code_original}</p>
                  <p className="font-bold text-white text-base mt-0.5">{feedback.item.product_name}</p>
                  <p className="text-xs text-slate-400">
                    {feedback.item.supplier ? `${feedback.item.supplier} · ` : ''}{feedback.item.received_boxes}/{feedback.item.expected_boxes} cajas
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void addBox(feedback.item)}
                    className="btn-success flex-1 py-3 rounded-xl text-sm font-bold"
                  >
                    Confirmar +1 caja
                  </button>
                  <button type="button" onClick={arm} className="btn-ghost px-4 rounded-xl text-sm">
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {feedback?.kind === 'ocr_none' && (
              <div className="card-base p-4 bg-slate-900 border border-slate-700 rounded-2xl text-center space-y-2">
                <p className="text-sm text-slate-300">No se reconoció ningún código legible en la imagen.</p>
                <button type="button" onClick={arm} className="btn-primary py-2 px-4 text-sm rounded-xl">
                  Reintentar escaneo
                </button>
              </div>
            )}

            {/* Caso 7: Error de Red / Base de Datos */}
            {feedback?.kind === 'error' && (
              <div className="card-base p-4 bg-rose-950/80 border border-rose-500 rounded-2xl space-y-2">
                <p className="text-sm font-bold text-rose-200">{feedback.message}</p>
                <button type="button" onClick={arm} className="btn-ghost py-2 px-4 text-xs rounded-xl">
                  Aceptar y continuar
                </button>
              </div>
            )}
          </div>

          {/* ── Entrada Manual / Soporte para Pistola USB de Código de Barras ── */}
          <form onSubmit={handleManualSubmit} className="card-base p-3.5 space-y-2 bg-slate-900/90 border-slate-800">
            <label htmlFor="barcode-gun-input" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Pistola USB / Bluetooth o Código Manual</span>
              <span className="text-[11px] text-slate-500 font-normal">Pulsa Enter para procesar</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  ref={manualInputRef}
                  id="barcode-gun-input"
                  type="text"
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  placeholder="Dispara con la pistola o escribe el código..."
                  className="input-search pl-9 pr-3 py-2.5 text-sm rounded-xl"
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                disabled={!manualInput.trim() || pending}
                className="btn-primary py-2.5 px-4 text-sm rounded-xl shrink-0"
              >
                Procesar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── PESTAÑA 2: HISTORIAL DE LA SESIÓN ACTIVA ── */}
      {activeTab === 'history' && (
        <div className="card-base p-4 sm:p-5 space-y-4 bg-slate-900/90">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-purple-400" />
                Cajas Escaneadas en Esta Sesión
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Total escaneado en vivo: <strong className="text-purple-300 font-mono">{history.length}</strong> cajas
              </p>
            </div>

            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="btn-ghost py-1.5 px-3 text-xs text-slate-400 hover:text-rose-300 rounded-lg"
              >
                Limpiar historial
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <Box className="w-12 h-12 mx-auto text-slate-700" />
              <p className="text-sm">Aún no has registrado cajas en esta sesión rápida.</p>
              <p className="text-xs text-slate-600">
                Al escanear códigos con la cámara o la pistola aparecerán aquí con su hora exacta.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {history.map(item => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/50">
                        {item.code}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">{item.time}</span>
                    </div>
                    <p className="font-semibold text-sm text-white mt-1 truncate">
                      {item.productName}
                    </p>
                    {item.supplier && (
                      <p className="text-xs text-slate-400">{item.supplier}</p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      +1 Caja
                    </span>
                    <p className="text-[11px] text-slate-400 font-mono mt-1">
                      {item.newQty} / {item.expectedQty}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PESTAÑA 3: LISTA DE PRODUCTOS Y FALTANTES ── */}
      {activeTab === 'items' && (
        <div className="card-base p-4 sm:p-5 space-y-4 bg-slate-900/90">
          <div className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-400" />
              Lista de Productos del Envío
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={itemSearchQuery}
                onChange={e => setItemSearchQuery(e.target.value)}
                placeholder="Buscar por código, producto o proveedor..."
                className="input-search pl-9 pr-3 py-2 text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto pr-1">
            {filteredItems.map(item => {
              const diff = item.expected_boxes - item.received_boxes;
              const isDone = diff <= 0;
              return (
                <div
                  key={item.id}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-slate-800/40 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-300 font-bold">
                        {item.code_original}
                      </span>
                      {isDone ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          COMPLETO
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                          FALTAN {diff}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-sm text-white mt-1 truncate">
                      {item.product_name}
                    </p>
                    {item.supplier && (
                      <p className="text-xs text-slate-400">{item.supplier}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-sm font-bold text-slate-200">
                      {item.received_boxes} / {item.expected_boxes}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setActiveTab('scanner');
                        acceptManual(item.code_original);
                      }}
                      className="btn-ghost py-1.5 px-2.5 text-xs rounded-lg hover:text-purple-300 hover:border-purple-500"
                    >
                      +1
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
