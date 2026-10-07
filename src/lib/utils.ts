// ============================================================
// CITY RECEPCIÓN - Utilidades generales
// ============================================================

/**
 * Combina clases CSS condicionalmente (wrapper ligero sobre clsx + tailwind-merge)
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formatea una fecha ISO a formato legible en español
 * @example formatDate("2026-10-06") → "06 OCT 2026"
 */
export function formatDate(isoDate: string, style: 'short' | 'long' = 'short'): string {
  if (!isoDate) return '';
  const [year, monthStr, dayStr] = isoDate.split('T')[0].split('-');
  if (!year || !monthStr || !dayStr) return isoDate;
  const monthIdx = parseInt(monthStr, 10) - 1;
  const months = {
    short: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'],
    long: ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'],
  };
  const month = months[style][monthIdx] ?? monthStr;
  const day = dayStr.padStart(2, '0');
  return `${day} ${month} ${year}`;
}

/**
 * Calcula el porcentaje de avance con 1 decimal
 * @example calcProgress(286, 490) → "58.4"
 */
export function calcProgress(received: number, expected: number): number {
  if (expected === 0) return 0;
  return Math.min(Math.round((received / expected) * 1000) / 10, 100);
}

/**
 * Formatea un porcentaje con símbolo
 * @example formatPercent(58.4) → "58.4%"
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Hook de debounce simple para búsquedas
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return function (...args: Parameters<T>) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Obtiene etiqueta legible para el status de un item
 */
export function getItemStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    partial: 'Parcial',
    complete: 'Completo',
    excess: 'Exceso',
  };
  return labels[status] ?? status;
}

/**
 * Obtiene etiqueta legible para el status de un envío
 */
export function getShipmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    receiving: 'En Recepción',
    completed: 'Completado',
    cancelled: 'Cancelado',
  };
  return labels[status] ?? status;
}
