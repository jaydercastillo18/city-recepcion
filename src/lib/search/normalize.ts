// ============================================================
// CITY RECEPCIÓN - Normalización de códigos
// ============================================================
// Función reutilizable tanto en frontend como en backend.
// Garantiza que KD-5238, kd5238, kd 5238, KD 5238 → "KD5238"
// ============================================================

/**
 * Normaliza un código de producto para búsqueda.
 * - Convierte a mayúsculas
 * - Elimina guiones, espacios y otros separadores
 *
 * El código ORIGINAL nunca se modifica; solo se normaliza para comparación.
 *
 * @example
 * normalizeCode("KD-5238")  // → "KD5238"
 * normalizeCode("kd 5238")  // → "KD5238"
 * normalizeCode("kd5238")   // → "KD5238"
 * normalizeCode("KD_5238")  // → "KD5238"
 */
export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[\s\-_./]+/g, ''); // elimina guiones, espacios, puntos, barras, guiones bajos
}

/**
 * Verifica si un input del usuario coincide con un código normalizado almacenado.
 * Normaliza el input antes de comparar.
 */
export function codeMatches(input: string, storedNormalized: string): boolean {
  return normalizeCode(input) === storedNormalized;
}

/**
 * Verifica si un input normalizado es subcadena del código normalizado almacenado.
 * Útil para búsqueda parcial de código.
 */
export function codePartialMatches(input: string, storedNormalized: string): boolean {
  return storedNormalized.includes(normalizeCode(input));
}
