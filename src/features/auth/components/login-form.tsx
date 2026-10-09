'use client';
// ============================================================
// CITY RECEPCIÓN - Formulario de Login
// ============================================================
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { loginAction } from '@/features/auth/actions';
import CityBrand from '@/components/layout/city-brand';
import { cn } from '@/lib/utils';

export default function LoginForm() {

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await loginAction(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className={cn(
        'w-full max-w-md',
        'card-base p-8 slide-up',
        'shadow-2xl shadow-black/50'
      )}
    >
      {/* Logo / Header */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <CityBrand large />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            City Ofertas
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Control interno · Mercadería y asistencia
          </p>
        </div>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Email */}
        <div className="space-y-2">
          <label
            htmlFor="login-email"
            className="block text-sm font-medium text-slate-300"
          >
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="usuario@empresa.com"
            className={cn(
              'w-full bg-slate-900 border rounded-xl px-4 py-3.5',
              'text-slate-100 placeholder-slate-500 text-base',
              'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
              'transition-all duration-200',
              error ? 'border-red-600' : 'border-slate-700'
            )}
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label
            htmlFor="login-password"
            className="block text-sm font-medium text-slate-300"
          >
            Contraseña
          </label>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className={cn(
                'w-full bg-slate-900 border rounded-xl px-4 py-3.5 pr-12',
                'text-slate-100 placeholder-slate-500 text-base',
                'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
                'transition-all duration-200',
                error ? 'border-red-600' : 'border-slate-700'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-sm fade-in"
            role="alert"
          >
            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          id="btn-login-submit"
          disabled={isPending}
          className="btn-primary w-full mt-2"
        >
          {isPending ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <span>Iniciando sesión...</span>
            </>
          ) : (
            <span>Iniciar sesión</span>
          )}
        </button>
      </form>

      <Link href="/auth/recuperar" className="btn-ghost w-full mt-4">
        ¿Olvidaste tu contraseña?
      </Link>

      {/* Footer */}
      <p className="text-center text-xs text-slate-600 mt-6">
        City Ofertas · Recepción de mercadería
      </p>
    </div>
  );
}
