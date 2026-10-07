// ============================================================
// CITY RECEPCIÓN - Admin: Lista de envíos
// ============================================================
import Link from 'next/link';
import { connection } from 'next/server';
import {
  Plus,
  Truck,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  Edit,
} from 'lucide-react';
import { getAllShipments } from '@/features/shipments/actions';
import {
  formatDate,
  calcProgress,
  formatPercent,
  getShipmentStatusLabel,
} from '@/lib/utils';
import type { Metadata } from 'next';
import type { Shipment, ShipmentStatus } from '@/types';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Envíos | Admin | City Recepción',
};

export const instant = false;

const statusIcons: Record<ShipmentStatus, React.ReactNode> = {
  draft: <Edit className="w-4 h-4 text-slate-400" aria-hidden="true" />,
  receiving: <Clock className="w-4 h-4 text-blue-400" aria-hidden="true" />,
  completed: <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />,
  cancelled: <XCircle className="w-4 h-4 text-red-400" aria-hidden="true" />,
};

const statusClasses: Record<ShipmentStatus, string> = {
  draft: 'bg-slate-800 text-slate-300 border-slate-700',
  receiving: 'bg-blue-900/60 text-blue-300 border-blue-700/50',
  completed: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
  cancelled: 'bg-red-900/60 text-red-300 border-red-700/50',
};

function ShipmentRow({ shipment }: { shipment: Shipment }) {
  const progress = calcProgress(
    shipment.total_received_boxes,
    shipment.total_expected_boxes
  );
  const status = shipment.status as ShipmentStatus;

  return (
    <Link
      href={`/recepcion/${shipment.id}`}
      className="block card-base p-4 hover:border-slate-600 transition-all group"
    >
      <div className="flex items-center gap-4">
        {/* Status icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
          {statusIcons[status]}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-xs text-slate-500">
              {shipment.shipment_number}
            </span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full border font-medium',
                statusClasses[status]
              )}
            >
              {getShipmentStatusLabel(status)}
            </span>
          </div>
          <p className="font-semibold text-white truncate">{shipment.destination}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {formatDate(shipment.shipment_date)}
          </p>
        </div>

        {/* Progress */}
        <div className="flex-shrink-0 text-right hidden sm:block">
          <p className="text-sm font-bold text-white tabular-nums">
            {shipment.total_received_boxes} / {shipment.total_expected_boxes}
          </p>
          <p
            className={cn(
              'text-xs font-medium tabular-nums',
              progress >= 100 ? 'text-emerald-400' : 'text-slate-400'
            )}
          >
            {formatPercent(progress)}
          </p>
          {/* Mini barra */}
          <div className="progress-bar mt-1 w-20" style={{ height: '4px' }}>
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(progress, 100)}%`, height: '4px' }}
            />
          </div>
        </div>

        <ChevronRight
          className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

export default async function AdminEnviosPage() {
  await connection();
  const shipments = await getAllShipments();

  // Totales globales
  const totalExpected = shipments.reduce((s, e) => s + e.total_expected_boxes, 0);
  const totalReceived = shipments.reduce((s, e) => s + e.total_received_boxes, 0);
  const countByStatus = shipments.reduce(
    (acc, s) => {
      acc[s.status as ShipmentStatus] = (acc[s.status as ShipmentStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<ShipmentStatus, number>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-400" aria-hidden="true" />
            Gestión de Envíos
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Administra y supervisa todos los envíos.
          </p>
        </div>
        <button
          id="btn-new-shipment"
          className="btn-primary py-2.5 px-4 text-sm"
          title="Funcionalidad completa en FASE 2"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nuevo envío
        </button>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total esperado"
          value={totalExpected}
          unit="cajas"
          color="text-slate-200"
        />
        <StatCard
          label="Total recibido"
          value={totalReceived}
          unit="cajas"
          color="text-blue-400"
        />
        <StatCard
          label="En recepción"
          value={countByStatus.receiving ?? 0}
          unit="envíos"
          color="text-blue-400"
        />
        <StatCard
          label="Completados"
          value={countByStatus.completed ?? 0}
          unit="envíos"
          color="text-emerald-400"
        />
      </div>

      {/* Lista de envíos */}
      <div className="space-y-2">
        {shipments.length === 0 ? (
          <div className="card-base p-10 text-center">
            <Truck className="w-10 h-10 text-slate-700 mx-auto mb-3" aria-hidden="true" />
            <p className="text-slate-400">No hay envíos registrados</p>
          </div>
        ) : (
          shipments.map((shipment) => (
            <ShipmentRow key={shipment.id} shipment={shipment} />
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <div className="card-base p-4 text-center">
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{unit}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
    </div>
  );
}
