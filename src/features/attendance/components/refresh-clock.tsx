"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
/** Refresh server-derived pending/absent states only while the page is visible. */
export default function RefreshClock() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return (
    <button className="btn-ghost text-sm" onClick={() => router.refresh()}>
      Actualizar
    </button>
  );
}
