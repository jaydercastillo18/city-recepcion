'use client';
// ============================================================
// CITY RECEPCIÓN - Header de la aplicación
// ============================================================
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Package2,
  LogOut,
  Settings,
  ChevronDown,
  Warehouse,
  ShieldCheck,
} from 'lucide-react';
import { logoutAction } from '@/features/auth/actions';
import { cn } from '@/lib/utils';

interface AppHeaderProps {
  userEmail: string;
  userName: string;
  userRole: 'admin' | 'warehouse';
}

export default function AppHeader({ userName, userRole }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const isAdmin = userRole === 'admin';

  const navLinks = [
    { href: '/recepcion', label: 'Recepción', active: pathname.startsWith('/recepcion') },
    ...(isAdmin
      ? [{ href: '/admin', label: 'Administración', active: pathname.startsWith('/admin') }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 glass">
      <div className="container mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          href="/recepcion"
          className="flex items-center gap-2.5 font-bold text-lg text-white hover:text-blue-300 transition-colors"
        >
          <div className="p-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30">
            <Package2 className="w-5 h-5 text-blue-400" aria-hidden="true" />
          </div>
          <span className="hidden sm:inline">City Recepción</span>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Navegación principal">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                link.active
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* User menu */}
        <div className="relative">
          <button
            id="btn-user-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors text-sm"
            aria-expanded={menuOpen}
            aria-haspopup="true"
          >
            <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center">
              {isAdmin ? (
                <ShieldCheck className="w-4 h-4 text-blue-400" aria-hidden="true" />
              ) : (
                <Warehouse className="w-4 h-4 text-slate-400" aria-hidden="true" />
              )}
            </div>
            <span className="hidden sm:inline text-slate-300 max-w-[120px] truncate">
              {userName}
            </span>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-slate-500 transition-transform',
                menuOpen && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-full mt-2 w-52 card-base shadow-xl shadow-black/50 z-20 overflow-hidden fade-in">
                <div className="px-4 py-3 border-b border-slate-800">
                  <p className="text-xs text-slate-500">Sesión activa</p>
                  <p className="text-sm font-medium text-slate-200 truncate">{userName}</p>
                  <span className="inline-flex items-center gap-1 text-xs text-blue-400 mt-0.5">
                    {isAdmin ? (
                      <><ShieldCheck className="w-3 h-3" /> Admin</>
                    ) : (
                      <><Warehouse className="w-3 h-3" /> Almacén</>
                    )}
                  </span>
                </div>

                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    <Settings className="w-4 h-4" aria-hidden="true" />
                    Administración
                  </Link>
                )}

                <form action={logoutAction}>
                  <button
                    id="btn-logout"
                    type="submit"
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-400 hover:bg-red-950/30 transition-colors"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" />
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
