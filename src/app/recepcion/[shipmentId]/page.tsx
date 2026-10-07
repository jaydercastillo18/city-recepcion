// ============================================================
// CITY RECEPCIÓN - Página /recepcion/[shipmentId]
// ============================================================
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { Metadata } from 'next';
import { getShipmentById, getShipmentItems } from '@/features/shipments/actions';
import { getShipmentStats } from '@/features/reception/actions';
import ShipmentReceptionClient from '@/features/reception/components/shipment-reception-client';
import ShipmentHeader from '@/features/reception/components/shipment-header';

interface PageProps {
  params: Promise<{ shipmentId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shipmentId } = await params;
  const shipment = await getShipmentById(shipmentId);
  if (!shipment) return { title: 'Envío no encontrado' };
  return {
    title: `${shipment.destination} - ${shipment.shipment_number} | City Recepción`,
    description: `Recepción del envío ${shipment.shipment_number} a ${shipment.destination}`,
  };
}

export const instant = false;

export default async function ShipmentReceptionPage({ params }: PageProps) {
  await connection();
  const { shipmentId } = await params;

  const [shipment, items, stats] = await Promise.all([
    getShipmentById(shipmentId),
    getShipmentItems(shipmentId),
    getShipmentStats(shipmentId),
  ]);

  if (!shipment) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <ShipmentHeader shipment={shipment} stats={stats} />
      <ShipmentReceptionClient
        shipment={shipment}
        initialItems={items}
      />
    </div>
  );
}
