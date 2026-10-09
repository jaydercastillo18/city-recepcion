"use server";
// ============================================================
// CITY RECEPCIÓN - Server Actions para Auth
// ============================================================
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { canEnterAttendance } from "@/features/attendance/personnel";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = formData.get("redirect") as string | null;

  if (!email || !password) {
    return { error: "Email y contraseña son requeridos." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Credenciales inválidas. Verifica tu email y contraseña." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  if (profile?.role === "employee") {
    const e = await supabase
      .from("employees")
      .select("active")
      .eq("profile_id", user!.id)
      .maybeSingle();
    if (e.error || !canEnterAttendance(e.data)) {
      await supabase.auth.signOut();
      return {
        error:
          "Tu acceso está suspendido, archivado o pendiente de vinculación. Contacta al administrador.",
      };
    }
  }
  const home =
    profile?.role === "admin"
      ? "/"
      : profile?.role === "employee"
        ? "/asistencia"
        : "/recepcion";
  const safeRedirect =
    redirectTo?.startsWith("/") &&
    !redirectTo.startsWith("//") &&
    !redirectTo.includes("\\") &&
    (profile?.role === "admin" ||
      (profile?.role === "employee"
        ? redirectTo.startsWith("/asistencia")
        : redirectTo.startsWith("/recepcion")));
  redirect(safeRedirect ? redirectTo! : home);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

import type { Profile } from "@/types";
import type { User } from "@supabase/supabase-js";

export async function getCurrentUser(): Promise<{
  user: User;
  profile: Profile | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = (await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()) as { data: Profile | null };

  if (profile?.role === "employee") {
    const e = await supabase
      .from("employees")
      .select("active")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (e.error || !canEnterAttendance(e.data)) return null;
  }
  return { user, profile: profile ?? null };
}
