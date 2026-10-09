import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  requestEmployeeRecovery,
  recoveryAfterEmail,
  forgotPassword,
  whatsappRecovery,
  FORGOT_MESSAGE,
  EXPIRED_MESSAGE,
  RECOVERY_EMAIL_LIMIT,
  type RecoveryPorts,
} from "../src/features/auth/recovery";
import {
  openRecoverySession,
  saveRecoveryPassword,
  recoveryDestination,
  type RecoveryAuth,
} from "../src/features/auth/recovery-session";
import { createEmployeeAccess } from "../src/features/attendance/invitations";
import type { Employee } from "../src/features/attendance/types";
const LINK =
  "https://auth.example/verify?token=TEMPORARY_RECOVERY_SECRET&type=recovery";
function fixture() {
  const employee = {
    id: "e1",
    profile_id: "u1",
    full_name: "Micaela Ruiz",
    email: "micaela@example.com",
    phone: "948000222",
    active: true,
    invitation_email_status: "sent",
  } as Employee;
  const requests: unknown[] = [],
    audits: unknown[] = [];
  let role = "admin",
    activated = true,
    emailError: unknown,
    linkError: unknown;
  const ports: RecoveryPorts = {
    requireAdmin: async () => {
      if (role !== "admin") throw new Error("Denied");
    },
    employee: async () => employee,
    lookup: async () => ({
      id: "u1",
      role: "employee",
      activated,
      email_confirmed: true,
    }),
    siteOrigin: "https://city-recepcion.vercel.app",
    generateLink: async (params) => {
      requests.push(params);
      return { userId: "u1", actionLink: LINK, error: linkError };
    },
    sendEmail: async (email, redirectTo) => {
      requests.push({ email, redirectTo });
      return { error: emailError };
    },
    audit: async (id) => {
      audits.push({
        employee_id: id,
        performed_by: "admin-1",
        action: "employee_password_recovery_requested",
        reason: "Administrador solicitó recuperación de contraseña",
      });
    },
  };
  return {
    ports,
    employee,
    requests,
    audits,
    setRole: (value: string) => {
      role = value;
    },
    setActivated: (value: boolean) => {
      activated = value;
    },
    setEmailError: (value: unknown) => {
      emailError = value;
    },
    setLinkError: (value: unknown) => {
      linkError = value;
    },
  };
}
function authFixture() {
  const calls: unknown[] = [];
  let valid = true,
    exchangeError: unknown = null,
    updateError: unknown = null;
  const auth: RecoveryAuth = {
    setSession: async (value) => {
      calls.push({ session: value });
      return { error: exchangeError };
    },
    exchangeCodeForSession: async (value) => {
      calls.push({ code: value });
      return { error: exchangeError };
    },
    getUser: async () => ({
      data: { user: valid ? { id: "u1" } : null },
      error: null,
    }),
    updateUser: async (value) => {
      calls.push({ update: value });
      return { error: updateError };
    },
  };
  return {
    auth,
    calls,
    invalidate: () => {
      valid = false;
    },
    failExchange: () => {
      exchangeError = new Error("Email link is invalid or has expired");
    },
    failUpdate: (value: unknown) => {
      updateError = value;
    },
  };
}
test("activated account generates recovery with exact reset redirect, never invite", async () => {
  const f = fixture(),
    before = JSON.stringify(f.employee);
  const result = await requestEmployeeRecovery(f.ports, "e1", "link");
  assert.equal(result.actionLink, LINK);
  assert.deepEqual(f.requests, [
    {
      type: "recovery",
      email: "micaela@example.com",
      options: {
        redirectTo: "https://city-recepcion.vercel.app/auth/restablecer",
      },
    },
  ]);
  assert.equal(JSON.stringify(f.employee), before);
});
test("activated account invitation path never generates a new invitation", async () => {
  const f = fixture();
  const result = await createEmployeeAccess(
    {
      ...f.ports,
      recordEmail: async () => {},
      link: async () => {},
      generateLink: async () => {
        assert.fail("Activated account must never generate invite");
      },
    },
    "e1",
  );
  assert.equal(result.accountState, "activated");
});
for (const role of ["employee", "warehouse", "anon"])
  test(`${role} cannot request another employee's recovery or trigger mail/audit`, async () => {
    const f = fixture();
    f.setRole(role);
    assert.ok((await requestEmployeeRecovery(f.ports, "e1", "link")).error);
    assert.ok((await requestEmployeeRecovery(f.ports, "e1", "email")).error);
    assert.deepEqual(f.requests, []);
    assert.deepEqual(f.audits, []);
  });
for (const state of [
  "inactive",
  "archived",
  "unlinked",
  "pending",
  "mismatched",
  "administrative-account",
])
  test(`recovery rejects ${state} employee`, async () => {
    const f = fixture();
    if (state === "inactive") f.employee.active = false;
    if (state === "archived") f.employee.archived_at = "2026-10-09";
    if (state === "unlinked") f.employee.profile_id = null;
    if (state === "pending") f.setActivated(false);
    if (state === "mismatched") f.employee.profile_id = "different";
    if (state === "administrative-account")
      f.ports.lookup = async () => ({
        id: "u1",
        role: "admin",
        activated: true,
        email_confirmed: true,
      });
    assert.ok((await requestEmployeeRecovery(f.ports, "e1", "link")).error);
    assert.deepEqual(f.requests, []);
    assert.deepEqual(f.audits, []);
  });
test("audit records only safe metadata, never links or token data", async () => {
  const f = fixture();
  await requestEmployeeRecovery(f.ports, "e1", "link");
  assert.equal(f.audits.length, 1);
  assert.equal(
    (f.audits[0] as { action: string }).action,
    "employee_password_recovery_requested",
  );
  assert.doesNotMatch(
    JSON.stringify(f.audits),
    /TEMPORARY_RECOVERY_SECRET|token|password\":|action_link/,
  );
});
test("audit failure prevents credential generation", async () => {
  const f = fixture();
  f.ports.audit = async () => {
    throw new Error("DB error");
  };
  assert.ok((await requestEmployeeRecovery(f.ports, "e1", "link")).error);
  assert.deepEqual(f.requests, []);
});
test("WhatsApp uses registered Peruvian phone and the recovery link", () => {
  const f = fixture(),
    url = new URL(whatsappRecovery(f.employee, LINK));
  assert.equal(url.pathname, "/51948000222");
  assert.match(url.searchParams.get("text")!, /Hola Micaela/);
  assert.ok(url.searchParams.get("text")!.includes(LINK));
  assert.match(url.searchParams.get("text")!, /cambiar tu contraseña/);
});
test("email rate limit preserves generated link and activated employee, without invite or regeneration", async () => {
  const f = fixture(),
    before = JSON.stringify(f.employee);
  const link = await requestEmployeeRecovery(f.ports, "e1", "link");
  f.setEmailError({ status: 429, code: "over_email_send_rate_limit" });
  const result = recoveryAfterEmail(
    link,
    await requestEmployeeRecovery(f.ports, "e1", "email"),
  );
  assert.equal(result.actionLink, LINK);
  assert.equal(result.message, RECOVERY_EMAIL_LIMIT);
  assert.equal(JSON.stringify(f.employee), before);
  assert.equal(f.requests.length, 2);
});
test("successful official recovery email clears potentially superseded UI link", async () => {
  const f = fixture();
  const result = await requestEmployeeRecovery(f.ports, "e1", "email");
  assert.equal(result.emailSent, true);
  assert.deepEqual(f.requests, [
    {
      email: f.employee.email,
      redirectTo: "https://city-recepcion.vercel.app/auth/restablecer",
    },
  ]);
  assert.equal(
    recoveryAfterEmail({ actionLink: LINK }, result).actionLink,
    undefined,
  );
});
test("thrown rate limit also keeps a previously generated link", async () => {
  const f = fixture();
  f.ports.sendEmail = async () => {
    throw { status: 429 };
  };
  const result = recoveryAfterEmail(
    { actionLink: LINK },
    await requestEmployeeRecovery(f.ports, "e1", "email"),
  );
  assert.equal(result.actionLink, LINK);
  assert.equal(result.message, RECOVERY_EMAIL_LIMIT);
});
test("hash recovery establishes a session", async () => {
  const f = authFixture();
  assert.equal(
    await openRecoverySession(
      f.auth,
      "https://app.test/auth/restablecer#access_token=access&refresh_token=refresh&type=recovery",
    ),
    null,
  );
  assert.deepEqual(f.calls, [
    { session: { access_token: "access", refresh_token: "refresh" } },
  ]);
});
test("PKCE recovery exchanges code once", async () => {
  const f = authFixture();
  assert.equal(
    await openRecoverySession(
      f.auth,
      "https://app.test/auth/restablecer?code=pkce-code",
    ),
    null,
  );
  assert.deepEqual(f.calls, [{ code: "pkce-code" }]);
});
test("valid existing session permits password form", async () => {
  assert.equal(
    await openRecoverySession(
      authFixture().auth,
      "https://app.test/auth/restablecer",
    ),
    null,
  );
});
for (const suffix of [
  "#error_description=Email+link+is+invalid+or+has+expired",
  "?error=access_denied&error_code=otp_expired",
  "#access_token=only",
  "#access_token=a&refresh_token=r&type=invite",
])
  test(`invalid recovery URL is friendly and cannot fall back to old session: ${suffix}`, async () => {
    const f = authFixture();
    assert.equal(
      await openRecoverySession(
        f.auth,
        `https://app.test/auth/restablecer${suffix}`,
      ),
      EXPIRED_MESSAGE,
    );
    assert.deepEqual(f.calls, []);
  });
test("expired PKCE and missing session show Spanish error", async () => {
  const f = authFixture();
  f.failExchange();
  assert.equal(
    await openRecoverySession(
      f.auth,
      "https://app.test/auth/restablecer?code=old",
    ),
    EXPIRED_MESSAGE,
  );
  f.invalidate();
  assert.equal(
    await openRecoverySession(f.auth, "https://app.test/auth/restablecer"),
    EXPIRED_MESSAGE,
  );
});
test("new password is saved only with valid session and matching >=8 chars", async () => {
  const f = authFixture();
  assert.match(
    (await saveRecoveryPassword(f.auth, "short", "short"))!,
    /8 caracteres/,
  );
  assert.match(
    (await saveRecoveryPassword(f.auth, "new-secure-password", "different"))!,
    /no coinciden/,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(
    await saveRecoveryPassword(
      f.auth,
      "new-secure-password",
      "new-secure-password",
    ),
    null,
  );
  assert.deepEqual(f.calls, [{ update: { password: "new-secure-password" } }]);
  f.invalidate();
  assert.equal(
    await saveRecoveryPassword(
      f.auth,
      "new-secure-password",
      "new-secure-password",
    ),
    EXPIRED_MESSAGE,
  );
  assert.equal(f.calls.length, 1);
});
test("update provider errors never expose technical errors or password", async () => {
  const f = authFixture();
  f.failUpdate({
    code: "same_password",
    message: "secret sensitive diagnostic",
  });
  assert.equal(
    await saveRecoveryPassword(f.auth, "test-password", "test-password"),
    "Elige una contraseña diferente a la actual.",
  );
  f.failUpdate({ code: "session_not_found" });
  assert.equal(
    await saveRecoveryPassword(f.auth, "test-password", "test-password"),
    EXPIRED_MESSAGE,
  );
});
test("employee redirects to attendance without trusting user metadata", () => {
  assert.equal(recoveryDestination("employee"), "/asistencia");
  assert.equal(recoveryDestination("admin"), "/");
});
test("forgot responses for sent/missing/limits/throws/invalid email are indistinguishable", async () => {
  for (const error of [
    undefined,
    { code: "user_not_found" },
    { status: 429 },
    new Error("mail error"),
  ]) {
    assert.equal(
      await forgotPassword(
        "test@example.com",
        "http://localhost:3000",
        async (_email, redirectTo) => {
          assert.equal(redirectTo, "http://localhost:3000/auth/restablecer");
          if (error instanceof Error) throw error;
          return { error };
        },
      ),
      FORGOT_MESSAGE,
    );
  }
  assert.equal(
    await forgotPassword("invalid", "http://localhost:3000", async () => {
      assert.fail("Invalid address should not trigger mail");
    }),
    FORGOT_MESSAGE,
  );
});
test("login includes recovery entry, secret adapter stays server-only, no logging/analytics", () => {
  assert.match(
    readFileSync("src/features/auth/components/login-form.tsx", "utf8"),
    /¿Olvidaste tu contraseña\?/,
  );
  const server = readFileSync("src/features/auth/recovery-server.ts", "utf8");
  assert.match(server, /import "server-only"/);
  assert.match(server, /attendanceSession\(true\)/);
  assert.match(server, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(server, /inviteUserByEmail/);
  for (const file of [
    "recovery.ts",
    "recovery-session.ts",
    "recovery-server.ts",
    "recovery-actions.ts",
    "components/reset-password-form.tsx",
  ]) {
    assert.doesNotMatch(
      readFileSync(`src/features/auth/${file}`, "utf8"),
      /console\.|analytics|localStorage|sessionStorage/,
    );
  }
});
