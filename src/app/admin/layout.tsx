// ============================================================
// CITY RECEPCIÓN - Layout Admin
// ============================================================
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { Profile } from '@/types';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/layout/app-header';

export const metadata: Metadata = {
  title: 'Administración | City Recepción',
};

export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name' | 'role'> | null };

  if (profile?.role !== 'admin') redirect('/recepcion');

  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader
        userEmail={user.email ?? ''}
        userName={profile?.full_name ?? user.email ?? ''}
        userRole="admin"
      />
      <main className="flex-1 container mx-auto max-w-6xl px-4 py-6 pb-20">
        {children}
      </main>
    </div>
  );
}
