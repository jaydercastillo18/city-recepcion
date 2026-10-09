import { after, before, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import type { ImportItem, ImportResult } from '../src/features/shipments/import/types';
import { findCodeMatches, receptionStats } from '../src/lib/reception';
import { generateShipmentExcel } from '../src/lib/reports/excel-generator';
import { generateShipmentPdf } from '../src/lib/reports/pdf-generator';
import * as XLSX from 'xlsx';
import type { Shipment, ShipmentItem, Incident } from '../src/types';

// Entirely ephemeral PostgreSQL, no environment credentials or remote connection.
const db = new PGlite({ extensions: { pg_trgm } });
const admin = '00000000-0000-4000-8000-000000000001';
const warehouse = '00000000-0000-4000-8000-000000000002';
const historicId = '00000000-0000-4000-8000-000000000006';
let historicSnapshot: string;
const newMigration = readFileSync('supabase/migrations/20261008190344_import_shipments_excel.sql', 'utf8');
const adminMigration = readFileSync('supabase/migrations/20261008203448_shipment_admin_finalize_delete.sql', 'utf8');

async function asUser(id = admin) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
}
const item = (code = 'KD-5238', name = 'Producto', boxes = 5, supplier = 'Marca'): ImportItem => ({ supplier, code_original: code, product_name: name, expected_boxes: boxes });
async function importFile(items: ImportItem[], date = '2026-10-14', number = `CHIMBOTE-${date.replace(/-/g, '')}`, requestId = randomUUID()) {
  const { rows } = await db.query<{ result: ImportResult }>(
    'SELECT public.import_shipment_excel($1,$2::date,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::uuid) AS result',
    ['CHIMBOTE', date, number, 'fixture.xlsx', 'a'.repeat(64), items.length, '[]', JSON.stringify(items), requestId]);
  return rows[0].result;
}
async function snapshotHistoric() {
  return (await db.query<{ snapshot: string }>(`SELECT jsonb_build_object(
    'shipment', (SELECT to_jsonb(s) FROM public.shipments s WHERE s.id=$1::uuid),
    'items', (SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.shipment_items i WHERE i.shipment_id=$1::uuid),
    'events', (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.reception_events e WHERE e.shipment_id=$1::uuid),
    'incidents', (SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.incidents n WHERE n.shipment_id=$1::uuid))::text AS snapshot`, [historicId])).rows[0].snapshot;
}

before(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`);
  for (const file of ['20261006000001_initial_schema.sql', '20261006000002_rls_policies.sql', '20261006000003_functions_rpc.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('${admin}','admin@test.invalid','{}'),('${warehouse}','warehouse@test.invalid','{}');
    UPDATE public.profiles SET role='admin' WHERE id='${admin}';
    INSERT INTO public.shipments(id,shipment_number,destination,shipment_date,status,total_expected_boxes,total_received_boxes,created_by)
      VALUES('${historicId}','CHIMBOTE-20261006','CHIMBOTE','2026-10-06','completed',5,5,'${admin}');
    INSERT INTO public.shipment_items(id,shipment_id,supplier,code_original,code_normalized,product_name,expected_boxes,received_boxes,status)
      VALUES('00000000-0000-4000-8000-000000000060','${historicId}','Marca','KD-5238','KD5238','Histórico',5,5,'complete');
    INSERT INTO public.reception_events(shipment_id,shipment_item_id,user_id,action,quantity,previous_quantity,new_quantity)
      VALUES('${historicId}','00000000-0000-4000-8000-000000000060','${admin}','receive',1,4,5);
    INSERT INTO public.incidents(shipment_id,shipment_item_id,user_id,type,description)
      VALUES('${historicId}','00000000-0000-4000-8000-000000000060','${admin}','other','Observación histórica');`);
  await db.exec(newMigration);
  await db.exec(adminMigration);
  historicSnapshot = await snapshotHistoric();
});
afterEach(async () => { await db.exec('RESET ROLE'); assert.equal(await snapshotHistoric(), historicSnapshot, 'La importación no debe modificar ningún dato histórico'); });
after(async () => { await db.close(); });

test('CASO 1: mismo KD-5238 en 06/10 y 14/10, recepción, escáner y reporte aislados', async () => {
  await asUser();
  const first = await importFile([item('KD-5238', 'Nuevo 06', 7)], '2026-10-06');
  const second = await importFile([item('KD-5238', 'Nuevo 14', 9)]);
  assert.notEqual(first.shipment_id, second.shipment_id); assert.notEqual(first.shipment_id, historicId);
  const firstItems = (await db.query<ShipmentItem>('SELECT * FROM public.shipment_items WHERE shipment_id=$1', [first.shipment_id])).rows;
  const secondItems = (await db.query<ShipmentItem>('SELECT * FROM public.shipment_items WHERE shipment_id=$1', [second.shipment_id])).rows;
  assert.equal(firstItems[0].expected_boxes, 7); assert.equal(secondItems[0].expected_boxes, 9);
  assert.equal(findCodeMatches(secondItems, 'kd5238')[0].id, secondItems[0].id);
  await db.query("SELECT public.register_box_reception($1,'receive',1,null)", [secondItems[0].id]);
  assert.equal((await db.query<{ received_boxes: number }>('SELECT received_boxes FROM public.shipment_items WHERE id=$1', [firstItems[0].id])).rows[0].received_boxes, 0);
  const receivedItems = (await db.query<ShipmentItem>('SELECT * FROM public.shipment_items WHERE shipment_id=$1', [second.shipment_id])).rows;
  const shipment = (await db.query<Shipment>('SELECT *,shipment_date::text AS shipment_date FROM public.shipments WHERE id=$1', [second.shipment_id])).rows[0];
  const excel = XLSX.read(generateShipmentExcel({ shipment, items: receivedItems, incidents: [], stats: receptionStats(receivedItems), generatedAt: 'Prueba local', responsible: 'Admin' }), { type: 'array' });
  assert.deepEqual(XLSX.utils.sheet_to_json(excel.Sheets.Detalle).map(row => (row as { Producto: string }).Producto), ['Nuevo 14']);
});

test('CASO 2: agrupación transaccional de proveedor+código+producto idénticos', async () => {
  await asUser();
  const result = await importFile([item('DUP', 'Mismo', 2), item('DUP', 'Mismo', 3), item('DUP', 'Mismo', 4, 'Otra marca')], '2026-10-14', 'AGRUPADOS');
  assert.equal(result.item_count, 2); assert.equal(result.total_boxes, 9);
  const rows = (await db.query<{ supplier: string; expected_boxes: number }>('SELECT supplier, expected_boxes FROM public.shipment_items WHERE shipment_id=$1 ORDER BY supplier', [result.shipment_id])).rows;
  assert.deepEqual(rows.map(row => row.expected_boxes), [5, 4]);
});

test('CASO 3: 000000 con diez productos conserva diez registros; código vacío también es válido', async () => {
  await asUser();
  const result = await importFile([...Array.from({ length: 10 }, (_, i) => item('000000', `Producto ${i}`, 1)), item('', 'Sin código', 1)], '2026-10-14', 'CEROS');
  assert.equal(result.item_count, 11); assert.equal(result.total_boxes, 11);
  const rows = (await db.query<ShipmentItem>('SELECT * FROM public.shipment_items WHERE shipment_id=$1', [result.shipment_id])).rows;
  assert.equal(findCodeMatches(rows, '000000').length, 10);
  assert.equal(rows.find(row => row.product_name === 'Sin código')?.code_normalized, '');
});

test('CASO 4: dos subidas del mismo archivo crean dos envíos; reintento del mismo intento es idempotente', async () => {
  await asUser();
  const request = randomUUID();
  const first = await importFile([item()], '2026-10-14', 'REPETIDO', request);
  const retry = await importFile([item()], '2026-10-14', 'REPETIDO', request);
  const second = await importFile([item()], '2026-10-14', 'REPETIDO');
  assert.equal(retry.shipment_id, first.shipment_id); assert.equal(retry.reused, true);
  assert.notEqual(first.shipment_id, second.shipment_id); assert.equal(second.shipment_number, 'REPETIDO-02');
  await assert.rejects(importFile([item('X', 'Otro archivo')], '2026-10-14', 'REPETIDO', request), /otros datos/);
});

test('CASO 5: fallo al insertar items revierte el envío y todos sus productos', async () => {
  await db.exec(`CREATE FUNCTION public.fail_import_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.product_name='FORCED_FAIL' THEN RAISE EXCEPTION 'fallo deliberado de prueba'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fixture_fail BEFORE INSERT ON public.shipment_items FOR EACH ROW EXECUTE FUNCTION public.fail_import_fixture();`);
  await asUser();
  const before = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.shipments')).rows[0].count;
  const itemsBefore = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.shipment_items')).rows[0].count;
  await assert.rejects(importFile([item('OK', 'Primero'), item('FAIL', 'FORCED_FAIL')], '2026-10-14', 'FALLA'), /fallo deliberado/);
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.shipments')).rows[0].count, before);
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.shipment_items')).rows[0].count, itemsBefore);
  await db.exec('RESET ROLE; DROP TRIGGER fixture_fail ON public.shipment_items; DROP FUNCTION public.fail_import_fixture();');
});

test('CASO 6: warehouse no puede importar ni saltarse RLS con insert directo', async () => {
  await asUser(warehouse);
  await assert.rejects(importFile([item()], '2026-10-14', 'WAREHOUSE'), /Solo los administradores/);
  await assert.rejects(db.query("INSERT INTO public.shipments(shipment_number,destination,shipment_date) VALUES('NO','NO','2026-10-14')"), /row-level security/);
});

test('permisos mínimos, SECURITY INVOKER, RLS y migración repetible sin alterar históricos', async () => {
  const signature = 'public.import_shipment_excel(text,date,text,text,text,integer,jsonb,jsonb,uuid)';
  const privileges = (await db.query<{ anon: boolean; authenticated: boolean; definer: boolean }>(`SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon,has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated,(SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure) AS definer`, [signature])).rows[0];
  assert.deepEqual(privileges, { anon: false, authenticated: true, definer: false });
  const rls = (await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE oid IN ('public.shipments'::regclass,'public.shipment_items'::regclass)")).rows;
  assert.ok(rls.every(table => table.relrowsecurity));
  await db.exec(newMigration);
  await db.exec('SET ROLE anon');
  await assert.rejects(importFile([item()], '2026-10-14', 'ANON'), /permission denied/);
});

test('sufijos no se truncarán al llegar a 10 envíos con el mismo número', async () => {
  await asUser();
  let result: ImportResult | undefined;
  for (let i = 0; i < 11; i++) result = await importFile([item('SERIE')], '2026-10-14', 'SERIE');
  assert.equal(result?.shipment_number, 'SERIE-11');
});

async function adminFixture(received = 13) {
  await asUser();
  const shipment = await importFile([item('KD-5238', 'Producto cierre', 16)], '2026-10-08', 'CHIMBOTE-20261008');
  const product = (await db.query<{ id: string }>('SELECT id FROM public.shipment_items WHERE shipment_id=$1', [shipment.shipment_id])).rows[0];
  await db.query("SELECT public.register_box_reception($1,'correction',$2,'Movimiento de prueba')", [product.id, received]);
  await db.query("INSERT INTO public.incidents(shipment_id,shipment_item_id,user_id,type,description) VALUES($1,$2,$3,'other','Observación preservada')", [shipment.shipment_id, product.id, admin]);
  return { ...shipment, itemId: product.id };
}
async function close(id: string, accepted = false, notes: string | null = null) {
  return (await db.query<{ result: { success: boolean; with_shortage: boolean; missing_boxes: number } }>(
    'SELECT public.finalize_shipment_admin($1,$2,$3) AS result', [id, accepted, notes])).rows[0].result;
}
async function remove(id: string, confirmation: string | null) {
  return (await db.query<{ result: { success: boolean; items_deleted: number; events_deleted: number; incidents_deleted: number } }>(
    'SELECT public.delete_shipment_admin($1,$2) AS result', [id, confirmation])).rows[0].result;
}
async function readShipment(id: string) {
  return (await db.query<Shipment>('SELECT *,shipment_date::text AS shipment_date,finalized_at::text AS finalized_at FROM public.shipments WHERE id=$1', [id])).rows[0];
}

test('CIERRE 1: warehouse no puede finalizar con faltantes', async () => {
  const shipment = await adminFixture(); await asUser(warehouse);
  await assert.rejects(close(shipment.shipment_id, true), /Solo los administradores/);
  assert.equal((await readShipment(shipment.shipment_id)).status, 'receiving');
});
test('CIERRE 2: admin 13/16 debe aceptar expresamente los faltantes', async () => {
  const shipment = await adminFixture();
  await assert.rejects(close(shipment.shipment_id), /Confirma expresamente/);
  const result = await close(shipment.shipment_id, true, 'Diferencia autorizada por jefe');
  assert.equal(result.success, true); assert.equal(result.missing_boxes, 3);
});
test('CIERRE 3: finalizar conserva 13/16, faltan 3 y el producto continúa parcial', async () => {
  const shipment = await adminFixture(); await close(shipment.shipment_id, true);
  const stored = await readShipment(shipment.shipment_id);
  assert.equal(stored.total_expected_boxes, 16); assert.equal(stored.total_received_boxes, 13);
  const rows = (await db.query<ShipmentItem>('SELECT * FROM public.shipment_items WHERE shipment_id=$1', [shipment.shipment_id])).rows;
  assert.equal(rows[0].received_boxes, 13); assert.equal(rows[0].expected_boxes, 16); assert.equal(rows[0].status, 'partial');
  assert.equal(receptionStats(rows).boxes_missing, 3);
  const receipt = (await db.query<{ result: { success: boolean } }>("SELECT public.register_box_reception($1,'receive',1,null) AS result", [shipment.itemId])).rows[0].result;
  assert.equal(receipt.success, false, 'Un cierre no permite continuar registrando cajas');
});
test('CIERRE 4: auditoría registra faltantes, fecha, admin y motivo; reintento no la cambia', async () => {
  const shipment = await adminFixture(); await close(shipment.shipment_id, true, 'Producto faltante confirmado');
  const stored = await readShipment(shipment.shipment_id);
  assert.equal(stored.finalized_with_shortage, true); assert.equal(stored.missing_boxes_at_finalization, 3);
  assert.equal(stored.finalized_by, admin); assert.ok(stored.finalized_at); assert.ok(stored.finalized_by_name);
  assert.equal(stored.finalization_notes, 'Producto faltante confirmado');
  await close(shipment.shipment_id, true, 'No reemplazar');
  assert.deepEqual(await readShipment(shipment.shipment_id), stored);
});
test('CIERRE 5: admin finaliza 16/16 normalmente', async () => {
  const shipment = await adminFixture(16); await close(shipment.shipment_id);
  const stored = await readShipment(shipment.shipment_id);
  assert.equal(stored.status, 'completed'); assert.equal(stored.finalized_with_shortage, false);
  assert.equal(stored.missing_boxes_at_finalization, 0); assert.equal(stored.total_received_boxes, 16);
});
test('BORRADO 6: warehouse no puede borrar aunque conozca el número', async () => {
  const shipment = await adminFixture(); await asUser(warehouse);
  await assert.rejects(remove(shipment.shipment_id, shipment.shipment_number), /Solo los administradores/);
  assert.ok(await readShipment(shipment.shipment_id));
});
test('BORRADO 7: admin sin confirmación no puede borrar', async () => {
  const shipment = await adminFixture();
  await assert.rejects(remove(shipment.shipment_id, null), /número exacto/);
  await assert.rejects(remove(shipment.shipment_id, ''), /número exacto/);
  assert.ok(await readShipment(shipment.shipment_id));
});
test('BORRADO 8: confirmación incorrecta, distinta capitalización o espacios se rechaza', async () => {
  const shipment = await adminFixture();
  for (const confirmation of ['OTRO', shipment.shipment_number.toLowerCase(), shipment.shipment_number + ' ']) {
    await assert.rejects(remove(shipment.shipment_id, confirmation), /número exacto/);
  }
});
test('BORRADO 9: admin elimina shipment y todas sus dependencias, incluso ya completado', async () => {
  const shipment = await adminFixture(); await close(shipment.shipment_id, true);
  const result = await remove(shipment.shipment_id, shipment.shipment_number);
  assert.deepEqual(result, { success: true, shipment_id: shipment.shipment_id, shipment_number: shipment.shipment_number,
    items_deleted: 1, events_deleted: 1, incidents_deleted: 1, expected_boxes: 16, received_boxes: 13 });
  assert.equal(await readShipment(shipment.shipment_id), undefined);
  for (const table of ['shipment_items', 'reception_events', 'incidents']) {
    assert.equal((await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.${table} WHERE shipment_id=$1`, [shipment.shipment_id])).rows[0].count, 0);
  }
});
test('BORRADO 10: eliminar 08/10 no modifica absolutamente nada del histórico 06/10', async () => {
  const snapshot = await snapshotHistoric(); const shipment = await adminFixture();
  await remove(shipment.shipment_id, shipment.shipment_number);
  assert.equal(await snapshotHistoric(), snapshot);
});
test('REPORTES 11: PDF y Excel incluyen Finalizado con faltantes y mantienen detalle/faltantes/observaciones', async () => {
  const shipment = await adminFixture(); await close(shipment.shipment_id, true, 'Diferencia autorizada');
  const stored = await readShipment(shipment.shipment_id);
  const items = (await db.query<ShipmentItem>('SELECT * FROM public.shipment_items WHERE shipment_id=$1', [shipment.shipment_id])).rows;
  const incidents = (await db.query<Incident>('SELECT *,created_at::text AS created_at FROM public.incidents WHERE shipment_id=$1', [shipment.shipment_id])).rows;
  const data = { shipment: stored, items, incidents, stats: receptionStats(items), generatedAt: 'Prueba local', responsible: 'Emisor' };
  const excel = XLSX.read(generateShipmentExcel(data), { type: 'array' });
  const summary = XLSX.utils.sheet_to_json<(string | number)[]>(excel.Sheets.Resumen, { header: 1 });
  assert.ok(summary.some(row => row[0] === 'Estado' && row[1] === 'Finalizado con faltantes'));
  assert.ok(summary.some(row => row[0] === 'Faltantes al cierre' && row[1] === 3));
  assert.ok(summary.some(row => row[0] === 'Motivo' && row[1] === 'Diferencia autorizada'));
  const missing = XLSX.utils.sheet_to_json<{ Esperadas: number; Recibidas: number; Diferencia: number }>(excel.Sheets.Faltantes);
  assert.deepEqual([missing[0].Esperadas, missing[0].Recibidas, missing[0].Diferencia], [16, 13, -3]);
  assert.equal(XLSX.utils.sheet_to_json<{ Descripción: string }>(excel.Sheets['Observaciones-Incidencias'])[0].Descripción, 'Observación preservada');
  const pdf = Buffer.from(generateShipmentPdf(data)).toString('latin1');
  assert.ok(pdf.includes('Finalizado con faltantes')); assert.ok(pdf.includes('Faltantes al cierre'));
  assert.ok(pdf.includes('Diferencia autorizada')); assert.ok(pdf.includes('Producto cierre'));
});
test('borrado con fallo intermedio revierte shipment, items, eventos y observaciones', async () => {
  const shipment = await adminFixture(); await db.exec('RESET ROLE');
  await db.exec(`CREATE FUNCTION public.fail_delete_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo deliberado al borrar'; END $$;
    CREATE TRIGGER fixture_fail_delete BEFORE DELETE ON public.shipment_items FOR EACH ROW EXECUTE FUNCTION public.fail_delete_fixture();`);
  await asUser();
  await assert.rejects(remove(shipment.shipment_id, shipment.shipment_number), /fallo deliberado/);
  assert.ok(await readShipment(shipment.shipment_id));
  for (const table of ['shipment_items', 'reception_events', 'incidents']) {
    assert.equal((await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.${table} WHERE shipment_id=$1`, [shipment.shipment_id])).rows[0].count, 1);
  }
  await db.exec('RESET ROLE; DROP TRIGGER fixture_fail_delete ON public.shipment_items; DROP FUNCTION public.fail_delete_fixture();');
});
test('RPC administrativas no permiten ejecución anónima y preservan SECURITY INVOKER/RLS', async () => {
  for (const signature of ['public.finalize_shipment_admin(uuid,boolean,text)', 'public.delete_shipment_admin(uuid,text)']) {
    const row = (await db.query<{ anon: boolean; definer: boolean }>(`SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon,(SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure) AS definer`, [signature])).rows[0];
    assert.deepEqual(row, { anon: false, definer: false });
  }
  await db.exec(adminMigration);
});
test('migración concede DELETE mínimo con RLS: admin elimina, warehouse no elimina directamente', async () => {
  await db.exec('REVOKE DELETE ON public.incidents,public.reception_events,public.shipment_items,public.shipments FROM authenticated');
  await db.exec(adminMigration);
  const shipment = await adminFixture();
  await asUser(warehouse);
  await db.query('DELETE FROM public.reception_events WHERE shipment_id=$1', [shipment.shipment_id]);
  await db.query('DELETE FROM public.shipments WHERE id=$1', [shipment.shipment_id]);
  assert.ok(await readShipment(shipment.shipment_id));
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.reception_events WHERE shipment_id=$1', [shipment.shipment_id])).rows[0].count, 1);
  await asUser();
  assert.equal((await remove(shipment.shipment_id, shipment.shipment_number)).success, true);
});
