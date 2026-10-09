export function normalizeHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function validShipmentDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseShipmentDate(value: string): string | null {
  const normalized = normalizeHeader(value);
  const months = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const long = normalized.match(/\b(\d{1,2})\s+DE\s+([A-Z]+)\s+(?:DE\s+)?(\d{4})\b/);
  let result: string | undefined;
  if (long) {
    const month = months.indexOf(long[2]) + 1;
    if (month) result = `${long[3]}-${String(month).padStart(2, '0')}-${long[1].padStart(2, '0')}`;
  } else {
    const iso = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const short = value.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/);
    if (iso) result = iso[0];
    else if (short) result = `${short[3]}-${short[2].padStart(2, '0')}-${short[1].padStart(2, '0')}`;
  }
  return result && validShipmentDate(result) ? result : null;
}

export function suggestShipmentNumber(destination: string, date: string) {
  const slug = normalizeHeader(destination).replace(/ /g, '-').slice(0, 90);
  return slug && validShipmentDate(date) ? `${slug}-${date.replace(/-/g, '')}` : '';
}

