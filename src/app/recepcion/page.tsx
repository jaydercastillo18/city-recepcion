// ============================================================
// CITY RECEPCIÓN - Página principal /recepcion
// Lista de envíos activos
// ============================================================
import WarehouseHero from '@/components/layout/warehouse-hero';
import ShipmentBackdrop from '@/components/layout/shipment-backdrop';
import { Suspense } from 'react';
import { Boxes, ArrowRight, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { getActiveShipments } from '@/features/shipments/actions';
import { formatDate, calcProgress, formatPercent } from '@/lib/utils';
import type { Shipment } from '@/types';

export const instant = false;

function ShipmentCard({ shipment }: { shipment: Shipment }) {
  const progress = calcProgress(
    shipment.total_received_boxes,
    shipment.total_expected_boxes
  );
  const isReceiving = shipment.status === 'receiving';

  return (
    <article
      className="card-base p-6 hover:border-slate-600 transition-all duration-200 slide-up group"
      aria-label={`Envío ${shipment.shipment_number} a ${shipment.destination}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2.5 py-1 rounded-md">
            {shipment.shipment_number}
          </span>
          <h2 className="text-lg font-bold text-white mt-2 group-hover:text-blue-400 transition-colors">
            {shipment.destination}
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {formatDate(shipment.shipment_date, 'long')}
          </p>
        </div>

        {/* Status badge */}
        <span
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            isReceiving
              ? 'badge-receiving'
              : 'badge-pending'
          }`}
        >
          {isReceiving ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              En Recepción
            </>
          ) : (
            'Borrador'
          )}
        </span>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
          <p className="text-xs text-slate-500 mb-0.5">Cajas esperadas</p>
          <p className="text-2xl font-bold text-slate-200 tabular-nums">
            {shipment.total_expected_boxes}
          </p>
        </div>
        <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
          <p className="text-xs text-slate-500 mb-0.5">Cajas recibidas</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              progress >= 100 ? 'text-emerald-400' : 'text-blue-400'
            }`}
          >
            {shipment.total_received_boxes}
          </p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1.5 mb-5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400">Progreso de recepción</span>
          <span
            className={`font-semibold tabular-nums ${
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
            aria-label={`${formatPercent(progress)} recibido`}
          />
        </div>
      </div>

      {/* Acción principal */}
      <Link
        href={`/recepcion/${shipment.id}`}
        id={`btn-open-shipment-${shipment.id}`}
        className="btn-warehouse w-full justify-between group-hover:bg-blue-600 transition-colors"
      >
        <span className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4" aria-hidden="true" />
          <span>{isReceiving ? 'Continuar Recepción' : 'Abrir Envío'}</span>
        </span>
        <ArrowRight
          className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
          aria-hidden="true"
        />
      </Link>
    </article>
  );
}

function ShipmentsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
      {[1, 2].map((i) => (
        <div key={i} className="card-base p-6 animate-pulse space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
      <WarehouseHero />
              <div className="h-5 w-40 bg-slate-800 rounded" />
              <div className="h-4 w-28 bg-slate-800 rounded" />
            </div>
            <div className="h-6 w-20 bg-slate-800 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 bg-slate-800 rounded-xl" />
            <div className="h-16 bg-slate-800 rounded-xl" />
          </div>
          <div className="h-2 w-full bg-slate-800 rounded" />
          <div className="h-10 w-full bg-slate-800 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

async function ShipmentsList() {
  await connection();
  const shipments = await getActiveShipments();

  if (shipments.length === 0) {
    return (
      <div className="card-base p-12 text-center">
        <Boxes
          className="w-12 h-12 text-slate-700 mx-auto mb-3"
          aria-hidden="true"
        />
        <p className="text-slate-400 font-medium">No hay envíos activos</p>
        <p className="text-slate-600 text-sm mt-1">
          Los envíos en estado &quot;Borrador&quot; o &quot;En Recepción&quot; aparecerán aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
      {shipments.map((shipment) => (
        <ShipmentCard key={shipment.id} shipment={shipment} />
      ))}
    </div>
  );
}

export default function RecepcionPage() {
  return (
    <div className="shipment-scene">
      <ShipmentBackdrop />
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Boxes className="w-5 h-5 text-blue-400" aria-hidden="true" />
          <h1 className="text-xl font-bold text-white">Envíos Activos</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Selecciona un envío para comenzar o continuar la recepción de mercadería.
        </p>
      </div>

      {/* Lista con streaming Suspense y fallback de skeleton */}
      <Suspense fallback={<ShipmentsSkeleton />}>
        <ShipmentsList />
      </Suspense>
    </div>
  );
}
