import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeAdminSupportEmail,
  parseAdminSettingsActionKey,
  parseAdminSettingsPatch,
} from "../app/application/admin-settings-boundary.server.ts";
import { handleAdminSettings } from "../app/server/admin-settings-http.server.ts";
import { LocalPersistentSupabaseAdapter } from "../app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { readLocalPersistentDigitalDeliveryPolicy } from "../app/application/local-persistent-digital-delivery-policy.server.ts";
import { composeServerRuntimeConfiguration } from "../app/config/server-runtime-composition.server.ts";
import { catalogTestEnvironment } from "./fixtures/local-persistent-catalog.mjs";

const authorized = {
  async verifyAdminSession() {
    return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
  },
};
const unauthorized = {
  async verifyAdminSession() {
    return { status: "unauthorized" };
  },
};

function environment(overrides = {}) {
  return catalogTestEnvironment({
    APP_DEPLOYMENT_ENV: "test",
    NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "http://localhost:3000",
    CUSTOMER_AUTH_SOURCE: "local_persistent",
    CART_SOURCE: "local_persistent",
    LOCAL_CHECKOUT_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "local_persistent",
    LOCAL_ORDER_SOURCE: "local_persistent",
    LOCAL_PAYMENT_SOURCE: "local_persistent",
    LOCAL_FULFILLMENT_SOURCE: "local_persistent",
    LOCAL_TRACKING_SOURCE: "local_persistent",
    ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
    LOCAL_ORDER_CAPABILITY_SECRET: "ab".repeat(32),
    LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600",
    ...overrides,
  });
}

function settings(value = { supportEmail: null, version: 0, updatedAt: null }) {
  return { status: "found", value };
}

function repository(initial = { supportEmail: null, version: 0, updatedAt: null }) {
  let current = structuredClone(initial);
  let updates = 0;
  return {
    get updates() { return updates; },
    repository: {
      async read() { return settings(structuredClone(current)); },
      async update(input) {
        if (input.expectedVersion !== current.version) return { status: "conflict", reason: "version_mismatch" };
        updates += 1;
        current = { supportEmail: input.supportEmail, version: current.version + 1, updatedAt: "2026-09-17T00:00:00.000Z" };
        return { status: "found", replayed: false, value: structuredClone(current) };
      },
    },
  };
}

function request(method, body, headers = {}) {
  return new Request("http://localhost:3000/api/admin/settings", {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("H19 normalizes only the approved nullable supportEmail setting", () => {
  assert.deepEqual(normalizeAdminSupportEmail(null), { status: "valid", value: null });
  assert.deepEqual(normalizeAdminSupportEmail(" team@example.test "), { status: "valid", value: "team@example.test" });
  for (const value of ["", "hello@photogift.example", "bad", "team @example.test", "team\n@example.test", "x".repeat(255), 42, {}, []]) {
    assert.equal(normalizeAdminSupportEmail(value).status, "invalid", String(value));
  }
  assert.deepEqual(parseAdminSettingsActionKey(" h19-action-1 "), { status: "valid", value: "h19-action-1" });
  assert.equal(parseAdminSettingsActionKey(null).status, "invalid");
});

test("H19 rejects unknown fields, missing expectedVersion, and secret-shaped updates", () => {
  assert.equal(parseAdminSettingsPatch({ supportEmail: null }).status, "invalid");
  const unknown = parseAdminSettingsPatch({ expectedVersion: 0, supportEmail: null, ADMIN_PASSWORD: "secret" });
  assert.equal(unknown.status, "invalid");
  assert.match(JSON.stringify(unknown), /not editable|unknown_field/);
  for (const key of ["serviceRoleKey", "markerDigest", "provider", "brandName", "siteOrigin"]) {
    assert.equal(parseAdminSettingsPatch({ expectedVersion: 0, supportEmail: null, [key]: "x" }).status, "invalid");
  }
});

test("H19 HTTP verifies Admin before constructing persistent settings", async () => {
  let constructed = 0;
  const result = await handleAdminSettings(request("GET"), {
    environment: environment({ ADMIN_ACCEPTANCE_SOURCE: "local_fake" }),
    verifier: unauthorized,
    createRepository: async () => {
      constructed += 1;
      throw new Error("unauthorized source construction");
    },
  });
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { status: "unauthorized" });
  assert.equal(constructed, 0);
});

test("H19 HTTP exposes safe read projection and persists a CAS update", async () => {
  const fake = repository();
  const dependencies = { environment: environment(), verifier: authorized, createRepository: async () => ({ status: "ready", repository: fake.repository }) };
  const read = await handleAdminSettings(request("GET"), dependencies);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.equal(readBody.status, "found");
  assert.deepEqual(readBody.value.settings, { supportEmail: null, version: 0, updatedAt: null });
  assert.equal(readBody.value.readOnly.brandName, "FigMemento");
  assert.deepEqual(readBody.value.readOnly.digitalDeliveryPolicy, readLocalPersistentDigitalDeliveryPolicy());
  assert.doesNotMatch(JSON.stringify(readBody), /projectId|marker|service.?role|password|secret|credential/i);

  const update = await handleAdminSettings(request("PATCH", { expectedVersion: 0, supportEmail: "team@example.test" }, {
    origin: "http://localhost:3000",
    "sec-fetch-site": "same-origin",
    "idempotency-key": "h19-test-1",
  }), dependencies);
  assert.equal(update.status, 200);
  const updateBody = await update.json();
  assert.equal(updateBody.status, "updated");
  assert.equal(updateBody.value.settings.supportEmail, "team@example.test");
  assert.equal(updateBody.value.settings.version, 1);
  assert.equal(fake.updates, 1);
});

test("H19 read-only projection uses the canonical Digital Delivery policy and K08 provider state", async () => {
  async function readWith(overrides = {}) {
    const dependencies = {
      environment: environment(overrides),
      verifier: authorized,
      createRepository: async () => ({ status: "ready", repository: repository().repository }),
    };
    const response = await handleAdminSettings(request("GET"), dependencies);
    assert.equal(response.status, 200);
    return (await response.json()).value.readOnly;
  }

  const withoutCredentials = await readWith();
  const withCredentialPlaceholders = await readWith({
    STRIPE_SECRET_KEY: "placeholder-not-a-credential",
    RESEND_API_KEY: "placeholder-not-a-credential",
    PAYPAL_CLIENT_SECRET: "placeholder-not-a-credential",
  });
  const runtime = composeServerRuntimeConfiguration(environment());
  assert.equal(runtime.status, "ready");
  assert.deepEqual(withoutCredentials.digitalDeliveryPolicy, readLocalPersistentDigitalDeliveryPolicy());
  assert.equal(withoutCredentials.providerActivation, runtime.value.providers.activation);
  assert.deepEqual(withCredentialPlaceholders.digitalDeliveryPolicy, withoutCredentials.digitalDeliveryPolicy);
  assert.equal(withCredentialPlaceholders.providerActivation, withoutCredentials.providerActivation);
});

test("H19 HTTP has no private policy or provider authority literals", () => {
  const http = readFileSync("app/server/admin-settings-http.server.ts", "utf8");
  const page = readFileSync("app/admin/settings/page.tsx", "utf8");
  for (const source of [http, page]) {
    assert.match(source, /readLocalPersistentDigitalDeliveryPolicy\(\)/);
    assert.match(source, /providerActivation:\s*(?:runtime\.value\.providers\.activation)/);
    assert.doesNotMatch(source, /durationDays:\s*30|maxDownloads:\s*5/);
  }
});

test("H19 stale writers and changed same-key contexts are bounded conflicts", async () => {
  let state = { supportEmail: null, version: 0, updatedAt: null };
  const committed = new Map();
  const shared = {
    async read() { return settings(state); },
    async update(input) {
      const old = committed.get(input.actionKeyDigest);
      if (old) return old.contextDigest === input.contextDigest
        ? { status: "found", replayed: true, value: old.value }
        : { status: "conflict", reason: "idempotency_mismatch" };
      if (input.expectedVersion !== state.version) return { status: "conflict", reason: "version_mismatch" };
      state = { supportEmail: input.supportEmail, version: state.version + 1, updatedAt: "2026-09-17T00:00:00.000Z" };
      const result = { status: "found", replayed: false, value: state };
      committed.set(input.actionKeyDigest, { contextDigest: input.contextDigest, value: state });
      return result;
    },
  };
  const [first, second] = await Promise.all([
    shared.update({ actionKeyDigest: "a".repeat(64), contextDigest: "b".repeat(64), expectedVersion: 0, supportEmail: "a@example.test" }),
    shared.update({ actionKeyDigest: "c".repeat(64), contextDigest: "d".repeat(64), expectedVersion: 0, supportEmail: "b@example.test" }),
  ]);
  assert.equal([first.status, second.status].filter((value) => value === "found").length, 1);
  const replay = await shared.update({ actionKeyDigest: "a".repeat(64), contextDigest: "b".repeat(64), expectedVersion: 0, supportEmail: "a@example.test" });
  assert.deepEqual(replay, { status: "found", replayed: true, value: state });
  assert.equal((await shared.update({ actionKeyDigest: "a".repeat(64), contextDigest: "e".repeat(64), expectedVersion: 0, supportEmail: "changed@example.test" })).status, "conflict");
});

test("H19 adapter uses only the two allowlisted RPCs and safe output", async () => {
  const calls = [];
  const client = {
    schema(name) {
      assert.equal(name, "local_commerce");
      return {
        async rpc(name, args) {
          calls.push({ name, args });
          if (name === "admin_settings_read") return { error: null, data: { status: "found", value: { supportEmail: null, version: 0, updatedAt: null } } };
          if (name === "admin_settings_command") return { error: null, data: { status: "found", replayed: false, value: { supportEmail: "team@example.test", version: 1, updatedAt: "2026-09-17T00:00:00Z" } } };
          return { error: null, data: true };
        },
      };
    },
  };
  const adapter = new LocalPersistentSupabaseAdapter(client);
  assert.deepEqual(await adapter.readAdminSettings({ p_project_id: "project", p_marker_digest: "a".repeat(64) }), { status: "found", value: { supportEmail: null, version: 0, updatedAt: null } });
  assert.equal((await adapter.updateAdminSettings({ p_project_id: "project", p_marker_digest: "a".repeat(64), p_actor_kind: "admin", p_actor_id: "configured-admin", p_action_key_digest: "b".repeat(64), p_context_digest: "c".repeat(64), p_expected_version: 0, p_support_email: "team@example.test" })).status, "found");
  assert.deepEqual(calls.map((call) => call.name), ["admin_settings_read", "admin_settings_command"]);
  assert.doesNotMatch(JSON.stringify(calls), /password|secret|service.?role|markerDigest/i);
});

test("H19 migration is typed, project-scoped, CAS/audit capable, and service-role only", () => {
  const sql = readFileSync("local/commerce/migrations/0038_local-commerce-admin-settings.sql", "utf8");
  assert.match(sql, /create table if not exists local_commerce\.admin_settings/);
  assert.match(sql, /support_email text/);
  assert.match(sql, /constraint admin_settings_project_key unique \(project_id\)/);
  assert.match(sql, /create table if not exists local_commerce\.admin_settings_actions/);
  assert.match(sql, /action_key_digest/);
  assert.match(sql, /set search_path = local_commerce, pg_catalog/);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/);
  assert.doesNotMatch(sql, /STRIPE|PAYPAL|RESEND|SUPPLIER|shipping|coupon|provider_credentials/i);
  assert.doesNotMatch(sql, /raw_token|password_hash|service_role_key/i);
});
