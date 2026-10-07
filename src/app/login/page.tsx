// ============================================================
// CITY RECEPCIÓN - Página de Login
// ============================================================
import type { Metadata } from 'next';
import LoginForm from '@/features/auth/components/login-form';

export const metadata: Metadata = {
  title: 'Iniciar Sesión | City Recepción',
  description: 'Accede al sistema de recepción de mercadería.',
};

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 relative overflow-hidden">
      {/* Fondo decorativo */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(37,99,235,0.15) 0%, transparent 70%), hsl(222 47% 6%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute top-1/4 left-1/4 -z-10 w-96 h-96 rounded-full opacity-5"
        style={{
          background: 'radial-gradient(circle, hsl(217 91% 60%), transparent)',
          filter: 'blur(60px)',
        }}
        aria-hidden="true"
      />

      <LoginForm />
    </main>
  );
}
