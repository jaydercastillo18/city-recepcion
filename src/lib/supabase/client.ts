'use client';
// ============================================================
// CITY RECEPCIÓN - Cliente Supabase para el Navegador
// ============================================================
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * Singleton del cliente Supabase para uso en Client Components.
 * Se reutiliza entre renders para evitar múltiples instancias.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
