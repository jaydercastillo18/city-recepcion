// ============================================================
// CITY RECEPCIÓN - Cliente Supabase para el Servidor (SSR)
// ============================================================
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

/**
 * Crea un cliente Supabase para uso en Server Components, Server Actions y Route Handlers.
 * Gestiona automáticamente las cookies de sesión.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // En Server Components no se pueden setear cookies (solo en middleware/route handlers)
          }
        },
      },
    }
  );
}
