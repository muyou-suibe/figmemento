import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import "./customer-session-persistence.test.mjs";

import {
  authenticatePersistentCustomerAccount,
  registerPersistentCustomerAccount,
} from "../app/application/customer-account-persistence.server.ts";
import {
  hashCustomerPassword,
  isCustomerPasswordHash,
  verifyCustomerPassword,
} from "../app/application/customer-auth-password.server.ts";
import { LocalPersistentCustomerAccountRepository } from "../app/infrastructure/local-commerce/local-customer-account-repository.server.ts";
import { sha256Text, validateMigrationManifest } from "../app/application/local-commerce-migration-ledger.ts";

function createAccountStore() {
  const accounts = new Map();
  let tail = Promise.resolve();
  return {
    get size() { return accounts.size; },
    async register(input) {
      let release;
      const previous = tail;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        if (accounts.has(input.normalizedEmail)) return { status: "conflict", reason: "email_already_registered" };
        const value = {
          projectId: input.projectId,
          customerId: `customer-${accounts.size + 1}`,
          ownerId: `owner-${accounts.size + 1}`,
          normalizedEmail: input.normalizedEmail,
          passwordHash: input.passwordHash,
          accountStatus: "active",
        };
        accounts.set(input.normalizedEmail, value);
        return { status: "created", value };
      } finally {
        release();
      }
    },
    async findByEmail(input) {
      const value = accounts.get(input.normalizedEmail);
      return value ? { status: "found", value } : { status: "not_found" };
    },
  };
}

test("Task 3.1 uses a salted password hash and never returns credentials", async () => {
  const first = await hashCustomerPassword("local-only-password");
  const second = await hashCustomerPassword("local-only-password");
  assert.notEqual(first, second, "each account hash must use a fresh salt");
  assert.equal(isCustomerPasswordHash(first), true);
  assert.equal(await verifyCustomerPassword("local-only-password", first), true);
  assert.equal(await verifyCustomerPassword("wrong-password", first), false);
  assert.doesNotMatch(first, /local-only-password/);
});

test("Task 3.1 serializes concurrent normalized registrations to one identity", async () => {
  const store = createAccountStore();
  const results = await Promise.all([
    registerPersistentCustomerAccount({ email: " Member@Example.com ", password: "first-password" }, store, "local-test"),
    registerPersistentCustomerAccount({ email: "MEMBER@example.com", password: "second-password" }, store, "local-test"),
  ]);
  assert.equal(results.filter((result) => result.status === "ok").length, 1);
  assert.equal(results.filter((result) => result.status === "error" && result.error.code === "EMAIL_ALREADY_REGISTERED").length, 1);
  assert.equal(store.size, 1, "the port owns one normalized identity");
  assert.doesNotMatch(JSON.stringify(results), /first-password|second-password|passwordHash/i);
});

test("Task 3.1 duplicate registration cannot overwrite credentials and wrong password is non-enumerating", async () => {
  const store = createAccountStore();
  const created = await registerPersistentCustomerAccount({ email: "member@example.com", password: "correct-password" }, store, "local-test");
  const duplicate = await registerPersistentCustomerAccount({ email: " MEMBER@example.com ", password: "replacement-password" }, store, "local-test");
  assert.equal(created.status, "ok");
  assert.equal(duplicate.status, "error");
  assert.equal(duplicate.status === "error" && duplicate.error.code, "EMAIL_ALREADY_REGISTERED");
  assert.equal((await authenticatePersistentCustomerAccount({ email: "member@example.com", password: "correct-password" }, store, "local-test")).status, "ok");
  const wrong = await authenticatePersistentCustomerAccount({ email: "member@example.com", password: "replacement-password" }, store, "local-test");
  assert.deepEqual(wrong, { status: "error", error: { code: "INVALID_CREDENTIALS", message: "Unable to sign in with those details." } });
});

test("Task 3.1 persistent account repository is an async RPC/read adapter with fail-closed input", async () => {
  const calls = [];
  const adapter = {
    async registerCustomerAccount(input) {
      calls.push({ operation: "register", input });
      return { status: "found", value: { status: "created", customerId: "customer-1", ownerId: "owner-1", normalizedEmail: input.p_normalized_email } };
    },
    async readCustomerAccountByEmail(projectId, normalizedEmail) {
      calls.push({ operation: "read", projectId, normalizedEmail });
      return { status: "found", value: { projectId, customerId: "customer-1", ownerId: "owner-1", normalizedEmail, passwordHash: "x".repeat(32), accountStatus: "active" } };
    },
  };
  const repository = new LocalPersistentCustomerAccountRepository(adapter, "local-test");
  const registration = repository.register({ projectId: "local-test", normalizedEmail: "member@example.com", passwordHash: "x".repeat(32), subjectHash: "s".repeat(32) });
  assert.equal(registration instanceof Promise, true);
  assert.equal((await registration).status, "created");
  assert.equal((await repository.register({ projectId: "remote/project", normalizedEmail: "member@example.com", passwordHash: "x".repeat(32), subjectHash: "s".repeat(32) })).status, "unavailable");
  assert.equal((await repository.findByEmail({ projectId: "local-test", normalizedEmail: "member@example.com" })).status, "found");
  assert.equal(calls.length, 2);
});

test("Task 3.1 migration is ordered, local-only, and exposes only a restricted atomic account RPC", () => {
  const root = path.resolve(process.cwd());
  const migrationRoot = path.join(root, "local/commerce/migrations");
  const manifest = JSON.parse(readFileSync(path.join(migrationRoot, "manifest.json"), "utf8"));
  const migrationPath = path.join(migrationRoot, "0005_local-commerce-customer-auth.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const entry = manifest.migrations.find((migration) => migration.version === 5);
  assert.deepEqual(validateMigrationManifest(manifest), { status: "valid" });
  assert.equal(sha256Text(sql), entry.checksum);
  assert.match(sql, /create or replace function local_commerce\.register_customer_account\(\s*p_project_id text,\s*p_normalized_email text,\s*p_password_hash text,\s*p_subject_hash text\s*\)/i);
  assert.match(sql, /returns jsonb[\s\S]*?security definer[\s\S]*?set search_path = local_commerce, pg_catalog/i);
  assert.match(sql, /revoke all on function local_commerce\.register_customer_account\(text, text, text, text\)\s+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function local_commerce\.register_customer_account\(text, text, text, text\)\s+to service_role/i);
  assert.match(sql, /unique_violation[\s\S]*?status', 'conflict'/i);
  assert.doesNotMatch(sql, /create table|supabase\.auth|otp|google|stripe|paypal|remote/i);
});
