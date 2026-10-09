import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEmployeeAccess,
  sendEmployeeInvitationEmail,
  invitationError,
  EMAIL_LIMIT_MESSAGE,
  accessAfterEmail,
  whatsappInvitation,
  type InvitationPorts,
  type InviteAccount,
} from "../src/features/attendance/invitations";
import type { Employee } from "../src/features/attendance/types";
const LINK = "https://auth.example/verify?token=SECRET_TEST_TOKEN&type=invite";
function fixture() {
  const employee: Employee = {
    id: "employee-1",
    profile_id: null,
    employee_code: "EMP-0001",
    full_name: "Harrison Calderon",
    normalized_name: "HARRISON CALDERON",
    position: "Aux. de Reposición",
    email: "harrison@example.com",
    phone: "923 425 372",
    active: true,
    late_tolerance_minutes: 5,
    invitation_email_status: "not_sent",
    created_at: "",
    updated_at: "",
  };
  let account: InviteAccount | null = null;
  let sends = 0;
  let generates = 0;
  let error: unknown;
  const audits: unknown[] = [];
  const requests: unknown[] = [];
  const ports: InvitationPorts = {
    requireAdmin: async () => {},
    employee: async () => employee,
    lookup: async () => account,
    siteOrigin: "https://city-recepcion.vercel.app",
    link: async (_id, userId) => {
      employee.profile_id = userId;
      audits.push({ action: "account_link", profile_id: userId });
    },
    recordEmail: async (_id, state) => {
      employee.invitation_email_status = state;
      audits.push({ action: "invitation_email", state });
    },
    generateLink: async (params) => {
      generates++;
      requests.push(params);
      account = {
        id: "auth-1",
        role: "employee",
        activated: false,
        email_confirmed: false,
      };
      return { userId: "auth-1", actionLink: LINK };
    },
    sendEmail: async () => {
      sends++;
      return { error };
    },
  };
  return {
    employee,
    ports,
    audits,
    requests,
    get account() {
      return account;
    },
    set account(value) {
      account = value;
    },
    get sends() {
      return sends;
    },
    get generates() {
      return generates;
    },
    set error(value: unknown) {
      error = value;
    },
  };
}
test("generateLink crea acceso sin enviar correo y con redirectTo correcto", async () => {
  const f = fixture();
  const result = await createEmployeeAccess(f.ports, f.employee.id);
  assert.equal(result.actionLink, LINK);
  assert.equal(result.accountState, "pending");
  assert.equal(result.emailState, "not_sent");
  assert.equal(f.sends, 0);
  assert.deepEqual(f.requests, [
    {
      type: "invite",
      email: f.employee.email,
      options: {
        redirectTo: "https://city-recepcion.vercel.app/auth/invitacion",
        data: { full_name: f.employee.full_name },
      },
    },
  ]);
});
test("rate limit no elimina, desvincula ni altera la invitación creada", async () => {
  const f = fixture();
  const access = await createEmployeeAccess(f.ports, f.employee.id);
  const linked = f.employee.profile_id;
  f.error = {
    status: 429,
    code: "over_email_send_rate_limit",
    message: "email rate limit exceeded",
  };
  const sent = await sendEmployeeInvitationEmail(f.ports, f.employee.id);
  assert.equal(f.employee.profile_id, linked);
  assert.equal(f.employee.active, true);
  assert.equal(f.account?.activated, false);
  assert.equal(sent.accountState, "pending");
  assert.equal(accessAfterEmail(access, sent).actionLink, LINK);
  assert.equal(f.generates, 1);
});
test("rate limit se muestra en español sin mensaje técnico", () => {
  for (const error of [
    { status: 429 },
    { code: "rate_limit" },
    { message: "email rate limit exceeded" },
    { code: "over_email_send_rate_limit" },
  ])
    assert.equal(invitationError(error), EMAIL_LIMIT_MESSAGE);
  assert.ok(
    !/AuthApiError|429|rate_limit|email rate limit exceeded/.test(
      EMAIL_LIMIT_MESSAGE,
    ),
  );
});
test("Copiar enlace sigue disponible tras rate limit", async () => {
  const f = fixture();
  const access = await createEmployeeAccess(f.ports, f.employee.id);
  f.error = { status: 429 };
  const state = accessAfterEmail(
    access,
    await sendEmployeeInvitationEmail(f.ports, f.employee.id),
  );
  let clipboard = "";
  const writeText = async (value: string) => {
    clipboard = value;
  };
  await writeText(state.actionLink!);
  assert.equal(clipboard, LINK);
});
test("WhatsApp conserva enlace personal y mensaje tras rate limit", async () => {
  const f = fixture();
  const access = await createEmployeeAccess(f.ports, f.employee.id);
  f.error = { status: 429 };
  const state = accessAfterEmail(
    access,
    await sendEmployeeInvitationEmail(f.ports, f.employee.id),
  );
  const url = new URL(whatsappInvitation(f.employee, state.actionLink!));
  assert.equal(url.pathname, "/51923425372");
  assert.ok(url.searchParams.get("text")?.includes(LINK));
  assert.ok(url.searchParams.get("text")?.includes("Hola Harrison 👋"));
  assert.ok(
    url.searchParams
      .get("text")
      ?.includes("Este enlace es personal. No lo compartas."),
  );
});
test("el email solo se intenta una vez por llamada explícita; no regenera al fallar", async () => {
  const f = fixture();
  await createEmployeeAccess(f.ports, f.employee.id);
  assert.equal(f.sends, 0);
  f.error = { status: 429 };
  await sendEmployeeInvitationEmail(f.ports, f.employee.id);
  assert.equal(f.sends, 1);
  assert.equal(f.generates, 1);
});
test("el enlace no se registra en logs ni en datos de auditoría", async () => {
  const f = fixture();
  const logged: unknown[] = [];
  const original = console.log;
  console.log = (...values) => {
    logged.push(values);
  };
  try {
    await createEmployeeAccess(f.ports, f.employee.id);
    f.error = { status: 429 };
    await sendEmployeeInvitationEmail(f.ports, f.employee.id);
  } finally {
    console.log = original;
  }
  assert.ok(!JSON.stringify(logged).includes("SECRET_TEST_TOKEN"));
  assert.ok(!JSON.stringify(f.audits).includes("SECRET_TEST_TOKEN"));
});
test("un error técnico nunca expone enlace ni detalles internos", async () => {
  const f = fixture();
  f.ports.generateLink = async () => {
    throw new Error(`AuthApiError: ${LINK}`);
  };
  const result = await createEmployeeAccess(f.ports, f.employee.id);
  assert.ok(result.error);
  assert.ok(!JSON.stringify(result).includes("SECRET_TEST_TOKEN"));
  assert.ok(!JSON.stringify(result).includes("AuthApiError"));
});
test("solo admin puede crear o regenerar enlaces y enviar email", async () => {
  const f = fixture();
  f.ports.requireAdmin = async () => {
    throw new Error("permission denied");
  };
  assert.ok((await createEmployeeAccess(f.ports, f.employee.id)).error);
  assert.ok((await sendEmployeeInvitationEmail(f.ports, f.employee.id)).error);
  assert.equal(f.generates, 0);
  assert.equal(f.sends, 0);
});
test("una cuenta activada se vincula sin regenerar, mandar correo ni cambiar estado", async () => {
  const f = fixture();
  f.account = {
    id: "auth-1",
    role: "employee",
    activated: true,
    email_confirmed: true,
  };
  const access = await createEmployeeAccess(f.ports, f.employee.id);
  assert.equal(access.accountState, "activated");
  assert.equal(access.actionLink, undefined);
  const sent = await sendEmployeeInvitationEmail(f.ports, f.employee.id);
  assert.equal(sent.accountState, "activated");
  assert.equal(f.generates, 0);
  assert.equal(f.sends, 0);
});
test("cuentas admin/warehouse no pueden convertirse en employee", async () => {
  for (const role of ["admin", "warehouse"]) {
    const f = fixture();
    f.account = { id: "auth-1", role, activated: true, email_confirmed: true };
    const result = await createEmployeeAccess(f.ports, f.employee.id);
    assert.match(result.error!, /cuenta administrativa/);
    assert.equal(f.employee.profile_id, null);
    assert.equal(f.generates, 0);
  }
});
test("regeneración pendiente usa Auth y correo fallido conserva estado de cuenta", async () => {
  const f = fixture();
  await createEmployeeAccess(f.ports, f.employee.id);
  const access = await createEmployeeAccess(f.ports, f.employee.id);
  assert.equal(f.generates, 2);
  f.error = { message: "Unexpected AuthApiError" };
  const sent = await sendEmployeeInvitationEmail(f.ports, f.employee.id);
  assert.equal(sent.emailState, "error");
  assert.equal(sent.accountState, "pending");
  assert.equal(accessAfterEmail(access, sent).actionLink, LINK);
});
test("si el email se envía se deja de mostrar el enlace anterior reemplazado por Auth", async () => {
  const f = fixture();
  const access = await createEmployeeAccess(f.ports, f.employee.id);
  const sent = await sendEmployeeInvitationEmail(f.ports, f.employee.id);
  assert.equal(sent.message, "Invitación enviada correctamente.");
  assert.equal(sent.emailState, "sent");
  assert.equal(accessAfterEmail(access, sent).actionLink, undefined);
});

test("fallo de transporte conserva enlace y muestra Error de envío sin reintento", async () => {
  const f = fixture();
  const access = await createEmployeeAccess(f.ports, f.employee.id);
  let attempts = 0;
  f.ports.sendEmail = async () => {
    attempts++;
    throw new Error("AuthApiError transport failure");
  };
  const result = await sendEmployeeInvitationEmail(f.ports, f.employee.id);
  assert.equal(attempts, 1);
  assert.equal(result.emailState, "error");
  assert.equal(accessAfterEmail(access, result).actionLink, LINK);
  assert.ok(!result.message?.includes("AuthApiError"));
});
test("si falla guardar estado no se oculta el éxito del envío ni se mantiene enlace reemplazado", async () => {
  const f = fixture();
  const access = await createEmployeeAccess(f.ports, f.employee.id);
  f.ports.recordEmail = async () => {
    throw new Error("Database internal error");
  };
  const result = await sendEmployeeInvitationEmail(f.ports, f.employee.id);
  assert.equal(result.emailSent, true);
  assert.equal(result.emailState, "sent");
  assert.equal(accessAfterEmail(access, result).actionLink, undefined);
  assert.ok(!JSON.stringify(result).includes("Database internal"));
});
