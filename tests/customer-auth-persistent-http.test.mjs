import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerAuthRuntime } from "../app/server/customer-auth-runtime.server.ts";
import { catalogTestEnvironment } from "./fixtures/local-persistent-catalog.mjs";
import {
  handleCustomerAuthCredentialsMutation,
  handleCustomerAuthSession,
  handleCustomerAuthSignOut,
} from "../app/server/customer-auth-http.server.ts";

const PROJECT_ID = "figmemento-local-commerce-test-run-auth3333";

function createPersistentAdapter() {
  const accountsByEmail = new Map();
  const accountsById = new Map();
  const sessions = new Map();
  let accountSequence = 0;
  let sessionSequence = 0;
  let failRevoke = false;

  function sessionProjection(record, status = "found") {
    return {
      status,
      project_id: PROJECT_ID,
      session_id: record.sessionId,
      customer_id: record.customerId,
      owner_id: record.ownerId,
      subject_hash: record.subjectHash,
      created_at: record.createdAt,
      expires_at: record.expiresAt,
      revoked_at: record.revokedAt,
    };
  }

  return {
    setFailRevoke(value) { failRevoke = value; },
    async registerCustomerAccount(input) {
      if (accountsByEmail.has(input.p_normalized_email)) {
        return { status: "found", value: { status: "conflict" } };
      }
      const customerId = `customer-${++accountSequence}`;
      const ownerId = `owner-${accountSequence}`;
      const account = {
        projectId: PROJECT_ID,
        customerId,
        ownerId,
        normalizedEmail: input.p_normalized_email,
        subjectHash: input.p_subject_hash,
        passwordHash: input.p_password_hash,
      };
      accountsByEmail.set(account.normalizedEmail, account);
      accountsById.set(account.customerId, account);
      return {
        status: "found",
        value: {
          status: "created",
          customerId,
          ownerId,
          normalizedEmail: account.normalizedEmail,
        },
      };
    },
    async readCustomerAccountByEmail(projectId, normalizedEmail) {
      const account = accountsByEmail.get(normalizedEmail);
      if (!account || projectId !== PROJECT_ID) return { status: "found", value: null };
      return {
        status: "found",
        value: {
          projectId: account.projectId,
          customerId: account.customerId,
          ownerId: account.ownerId,
          normalizedEmail: account.normalizedEmail,
          subjectHash: account.subjectHash,
          passwordHash: account.passwordHash,
          accountStatus: "active",
        },
      };
    },
    async readCustomerAccountById(projectId, customerId) {
      if (projectId !== PROJECT_ID) return { status: "found", value: null };
      const account = accountsById.get(customerId);
      return {
        status: "found",
        value: account
          ? {
              projectId: account.projectId,
              customerId: account.customerId,
              ownerId: account.ownerId,
              normalizedEmail: account.normalizedEmail,
            }
          : null,
      };
    },
    async createCustomerSession(input) {
      const account = accountsById.get(input.p_customer_id);
      if (!account || account.ownerId !== input.p_owner_id || account.subjectHash !== input.p_subject_hash) {
        return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      }
      if (sessions.has(input.p_session_hash)) {
        return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      }
      const record = {
        sessionId: `session-${++sessionSequence}`,
        customerId: account.customerId,
        ownerId: account.ownerId,
        subjectHash: account.subjectHash,
        sessionHash: input.p_session_hash,
        createdAt: input.p_created_at,
        expiresAt: input.p_expires_at,
        revokedAt: null,
      };
      sessions.set(record.sessionHash, record);
      return { status: "found", value: sessionProjection(record, "created") };
    },
    async lookupCustomerSession(input) {
      const record = sessions.get(input.p_session_hash);
      if (!record || input.p_project_id !== PROJECT_ID) return { status: "found", value: { status: "not_found" } };
      if (record.revokedAt) return { status: "found", value: { status: "revoked" } };
      if (Date.parse(record.expiresAt) <= Date.parse(input.p_now)) return { status: "found", value: { status: "expired" } };
      return { status: "found", value: sessionProjection(record) };
    },
    async revokeCustomerSession(input) {
      if (failRevoke) return { status: "unavailable", issues: [{ code: "local_authority_unavailable" }] };
      const record = sessions.get(input.p_session_hash);
      if (!record || input.p_project_id !== PROJECT_ID) return { status: "found", value: { status: "not_found" } };
      if (record.revokedAt) return { status: "found", value: { status: "revoked" } };
      if (Date.parse(record.expiresAt) <= Date.parse(input.p_now)) return { status: "found", value: { status: "expired" } };
      record.revokedAt = input.p_now;
      return { status: "found", value: sessionProjection(record) };
    },
  };
}

function createRuntime(adapter) {
  return createCustomerAuthRuntime(
    catalogTestEnvironment({
      LOCAL_COMMERCE_PROJECT_ID: PROJECT_ID,
      LOCAL_COMMERCE_RUN_ID: "run-auth3333",
      CUSTOMER_AUTH_SOURCE: "local_persistent",
      PHOTOGIFT_PRODUCT_SOURCE: "fixture",
    }),
    "test",
    {
      adapterFactory: async () => ({
        status: "ready",
        adapter,
        composition: { projectId: PROJECT_ID },
      }),
    },
  );
}

function sameOrigin(path, init = {}) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...(init.headers ?? {}),
    },
  });
}

async function signUp(adapter, email = "member@example.com") {
  const response = await handleCustomerAuthCredentialsMutation(
    sameOrigin("/api/customer-auth/sign-up", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "local-only-password" }),
    }),
    "signUp",
    () => createRuntime(adapter),
  );
  return { response, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? null };
}

test("Task 3.3 persistent sign-up creates a durable session and safe cookie", async () => {
  const adapter = createPersistentAdapter();
  const { response, cookie } = await signUp(adapter);
  assert.equal(response.status, 200);
  assert.ok(cookie);
  const body = await response.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.customerId, "customer-1");
  assert.equal(body.ownerId, "owner-1");
  assert.equal(body.sessionStatus, "active");
  assert.doesNotMatch(JSON.stringify(body), /passwordHash|sessionHash|sessionToken|token/i);
  assert.doesNotMatch(JSON.stringify(adapter), /local-only-password|sessionHash/i);
});

test("Task 3.3 duplicate sign-up and wrong sign-in use bounded credential errors", async () => {
  const adapter = createPersistentAdapter();
  assert.equal((await signUp(adapter)).response.status, 200);
  const duplicate = await signUp(adapter, " MEMBER@example.com ");
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.cookie, null);

  const wrong = await handleCustomerAuthCredentialsMutation(
    sameOrigin("/api/customer-auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "member@example.com", password: "wrong-password" }),
    }),
    "signIn",
    () => createRuntime(adapter),
  );
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).code, "INVALID_CREDENTIALS");
  assert.equal(wrong.headers.has("set-cookie"), false);
});

test("Task 3.3 sign-in and current-session recover from durable state", async () => {
  const adapter = createPersistentAdapter();
  const first = await signUp(adapter, "restart@example.com");
  const signedIn = await handleCustomerAuthCredentialsMutation(
    sameOrigin("/api/customer-auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "restart@example.com", password: "local-only-password" }),
    }),
    "signIn",
    () => createRuntime(adapter),
  );
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const current = await handleCustomerAuthSession(
    new Request("http://localhost:3000/api/customer-auth/session", { headers: { cookie } }),
    () => createRuntime(adapter),
  );
  assert.equal(current.status, 200);
  const body = await current.json();
  assert.equal(body.status, "ok");
  assert.equal(body.authenticated, true);
  assert.deepEqual(body.customer, { id: "customer-1", email: "restart@example.com" });
  assert.equal(body.customerId, "customer-1");
  assert.equal(body.ownerId, "owner-1");
  assert.equal(body.sessionStatus, "active");
  assert.match(body.issuedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(body.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(first.cookie);
});

test("Task 3.3 sign-out revokes durably before expiring the cookie", async () => {
  const adapter = createPersistentAdapter();
  const { cookie } = await signUp(adapter, "logout@example.com");
  assert.ok(cookie);
  const response = await handleCustomerAuthSignOut(
    sameOrigin("/api/customer-auth/sign-out", { method: "POST", headers: { cookie } }),
    () => createRuntime(adapter),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  const current = await handleCustomerAuthSession(
    new Request("http://localhost:3000/api/customer-auth/session", { headers: { cookie } }),
    () => createRuntime(adapter),
  );
  assert.deepEqual(await current.json(), { status: "ok", authenticated: false });
});

test("Task 3.3 revoke failure returns unavailable and does not claim logout", async () => {
  const adapter = createPersistentAdapter();
  const { cookie } = await signUp(adapter, "failure@example.com");
  assert.ok(cookie);
  adapter.setFailRevoke(true);
  const response = await handleCustomerAuthSignOut(
    sameOrigin("/api/customer-auth/sign-out", { method: "POST", headers: { cookie } }),
    () => createRuntime(adapter),
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "AUTH_UNAVAILABLE");
  assert.equal(response.headers.has("set-cookie"), false);
});

test("Task 3.3 exposes POST mutations and GET current-session only", async () => {
  const adapter = createPersistentAdapter();
  const getLogout = await handleCustomerAuthSignOut(
    new Request("http://localhost:3000/api/customer-auth/sign-out", { method: "GET" }),
    () => createRuntime(adapter),
  );
  assert.equal(getLogout.status, 405);
  const postSession = await handleCustomerAuthSession(
    sameOrigin("/api/customer-auth/session", { method: "POST" }),
    () => createRuntime(adapter),
  );
  assert.equal(postSession.status, 405);
});
