// ============================================================
// CITY RECEPCIÓN - Middleware de autenticación
// ============================================================
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canEnterAttendance } from "@/features/attendance/personnel";
import type { Database } from "@/types/database";

// Rutas que requieren autenticación
const PROTECTED_ROUTES = ["/recepcion", "/admin", "/asistencia"];

// Rutas solo para admin
const ADMIN_ROUTES = ["/admin"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const pathname = request.nextUrl.pathname;

  // Refresh de sesión (necesario para SSR)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route),
  );
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  // Redirigir a login si no autenticado y ruta protegida
  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (isProtected || pathname === "/login")) {
    const p = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (p.data?.role === "employee") {
      const e = await supabase
        .from("employees")
        .select("active")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (e.error || !canEnterAttendance(e.data)) {
        if (pathname === "/login") return supabaseResponse;
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        const response = NextResponse.redirect(url);
        supabaseResponse.cookies
          .getAll()
          .forEach((c) => response.cookies.set(c));
        return response;
      }
    }
  }

  // Si ya autenticado y va a /login → redirigir a /recepcion
  if (pathname === "/login" && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  // Verificar rol para rutas admin
  if (isAdminRoute && user) {
    const { data: profile } = (await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()) as { data: { role: string } | null };

    if (profile?.role !== "admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname =
        profile?.role === "employee" ? "/asistencia" : "/recepcion";
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (
    user &&
    (pathname.startsWith("/recepcion") || pathname.startsWith("/asistencia"))
  ) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (
      (pathname.startsWith("/recepcion") && profile?.role === "employee") ||
      (pathname.startsWith("/asistencia") && profile?.role === "warehouse")
    ) {
      const url = request.nextUrl.clone();
      url.pathname =
        profile?.role === "employee" ? "/asistencia" : "/recepcion";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
