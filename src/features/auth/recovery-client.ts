"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
let recoveryClient:
  | ReturnType<typeof createBrowserClient<Database>>
  | undefined;
export function getRecoveryClient() {
  // URL credentials are handled once by the recovery page, before initialization.
  // Cookie storage retains PKCE verifiers and sessions through the official SSR adapter.
  recoveryClient ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { isSingleton: false, auth: { detectSessionInUrl: false } },
  );
  return recoveryClient;
}
