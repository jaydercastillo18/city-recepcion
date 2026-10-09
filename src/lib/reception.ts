import type { ShipmentItem, ShipmentStats } from '@/types';
import { normalizeCode } from '@/lib/search/normalize';

// Exact equality only: partial codes must never register boxes automatically.
export function findCodeMatches(items: ShipmentItem[], code: string) {
  const normalized = normalizeCode(code.trim());
  if (!normalized) return [];
  return items.filter(item => [item.code_original, item.code_normalized]
    .some(value => normalizeCode(value) === normalized));
}

export function receptionStats(items: ShipmentItem[]): ShipmentStats {
  return {
    total_expected: items.reduce((n, i) => n + i.expected_boxes, 0),
    total_received: items.reduce((n, i) => n + i.received_boxes, 0),
    boxes_missing: items.reduce((n, i) => n + Math.max(0, i.expected_boxes - i.received_boxes), 0),
    total_pending: items.filter(i => i.status === 'pending').length,
    total_partial: items.filter(i => i.status === 'partial').length,
    total_complete: items.filter(i => i.status === 'complete').length,
    total_excess: items.filter(i => i.status === 'excess').length,
    item_count: items.length,
  };
}
