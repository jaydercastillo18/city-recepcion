// ============================================================
// CITY RECEPCIÓN - Página 404
// ============================================================
import Link from 'next/link';
import { Package2, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700 inline-flex mb-6">
          <Package2 className="w-12 h-12 text-slate-500" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">404</h1>
        <p className="text-slate-400 mb-6">
          Esta página no existe o no tienes acceso.
        </p>
        <Link href="/recepcion" className="btn-primary inline-flex">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Ir a Recepción
        </Link>
      </div>
    </main>
  );
}
