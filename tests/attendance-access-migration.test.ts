import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const db = new PGlite({ extensions: { pg_trgm } });
const original = readFileSync("supabase/migrations/20261009001046_attendance_module.sql", "utf8").replace(/\r\n/g, "\n");
const incremental = readFileSync("supabase/migrations/20261009025154_attendance_access_links.sql", "utf8").replace(/\r\n/g, "\n");
const admin = randomUUID(), employee = randomUUID(), warehouse = randomUUID();
let existingId: string, unlinkedId: string;
let beforeRows: Record<string, unknown>;
let beforeSecurity: unknown;
const tables = ["employees", "attendance_schedules", "attendance_records", "attendance_imports", "attendance_settings", "attendance_audit_log", "profiles"];

async function as(id: string) {
  await db.exec("SET ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function command(action: string, data: Record<string, unknown> = {}) {
  return (await db.query<{ result: Record<string, unknown> }>(
    "SELECT public.attendance_admin_command($1,$2::jsonb) result",
    [action, JSON.stringify({ reason: "Verificación incremental", ...data })],
  )).rows[0].result;
}
async function snapshot() {
  const rows: Record<string, unknown> = {};
  for (const table of tables) rows[table] = (await db.query(
    `SELECT to_jsonb(t)-'invitation_email_status' AS row FROM public.${table} t ORDER BY id`,
  )).rows;
  rows.objects = (await db.query("SELECT * FROM storage.objects ORDER BY name")).rows;
  rows.buckets = (await db.query("SELECT * FROM storage.buckets ORDER BY id")).rows;
  rows.sequence = (await db.query("SELECT * FROM public.attendance_employee_code_seq")).rows;
  rows.auth = (await db.query("SELECT * FROM auth.users ORDER BY id")).rows;
  return rows;
}
async function security() {
  return {
    policies: (await db.query("SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies ORDER BY schemaname,tablename,policyname")).rows,
    functions: (await db.query(`SELECT n.nspname,p.proname,p.oid,p.prosecdef,p.proconfig,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','attendance_private') ORDER BY p.oid`)).rows,
    grants: (await db.query("SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema IN ('public','storage') ORDER BY table_schema,table_name,grantee,privilege_type")).rows,
  };
}
before(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb,email_confirmed_at timestamptz,encrypted_password text DEFAULT '');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA auth,public,storage TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
    GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;`);
  for (const file of ["20261006000001_initial_schema.sql", "20261006000002_rls_policies.sql", "20261006000003_functions_rpc.sql"])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(original);
  assert.equal((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='employees' AND column_name='invitation_email_status'")).rows.length, 0);
  for (const [id, role] of [[admin, "admin"], [employee, "employee"], [warehouse, "warehouse"]]) {
    await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,'{}')", [id, `${id}@test.invalid`]);
    await db.query("UPDATE public.profiles SET role=$1 WHERE id=$2", [role, id]);
  }
  await as(admin);
  existingId = (await command("employee", { full_name: "Empleado histórico", email: `${employee}@test.invalid`, late_tolerance_minutes: 17 })).id as string;
  unlinkedId = (await command("employee", { full_name: "Empleado sin cuenta", late_tolerance_minutes: 9 })).id as string;
  await command("link", { id: existingId, profile_id: employee });
  await command("import", {
    target_date: "2026-01-02", request_id: randomUUID(), file_name: "historico.xlsx", file_hash: "a".repeat(64),
    rows: [{ employee_id: existingId, work_date: "2026-01-02", shift: "day", scheduled_time: "08:00", is_day_off: false },
      { employee_id: existingId, work_date: "2026-01-02", shift: "night", scheduled_time: "20:00", is_day_off: false }],
  });
  await db.exec("RESET ROLE");
  await db.query(`INSERT INTO public.attendance_records(employee_id,schedule_id,work_date,scheduled_time,check_in_at,status,minutes_late,tolerance_minutes_applied,photo_storage_path,registered_by)
    SELECT employee_id,id,work_date,scheduled_time,'2026-01-02T13:08:00Z','on_time',0,17,'attendance/2026/01/02/historico.jpg',$1 FROM public.attendance_schedules WHERE shift='day'`, [employee]);
  await db.query("INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('attendance-evidence','attendance/2026/01/02/historico.jpg',$1)", [employee]);
  beforeRows = await snapshot();
  beforeSecurity = await security();
  // Existing employees, schedules, attendance, imports, photos and audit precede the incremental migration.
  await db.exec(incremental);
});
after(async () => db.close());

test("incremental conserva todos los datos históricos, fotos, tolerancias, códigos y secuencia", async () => {
  await db.exec("RESET ROLE");
  assert.deepEqual(await snapshot(), beforeRows);
  assert.deepEqual((await db.query("SELECT invitation_email_status FROM public.employees ORDER BY id")).rows,
    [{ invitation_email_status: "not_sent" }, { invitation_email_status: "not_sent" }]);
});
test("incremental conserva RLS, permisos, OIDs y propiedades de seguridad de funciones", async () => {
  await db.exec("RESET ROLE");
  assert.deepEqual(await security(), beforeSecurity);
  assert.equal(original.slice(original.indexOf(" ELSIF p_action='employee'"), original.indexOf("CREATE FUNCTION public.attendance_admin_command")),
    incremental.slice(incremental.indexOf(" ELSIF p_action='employee'"), incremental.indexOf("CREATE OR REPLACE FUNCTION public.attendance_admin_command")));
  assert.doesNotMatch(incremental, /CREATE\s+(?:TABLE|SCHEMA|TRIGGER|POLICY|INDEX)|DROP\s|DELETE\s+FROM|INSERT\s+INTO\s+storage\.buckets/i);
});
test("Auth determina sin acceso, pendiente y activado; límite de correo no modifica la cuenta", async () => {
  await as(admin);
  assert.deepEqual(await command("access_statuses"), { [existingId]: "pending", [unlinkedId]: "no_access" });
  const lookup = await command("lookup_account", { email: `${employee}@test.invalid` });
  assert.equal(lookup.activated, false);
  await command("invitation_email", { id: existingId, status: "rate_limited", action_link: "SECRET_LINK", token: "SECRET_TOKEN", otp: "SECRET_OTP" });
  assert.equal((await command("access_statuses"))[existingId], "pending");
  await db.exec("RESET ROLE");
  await db.query("UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1", [employee]);
  await as(admin);
  assert.equal((await command("access_statuses"))[existingId], "pending");
  await db.exec("RESET ROLE");
  await db.query("UPDATE auth.users SET encrypted_password='test-only-hash' WHERE id=$1", [employee]);
  await as(admin);
  assert.equal((await command("access_statuses"))[existingId], "activated");
  assert.deepEqual(await command("lookup_account", { email: `${employee}@test.invalid` }),
    { id: employee, role: "employee", activated: true, email_confirmed: true });
  await command("invitation_email", { id: existingId, status: "error" });
  assert.equal((await command("access_statuses"))[existingId], "activated");
  const stored = JSON.stringify((await db.query("SELECT to_jsonb(e) row FROM public.employees e")).rows)
    + JSON.stringify((await db.query("SELECT to_jsonb(a) row FROM public.attendance_audit_log a")).rows);
  assert.doesNotMatch(stored, /SECRET_|action_link|test-only-hash/);
  await assert.rejects(command("invitation_email", { id: existingId, status: "invalid" }), /check constraint/i);
});
test("employee solo ve lo suyo; employee, warehouse y anon no administran accesos", async () => {
  await as(employee);
  assert.deepEqual((await db.query("SELECT id FROM public.employees")).rows, [{ id: existingId }]);
  for (const id of [employee, warehouse]) {
    await as(id);
    await assert.rejects(command("access_statuses"), /Solo administradores/);
    await assert.rejects(command("lookup_account", { email: `${employee}@test.invalid` }), /Solo administradores/);
    await assert.rejects(command("invitation_email", { id: existingId, status: "sent" }), /Solo administradores/);
    await assert.rejects(db.exec("UPDATE public.employees SET invitation_email_status='sent'"), /permission denied/i);
  }
  assert.equal((await db.query("SELECT id FROM public.employees")).rows.length, 0);
  await db.exec("SET ROLE anon");
  await assert.rejects(command("access_statuses"), /permission denied/i);
});
