import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  ServerConfigurationError,
  readCustomerAuthConfig,
} from "../app/config/server.ts";
import {
  customerAuthError,
  normalizeCustomerAuthCredentials,
} from "../app/domain/customer-auth.ts";
import { createCustomerAuthRuntime } from "../app/server/customer-auth-runtime.server.ts";
import { createLocalFakeCustomerAuthProvider } from "../app/application/customer-auth-local-provider.server.ts";
import {
  customerAuthCookieName,
  handleCustomerAuthCredentialsMutation,
  handleCustomerAuthSession,
  handleCustomerAuthSignOut,
} from "../app/server/customer-auth-http.server.ts";

import "./customer-auth-persistent-http.test.mjs";

test("Customer Auth configuration defaults to disabled and rejects unsafe sources", async () => {
  assert.deepEqual(readCustomerAuthConfig({}, "development"), { source: "disabled", runtimeMode: "development" });
  assert.equal(readCustomerAuthConfig({ CUSTOMER_AUTH_SOURCE: "local_fake" }, "development").source, "local_fake");
  assert.equal(readCustomerAuthConfig({ CUSTOMER_AUTH_SOURCE: "local_fake" }, "test").source, "local_fake");
  assert.throws(() => readCustomerAuthConfig({ CUSTOMER_AUTH_SOURCE: "local_fake" }, "production"), ServerConfigurationError);
  assert.throws(() => readCustomerAuthConfig({ CUSTOMER_AUTH_SOURCE: "local_fake" }, "unknown-runtime"), ServerConfigurationError);
  assert.throws(() => readCustomerAuthConfig({ CUSTOMER_AUTH_SOURCE: "other" }, "test"), ServerConfigurationError);
  const disabled = createCustomerAuthRuntime({}, "development");
  assert.equal(disabled.source, "disabled");
  const unavailable = await disabled.provider.signIn({ email: "member@example.com", password: "throwaway" });
  assert.equal(unavailable.status, "error");
  assert.equal(unavailable.error.code, "AUTH_UNAVAILABLE");
});

test("Customer Auth contract exposes only safe identity/session fields and bounded credentials", () => {
  assert.deepEqual(Object.keys({ id: "opaque", email: "member@example.com" }).sort(), ["email", "id"]);
  const credentials = normalizeCustomerAuthCredentials({ email: "  MEMBER@Example.com ", password: "throwaway" });
  assert.equal(credentials.status, "ok");
  assert.deepEqual(credentials.status === "ok" ? credentials.value : null, { email: "member@example.com", password: "throwaway" });
  for (const invalid of [null, {}, { email: "bad", password: "throwaway" }, { email: "member@example.com", password: "" }, { email: "member@example.com", password: "x".repeat(1025) }]) {
    assert.equal(normalizeCustomerAuthCredentials(invalid).status, "error");
  }
  const codes = ["INVALID_REQUEST", "INVALID_CREDENTIALS", "EMAIL_ALREADY_REGISTERED", "INVALID_EMAIL", "NOT_AUTHENTICATED", "AUTH_UNAVAILABLE", "RATE_LIMITED", "PROVIDER_FAILURE"];
  for (const code of codes) {
    const error = customerAuthError(code);
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /password|token|jwt|secret|provider detail/i);
  }
});

test("local fake provider normalizes email, creates opaque sessions, and never returns password", async () => {
  let id = 0;
  const provider = createLocalFakeCustomerAuthProvider({
    nowMilliseconds: () => 1_700_000_000_000,
    randomId: () => `opaque-random-${++id}`,
  });
  const created = await provider.signUp({ email: "  Demo@Example.com ", password: "local-only-password" });
  assert.equal(created.status, "ok");
  assert.equal(created.value.session.customer.email, "demo@example.com");
  assert.match(created.value.sessionId, /^opaque-random-/);
  const serialized = JSON.stringify(created);
  assert.doesNotMatch(serialized, /local-only-password/);
  assert.doesNotMatch(JSON.stringify(created.value.session), /password|token|jwt/i);
  const duplicate = await provider.signUp({ email: "DEMO@example.com", password: "another-password" });
  assert.equal(duplicate.status, "error");
  assert.equal(duplicate.error.code, "EMAIL_ALREADY_REGISTERED");
});

test("local fake provider signs in, reads sessions, rejects credentials, and revokes sessions", async () => {
  const provider = createLocalFakeCustomerAuthProvider({ randomId: (() => { let id = 0; return () => `session-${++id}`; })() });
  const created = await provider.signUp({ email: "member@example.com", password: "local-only-password" });
  assert.equal(created.status, "ok");
  const invalid = await provider.signIn({ email: "member@example.com", password: "wrong-password" });
  assert.equal(invalid.status, "error");
  assert.equal(invalid.error.code, "INVALID_CREDENTIALS");
  const signedIn = await provider.signIn({ email: " MEMBER@example.com ", password: "local-only-password" });
  assert.equal(signedIn.status, "ok");
  const session = await provider.getSession(signedIn.status === "ok" ? signedIn.value.sessionId : null);
  assert.equal(session.status, "ok");
  assert.equal(session.status === "ok" && session.value.authenticated, true);
  const sessionId = signedIn.status === "ok" ? signedIn.value.sessionId : null;
  await provider.signOut(sessionId);
  const revoked = await provider.getSession(sessionId);
  assert.equal(revoked.status, "ok");
  assert.equal(revoked.status === "ok" && revoked.value.authenticated, false);
});

test("local fake sessions expire and remain process-local", async () => {
  let now = 1_700_000_000_000;
  const provider = createLocalFakeCustomerAuthProvider({
    nowMilliseconds: () => now,
    randomId: () => "opaque-expiring-session",
  });
  const created = await provider.signUp({ email: "expiry@example.com", password: "throwaway" });
  assert.equal(created.status, "ok");
  now += 60 * 60 * 24 * 7 * 1000 + 1;
  const expired = await provider.getSession(created.status === "ok" ? created.value.sessionId : null);
  assert.equal(expired.status, "ok");
  assert.equal(expired.status === "ok" && expired.value.authenticated, false);
});

const testProvider = createLocalFakeCustomerAuthProvider();
const testRuntime = () => ({ provider: testProvider, runtimeMode: "test", source: "local_fake" });

function sameOriginRequest(path, init = {}) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...(init.headers ?? {}),
    },
  });
}

test("HTTP routes set only the isolated customer cookie and return safe session JSON", async () => {
  const created = await handleCustomerAuthCredentialsMutation(
    sameOriginRequest("/api/customer-auth/sign-up", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "photogift-admin-session=admin-value; photogift-guest-draft-owner=guest-value",
      },
      body: JSON.stringify({ email: "route@example.com", password: "local-only-password" }),
    }),
    "signUp",
    testRuntime,
  );
  assert.equal(created.status, 200);
  const setCookie = created.headers.get("set-cookie");
  assert.ok(setCookie?.startsWith(`${customerAuthCookieName}=`));
  assert.match(setCookie, /; Path=\//);
  assert.match(setCookie, /; HttpOnly/);
  assert.match(setCookie, /; SameSite=Lax/);
  assert.doesNotMatch(setCookie, /; Domain=/i);
  assert.doesNotMatch(setCookie, /photogift-admin-session|photogift-guest-draft-owner|route@example.com|local-only-password/i);

  const body = await created.json();
  assert.equal(body.authenticated, true);
  assert.equal("sessionId" in body, false);
  assert.doesNotMatch(JSON.stringify(body), /password|token|jwt/i);

  const sessionCookie = setCookie.split(";", 1)[0];
  const session = await handleCustomerAuthSession(new Request("http://localhost:3000/api/customer-auth/session", { headers: { cookie: sessionCookie } }), testRuntime);
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, true);

  const signedOut = await handleCustomerAuthSignOut(sameOriginRequest("/api/customer-auth/sign-out", { method: "POST", headers: { cookie: sessionCookie } }), testRuntime);
  assert.equal(signedOut.status, 200);
  const clearedCookie = signedOut.headers.get("set-cookie") ?? "";
  assert.match(clearedCookie, new RegExp(`^${customerAuthCookieName}=`));
  assert.match(clearedCookie, /; Path=\//);
  assert.match(clearedCookie, /; Max-Age=0/);
  assert.match(clearedCookie, /; HttpOnly/);
  assert.match(clearedCookie, /; SameSite=Lax/);
  assert.doesNotMatch(clearedCookie, /; Domain=/i);
  assert.doesNotMatch(clearedCookie, /photogift-admin-session|photogift-guest-draft-owner/);
});

test("customer mutation routes reject missing, invalid, cross-origin, and attacker origins before provider mutation", async () => {
  const payload = JSON.stringify({ email: "origin@example.com", password: "local-only-password" });
  const rejectedRequests = [
    new Request("http://localhost:3000/api/customer-auth/sign-up", { method: "POST", headers: { "content-type": "application/json" }, body: payload }),
    new Request("http://localhost:3000/api/customer-auth/sign-up", { method: "POST", headers: { "content-type": "application/json", origin: "not-an-origin" }, body: payload }),
    new Request("http://localhost:3000/api/customer-auth/sign-up", { method: "POST", headers: { "content-type": "application/json", origin: "https://other.example" }, body: payload }),
    new Request("http://localhost:3000/api/customer-auth/sign-up", { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: payload }),
    new Request("http://localhost:3000/api/customer-auth/sign-up", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", "sec-fetch-site": "cross-site" }, body: payload }),
    new Request("http://localhost:3000/api/customer-auth/sign-up", { method: "POST", headers: { "content-type": "application/json", host: "attacker.example" }, body: payload }),
    new Request("http://localhost:3000/api/customer-auth/sign-up", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-host": "attacker.example" }, body: payload }),
    new Request("http://localhost:3000/api/customer-auth/sign-in", { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: payload }),
    new Request("http://localhost:3000/api/customer-auth/sign-out", { method: "POST", headers: { origin: "https://attacker.example" } }),
  ];
  for (const request of rejectedRequests) {
    const response = request.url.endsWith("sign-in")
      ? await handleCustomerAuthCredentialsMutation(request, "signIn", testRuntime)
      : request.url.endsWith("sign-out")
        ? await handleCustomerAuthSignOut(request, testRuntime)
        : await handleCustomerAuthCredentialsMutation(request, "signUp", testRuntime);
    assert.equal(response.status, 403);
  }

  const accepted = await handleCustomerAuthCredentialsMutation(
    sameOriginRequest("/api/customer-auth/sign-up", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    }),
    "signUp",
    testRuntime,
  );
  assert.equal(accepted.status, 200, "rejected requests must not mutate provider state");
});

test("customer auth exposes only the approved HTTP surface", async () => {
  const routeFiles = ["sign-up", "sign-in", "sign-out", "session"];
  await Promise.all(routeFiles.map((route) => access(new URL(`../app/api/customer-auth/${route}/route.ts`, import.meta.url))));
  for (const forbiddenRoute of ["callback", "otp", "magic-link", "reset-password", "password-reset", "verify-email"]) {
    await assert.rejects(access(new URL(`../app/api/customer-auth/${forbiddenRoute}/route.ts`, import.meta.url)));
  }
  const signOutSource = await readFile(new URL("../app/api/customer-auth/sign-out/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(signOutSource, /export\s+async\s+function\s+GET/);
});

test("Account UI exposes only the approved identity workflow", async () => {
  const [navigation, account, signIn, signUp, form] = await Promise.all([
    readFile(new URL("../app/storefront/CatalogShellNavigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/sign-in/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/sign-up/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/CustomerAuthForm.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(navigation, /href="\/account"/);
  assert.match(account, /href="\/account\/sign-in"/);
  assert.match(account, /href="\/account\/sign-up"/);
  assert.match(form, /autoComplete/);
  assert.match(form, /Email/);
  assert.match(form, /Password/);
  assert.match(form, /disabled=\{loading\}/);
  assert.match(form, /role="alert"/);
  assert.match(form, /method: "POST"/);
  assert.match(form, /\/api\/customer-auth\//);
  assert.match(account, /CustomerSignOutButton/);
  assert.doesNotMatch(`${signIn}\n${signUp}\n${form}`, /Google|OAuth|magic link|Forgot password|OTP/i);
  assert.doesNotMatch(account, /href="\/(orders|wishlist|addresses|payments|profile)/i);
  const styles = await readFile(new URL("../app/account/account.module.css", import.meta.url), "utf8");
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("customer-auth implementation does not couple to Supabase Auth or guest/order ownership", async () => {
  const paths = [
    "../app/domain/customer-auth.ts",
    "../app/application/customer-auth-provider.ts",
    "../app/application/customer-auth-local-provider.server.ts",
    "../app/server/customer-auth-runtime.server.ts",
    "../app/server/customer-auth-http.server.ts",
    "../app/api/customer-auth/sign-up/route.ts",
    "../app/api/customer-auth/sign-in/route.ts",
    "../app/api/customer-auth/sign-out/route.ts",
    "../app/api/customer-auth/session/route.ts",
    "../app/account/CustomerAuthForm.tsx",
  ];
  const source = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /supabase\.auth|signInWithPassword|signInWithOAuth|verifyOtp|resetPasswordForEmail/i);
  assert.doesNotMatch(source, /photogift-admin-session|photogift-guest-draft-owner|CustomerUpload|order_items|customization/i);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/i);
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /Object\.(keys|values|entries)\(process\.env\)|JSON\.stringify\(process\.env\)/);
  assert.doesNotMatch(source, /fetch\([`"']https?:\/\//i);
});

test("enabled Account/Auth branches remain provider-neutral and safe without a remote provider", async () => {
  const [account, signIn, signUp, form] = await Promise.all([
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/sign-in/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/sign-up/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/CustomerAuthForm.tsx", import.meta.url), "utf8"),
  ]);
  const source = `${account}\n${signIn}\n${signUp}\n${form}`;
  assert.match(source, /source === "local_fake"/);
  assert.match(source, /Create a local development account/);
  assert.match(source, /process memory/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /window\.location\.assign\("\/account"\)/);
  assert.doesNotMatch(source, /href="\/(orders|wishlist|addresses|payments|profile)/i);
});
