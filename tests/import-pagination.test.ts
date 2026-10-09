import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAllRows } from '../src/lib/supabase/read-all-rows';

test('envíos de más de 1000 productos cargan todas las páginas, sin repetir productos', async () => {
  const source = Array.from({ length: 1501 }, (_, id) => ({ id, shipment_id: 'envio-14' }));
  const calls: number[][] = [];
  const result = await readAllRows(async (from, to) => {
    calls.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  });
  assert.deepEqual(result.data, source);
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499], [1500, 1999]]);
});

test('fallo en una página posterior no presenta un reporte ni recepción parcial', async () => {
  const result = await readAllRows(async (from) => from === 0
    ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
    : { data: null, error: { message: 'Error de conexión' } });
  assert.equal(result.data, null);
  assert.equal(result.error?.message, 'Error de conexión');
});
