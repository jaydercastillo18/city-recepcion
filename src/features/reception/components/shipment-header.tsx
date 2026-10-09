'use client';
// ============================================================
// CITY RECEPCIÓN - Componente: Cabecera del envío con estadísticas
// ============================================================
import { ArrowLeft, Truck, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import type { Shipment, ShipmentStats } from '@/types';
import { formatDate, calcProgress, formatPercent } from '@/lib/utils';
import ShipmentReportButtons from './shipment-report-buttons';

interface ShipmentHeaderProps {
  shipment: Shipment;
  stats: ShipmentStats | null;
  isAdmin?: boolean;
}

export default function ShipmentHeader({ shipment, stats, isAdmin }: ShipmentHeaderProps) {
  const received = stats?.total_received ?? shipment.total_received_boxes;
  const expected = stats?.total_expected ?? shipment.total_expected_boxes;
  const progress = calcProgress(received, expected);
  const missing = stats?.boxes_missing ?? Math.max(0, expected - received);

  return (
    <div className="card-base overflow-hidden">
      {/* Top accent bar */}
      <div
        className="h-1"
        style={{
          background:
            progress >= 100
              ? 'linear-gradient(90deg, hsl(142 76% 36%), hsl(142 76% 50%))'
              : 'linear-gradient(90deg, hsl(275 75% 50%), hsl(325 85% 55%))',
        }}
        aria-hidden="true"
      />

      <div className="p-5">
        {/* Back link */}
        <Link
          href="/recepcion"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Volver a envíos</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Shipment info */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Truck className="w-5 h-5 text-blue-400" aria-hidden="true" />
              <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                {shipment.shipment_number}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white">{shipment.destination}</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {formatDate(shipment.shipment_date, 'long')}
            </p>
          </div>

          {/* Counter */}
          <div className="text-left sm:text-right">
            <p className="text-3xl font-bold text-white tabular-nums leading-none">
              {received}
              <span className="text-slate-500 text-2xl font-normal"> / {expected}</span>
            </p>
            <p className="text-slate-400 text-sm mt-0.5">CAJAS RECIBIDAS</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              Progreso general
            </span>
            <span
              className={`text-sm font-bold tabular-nums ${
                progress >= 100 ? 'text-emerald-400' : 'text-blue-400'
              }`}
            >
              {formatPercent(progress)}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-bar-fill ${progress > 100 ? 'excess' : ''}`}
              style={{ width: `${Math.min(progress, 100)}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${formatPercent(progress)} completado`}
            />
          </div>
        </div>

        {/* Stats mini row */}
        {stats && (
          <div className="grid grid-cols-4 gap-2 mt-4">
            <StatPill
              label="Pendientes"
              value={stats.total_pending}
              color="text-slate-400"
            />
            <StatPill
              label="Parciales"
              value={stats.total_partial}
              color="text-amber-400"
            />
            <StatPill
              label="Completos"
              value={stats.total_complete}
              color="text-emerald-400"
            />
            <StatPill
              label="Excesos"
              value={stats.total_excess}
              color="text-purple-400"
            />
          </div>
        )}

        {/* Faltante alert */}
        {missing > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-300 text-sm flex items-center justify-between">
            <span>Faltan por recibir:</span>
            <span className="font-bold tabular-nums">{missing} cajas</span>
          </div>
        )}
        {missing === 0 && expected > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-sm flex items-center gap-2">
            <span>✅</span>
            <span className="font-medium">Recepción completada</span>
          </div>
        )}

        {/* Acciones de reportes y cierre */}
        <div className="mt-4">
        <ShipmentReportButtons
            shipmentId={shipment.id}
            shipmentNumber={shipment.shipment_number}
            destination={shipment.destination}
            status={shipment.status}
            finalizedWithShortage={shipment.finalized_with_shortage}
            isAdmin={!!isAdmin}
            variant="full"
          />
        </div>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center bg-slate-900/80 rounded-lg p-2 border border-slate-800">
      <span className={`text-lg font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-xs text-slate-500 text-center leading-tight">{label}</span>
    </div>
  );
}
