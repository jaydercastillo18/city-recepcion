// ============================================================
// CITY RECEPCIÓN - Dashboard Admin (redirige a envíos)
// ============================================================
import { redirect } from 'next/navigation';

export const instant = false;

export default async function AdminPage() {
  redirect('/admin/envios');
}
