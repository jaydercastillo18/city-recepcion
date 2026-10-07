// ============================================================
// CITY RECEPCIÓN - Modo Recepción Rápida (FASE 2 placeholder)
// ============================================================
import Link from 'next/link';
import { connection } from 'next/server';
import { ArrowLeft, ScanLine, Zap, Clock } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recepción Rápida | City Recepción',
};

export const instant = false;

interface PageProps {
  params: Promise<{ shipmentId: string }>;
}

export default async function RecepcionRapidaPage({ params }: PageProps) {
  await connection();
  const { shipmentId } = await params;

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="p-6 rounded-2xl bg-amber-900/20 border border-amber-700/40 mb-6">
        <Zap className="w-16 h-16 text-amber-400 mx-auto" aria-hidden="true" />
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">Modo Recepción Rápida</h1>
      <p className="text-slate-400 max-w-sm mb-3">
        Esta funcionalidad estará disponible en la{' '}
        <strong className="text-amber-300">FASE 2</strong>.
      </p>

      <div className="card-base p-4 text-left max-w-sm w-full mb-6 space-y-3">
        <p className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" aria-hidden="true" />
          Próximamente incluirá:
        </p>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <ScanLine className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            Escaneo de códigos de barra desde cámara
          </li>
          <li className="flex items-start gap-2">
            <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            Registro ultrarrápido con una sola acción
          </li>
        </ul>
      </div>

      <Link
        href={`/recepcion/${shipmentId}`}
        className="btn-ghost"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Volver al envío
      </Link>
    </div>
  );
}
