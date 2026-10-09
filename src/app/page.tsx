// ============================================================
// CITY RECEPCIÓN - Página de inicio (redirect)
// ============================================================
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import Link from 'next/link';
import { Boxes, Clock3 } from 'lucide-react';
import { getCurrentUser } from '@/features/auth/actions';
import AppHeader from '@/components/layout/app-header';
import ShipmentBackdrop from '@/components/layout/shipment-backdrop';

export const instant=false;
export default async function HomePage() {
  await connection();
  const auth=await getCurrentUser();
  if (!auth) redirect('/login');
  if (auth.profile?.role==='employee') redirect('/asistencia');
  if (auth.profile?.role!=='admin') redirect('/recepcion');
  return <div className="min-h-dvh"><AppHeader userEmail={auth.user.email??''} userName={auth.profile.full_name??''} userRole="admin" />
    <main className="container max-w-5xl mx-auto p-4 py-12 shipment-scene"><ShipmentBackdrop />
      <p className="text-fuchsia-300 text-sm tracking-widest">CITY OFERTAS</p><h1 className="text-3xl font-bold mt-2 mb-8">Control interno</h1>
      <div className="grid md:grid-cols-2 gap-6">
        <Link href="/admin/envios" className="card-base p-8 hover:border-fuchsia-400 transition-colors"><Boxes className="w-12 h-12 text-fuchsia-300 mb-5" aria-hidden /><h2 className="text-xl font-bold">Recepción de mercadería</h2><p className="text-slate-400 mt-2">Administrar envíos y recepción.</p></Link>
        <Link href="/admin/asistencia" className="card-base p-8 hover:border-purple-400 transition-colors"><Clock3 className="w-12 h-12 text-purple-300 mb-5" aria-hidden /><h2 className="text-xl font-bold">Control de asistencia</h2><p className="text-slate-400 mt-2">Personal, horarios y marcaciones.</p></Link>
      </div>
    </main></div>;
}
