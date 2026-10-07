import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'City Recepción',
    template: '%s | City Recepción',
  },
  description: 'Sistema profesional de recepción y control de mercadería para almacén.',
  keywords: ['almacén', 'recepción', 'mercadería', 'inventario', 'control'],
  robots: 'noindex, nofollow', // Sistema interno
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // Evita zoom en inputs en mobile
  themeColor: '#0f172a',
};

export const instant = false;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
