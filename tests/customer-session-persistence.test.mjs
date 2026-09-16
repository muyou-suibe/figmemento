import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createPersistentCustomerSession,
  hashOpaqueCustomerSessionToken,
  lookupPersistentCustomerSession,
  revokePersistentCustomerSession,
} from "../app/application/customer-auth-session-persistence.server.ts";
import { readCustomerAuthSessionId, customerAuthCookieName } from "../app/server/customer-auth-http.server.ts";
import { LocalPersistentCustomerSessionRepository } from "../app/infrastructure/local-commerce/local-customer-session-repository.server.ts";
import { LocalPersistentSupabaseAdapter } from "../app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { sha256Text, validateMigrationManifest } from "../app/application/local-commerce-migration-ledger.ts";

const NOW = Date.parse("2026-09-11T00:00:00.000Z");

function identity(input, sessionId) {
  return {
    projectId: input.projectId,
    sessionId,
    customerId: input.customerId,
    ownerId: input.ownerId,
    subjectHash: input.subjectHash,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    revokedAt: null,
  };
}

function createDurableSessionPort() {
  const sessions = new Map();
  let sequence = 0;
  let revokeTail = Promise.resolve();
  const calls = [];
  return {
    sessions,
    calls,
    async createSession(input) {
      calls.push({ operation: "create", input: { ...input } });
      const key = `${input.projectId}:${input.sessionHash}`;
      if (sessions.has(key)) return { status: "unavailable", reason: "source_failure" };
      const value = identity(input, `session-${++sequence}`);
      sessions.set(key, { ...value, sessionHash: input.sessionHash });
      return { status: "found", value };
    },
    async lookupSession(input) {
      calls.push({ operation: "lookup", input: { ...input } });
      const record = sessions.get(`${input.projectId}:${input.sessionHash}`);
      if (!record) return { status: "not_found" };
      if (record.revokedAt) return { status: "revoked" };
      if (Date.parse(record.expiresAt) <= Date.parse(input.now)) return { status: "expired" };
      const value = { ...record };
      delete value.sessionHash;
      return { status: "found", value };
    },
    async revokeSession(input) {
      const previous = revokeTail;
      let release;
      revokeTail = new Promise((resolve) => { release = resolve; });
      await previous;
      calls.push({ operation: "revoke", input: { ...input } });
      try {
        const key = `${input.projectId}:${input.sessionHash}`;
        const record = sessions.get(key);
        if (!record) return { status: "not_found" };
        if (record.revokedAt) return { status: "revoked" };
        if (Date.parse(record.expiresAt) <= Date.parse(input.now)) return { status: "expired" };
        record.revokedAt = input.now;
        const value = { ...record };
        delete value.sessionHash;
        return { status: "found", value };
      } finally {
        release();
      }
    },
  };
}

function baseCreateInput(port, overrides = {}) {
  return {
    projectId: "figmemento-local-commerce",
    ownerId: "owner-1",
    customerId: "customer-1",
    subjectHash: "s".repeat(64),
    port,
    nowMilliseconds: NOW,
    lifetimeMilliseconds: 60 * 60 * 1000,
    ...overrides,
  };
}

test("Task 3.2 creates a cryptographically opaque token while the port receives only its hash", async () => {
  const port = createDurableSessionPort();
  const created = await createPersistentCustomerSession(baseCreateInput(port));
  assert.equal(created.status, "found");
  if (created.status !== "found") return;
  assert.match(created.value.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(created.value.sessionToken, /[;=\s]/);
  assert.equal(created.value.session.projectId, "figmemento-local-commerce");
  assert.equal("sessionToken" in port.calls[0].input, false);
  assert.equal(port.calls[0].input.sessionHash, await hashOpaqueCustomerSessionToken(created.value.sessionToken));
  assert.doesNotMatch(JSON.stringify(port.calls), new RegExp(created.value.sessionToken));
  assert.doesNotMatch(JSON.stringify(created.value.session), /sessionHash|password|token/i);
});

test("Task 3.2 lookup hashes the opaque cookie token and recovers from durable state after memory is cleared", async () => {
  const port = createDurableSessionPort();
  const created = await createPersistentCustomerSession(baseCreateInput(port));
  assert.equal(created.status, "found");
  if (created.status !== "found") return;
  const token = created.value.sessionToken;
  let processMemory = { ignored: true };
  processMemory = null;
  const restored = await lookupPersistentCustomerSession({ projectId: "figmemento-local-commerce", sessionToken: token, nowMilliseconds: NOW + 1 }, port);
  assert.equal(restored.status, "found");
  assert.equal(restored.status === "found" && restored.value.customerId, "customer-1");
  assert.equal(processMemory, null);
});

test("Task 3.2 wrong tokens and cross-project lookups are non-enumerating", async () => {
  const port = createDurableSessionPort();
  const created = await createPersistentCustomerSession(baseCreateInput(port));
  assert.equal(created.status, "found");
  if (created.status !== "found") return;
  const token = created.value.sessionToken;
  const replacement = token.endsWith("A") ? "B" : "A";
  const wrongToken = `${token.slice(0, -1)}${replacement}`;
  assert.notEqual(wrongToken, token);
  assert.equal(wrongToken.length, token.length);
  assert.match(wrongToken, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(
    await lookupPersistentCustomerSession({ projectId: "figmemento-local-commerce", sessionToken: wrongToken, nowMilliseconds: NOW }, port),
    { status: "not_found" },
  );
  assert.deepEqual(
    await lookupPersistentCustomerSession({ projectId: "other-local-project", sessionToken: created.value.sessionToken, nowMilliseconds: NOW }, port),
    { status: "not_found" },
  );
});

test("Task 3.2 server time marks an expired session invalid at and after expiry", async () => {
  const port = createDurableSessionPort();
  const created = await createPersistentCustomerSession(baseCreateInput(port, { lifetimeMilliseconds: 1000 }));
  assert.equal(created.status, "found");
  if (created.status !== "found") return;
  assert.equal((await lookupPersistentCustomerSession({ projectId: created.value.session.projectId, sessionToken: created.value.sessionToken, nowMilliseconds: NOW + 999 }, port)).status, "found");
  assert.equal((await lookupPersistentCustomerSession({ projectId: created.value.session.projectId, sessionToken: created.value.sessionToken, nowMilliseconds: NOW + 1000 }, port)).status, "expired");
  assert.equal((await lookupPersistentCustomerSession({ projectId: created.value.session.projectId, sessionToken: created.value.sessionToken, nowMilliseconds: NOW + 1001 }, port)).status, "expired");
});

test("Task 3.2 revoke is durable and concurrent revoke has one success", async () => {
  const port = createDurableSessionPort();
  const created = await createPersistentCustomerSession(baseCreateInput(port));
  assert.equal(created.status, "found");
  if (created.status !== "found") return;
  const [first, second] = await Promise.all([
    revokePersistentCustomerSession({ projectId: created.value.session.projectId, sessionToken: created.value.sessionToken, nowMilliseconds: NOW + 10 }, port),
    revokePersistentCustomerSession({ projectId: created.value.session.projectId, sessionToken: created.value.sessionToken, nowMilliseconds: NOW + 11 }, port),
  ]);
  assert.deepEqual([first.status, second.status].sort(), ["found", "revoked"]);
  assert.equal((await lookupPersistentCustomerSession({ projectId: created.value.session.projectId, sessionToken: created.value.sessionToken, nowMilliseconds: NOW + 12 }, port)).status, "revoked");
});

test("Task 3.2 does not authorize from a cache when the durable authority is unavailable", async () => {
  const unavailable = {
    async lookupSession() { return { status: "unavailable", reason: "source_failure" }; },
    async revokeSession() { return { status: "unavailable", reason: "source_failure" }; },
    async createSession() { return { status: "unavailable", reason: "source_failure" }; },
  };
  const lookup = await lookupPersistentCustomerSession({ projectId: "figmemento-local-commerce", sessionToken: "A".repeat(43), nowMilliseconds: NOW }, unavailable);
  assert.deepEqual(lookup, { status: "unavailable", reason: "source_failure" });
  const revoke = await revokePersistentCustomerSession({ projectId: "figmemento-local-commerce", sessionToken: "A".repeat(43), nowMilliseconds: NOW }, unavailable);
  assert.deepEqual(revoke, { status: "unavailable", reason: "source_failure" });
  assert.deepEqual(await createPersistentCustomerSession(baseCreateInput(unavailable)), { status: "unavailable", reason: "source_failure" });
});

test("Task 3.2 preserves the existing cookie name and stores only the opaque token in its value", async () => {
  const port = createDurableSessionPort();
  const created = await createPersistentCustomerSession(baseCreateInput(port));
  assert.equal(created.status, "found");
  if (created.status !== "found") return;
  const request = new Request("http://localhost:3000/api/customer-auth/session", {
    headers: { cookie: `${customerAuthCookieName}=${encodeURIComponent(created.value.sessionToken)}` },
  });
  assert.equal(readCustomerAuthSessionId(request), created.value.sessionToken);
  assert.equal(customerAuthCookieName, "figmemento-local-customer-session");
});

test("Task 3.2 repository is project-bound and maps restricted RPC results without session hashes", async () => {
  const calls = [];
  const adapter = {
    async createCustomerSession(input) {
      calls.push({ operation: "create", input });
      return {
        status: "found",
        value: {
          status: "created",
          project_id: input.p_project_id,
          session_id: "session-1",
          customer_id: input.p_customer_id,
          owner_id: input.p_owner_id,
          subject_hash: input.p_subject_hash,
          created_at: input.p_created_at,
          expires_at: input.p_expires_at,
          revoked_at: null,
        },
      };
    },
    async lookupCustomerSession(input) {
      calls.push({ operation: "lookup", input });
      return { status: "found", value: { status: "not_found" } };
    },
    async revokeCustomerSession(input) {
      calls.push({ operation: "revoke", input });
      return { status: "found", value: { status: "revoked" } };
    },
  };
  const repository = new LocalPersistentCustomerSessionRepository(adapter, "figmemento-local-commerce");
  assert.equal((await repository.createSession({
    projectId: "other-project",
    ownerId: "owner-1",
    customerId: "customer-1",
    subjectHash: "s".repeat(64),
    sessionHash: "a".repeat(64),
    issuedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 1000).toISOString(),
  })).status, "unavailable");
  const created = await repository.createSession({
    projectId: "figmemento-local-commerce",
    ownerId: "owner-1",
    customerId: "customer-1",
    subjectHash: "s".repeat(64),
    sessionHash: "a".repeat(64),
    issuedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 1000).toISOString(),
  });
  assert.equal(created.status, "found");
  assert.equal((await repository.lookupSession({ projectId: "figmemento-local-commerce", sessionHash: "a".repeat(64), now: new Date(NOW).toISOString() })).status, "not_found");
  assert.equal((await repository.revokeSession({ projectId: "figmemento-local-commerce", sessionHash: "a".repeat(64), now: new Date(NOW).toISOString() })).status, "revoked");
  assert.doesNotMatch(JSON.stringify(calls), /session_token|raw_token|token=/i);
});

test("Task 3.2 Supabase adapter allowlists the three session RPCs and never maps a raw token", async () => {
  const calls = [];
  const response = {
    status: "created",
    project_id: "figmemento-local-commerce",
    session_id: "session-1",
    customer_id: "customer-1",
    owner_id: "owner-1",
    subject_hash: "s".repeat(64),
    created_at: new Date(NOW).toISOString(),
    expires_at: new Date(NOW + 1000).toISOString(),
    revoked_at: null,
  };
  const client = {
    schema(name) {
      assert.equal(name, "local_commerce");
      return {
        async rpc(name, args) {
          calls.push({ name, args });
          return { data: response, error: null };
        },
      };
    },
  };
  const adapter = new LocalPersistentSupabaseAdapter(client);
  assert.equal((await adapter.createCustomerSession({
    p_project_id: "figmemento-local-commerce",
    p_owner_id: "owner-1",
    p_customer_id: "customer-1",
    p_subject_hash: "s".repeat(64),
    p_session_hash: "a".repeat(64),
    p_created_at: new Date(NOW).toISOString(),
    p_expires_at: new Date(NOW + 1000).toISOString(),
  })).status, "found");
  assert.equal((await adapter.lookupCustomerSession({ p_project_id: "figmemento-local-commerce", p_session_hash: "a".repeat(64), p_now: new Date(NOW).toISOString() })).status, "found");
  assert.equal((await adapter.revokeCustomerSession({ p_project_id: "figmemento-local-commerce", p_session_hash: "a".repeat(64), p_now: new Date(NOW).toISOString() })).status, "found");
  assert.deepEqual(calls.map((call) => call.name), ["create_customer_session", "lookup_customer_session", "revoke_customer_session"]);
  assert.doesNotMatch(JSON.stringify(calls), /session_token|raw_token/i);
});

test("Task 3.2 migration is ordered, hash-only at the RPC boundary, and service-role restricted", () => {
  const root = path.resolve(process.cwd());
  const migrationRoot = path.join(root, "local/commerce/migrations");
  const manifest = JSON.parse(readFileSync(path.join(migrationRoot, "manifest.json"), "utf8"));
  const migrationPath = path.join(migrationRoot, "0006_local-commerce-customer-session.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const entry = manifest.migrations.find((migration) => migration.version === 6);
  assert.deepEqual(validateMigrationManifest(manifest), { status: "valid" });
  assert.ok(manifest.schemaVersion >= 6);
  assert.deepEqual(manifest.migrations.slice(0, 6).map((migration) => migration.version), [1, 2, 3, 4, 5, 6]);
  assert.equal(sha256Text(sql), entry.checksum);
  assert.match(sql, /create or replace function local_commerce\.create_customer_session\(/i);
  assert.match(sql, /create or replace function local_commerce\.lookup_customer_session\(/i);
  assert.match(sql, /create or replace function local_commerce\.revoke_customer_session\(/i);
  assert.match(sql, /security definer[\s\S]*?set search_path = local_commerce, pg_catalog/i);
  assert.match(sql, /revoke all on function local_commerce\.lookup_customer_session\(text, text, timestamptz\)[\s\S]*?from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function local_commerce\.revoke_customer_session\(text, text, timestamptz\)[\s\S]*?to service_role/i);
  assert.doesNotMatch(sql, /create table|session_token|raw_token|signed_url|supabase\.auth|stripe|paypal|remote/i);
});
