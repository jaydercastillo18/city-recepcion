import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import * as XLSX from "xlsx";
import {
  parseAttendanceExcel,
  parseScheduleTime,
} from "../src/features/attendance/parser";
import {
  attendanceRows,
  attendanceSummary,
  normalizeName,
  limaDate,
  scheduleChange,
} from "../src/features/attendance/domain";
import type { Employee } from "../src/features/attendance/types";
import {
  attendanceExcel,
  attendancePdf,
} from "../src/features/attendance/reports";

const db = new PGlite({ extensions: { pg_trgm } });
const admin = randomUUID(),
  warehouse = randomUUID(),
  first = randomUUID(),
  second = randomUUID();
let a: Employee, b: Employee;
const sql = readFileSync(
  "supabase/migrations/20261009001046_attendance_module.sql",
  "utf8",
);
async function as(id: string) {
  await db.exec("SET ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function command(action: string, data: Record<string, unknown>) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.attendance_admin_command($1,$2::jsonb) AS result",
      [action, JSON.stringify({ reason: "Prueba autorizada", ...data })],
    )
  ).rows[0].result;
}
async function now() {
  return (
    await db.query<{ stamp: string; date: string; time: string }>(
      "SELECT now()::text stamp,(now() AT TIME ZONE 'America/Lima')::date::text date,(now() AT TIME ZONE 'America/Lima')::time::text time",
    )
  ).rows[0];
}
async function fixture(user: string, offset = 0, dayOff = false) {
  await as(admin);
  const employee = await command("employee", {
    full_name: `Persona ${randomUUID()}`,
    email: `${randomUUID()}@test.invalid`,
    position: "Caja",
  });
  await db.exec("RESET ROLE");
  await db.query("UPDATE public.employees SET profile_id=$1 WHERE id=$2", [
    user,
    employee.id,
  ]);
  const { date } = await now();
  const time = (
    await db.query<{ t: string }>(
      "SELECT ((now() AT TIME ZONE 'America/Lima')::time + make_interval(mins=>$1))::text t",
      [offset],
    )
  ).rows[0].t;
  await as(admin);
  await command("schedule", {
    employee_id: employee.id,
    work_date: date,
    scheduled_time: dayOff ? null : time,
    is_day_off: dayOff,
  });
  const path = `attendance/${date.replace(/-/g, "/")}/${employee.employee_code}/${randomUUID()}.jpg`;
  await db.exec("RESET ROLE");
  await db.query(
    "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('attendance-evidence',$1,$2)",
    [path, user],
  );
  return { employee, path, date, time };
}
async function mark(path: string) {
  return (
    await db.query<{
      r: {
        status: string;
        minutes_late: number;
        check_in_at: string;
        tolerance_minutes_applied: number;
      };
    }>("SELECT public.register_attendance_check_in($1) r", [path])
  ).rows[0].r;
}
before(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA auth,public,storage TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
 GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated; GRANT SELECT ON storage.objects TO anon;`);
  for (const file of [
    "20261006000001_initial_schema.sql",
    "20261006000002_rls_policies.sql",
    "20261006000003_functions_rpc.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated",
  );
  for (const [id, role] of [
    [admin, "admin"],
    [warehouse, "warehouse"],
    [first, "warehouse"],
    [second, "warehouse"],
  ]) {
    await db.query("INSERT INTO auth.users VALUES($1,$2,'{}')", [
      id,
      `${id}@test.invalid`,
    ]);
    await db.query("UPDATE public.profiles SET role=$1 WHERE id=$2", [
      role,
      id,
    ]);
  }
  // A manually precreated public bucket must be hardened by the new migration.
  await db.exec(
    "INSERT INTO storage.buckets(id,name,public) VALUES('attendance-evidence','attendance-evidence',true)",
  );
  await db.exec(sql);
  await db.query(
    "UPDATE public.profiles SET role='employee' WHERE id IN ($1,$2)",
    [first, second],
  );
  await as(admin);
  a = (await command("employee", {
    full_name: "Yadira Hernández",
    email: `${first}@test.invalid`,
    position: "Caja",
  })) as unknown as Employee;
  b = (await command("employee", {
    full_name: "Leandro Mansilla",
    email: `${second}@test.invalid`,
    position: "Prevención",
  })) as unknown as Employee;
  await command("link", { id: a.id, profile_id: first });
  await command("link", { id: b.id, profile_id: second });
});
after(async () => db.close());
test("admin ve todos los empleados; employee solo su ficha", async () => {
  await as(admin);
  assert.equal(
    (await db.query("SELECT * FROM public.employees")).rows.length,
    2,
  );
  await as(first);
  assert.deepEqual(
    (
      await db.query<{ id: string }>("SELECT id FROM public.employees")
    ).rows.map((e) => e.id),
    [a.id],
  );
});
test("marcación puntual usa reloj PostgreSQL y foto propia", async () => {
  const user = randomUUID();
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO auth.users VALUES($1,$2,'{}')", [
    user,
    `${user}@test.invalid`,
  ]);
  const f = await fixture(user);
  await as(user);
  const result = await mark(f.path);
  assert.equal(result.status, "on_time");
  assert.equal(result.minutes_late, 0);
  assert.ok(result.check_in_at);
  await assert.rejects(mark(f.path), /Ya registraste/);
});
test("tardanza calculada y employee no puede modificar ni insertar estados", async () => {
  const user = randomUUID();
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO auth.users VALUES($1,$2,'{}')", [
    user,
    `${user}@test.invalid`,
  ]);
  const f = await fixture(user, -20);
  await as(user);
  const result = await mark(f.path);
  assert.equal(result.status, "late");
  assert.ok(result.minutes_late >= 20);
  await assert.rejects(
    db.exec("UPDATE public.attendance_records SET status='on_time'"),
    /permission denied/,
  );
  await assert.rejects(
    command("correct", { schedule_id: randomUUID(), status: "on_time" }),
    /Solo administradores/,
  );
});
test("descanso no permite marcar", async () => {
  const user = randomUUID();
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO auth.users VALUES($1,$2,'{}')", [
    user,
    `${user}@test.invalid`,
  ]);
  const f = await fixture(user, 0, true);
  await as(user);
  await assert.rejects(mark(f.path), /descanso/);
});
test("warehouse no administra ni lee asistencia; empleado no lee mercadería", async () => {
  await as(warehouse);
  await assert.rejects(
    command("settings", {
      late_tolerance_minutes: 5,
      absence_cutoff_minutes: 180,
    }),
    /Solo administradores/,
  );
  assert.equal(
    (await db.query("SELECT * FROM public.employees")).rows.length,
    0,
  );
  await as(admin);
  await db.query(
    "INSERT INTO public.shipments(shipment_number,destination,shipment_date) VALUES($1,'CHIMBOTE','2026-10-06')",
    [randomUUID()],
  );
  await as(first);
  assert.equal(
    (await db.query("SELECT * FROM public.shipments")).rows.length,
    0,
  );
});
test("dos empleados no pueden leer horarios, marcaciones ni fotos del otro; anon no ve fotos", async () => {
  await as(admin);
  const date = "2026-10-09";
  await command("schedule", {
    employee_id: b.id,
    work_date: date,
    scheduled_time: "10:00",
    is_day_off: false,
  });
  await as(first);
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_schedules WHERE employee_id=$1",
        [b.id],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_records WHERE employee_id=$1",
        [b.id],
      )
    ).rows.length,
    0,
  );
  await db.exec("RESET ROLE");
  await db.query(
    "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('attendance-evidence',$1,$2)",
    [`attendance/2026/10/09/${b.employee_code}/${randomUUID()}.jpg`, second],
  );
  await as(first);
  assert.equal(
    (await db.query("SELECT * FROM storage.objects")).rows.length,
    0,
  );
  await db.exec("SET ROLE anon");
  assert.equal(
    (await db.query("SELECT * FROM storage.objects")).rows.length,
    0,
  );
});
test("fechas independientes; corrección admin genera auditoría y exige motivo", async () => {
  await as(admin);
  await command("schedule", {
    employee_id: a.id,
    work_date: "2026-10-06",
    scheduled_time: "10:00",
    is_day_off: false,
  });
  await command("schedule", {
    employee_id: a.id,
    work_date: "2026-10-07",
    scheduled_time: "09:00",
    is_day_off: false,
  });
  const schedules = (
    await db.query<{ id: string; scheduled_time: string }>(
      "SELECT id,scheduled_time::text FROM public.attendance_schedules WHERE employee_id=$1 ORDER BY work_date",
      [a.id],
    )
  ).rows;
  assert.deepEqual(
    schedules.map((s) => s.scheduled_time),
    ["10:00:00", "09:00:00"],
  );
  await assert.rejects(
    command("correct", {
      schedule_id: schedules[0].id,
      status: "justified",
      reason: "",
    }),
    /motivo/,
  );
  await command("correct", {
    schedule_id: schedules[0].id,
    status: "justified",
    notes: "Permiso médico",
  });
  const audit = (
    await db.query<{ action: string }>(
      "SELECT action FROM public.attendance_audit_log WHERE attendance_record_id IS NOT NULL AND employee_id=$1",
      [a.id],
    )
  ).rows;
  assert.ok(audit.some((v) => v.action === "correction"));
});
test("normalización de tildes y formatos de hora", () => {
  assert.equal(
    normalizeName("  Yadira   HERNÁNDEZ "),
    normalizeName("Yadira Hernandez"),
  );
  for (const value of ["9:00 a. m.", "09:00", 9 / 24])
    assert.equal(parseScheduleTime(value)?.time, "09:00:00");
  assert.equal(parseScheduleTime("DESCANSO")?.dayOff, true);
  assert.equal(parseScheduleTime("99:00"), null);
});
test("Excel detecta fechas, horas, descanso; ambigüedad requiere revisión", () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["N°", "NOMBRE", "FUNCIÓN", "6-Oct", "7-Oct"],
      [1, "Yadira Hernandez", "Caja", "09:00", "DESCANSO"],
    ]),
    "Horario",
  );
  const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const parsed = parseAttendanceExcel(
    bytes,
    "test.xlsx",
    2026,
    [a],
    "2026-10-06",
  );
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].employeeId, a.id);
  assert.equal(
    parseAttendanceExcel(bytes, "test.xlsx", 2026, [a], "2026-10-07").rows[0]
      .dayOff,
    true,
  );
  const ambiguous = parseAttendanceExcel(
    bytes,
    "test.xlsx",
    2026,
    [a, { ...a, id: randomUUID() }],
    "2026-10-06",
  );
  assert.equal(ambiguous.rows[0].employeeId, null);
  assert.equal(ambiguous.rows[0].candidates.length, 2);
});
test("importación transaccional, conflicto posterior a preview y día marcado protegido", async () => {
  await as(admin);
  const data = {
    request_id: randomUUID(),
    file_name: "horario.xlsx",
    target_date: "2026-11-06",
    file_hash: "a".repeat(64),
    warnings: [],
    rows: [
      {
        employee_id: b.id,
        work_date: "2026-11-06",
        scheduled_time: "09:00",
        is_day_off: false,
        previous_version: null,
      },
      {
        employee_id: b.id,
        work_date: "2026-11-06",
        shift: "night",
        scheduled_time: null,
        is_day_off: true,
        previous_version: null,
      },
    ],
  };
  await command("import", data);
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_schedules WHERE employee_id=$1 AND work_date IN ('2026-11-06','2026-11-07')",
        [b.id],
      )
    ).rows.length,
    2,
  );
  assert.equal((await command("import", data)).reused, true);
  await assert.rejects(
    command("import", { ...data, request_id: randomUUID() }),
    /cambió/,
  );
});
test("ausencia solo después del límite; cierre explícito auditado; reloj Perú", async () => {
  const serverNow = "2026-10-09T16:00:00Z";
  assert.equal(limaDate(new Date(serverNow)), "2026-10-09");
  const schedule = {
    id: randomUUID(),
    employee_id: a.id,
    work_date: "2026-10-09",
    scheduled_time: "10:00:00",
    is_day_off: false,
    shift: "day",
    source_import_id: null,
    created_at: serverNow,
    updated_at: serverNow,
  };
  const data = {
    employees: [a],
    schedules: [schedule],
    records: [],
    settings: {
      id: 1,
      late_tolerance_minutes: 5,
      absence_cutoff_minutes: 180,
      updated_at: serverNow,
    },
    serverNow,
    from: "2026-10-09",
    to: "2026-10-09",
  };
  assert.equal(attendanceRows(data)[0].status, "pending");
  assert.equal(
    attendanceRows({ ...data, serverNow: "2026-10-09T19:00:00Z" })[0].status,
    "absent",
  );
  assert.equal(attendanceSummary(attendanceRows(data)).pending, 1);
  await as(admin);
  await command("close", { work_date: "2026-10-07" });
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_audit_log WHERE action='close_day'",
      )
    ).rows.length,
    1,
  );
});

test("reporte employee contiene exclusivamente sus datos autorizados por RLS", async () => {
  await as(first);
  const people = (await db.query<Employee>("SELECT * FROM public.employees"))
    .rows;
  const schedules = (
    await db.query<import("../src/features/attendance/types").Schedule>(
      "SELECT *,work_date::text work_date FROM public.attendance_schedules",
    )
  ).rows;
  const records = (
    await db.query<import("../src/features/attendance/types").AttendanceRecord>(
      "SELECT *,work_date::text work_date FROM public.attendance_records",
    )
  ).rows;
  const data = {
    employees: people,
    schedules,
    records,
    settings: {
      id: 1,
      late_tolerance_minutes: 5,
      absence_cutoff_minutes: 180,
      updated_at: new Date().toISOString(),
    },
    serverNow: new Date().toISOString(),
    from: "2026-10-01",
    to: "2026-10-31",
  };
  const excel = XLSX.read(attendanceExcel(data, "Empleado"), { type: "array" });
  assert.deepEqual(excel.SheetNames, [
    "Resumen",
    "Detalle",
    "Tardanzas",
    "Faltas",
    "Descansos",
    "Justificaciones",
  ]);
  const details = XLSX.utils.sheet_to_json<{ Nombre: string }>(
    excel.Sheets.Detalle,
  );
  assert.ok(details.length > 0);
  assert.ok(details.every((r) => r.Nombre === a.full_name));
  assert.ok(!JSON.stringify(details).includes(b.full_name));
  const pdf = Buffer.from(attendancePdf(data, "Empleado")).toString("latin1");
  assert.ok(pdf.startsWith("%PDF"));
  assert.ok(!pdf.includes(b.full_name));
});

test("una foto ajena no sirve como evidencia para marcar", async () => {
  const user = randomUUID();
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO auth.users VALUES($1,$2,'{}')", [
    user,
    `${user}@test.invalid`,
  ]);
  const f = await fixture(user);
  await db.exec("RESET ROLE");
  await db.query("UPDATE storage.objects SET owner_id=$1 WHERE name=$2", [
    second,
    f.path,
  ]);
  await as(user);
  await assert.rejects(mark(f.path), /foto privada/);
});

test("employee no puede subir foto al espacio de otro y bucket es privado", async () => {
  await db.exec("RESET ROLE");
  assert.equal(
    (
      await db.query<{ public: boolean }>(
        "SELECT public FROM storage.buckets WHERE id='attendance-evidence'",
      )
    ).rows[0].public,
    false,
  );
  await as(first);
  const { date } = await now();
  await assert.rejects(
    db.query(
      "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('attendance-evidence',$1,$2)",
      [
        `attendance/${date.replace(/-/g, "/")}/${b.employee_code}/${randomUUID()}.jpg`,
        first,
      ],
    ),
    /row-level security/,
  );
});

test("admin no puede enlazar una cuenta warehouse ni vincular employee a dos personas", async () => {
  await as(admin);
  const employee = await command("employee", {
    full_name: "Cuenta inválida",
    email: `${warehouse}@test.invalid`,
  });
  await assert.rejects(
    command("link", { id: employee.id, profile_id: warehouse }),
    /rol employee/,
  );
  const duplicate = await command("employee", {
    full_name: "Otra persona",
    email: `${randomUUID()}@test.invalid`,
  });
  await assert.rejects(
    command("link", { id: duplicate.id, profile_id: first }),
    /mismo correo/,
  );
});

test("fallo de importación revierte todos los horarios y el registro de importación", async () => {
  await as(admin);
  const request = randomUUID();
  const before = (
    await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.attendance_imports",
    )
  ).rows[0].n;
  await assert.rejects(
    command("import", {
      request_id: request,
      file_name: "fallo.xlsx",
      target_date: "2026-12-04",
      file_hash: "f".repeat(64),
      warnings: [],
      rows: [
        {
          employee_id: b.id,
          work_date: "2026-12-04",
          scheduled_time: "09:00",
          is_day_off: false,
          previous_version: null,
        },
        {
          employee_id: randomUUID(),
          work_date: "2026-12-04",
          scheduled_time: "10:00",
          is_day_off: false,
          previous_version: null,
        },
      ],
    }),
    /empleado activo/,
  );
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM public.attendance_imports",
      )
    ).rows[0].n,
    before,
  );
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_schedules WHERE employee_id=$1 AND work_date='2026-12-04'",
        [b.id],
      )
    ).rows.length,
    0,
  );
});

test("nueva cuenta ignora rol de metadata y código interno sobrevive cambio de nombre", async () => {
  const user = randomUUID();
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO auth.users VALUES($1,$2,$3::jsonb)", [
    user,
    `${user}@test.invalid`,
    JSON.stringify({ role: "admin" }),
  ]);
  assert.equal(
    (
      await db.query<{ role: string }>(
        "SELECT role FROM public.profiles WHERE id=$1",
        [user],
      )
    ).rows[0].role,
    "employee",
  );
  await as(admin);
  const person = await command("employee", { full_name: "Nombre inicial" });
  const updated = await command("employee", {
    id: person.id,
    full_name: "Nombre corregido",
    active: true,
  });
  assert.equal(updated.employee_code, person.employee_code);
  assert.equal(updated.normalized_name, "NOMBRE CORREGIDO");
});

test("RPC públicas son invoker, helpers privados sin permiso anónimo y todas las tablas tienen RLS", async () => {
  await db.exec("RESET ROLE");
  const rls = (
    await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE relname IN ('employees','attendance_records','attendance_schedules','attendance_imports','attendance_settings','attendance_audit_log')",
    )
  ).rows;
  assert.equal(rls.length, 6);
  assert.ok(rls.every((r) => r.relrowsecurity));
  for (const signature of [
    "public.register_attendance_check_in(text)",
    "public.attendance_admin_command(text,jsonb)",
    "attendance_private.check_in(text,uuid)",
    "attendance_private.admin_command(text,jsonb)",
    "attendance_private.photo_unused(text)",
  ]) {
    const p = (
      await db.query<{ anon: boolean; searchpath: string[] }>(
        "SELECT has_function_privilege('anon',$1,'EXECUTE') anon,(SELECT proconfig FROM pg_proc WHERE oid=$1::regprocedure) searchpath",
        [signature],
      )
    ).rows[0];
    assert.equal(p.anon, false);
    assert.ok(p.searchpath.some((v) => v.startsWith("search_path=")));
  }
  assert.equal(
    (
      await db.query<{ definer: boolean }>(
        "SELECT prosecdef definer FROM pg_proc WHERE oid='public.register_attendance_check_in(text)'::regprocedure",
      )
    ).rows[0].definer,
    false,
  );
});

test("tolerancia: 09:55, 10:00 y 10:04 puntuales; 10:06 son 6 min y 10:20 son 20 min", async () => {
  await db.exec("RESET ROLE");
  for (const [time, expected] of [
    ["09:55:00", 0],
    ["10:00:00", 0],
    ["10:04:59", 0],
    ["10:06:00", 6],
    ["10:06:40", 6],
    ["10:20:00", 20],
  ] as [string, number][]) {
    const result = (
      await db.query<{ n: number }>(
        "SELECT attendance_private.late_minutes('2026-10-09 10:00:00-05'::timestamptz,$1::timestamptz,5) n",
        [`2026-10-09 ${time}-05`],
      )
    ).rows[0].n;
    assert.equal(result, expected);
  }
});

test("cierre transforma un pending existente en absent con antes/después", async () => {
  await as(admin);
  await command("schedule", {
    employee_id: b.id,
    work_date: "2026-10-01",
    scheduled_time: "10:00",
    is_day_off: false,
  });
  const schedule = (
    await db.query<{ id: string }>(
      "SELECT id FROM public.attendance_schedules WHERE employee_id=$1 AND work_date='2026-10-01'",
      [b.id],
    )
  ).rows[0];
  await command("correct", {
    schedule_id: schedule.id,
    status: "pending",
    check_in_at: null,
  });
  await command("close", { work_date: "2026-10-01" });
  assert.equal(
    (
      await db.query<{ status: string }>(
        "SELECT status FROM public.attendance_records WHERE schedule_id=$1",
        [schedule.id],
      )
    ).rows[0].status,
    "absent",
  );
  assert.equal(
    (
      await db.query<{ status: string }>(
        "SELECT before_data->>'status' status FROM public.attendance_audit_log WHERE action='close_day' AND employee_id=$1 AND after_data->>'work_date'='2026-10-01'",
        [b.id],
      )
    ).rows[0].status,
    "pending",
  );
});

test("employee activo puede marcar un pending corregido y no puede eliminar evidencia auditada", async () => {
  const user = randomUUID();
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO auth.users VALUES($1,$2,'{}')", [
    user,
    `${user}@test.invalid`,
  ]);
  const f = await fixture(user);
  await as(user);
  await mark(f.path);
  await as(admin);
  const s = (
    await db.query<{ id: string }>(
      "SELECT id FROM public.attendance_schedules WHERE employee_id=$1",
      [f.employee.id],
    )
  ).rows[0];
  await command("correct", {
    schedule_id: s.id,
    status: "pending",
    check_in_at: null,
  });
  const nextPath = f.path.replace(/[^/]+$/, `${randomUUID()}.jpg`);
  await db.exec("RESET ROLE");
  await db.query(
    "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('attendance-evidence',$1,$2)",
    [nextPath, user],
  );
  await as(user);
  assert.equal((await mark(nextPath)).status, "on_time");
  await db.query("DELETE FROM storage.objects WHERE name=$1", [f.path]);
  assert.equal(
    (await db.query("SELECT * FROM storage.objects WHERE name=$1", [f.path]))
      .rows.length,
    1,
  );
});

test("warehouse conserva recepción y estadísticas; employee no ve totales vía RPC antigua", async () => {
  await as(admin);
  const shipment = (
    await db.query<{ id: string }>(
      "INSERT INTO public.shipments(shipment_number,destination,shipment_date,status,total_expected_boxes) VALUES($1,'CHIMBOTE','2026-10-06','receiving',5) RETURNING id",
      [randomUUID()],
    )
  ).rows[0];
  const item = (
    await db.query<{ id: string }>(
      "INSERT INTO public.shipment_items(shipment_id,code_original,code_normalized,product_name,expected_boxes) VALUES($1,'A','A','Prueba intacta',5) RETURNING id",
      [shipment.id],
    )
  ).rows[0];
  await as(warehouse);
  const receipt = (
    await db.query<{ r: { success: boolean } }>(
      "SELECT public.register_box_reception($1,'receive',1,null) r",
      [item.id],
    )
  ).rows[0].r;
  assert.equal(receipt.success, true);
  const stats = (
    await db.query<{ r: { total_expected: number; total_received: number } }>(
      "SELECT public.get_shipment_stats($1) r",
      [shipment.id],
    )
  ).rows[0].r;
  assert.equal(stats.total_expected, 5);
  assert.equal(stats.total_received, 1);
  await as(first);
  const hidden = (
    await db.query<{ r: { item_count: number; total_expected: number } }>(
      "SELECT public.get_shipment_stats($1) r",
      [shipment.id],
    )
  ).rows[0].r;
  assert.equal(hidden.item_count, 0);
  assert.equal(hidden.total_expected, 0);
});

test("códigos después de EMP-9999 no se truncan; fechas Excel reales se detectan", async () => {
  await db.exec(
    "RESET ROLE; SELECT setval('public.attendance_employee_code_seq',9999)",
  );
  await as(admin);
  const employee = await command("employee", { full_name: "Último código" });
  assert.equal(employee.employee_code, "EMP-10000");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["NOMBRE", new Date("2026-10-09T12:00:00Z")],
      ["Yadira Hernandez", 10 / 24],
    ]),
    "Horario",
  );
  const preview = parseAttendanceExcel(
    XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
    "fecha.xlsx",
    2026,
    [a],
    "2026-10-09",
  );
  assert.equal(preview.rows[0].workDate, "2026-10-09");
  assert.equal(preview.rows[0].time, "10:00:00");
});

test("sesión sin perfil no puede ejecutar comandos administrativos ni marcar", async () => {
  await as(randomUUID());
  await assert.rejects(
    command("lookup_account", { email: `${first}@test.invalid` }),
    /Solo administradores/,
  );
  await assert.rejects(mark("invalida"), /Solo empleados autenticados/);
});

for (const tolerance of [0, 5, 10]) {
  test(`empleado con tolerancia individual ${tolerance}: marcación real y snapshot`, async () => {
    const user = randomUUID();
    await db.exec("RESET ROLE");
    await db.query("INSERT INTO auth.users VALUES($1,$2,'{}')", [
      user,
      `${user}@test.invalid`,
    ]);
    const f = await fixture(user, -6);
    await as(admin);
    await command("employee", {
      id: f.employee.id,
      full_name: f.employee.full_name,
      email: f.employee.email,
      late_tolerance_minutes: tolerance,
    });
    await as(user);
    const record = await mark(f.path);
    assert.equal(record.status, tolerance < 6 ? "late" : "on_time");
    assert.equal(record.minutes_late, tolerance < 6 ? 6 : 0);
    assert.equal(record.tolerance_minutes_applied, tolerance);
  });
}
test("misma hora: tolerancias 0/5/10 y límite inclusivo sin descontar minutos", async () => {
  await db.exec("RESET ROLE");
  for (const [tolerance, time, expected] of [
    [0, "10:00", 0],
    [0, "10:01", 1],
    [5, "10:05", 0],
    [5, "10:06", 6],
    [5, "10:12", 12],
    [10, "10:10", 0],
    [10, "10:11", 11],
    [0, "10:06", 6],
    [10, "10:06", 0],
  ] as const) {
    const result = await db.query<{ n: number }>(
      "SELECT attendance_private.late_minutes('2026-10-07 10:00-05'::timestamptz,$1::timestamptz,$2) n",
      [`2026-10-07 ${time}-05`, tolerance],
    );
    assert.equal(result.rows[0].n, expected);
  }
});
test("snapshot histórico: cambio de tolerancia y corrección conservan la aplicada", async () => {
  await as(admin);
  const employee = await command("employee", {
    full_name: "Histórico tolerancia",
    late_tolerance_minutes: 5,
  });
  const schedule = await command("schedule", {
    employee_id: employee.id,
    work_date: "2026-10-07",
    shift: "day",
    scheduled_time: "10:00",
    is_day_off: false,
  });
  void schedule;
  const s = (
    await db.query<{ id: string }>(
      "SELECT id FROM public.attendance_schedules WHERE employee_id=$1",
      [employee.id],
    )
  ).rows[0];
  const old = await command("correct", {
    schedule_id: s.id,
    status: "late",
    check_in_at: "2026-10-07T10:06:00-05:00",
  });
  assert.equal(old.tolerance_minutes_applied, 5);
  assert.equal(old.minutes_late, 6);
  await command("employee", {
    id: employee.id,
    full_name: employee.full_name,
    late_tolerance_minutes: 10,
  });
  const unchanged = (
    await db.query<{ tolerance_minutes_applied: number; minutes_late: number }>(
      "SELECT * FROM public.attendance_records WHERE id=$1",
      [old.id],
    )
  ).rows[0];
  assert.equal(unchanged.tolerance_minutes_applied, 5);
  assert.equal(unchanged.minutes_late, 6);
  const corrected = await command("correct", {
    schedule_id: s.id,
    status: "on_time",
    check_in_at: "2026-10-07T10:06:00-05:00",
    notes: "Corregir observación",
  });
  assert.equal(corrected.tolerance_minutes_applied, 5);
  assert.equal(corrected.status, "late");
  assert.equal(corrected.minutes_late, 6);
  await command("schedule", {
    employee_id: employee.id,
    work_date: "2026-10-06",
    scheduled_time: "10:00",
    is_day_off: false,
  });
  const fresh = (
    await db.query<{ id: string }>(
      "SELECT id FROM public.attendance_schedules WHERE employee_id=$1 AND work_date='2026-10-06'",
      [employee.id],
    )
  ).rows[0];
  const created = await command("correct", {
    schedule_id: fresh.id,
    status: "late",
    check_in_at: "2026-10-06T10:06:00-05:00",
  });
  assert.equal(created.tolerance_minutes_applied, 10);
  assert.equal(created.status, "on_time");
});
test("admin cambia tolerancia con auditoría completa y límites 0–120", async () => {
  await as(admin);
  const e = await command("employee", { full_name: "Auditoría tolerancia" });
  await command("employee", {
    id: e.id,
    full_name: e.full_name,
    late_tolerance_minutes: 15,
    reason: "Acuerdo individual autorizado",
  });
  const audit = (
    await db.query<{
      before_data: Employee;
      after_data: Employee;
      performed_by: string;
      reason: string;
      created_at: string;
    }>(
      "SELECT * FROM public.attendance_audit_log WHERE employee_id=$1 AND action='employee_tolerance_changed'",
      [e.id],
    )
  ).rows[0];
  assert.equal(audit.before_data.late_tolerance_minutes, 5);
  assert.equal(audit.after_data.late_tolerance_minutes, 15);
  assert.equal(audit.performed_by, admin);
  assert.equal(audit.reason, "Acuerdo individual autorizado");
  assert.ok(audit.created_at);
  for (const invalid of [-1, 121, 2.5])
    await assert.rejects(
      command("employee", {
        id: e.id,
        full_name: e.full_name,
        late_tolerance_minutes: invalid,
      }),
    );
});
test("employee no puede cambiar tolerancia vía RPC ni DML", async () => {
  await as(first);
  await assert.rejects(
    command("employee", {
      id: a.id,
      full_name: a.full_name,
      email: a.email,
      late_tolerance_minutes: 120,
    }),
    /Solo administradores/,
  );
  await assert.rejects(
    db.query(
      "UPDATE public.employees SET late_tolerance_minutes=120 WHERE id=$1",
      [a.id],
    ),
    /permission denied/,
  );
});
function dailyWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["HORARIO CITY OFERTAS (Turno Día)"],
      ["NOMBRE", "FUNCIÓN", "7-Oct", "8-Oct"],
      [a.full_name, "Caja", "09:00", "10:00"],
      ["HORARIO CITY OFERTAS (Turno Noche)"],
      ["NOMBRE", "FUNCIÓN", "7-Oct", "8-Oct"],
      [b.full_name, "Caja", "18:00", "DESCANSO"],
    ]),
    "Horarios",
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
test("parser detecta Turno Día day y Turno Noche night, seleccionando solo 8-Oct", () => {
  const preview = parseAttendanceExcel(
    dailyWorkbook(),
    "real.xlsx",
    2026,
    [a, b],
    "2026-10-08",
  );
  assert.deepEqual(preview.availableDates, ["2026-10-07", "2026-10-08"]);
  assert.equal(preview.rows.length, 2);
  assert.ok(preview.rows.every((r) => r.workDate === "2026-10-08"));
  assert.equal(preview.rows[0].shift, "day");
  assert.equal(preview.rows[1].shift, "night");
  assert.equal(preview.rows[1].dayOff, true);
});
test("sin selección solo detecta fechas; fecha antigua exige selección expresa", () => {
  const detected = parseAttendanceExcel(dailyWorkbook(), "real.xlsx", 2026, [
    a,
    b,
  ]);
  assert.equal(detected.rows.length, 0);
  assert.equal(detected.targetDate, null);
  assert.equal(
    parseAttendanceExcel(
      dailyWorkbook(),
      "real.xlsx",
      2026,
      [a, b],
      "2026-10-07",
    ).rows[0].time,
    "09:00:00",
  );
  assert.ok(
    parseAttendanceExcel(
      dailyWorkbook(),
      "real.xlsx",
      2026,
      [a, b],
      "2026-10-09",
    ).errors.length,
  );
});
async function dailyImport(
  employeeId: unknown,
  date: string,
  shift: string,
  time: string | null,
  version: string | null = null,
) {
  return command("import", {
    request_id: randomUUID(),
    file_name: "diario.xlsx",
    file_hash: "c".repeat(64),
    target_date: date,
    rows: [
      {
        employee_id: employeeId,
        work_date: date,
        shift,
        scheduled_time: time,
        is_day_off: time === null,
        previous_version: version,
      },
    ],
  });
}
test("import SQL guarda day/night separados y nunca crea attendance_records", async () => {
  await as(admin);
  const e = await command("employee", {
    full_name: "Turnos separados",
    late_tolerance_minutes: 15,
  });
  await dailyImport(e.id, "2026-10-08", "day", "09:00");
  await dailyImport(e.id, "2026-10-08", "night", "18:00");
  const shifts = (
    await db.query<{ shift: string }>(
      "SELECT shift FROM public.attendance_schedules WHERE employee_id=$1 ORDER BY shift",
      [e.id],
    )
  ).rows;
  assert.deepEqual(
    shifts.map((s) => s.shift),
    ["day", "night"],
  );
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_records WHERE employee_id=$1",
        [e.id],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query<Employee>("SELECT * FROM public.employees WHERE id=$1", [
        e.id,
      ])
    ).rows[0].late_tolerance_minutes,
    15,
  );
});
test("importar 8-Oct preserva 7-Oct; reimportación idéntica no modifica timestamp ni origen", async () => {
  await as(admin);
  const e = await command("employee", { full_name: "Importación diaria" });
  await dailyImport(e.id, "2026-10-07", "day", "09:00");
  await dailyImport(e.id, "2026-10-08", "day", "10:00");
  const old = (
    await db.query<{
      work_date: string;
      updated_at: string;
      source_import_id: string;
      scheduled_time: string;
    }>(
      "SELECT *,work_date::text work_date FROM public.attendance_schedules WHERE employee_id=$1 ORDER BY public.attendance_schedules.work_date",
      [e.id],
    )
  ).rows;
  const result = await dailyImport(
    e.id,
    "2026-10-08",
    "day",
    "10:00",
    old[1].updated_at,
  );
  assert.equal(result.count, 0);
  assert.equal(result.unchanged, 1);
  assert.deepEqual(
    (
      await db.query(
        "SELECT *,work_date::text work_date FROM public.attendance_schedules WHERE employee_id=$1 ORDER BY public.attendance_schedules.work_date",
        [e.id],
      )
    ).rows,
    old,
  );
  await dailyImport(e.id, "2026-10-08", "day", "11:00", old[1].updated_at);
  assert.equal(
    (
      await db.query<{ scheduled_time: string }>(
        "SELECT scheduled_time::text FROM public.attendance_schedules WHERE employee_id=$1 AND work_date='2026-10-07'",
        [e.id],
      )
    ).rows[0].scheduled_time,
    "09:00:00",
  );
  const audit = (
    await db.query(
      "SELECT * FROM public.attendance_audit_log WHERE action='schedule_import' AND after_data->>'target_date'='2026-10-08'",
    )
  ).rows;
  assert.ok(audit.length >= 3);
});
test("DESCANSO solo reemplaza después de confirmar; otros días conservan horario", async () => {
  await as(admin);
  const e = await command("employee", { full_name: a.full_name });
  await dailyImport(e.id, "2026-10-08", "day", "09:00");
  const old = (
    await db.query<{ id: string; updated_at: string; is_day_off: boolean }>(
      "SELECT * FROM public.attendance_schedules WHERE employee_id=$1",
      [e.id],
    )
  ).rows[0];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["NOMBRE", "8-Oct"],
      [a.full_name, "DESCANSO"],
    ]),
    "Turno Día",
  );
  const preview = parseAttendanceExcel(
    XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
    "descanso.xlsx",
    2026,
    [{ ...a, id: String(e.id) }],
    "2026-10-08",
  );
  assert.equal(preview.rows[0].dayOff, true);
  assert.equal(
    (
      await db.query<{ is_day_off: boolean }>(
        "SELECT is_day_off FROM public.attendance_schedules WHERE id=$1",
        [old.id],
      )
    ).rows[0].is_day_off,
    false,
  );
  await dailyImport(e.id, "2026-10-08", "day", null, old.updated_at);
  assert.equal(
    (
      await db.query<{ is_day_off: boolean }>(
        "SELECT is_day_off FROM public.attendance_schedules WHERE id=$1",
        [old.id],
      )
    ).rows[0].is_day_off,
    true,
  );
});
test("SQL rechaza archivos con más de una fecha, sin fecha objetivo y turno inválido", async () => {
  await as(admin);
  const e = await command("employee", {
    full_name: "Rechazo fechas mezcladas",
  });
  const row = {
    employee_id: e.id,
    work_date: "2026-10-08",
    shift: "day",
    scheduled_time: "09:00",
    is_day_off: false,
    previous_version: null,
  };
  const data = {
    request_id: randomUUID(),
    file_name: "mezclado.xlsx",
    file_hash: "d".repeat(64),
    target_date: "2026-10-08",
    rows: [row, { ...row, work_date: "2026-10-07" }],
  };
  await assert.rejects(command("import", data), /fecha/);
  await assert.rejects(
    command("import", { ...data, target_date: null, rows: [row] }),
    /fecha/,
  );
  await assert.rejects(dailyImport(e.id, "2026-10-08", "invalid", "09:00"));
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_schedules WHERE employee_id=$1",
        [e.id],
      )
    ).rows.length,
    0,
  );
});

test("vista previa distingue NUEVO, SIN CAMBIOS, ACTUALIZAR y ERROR", () => {
  const row = parseAttendanceExcel(
    dailyWorkbook(),
    "real.xlsx",
    2026,
    [a, b],
    "2026-10-08",
  ).rows[0];
  const old: import("../src/features/attendance/types").Schedule = {
    id: randomUUID(),
    employee_id: a.id,
    work_date: row.workDate,
    shift: "day",
    scheduled_time: row.time,
    is_day_off: false,
    source_import_id: null,
    created_at: "2026-10-08",
    updated_at: "2026-10-08",
  };
  assert.equal(scheduleChange(row), "NUEVO");
  assert.equal(scheduleChange(row, old), "SIN CAMBIOS");
  assert.equal(scheduleChange({ ...row, time: "11:00:00" }, old), "ACTUALIZAR");
  assert.equal(
    scheduleChange({ ...row, time: null, dayOff: true }, old),
    "ACTUALIZAR",
  );
  assert.equal(
    scheduleChange({ ...row, error: "Hora inválida" }, old),
    "ERROR",
  );
});
test("day permite marcar aunque haya night; night rechaza RPC incluso sin foto", async () => {
  const user = randomUUID();
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO auth.users VALUES($1,$2,'{}')", [
    user,
    `${user}@test.invalid`,
  ]);
  const f = await fixture(user);
  await as(admin);
  await command("schedule", {
    employee_id: f.employee.id,
    work_date: f.date,
    shift: "night",
    scheduled_time: f.time,
    is_day_off: false,
  });
  const night = (
    await db.query<{ id: string }>(
      "SELECT id FROM public.attendance_schedules WHERE employee_id=$1 AND shift='night'",
      [f.employee.id],
    )
  ).rows[0];
  await as(user);
  await assert.rejects(
    db.query("SELECT public.register_attendance_check_in(NULL,$1::uuid)", [
      night.id,
    ]),
    /El turno noche no requiere marcación de asistencia\./,
  );
  assert.equal((await mark(f.path)).status, "on_time");
  await assert.rejects(mark(f.path), /Ya registraste/);
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_records WHERE employee_id=$1",
        [f.employee.id],
      )
    ).rows.length,
    1,
  );
});
test("solo night rechaza marcación sin selección y nunca requiere foto", async () => {
  const user = randomUUID();
  await db.exec("RESET ROLE");
  await db.query("INSERT INTO auth.users VALUES($1,$2,'{}')", [
    user,
    `${user}@test.invalid`,
  ]);
  const f = await fixture(user);
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE public.attendance_schedules SET shift='night' WHERE employee_id=$1",
    [f.employee.id],
  );
  await as(user);
  await assert.rejects(
    db.query("SELECT public.register_attendance_check_in(NULL::text)"),
    /El turno noche no requiere marcación de asistencia\./,
  );
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_records WHERE employee_id=$1",
        [f.employee.id],
      )
    ).rows.length,
    0,
  );
});
test("close ignora night laborable y descanso; correct tampoco crea asistencias night", async () => {
  await as(admin);
  const e = await command("employee", { full_name: "No controlar noche" });
  await dailyImport(e.id, "2026-10-07", "night", "18:00");
  await dailyImport(e.id, "2026-10-06", "night", null);
  const night = (
    await db.query<{ id: string }>(
      "SELECT id FROM public.attendance_schedules WHERE employee_id=$1",
      [e.id],
    )
  ).rows;
  for (const date of ["2026-10-06", "2026-10-07"])
    await command("close", { work_date: date });
  assert.equal(
    (
      await db.query(
        "SELECT * FROM public.attendance_records WHERE employee_id=$1",
        [e.id],
      )
    ).rows.length,
    0,
  );
  for (const schedule of night)
    await assert.rejects(
      command("correct", { schedule_id: schedule.id, status: "absent" }),
      /El turno noche no requiere marcación/,
    );
});
function nightData() {
  const stamp = "2026-10-09T23:00:00Z";
  const schedule = {
    id: randomUUID(),
    employee_id: a.id,
    work_date: "2026-10-07",
    shift: "night",
    scheduled_time: "18:00:00",
    is_day_off: false,
    source_import_id: null,
    created_at: stamp,
    updated_at: stamp,
  };
  return {
    employees: [a],
    schedules: [
      schedule,
      {
        ...schedule,
        id: randomUUID(),
        work_date: "2026-10-06",
        scheduled_time: null,
        is_day_off: true,
      },
    ],
    records: [],
    settings: { id: 1, absence_cutoff_minutes: 180, updated_at: stamp },
    serverNow: stamp,
    from: "2026-10-06",
    to: "2026-10-09",
  };
}
test("night nunca deriva absent/day_off ni afecta KPIs, ni siquiera tras el límite", () => {
  const data = nightData();
  const rows = attendanceRows(data);
  assert.ok(
    rows.every(
      (r) => r.status === "informational" && r.minutesLate === 0 && !r.record,
    ),
  );
  assert.deepEqual(attendanceSummary(rows), {
    scheduled: 0,
    attended: 0,
    pending: 0,
    on_time: 0,
    late: 0,
    absent: 0,
    day_off: 0,
    justified: 0,
  });
  const day = { ...data.schedules[0], id: randomUUID(), shift: "day" };
  const onlyDay = attendanceRows({ ...data, schedules: [day] });
  assert.deepEqual(
    attendanceSummary(
      attendanceRows({ ...data, schedules: [...data.schedules, day] }),
    ),
    attendanceSummary(onlyDay),
  );
});
test("night importado se conserva como horario informativo y separado en PDF/Excel", () => {
  const data = nightData();
  const parsed = parseAttendanceExcel(
    dailyWorkbook(),
    "horario.xlsx",
    2026,
    [a, b],
    "2026-10-08",
  );
  assert.equal(parsed.rows[1].shift, "night");
  const wb = XLSX.read(attendanceExcel(data, "Administrador"), {
    type: "array",
  });
  assert.ok(wb.SheetNames.includes("Horario noche"));
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Detalle).length, 0);
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Faltas).length, 0);
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Descansos).length, 0);
  const info = XLSX.utils.sheet_to_json<{ Información: string }>(
    wb.Sheets["Horario noche"],
  );
  assert.equal(info.length, 2);
  assert.ok(info.every((r) => r.Información === "Sin control de asistencia"));
  const pdf = Buffer.from(attendancePdf(data, "Administrador")).toString(
    "latin1",
  );
  assert.ok(pdf.includes("Sin control de asistencia"));
});
