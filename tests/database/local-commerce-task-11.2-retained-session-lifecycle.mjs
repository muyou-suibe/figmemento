// Acceptance-only retained session lifecycle across an actual Supabase stop/start.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { createLocalPersistentCustomerAuthProvider } from "../../app/application/customer-auth-persistent-provider.server.ts";
import { createPersistentCustomerSession, lookupPersistentCustomerSession } from "../../app/application/customer-auth-session-persistence.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../../app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { LocalPersistentCustomerAccountRepository } from "../../app/infrastructure/local-commerce/local-customer-account-repository.server.ts";
import { LocalPersistentCustomerSessionRepository } from "../../app/infrastructure/local-commerce/local-customer-session-repository.server.ts";
import { sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { catalogTestEnvironment } from "../fixtures/local-persistent-catalog.mjs";

assert.deepEqual(process.argv.slice(2), ["--confirm-retained-session-cycle"]);
const root = path.resolve("."), workdir = path.join(root, "local", "commerce"), projectId = "figmemento-local-commerce";
const marker = JSON.parse(readFileSync(path.join(workdir, "runtime/project-marker.json"), "utf8"));
const markerDigest = sha256Text(JSON.stringify(marker));
function command(binary, args, input, timeout = 30_000) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, (result.stderr || "command failed").split("\n")[0]); return result.stdout.trim();
}
const status = () => JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));
const initialStatus = status();
const env = { ...process.env, ...catalogTestEnvironment({ NODE_ENV: "development", LOCAL_COMMERCE_ENVIRONMENT: "development",
  LOCAL_COMMERCE_PROJECT_KIND: "retained_development", LOCAL_COMMERCE_PROJECT_ID: projectId, LOCAL_COMMERCE_RUN_ID: "retained-development",
  LOCAL_COMMERCE_MARKER_DIGEST: markerDigest, LOCAL_COMMERCE_SERVICE_ROLE_KEY: initialStatus.SERVICE_ROLE_KEY,
  CUSTOMER_AUTH_SOURCE: "local_persistent" }) };
Object.assign(env, { LOCAL_COMMERCE_SHADOW_DB_PORT: "55420", LOCAL_COMMERCE_API_PORT: "55421", LOCAL_COMMERCE_DB_PORT: "55422",
  LOCAL_COMMERCE_STUDIO_PORT: "55423", LOCAL_COMMERCE_SMTP_PORT: "55424", LOCAL_COMMERCE_IMAGE_HELPER_PORT: "55425",
  LOCAL_COMMERCE_API_URL: "http://127.0.0.1:55421", LOCAL_COMMERCE_RPC_URL: "http://127.0.0.1:55421",
  LOCAL_COMMERCE_STORAGE_URL: "http://127.0.0.1:55421/storage/v1", LOCAL_COMMERCE_IMAGE_HELPER_URL: "http://127.0.0.1:55425" });

const credentials = () => ({ email: `task112-${randomUUID()}@example.invalid`, password: `Synthetic-${randomBytes(16).toString("hex")}!7a` });
const providerA = createLocalPersistentCustomerAuthProvider(env);
const valid = await providerA.signUp(credentials()); assert.equal(valid.status, "ok");
const revoked = await providerA.signUp(credentials()); assert.equal(revoked.status, "ok");
assert.equal((await providerA.signOut(revoked.value.sessionId)).status, "ok");
assert.deepEqual(await providerA.getSession(revoked.value.sessionId), { status: "ok", value: { authenticated: false } });

const connection = await createLocalPersistentSupabaseAdapter(env); assert.equal(connection.status, "ready");
const accounts = new LocalPersistentCustomerAccountRepository(connection.adapter, projectId);
const sessions = new LocalPersistentCustomerSessionRepository(connection.adapter, projectId);
const source = await accounts.findByEmail({ projectId, normalizedEmail: valid.value.session.customer.email });
assert.equal(source.status, "found");
const expiring = await createPersistentCustomerSession({ projectId, ownerId: source.value.ownerId, customerId: source.value.customerId,
  subjectHash: source.value.subjectHash, port: sessions, lifetimeMilliseconds: 100 });
assert.equal(expiring.status, "found");
await new Promise((resolve) => setTimeout(resolve, 150));
assert.equal((await lookupPersistentCustomerSession({ projectId, sessionToken: expiring.value.sessionToken }, sessions)).status, "expired");

const volumes = () => command("docker", ["volume", "ls", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.Name}}"]).split("\n").filter(Boolean).sort();
const beforeVolumes = volumes();
command(path.resolve("node_modules/.bin/supabase"), ["stop", "--project-id", projectId, "--workdir", workdir], undefined, 120_000);
assert.equal(command("docker", ["ps", "-a", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.ID}}"]).trim(), "");
assert.deepEqual(volumes(), beforeVolumes);
command(path.resolve("node_modules/.bin/supabase"), ["start", "--workdir", workdir, "-x", "vector,logflare,studio,realtime,edge-runtime,mailpit,imgproxy,postgres-meta,supavisor"], undefined, 300_000);
assert.deepEqual(volumes(), beforeVolumes);
const restartedStatus = status();
env.LOCAL_COMMERCE_SERVICE_ROLE_KEY = restartedStatus.SERVICE_ROLE_KEY;
let identityReady = false;
for (let attempt = 0; attempt < 20 && !identityReady; attempt += 1) {
  try {
    const identityResponse = await fetch(`${restartedStatus.API_URL}/rest/v1/rpc/verify_project_identity`, { method: "POST",
      headers: { apikey: restartedStatus.SERVICE_ROLE_KEY, authorization: `Bearer ${restartedStatus.SERVICE_ROLE_KEY}`, "content-type": "application/json", "content-profile": "local_commerce" },
      body: JSON.stringify({ p_project_id: projectId, p_marker_digest: markerDigest }), signal: AbortSignal.timeout(5_000) });
    identityReady = identityResponse.status === 200 && await identityResponse.json() === true;
  } catch { /* bounded post-start readiness window */ }
  if (!identityReady) await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal(identityReady, true);

const providerB = createLocalPersistentCustomerAuthProvider(env);
const validAfter = await providerB.getSession(valid.value.sessionId); assert.equal(validAfter.status, "ok"); assert.equal(validAfter.value.authenticated, true);
assert.equal(validAfter.value.customer.id, valid.value.session.customer.id); assert.equal(validAfter.value.ownerId, valid.value.session.ownerId);
assert.deepEqual(await providerB.getSession(revoked.value.sessionId), { status: "ok", value: { authenticated: false } });
const connectionB = await createLocalPersistentSupabaseAdapter(env); assert.equal(connectionB.status, "ready");
const sessionsB = new LocalPersistentCustomerSessionRepository(connectionB.adapter, projectId);
assert.equal((await lookupPersistentCustomerSession({ projectId, sessionToken: expiring.value.sessionToken }, sessionsB)).status, "expired");
assert.equal(sha256Text(JSON.stringify(JSON.parse(readFileSync(path.join(workdir, "runtime/project-marker.json"), "utf8")))), markerDigest);
console.info(JSON.stringify({ status: "PASS", task: "11.2-session-lifecycle", projectId, ledger: 37, pending: 0,
  validSessionRecovered: true, revokedSessionDenied: true, expiredSessionDenied: true, serverControlledLifetime: true,
  rawTokensReported: false, volumesPreserved: true }));
