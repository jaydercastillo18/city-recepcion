import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  canEnterAttendance,
  employeeState,
  filterEmployees,
  initials,
} from "../src/features/attendance/personnel";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EmployeeStatusBadge,
  EmployeeAvatar,
} from "../src/features/attendance/components/ui";
import type { Employee } from "../src/features/attendance/types";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const db = new PGlite({ extensions: { pg_trgm } });
const original = readFileSync(
  "supabase/migrations/20261009001046_attendance_module.sql",
  "utf8",
).replace(/\r\n/g, "\n");
const incremental = readFileSync(
  "supabase/migrations/20261009025154_attendance_access_links.sql",
  "utf8",
).replace(/\r\n/g, "\n");
const admin = randomUUID(),
  employee = randomUUID(),
  warehouse = randomUUID();
let existingId: string;
let beforeRows: Record<string, unknown>;

const tables = [
  "employees",
  "attendance_schedules",
  "attendance_records",
  "attendance_imports",
  "attendance_settings",
  "attendance_audit_log",
  "profiles",
];

async function as(id: string) {
  await db.exec("SET ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function command(action: string, data: Record<string, unknown> = {}) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.attendance_admin_command($1,$2::jsonb) result",
      [action, JSON.stringify({ reason: "Verificación incremental", ...data })],
    )
  ).rows[0].result;
}
async function snapshot() {
  const rows: Record<string, unknown> = {};
  for (const table of tables)
    rows[table] = (
      await db.query(
        `SELECT to_jsonb(t)-'invitation_email_status'-'suspended_at'-'archived_at' AS row FROM public.${table} t ORDER BY id`,
      )
    ).rows;
  rows.objects = (
    await db.query("SELECT * FROM storage.objects ORDER BY name")
  ).rows;
  rows.buckets = (
    await db.query("SELECT * FROM storage.buckets ORDER BY id")
  ).rows;
  rows.sequence = (
    await db.query("SELECT * FROM public.attendance_employee_code_seq")
  ).rows;
  rows.auth = (await db.query("SELECT * FROM auth.users ORDER BY id")).rows;
  return rows;
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
  for (const file of [
    "20261006000001_initial_schema.sql",
    "20261006000002_rls_policies.sql",
    "20261006000003_functions_rpc.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(original);
  assert.equal(
    (
      await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='employees' AND column_name='invitation_email_status'",
      )
    ).rows.length,
    0,
  );
  for (const [id, role] of [
    [admin, "admin"],
    [employee, "employee"],
    [warehouse, "warehouse"],
  ]) {
    await db.query(
      "INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,'{}')",
      [id, `${id}@test.invalid`],
    );
    await db.query("UPDATE public.profiles SET role=$1 WHERE id=$2", [
      role,
      id,
    ]);
  }
  await as(admin);
  existingId = (
    await command("employee", {
      full_name: "Empleado histórico",
      email: `${employee}@test.invalid`,
      late_tolerance_minutes: 17,
    })
  ).id as string;
  await command("employee", {
    full_name: "Empleado sin cuenta",
    late_tolerance_minutes: 9,
  });
  await command("link", { id: existingId, profile_id: employee });
  await command("import", {
    target_date: "2026-01-02",
    request_id: randomUUID(),
    file_name: "historico.xlsx",
    file_hash: "a".repeat(64),
    rows: [
      {
        employee_id: existingId,
        work_date: "2026-01-02",
        shift: "day",
        scheduled_time: "08:00",
        is_day_off: false,
      },
      {
        employee_id: existingId,
        work_date: "2026-01-02",
        shift: "night",
        scheduled_time: "20:00",
        is_day_off: false,
      },
    ],
  });
  await db.exec("RESET ROLE");
  await db.query(
    `INSERT INTO public.attendance_records(employee_id,schedule_id,work_date,scheduled_time,check_in_at,status,minutes_late,tolerance_minutes_applied,photo_storage_path,registered_by)
    SELECT employee_id,id,work_date,scheduled_time,'2026-01-02T13:08:00Z','on_time',0,17,'attendance/2026/01/02/historico.jpg',$1 FROM public.attendance_schedules WHERE shift='day'`,
    [employee],
  );
  await db.query(
    "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('attendance-evidence','attendance/2026/01/02/historico.jpg',$1)",
    [employee],
  );
  beforeRows = await snapshot();

  // Existing employees, schedules, attendance, imports, photos and audit precede the incremental migration.
  await db.exec(incremental);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261009211607_attendance_personnel_lifecycle.sql",
      "utf8",
    ),
  );
});
after(async () => db.close());

async function lifecycle(action: string, data: Record<string, unknown> = {}) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.attendance_employee_command($1,$2::jsonb) result",
      [
        action,
        JSON.stringify({
          id: existingId,
          reason: "Motivo administrativo de prueba",
          ...data,
        }),
      ],
    )
  ).rows[0].result;
}
async function person() {
  await db.exec("RESET ROLE");
  return (
    await db.query<Employee>("SELECT * FROM public.employees WHERE id=$1", [
      existingId,
    ])
  ).rows[0];
}
let createdId: string;
test("migración lifecycle preserva empleados, historial laboral, evidencia, códigos, tolerancias y Auth", async () => {
  await db.exec("RESET ROLE");
  assert.deepEqual(await snapshot(), beforeRows);
});
test("admin crea empleado y registra employee_created", async () => {
  await as(admin);
  const e = await command("employee", {
    full_name: "Persona nueva",
    email: "nueva@test.invalid",
    position: "Caja",
    late_tolerance_minutes: 10,
  });
  createdId = e.id as string;
  assert.equal(e.active, true);
  assert.equal(e.late_tolerance_minutes, 10);
  assert.equal(
    (
      await db.query<{ action: string }>(
        "SELECT action FROM public.attendance_audit_log WHERE employee_id=$1",
        [createdId],
      )
    ).rows[0].action,
    "employee_created",
  );
});
test("admin edita sin cambiar código ni vinculación y audita employee_updated", async () => {
  await as(admin);
  const old = await person();
  await as(admin);
  const e = await command("employee", {
    id: existingId,
    full_name: "Persona actualizada",
    email: old.email,
    position: "Almacén",
    late_tolerance_minutes: 17,
    active: true,
  });
  assert.equal(e.employee_code, old.employee_code);
  assert.equal(e.profile_id, old.profile_id);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM public.attendance_audit_log WHERE employee_id=$1 AND action='employee_updated'",
        [existingId],
      )
    ).rows[0].n,
    1,
  );
});
test("suspender requiere motivo y es reversible sin borrar la cuenta", async () => {
  await as(admin);
  await assert.rejects(lifecycle("suspend", { reason: "" }), /motivo/);
  await lifecycle("suspend");
  const e = await person();
  assert.equal(e.active, false);
  assert.ok(e.suspended_at);
  assert.equal(canEnterAttendance(e), false);
  assert.equal(employeeState(e), "suspended");
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM auth.users WHERE id=$1",
        [employee],
      )
    ).rows[0].n,
    1,
  );
});
test("suspendido no marca ni accede al módulo con una sesión ya existente", async () => {
  await as(employee);
  await assert.rejects(
    db.query("SELECT public.register_attendance_check_in('foto.jpg')"),
    /activo vinculado/,
  );
  assert.equal(canEnterAttendance(await person()), false);
});
test("reactivar restaura active y conserva tolerancia e historial", async () => {
  await as(admin);
  await lifecycle("reactivate");
  const e = await person();
  assert.equal(e.active, true);
  assert.equal(e.suspended_at, null);
  assert.equal(e.late_tolerance_minutes, 17);
  assert.equal(canEnterAttendance(e), true);
  await as(admin);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM public.attendance_audit_log WHERE action='employee_reactivated'",
      )
    ).rows[0].n,
    1,
  );
});
test("eliminar requiere confirmación exacta incluso diferencias de espacios/capitalización", async () => {
  const e = await person();
  await as(admin);
  for (const confirmation of [
    "",
    e.employee_code.toLowerCase(),
    ` ${e.employee_code}`,
    `${e.employee_code} `,
  ])
    await assert.rejects(
      lifecycle("archive", { confirmation }),
      /código exacto/,
    );
  assert.equal((await person()).archived_at, null);
});
test("archivar empleado con historial preserva horarios, asistencias, fotos y auditoría previa", async () => {
  await db.exec("RESET ROLE");
  const history = await snapshot();
  const e = await person();
  await as(admin);
  await lifecycle("archive", { confirmation: e.employee_code });
  const archived = await person();
  assert.ok(archived.archived_at);
  assert.equal(archived.active, false);
  assert.equal(employeeState(archived), "archived");
  const after = await snapshot();
  for (const table of [
    "attendance_records",
    "attendance_schedules",
    "attendance_imports",
    "auth",
    "objects",
    "buckets",
  ])
    assert.deepEqual(after[table], history[table]);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM public.attendance_audit_log WHERE action='employee_archived'",
      )
    ).rows[0].n,
    1,
  );
});
test("archivado no aparece en activos y admin puede verlo; no se permite reactivar por RPC antigua", async () => {
  const e = await person();
  assert.equal(filterEmployees([e], "", "active", "").length, 0);
  assert.equal(filterEmployees([e], "", "archived", "").length, 1);
  await as(admin);
  assert.equal(
    (
      await db.query("SELECT id FROM public.employees WHERE id=$1", [
        existingId,
      ])
    ).rows.length,
    1,
  );
  await assert.rejects(lifecycle("reactivate"), /archivado/);
  await assert.rejects(
    command("employee", {
      id: e.id,
      full_name: e.full_name,
      email: e.email,
      active: true,
    }),
    /archivado/,
  );
});
test("archivado no marca y la confirmación repetida no duplica auditoría", async () => {
  const e = await person();
  await as(employee);
  await assert.rejects(
    db.query("SELECT public.register_attendance_check_in('foto.jpg')"),
    /activo vinculado/,
  );
  await as(admin);
  assert.equal(
    (await lifecycle("archive", { confirmation: e.employee_code })).reused,
    true,
  );
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM public.attendance_audit_log WHERE action='employee_archived'",
      )
    ).rows[0].n,
    1,
  );
});
test("RLS: employee solo ve lo suyo y warehouse/employee/anon no pueden administrar", async () => {
  await as(employee);
  assert.equal(
    (await db.query("SELECT * FROM public.employees")).rows.length,
    1,
  );
  for (const uid of [employee, warehouse]) {
    await as(uid);
    for (const action of [
      "suspend",
      "reactivate",
      "archive",
      "access_generated",
    ])
      await assert.rejects(lifecycle(action), /Solo administradores/);
  }
  await as(warehouse);
  assert.equal(
    (await db.query("SELECT * FROM public.employees")).rows.length,
    0,
  );
  await db.exec("SET ROLE anon");
  await assert.rejects(lifecycle("suspend"), /permission denied/);
});
test("auditoría de accesos nunca incluye links, OTP ni tokens", async () => {
  await as(admin);
  await lifecycle("access_generated", {
    id: createdId,
    action_link: "SECRET_LINK",
    token: "SECRET_TOKEN",
    otp: "SECRET_OTP",
  });
  const logs = await db.query(
    "SELECT * FROM public.attendance_audit_log WHERE employee_id=$1 AND action='employee_access_generated'",
    [createdId],
  );
  assert.equal(logs.rows.length, 1);
  assert.doesNotMatch(
    JSON.stringify(logs.rows),
    /SECRET_|action_link|token|otp/,
  );
});
test("filtros normalizan nombre/correo/código y combinan cargo/estado", async () => {
  const e = {
    ...(await person()),
    active: true,
    archived_at: null,
    suspended_at: null,
    full_name: "Mónica Ruiz",
    position: "Caja",
    email: "MONICA@ejemplo.com",
    access_status: "pending",
  } as Employee;
  assert.equal(filterEmployees([e], "monica", "pending", "Caja").length, 1);
  assert.equal(filterEmployees([e], "@ejemplo", "all", "").length, 1);
  assert.equal(filterEmployees([e], e.employee_code, "active", "").length, 1);
  assert.equal(filterEmployees([e], "", "activated", "").length, 0);
  assert.equal(filterEmployees([e], "", "all", "Almacén").length, 0);
});
test("iniciales y badges accesibles reflejan activación, suspensión y archivo", async () => {
  assert.equal(initials("Harrison Calderon"), "HC");
  assert.equal(initials("Micaela"), "M");
  const e = await person();
  const html = renderToStaticMarkup(
    createElement(EmployeeStatusBadge, { employee: e }),
  );
  assert.match(html, /Archivado/);
  assert.match(html, /attendance-dot/);
  assert.match(
    renderToStaticMarkup(
      createElement(EmployeeAvatar, { name: "Carlos Ruiz" }),
    ),
    />CR</,
  );
  assert.equal(
    employeeState({
      ...e,
      archived_at: null,
      suspended_at: null,
      active: true,
      access_status: "activated",
    }),
    "activated",
  );
});

test("acceso falla cerrado ante ficha ausente, inactiva o archivada", () => {
  assert.equal(canEnterAttendance(null), false);
  assert.equal(canEnterAttendance(undefined), false);
  assert.equal(canEnterAttendance({ active: false }), false);
  assert.equal(
    canEnterAttendance({ active: true, archived_at: "2026-10-09T16:00:00Z" }),
    false,
  );
  assert.equal(canEnterAttendance({ active: true, archived_at: null }), true);
});

test("auditoría de recuperación admite metadata segura sin migración y conserva RLS de solo lectura", async () => {
  await db.exec("RESET ROLE");
  const before = await person();
  await db.query(
    "INSERT INTO public.attendance_audit_log(employee_id,action,performed_by,reason) VALUES($1,'employee_password_recovery_requested',$2,'Administrador solicitó recuperación de contraseña')",
    [existingId, admin],
  );
  const rows = (
    await db.query<{
      action: string;
      before_data: unknown;
      after_data: unknown;
    }>(
      "SELECT action,before_data,after_data FROM public.attendance_audit_log WHERE action='employee_password_recovery_requested'",
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].before_data, null);
  assert.equal(rows[0].after_data, null);
  assert.deepEqual(await person(), before);
  for (const id of [admin, employee, warehouse]) {
    await as(id);
    await assert.rejects(
      db.query(
        "INSERT INTO public.attendance_audit_log(employee_id,action,performed_by,reason) VALUES($1,'employee_password_recovery_requested',$2,'No permitido')",
        [existingId, id],
      ),
      /permission denied/,
    );
  }
  await db.exec("RESET ROLE");
});
