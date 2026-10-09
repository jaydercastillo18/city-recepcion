"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Settings } from "lucide-react";
import CityBrand from "./city-brand";
import LogoutMenuItem from "./logout-menu-item";
import { initials } from "@/features/attendance/personnel";
interface AppHeaderProps {
  userEmail: string;
  userName: string;
  userRole: "admin" | "warehouse" | "employee";
}
export default function AppHeader({
  userEmail,
  userName,
  userRole,
}: AppHeaderProps) {
  const pathname = usePathname(),
    admin = userRole === "admin",
    attendance = pathname.includes("asistencia");
  const role = admin
    ? "Administrador"
    : userRole === "employee"
      ? "Empleado"
      : "Almacén";
  const links = [
    ...(admin
      ? [{ href: "/", label: "Portal", active: pathname === "/" }]
      : []),
    ...(userRole !== "employee"
      ? [
          {
            href: "/recepcion",
            label: "Recepción",
            active: pathname.startsWith("/recepcion"),
          },
        ]
      : []),
    ...(userRole !== "warehouse"
      ? [
          {
            href: admin ? "/admin/asistencia" : "/asistencia",
            label: "Asistencia",
            active: attendance,
          },
        ]
      : []),
    ...(admin
      ? [
          {
            href: "/admin",
            label: "Administración",
            active: pathname.startsWith("/admin") && !attendance,
          },
        ]
      : []),
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-purple-300/10 bg-[#100b19]/95">
      <div className="mx-auto max-w-6xl px-4 min-h-20 flex items-center justify-between gap-4">
        <Link
          href={
            admin ? "/" : userRole === "employee" ? "/asistencia" : "/recepcion"
          }
          className="flex items-center gap-3"
        >
          <CityBrand />
          <span className="hidden lg:block border-l border-purple-400/20 pl-3 text-[11px] text-slate-300">
            {attendance ? "Control de asistencia" : "Control interno"}
          </span>
        </Link>
        <nav aria-label="Navegación principal" className="hidden md:flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.active ? "page" : undefined}
              className={`px-3 py-2 rounded-lg text-xs font-medium ${l.active ? "bg-purple-500/15 text-fuchsia-200" : "text-slate-400 hover:text-white"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Menu.Root>
          <Menu.Trigger asChild>
            <button
              id="btn-user-menu"
              className="flex gap-3 items-center rounded-xl min-h-11 p-2 hover:bg-purple-500/10 focus-visible:outline-2 focus-visible:outline-fuchsia-400"
              aria-label="Abrir menú de cuenta"
            >
              <span className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-600 to-fuchsia-600 text-xs font-bold">
                {initials(userName || userEmail)}
              </span>
              <span className="hidden sm:block text-left">
                <span className="block text-xs max-w-40 truncate text-slate-200">
                  {userEmail}
                </span>
                <span className="block text-[10px] text-purple-300 mt-1">
                  {role}
                </span>
              </span>
              <ChevronDown
                size={15}
                className="text-slate-400"
                aria-hidden="true"
              />
            </button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="end"
              sideOffset={8}
              className="z-50 w-64 rounded-xl border border-purple-400/20 bg-[#1c1329] shadow-xl p-2"
            >
              <div className="p-3 text-xs border-b border-purple-400/15 mb-1">
                <p className="font-semibold text-slate-200">{userName}</p>
                <p className="text-slate-400 mt-1 break-all">{userEmail}</p>
                <p className="text-purple-300 mt-1">{role}</p>
              </div>
              <div className="md:hidden">
                {links.map((l) => (
                  <Menu.Item key={l.href} asChild>
                    <Link
                      href={l.href}
                      className="block p-3 rounded-lg text-sm text-slate-200 outline-none data-[highlighted]:bg-purple-500/20"
                    >
                      {l.label}
                    </Link>
                  </Menu.Item>
                ))}
              </div>
              {admin && (
                <Menu.Item asChild>
                  <Link
                    href="/admin"
                    className="flex gap-2 p-3 rounded-lg text-sm outline-none data-[highlighted]:bg-purple-500/20"
                  >
                    <Settings size={16} />
                    Administración
                  </Link>
                </Menu.Item>
              )}
              <LogoutMenuItem />
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </header>
  );
}
