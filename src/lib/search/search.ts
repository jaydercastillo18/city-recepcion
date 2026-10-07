// ============================================================
// CITY RECEPCIÓN - Algoritmo de búsqueda y ranking client-side
// ============================================================
// Aplica prioridad de resultados:
//   1. Coincidencia exacta de código normalizado
//   2. Coincidencia parcial de código
//   3. Coincidencia en nombre de producto
//   4. Coincidencia en proveedor
// ============================================================

import { type ShipmentItem, type SearchResult } from '@/types';
import { normalizeCode } from './normalize';

/**
 * Busca y rankea items de un envío según la query del usuario.
 * Diseñado para búsqueda client-side rápida sobre conjuntos pequeños/medianos.
 *
 * Para conjuntos grandes (>500 items por envío), considerar búsqueda server-side.
 */
export function searchItems(
  items: ShipmentItem[],
  query: string
): SearchResult[] {
  const trimmed = query.trim();

  if (!trimmed) {
    return items.map((item) => ({
      ...item,
      matchType: 'product' as const,
      score: 0,
    }));
  }

  const normalizedQuery = normalizeCode(trimmed);
  const lowerQuery = trimmed.toLowerCase();

  const results: SearchResult[] = [];

  for (const item of items) {
    let matchType: SearchResult['matchType'] | null = null;
    let score = 0;

    // 1. Coincidencia exacta de código
    if (item.code_normalized === normalizedQuery) {
      matchType = 'exact_code';
      score = 100;
    }
    // 2. Coincidencia parcial de código
    else if (item.code_normalized.includes(normalizedQuery)) {
      matchType = 'partial_code';
      score = 80;
    }
    // 3. Coincidencia en nombre de producto
    else if (item.product_name.toLowerCase().includes(lowerQuery)) {
      matchType = 'product';
      score = 60;
    }
    // 4. Coincidencia en proveedor
    else if (item.supplier?.toLowerCase().includes(lowerQuery)) {
      matchType = 'supplier';
      score = 40;
    }

    if (matchType !== null) {
      results.push({ ...item, matchType, score });
    }
  }

  // Ordenar por score descendente, luego por código original
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.code_original.localeCompare(b.code_original);
  });
}
