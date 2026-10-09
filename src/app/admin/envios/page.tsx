// ============================================================
// CITY RECEPCIÓN - Admin: Lista de envíos
// ============================================================
import { Truck } from 'lucide-react';
import { connection } from 'next/server';
import { getAllShipments } from '@/features/shipments/actions';
import ShipmentHistory from '@/features/shipments/components/shipment-history';
import ImportShipmentDialog from '@/features/shipments/components/import-shipment-dialog';
import ShipmentBackdrop from '@/components/layout/shipment-backdrop';

import type { Metadata } from 'next';
import type { ShipmentStatus } from '@/types';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Envíos | Admin | City Recepción',
};

export const instant = false;

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
    <div className="shipment-scene">
      <ShipmentBackdrop />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-400" aria-hidden="true" />
            Gestión de Envíos
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Administra y supervisa todos los envíos.
          </p>
        </div>
        <ImportShipmentDialog />
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

      <ShipmentHistory shipments={shipments} />
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
