import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { getSupportContactTextFromAuthority, resolveSupportContact } from "../../app/server/support-contact.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../../app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";

const root = process.cwd();

function readLocalEnvironment() {
  const environment = { ...process.env };
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    environment[match[1]] = value;
  }
  return environment;
}

async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (part) => part.toString(16).padStart(2, "0")).join("");
}

async function update(adapter, composition, expectedVersion, supportEmail, label) {
  const actionKeyDigest = await digest(`h19-support-acceptance:${label}:${crypto.randomUUID()}`);
  const contextDigest = await digest(JSON.stringify(["h19.set_support_email", supportEmail, expectedVersion]));
  const result = await adapter.updateAdminSettings({
    p_project_id: composition.projectId,
    p_marker_digest: composition.markerDigest,
    p_actor_kind: "admin",
    p_actor_id: "configured-admin",
    p_action_key_digest: actionKeyDigest,
    p_context_digest: contextDigest,
    p_expected_version: expectedVersion,
    p_support_email: supportEmail,
  });
  assert.equal(result.status, "found", `support update ${label} was unavailable`);
  assert.equal(result.value.status, "found", `support update ${label} was not committed`);
  return result.value.value;
}

function childProcessSupportRead(environment) {
  const script = [
    'import { resolveSupportContact } from "./app/server/support-contact.server.ts";',
    "const result = await resolveSupportContact();",
    "process.stdout.write(JSON.stringify(result));",
  ].join("\n");
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1_000_000,
  });
  assert.equal(child.status, 0, child.stderr || "support reader child failed");
  return JSON.parse(child.stdout);
}

test("H19 local_persistent support email is sole authority across null, set, and process restart", async () => {
  const environment = readLocalEnvironment();
  const connection = await createLocalPersistentSupabaseAdapter(environment);
  assert.equal(connection.status, "ready");
  const { adapter, composition } = connection;
  let current = (await adapter.readAdminSettings({
    p_project_id: composition.projectId,
    p_marker_digest: composition.markerDigest,
  }));
  assert.equal(current.status, "found");

  if (current.value.supportEmail !== null) {
    current = { status: "found", value: await update(adapter, composition, current.value.version, null, "normalize-before-cases") };
  }
  assert.equal(current.value.supportEmail, null);

  const conflictingEmail = "conflicting@example.test";
  const nullEnvironment = { ...environment, NEXT_PUBLIC_SUPPORT_EMAIL: conflictingEmail };
  const nullProjection = await resolveSupportContact(nullEnvironment);
  assert.deepEqual(nullProjection, { status: "persistent", supportEmail: null });
  const genericText = await getSupportContactTextFromAuthority(nullEnvironment);
  assert.match(genericText, /contact the support team/);
  assert.doesNotMatch(genericText, new RegExp(conflictingEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  current = { status: "found", value: await update(adapter, composition, current.value.version, "team@example.test", "set-team") };
  const teamEnvironment = { ...environment, NEXT_PUBLIC_SUPPORT_EMAIL: conflictingEmail };
  const teamProjection = await resolveSupportContact(teamEnvironment);
  assert.deepEqual(teamProjection, { status: "persistent", supportEmail: "team@example.test" });
  const teamText = await getSupportContactTextFromAuthority(teamEnvironment);
  assert.match(teamText, /team@example\.test/);
  assert.doesNotMatch(teamText, /conflicting@example\.test/);

  const afterRestart = childProcessSupportRead(teamEnvironment);
  assert.deepEqual(afterRestart, { status: "persistent", supportEmail: "team@example.test" });

  current = { status: "found", value: await update(adapter, composition, current.value.version, null, "clear-final") };
  assert.equal(current.value.supportEmail, null);
});
