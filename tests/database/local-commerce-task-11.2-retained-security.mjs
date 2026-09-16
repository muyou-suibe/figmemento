// Read-mostly retained runtime security gate; the sole synthetic Storage probe
// is deleted before success and creates no commerce-domain state.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";

assert.deepEqual(process.argv.slice(2), ["--confirm-retained-security-probe"]);
const root = path.resolve(".");
const workdir = path.join(root, "local", "commerce");
const projectId = "figmemento-local-commerce";
const marker = JSON.parse(readFileSync(path.join(workdir, "runtime", "project-marker.json"), "utf8"));
const markerDigest = sha256Text(JSON.stringify(marker));
function command(binary, args, input) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, (result.stderr || "command failed").split("\n")[0]);
  return result.stdout.trim();
}
const ids = command("docker", ["ps", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const inspected = ids.length ? JSON.parse(command("docker", ["inspect", ...ids])) : [];
const db = inspected.filter((container) => container.Name === "/supabase_db_figmemento-local-commerce"
  && container.Config?.Labels?.["com.supabase.cli.workdir"] === workdir && container.State?.Running === true);
assert.equal(db.length, 1);
const sql = (query) => command("docker", ["exec", "-i", db[0].Id, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${markerDigest}');`), "t");
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "37");
assert.equal(sql("select public from storage.buckets where id='local-commerce-private';"), "f");
assert.equal(sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='local_commerce' and c.relkind='r' and not c.relrowsecurity;`), "0");
for (const role of ["anon", "authenticated"]) {
  assert.equal(sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='local_commerce' and c.relkind='r' and has_table_privilege('${role}',c.oid,'select,insert,update,delete');`), "0");
}

const stack = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));
const roleHeaders = (key) => ({ apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", "content-profile": "local_commerce" });
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwtBody = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "authenticated", aud: "authenticated", sub: randomUUID(), exp: Math.floor(Date.now() / 1000) + 300 })}`;
const authenticatedKey = `${jwtBody}.${createHmac("sha256", stack.JWT_SECRET).update(jwtBody).digest("base64url")}`;
for (const key of [stack.ANON_KEY, authenticatedKey]) {
  for (const [method, body] of [["GET", undefined], ["POST", { project_id: projectId }], ["PATCH", { lifecycle: "active" }], ["DELETE", undefined]]) {
    const response = await fetch(`${stack.API_URL}/rest/v1/catalog_products?id=eq.${randomUUID()}`, { method, headers: roleHeaders(key),
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5_000) });
    assert.ok([401, 403, 404].includes(response.status) || (method === "GET" && response.status === 200 && (await response.json()).length === 0), `${method}:${response.status}`);
  }
}
const identity = { p_project_id: projectId, p_marker_digest: markerDigest };
const rpc = async (key, body) => fetch(`${stack.API_URL}/rest/v1/rpc/verify_project_identity`, { method: "POST", headers: roleHeaders(key), body: JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
for (const key of [stack.ANON_KEY, authenticatedKey]) assert.ok([401, 403].includes((await rpc(key, identity)).status));
assert.deepEqual(await (await rpc(stack.SERVICE_ROLE_KEY, identity)).json(), true);
assert.deepEqual(await (await rpc(stack.SERVICE_ROLE_KEY, { ...identity, p_project_id: "wrong-project" })).json(), false);
assert.deepEqual(await (await rpc(stack.SERVICE_ROLE_KEY, { ...identity, p_marker_digest: "0".repeat(64) })).json(), false);

const objectName = `${projectId}/security/task-11.2-${randomUUID()}.bin`;
const anonymousUpload = await fetch(`${stack.API_URL}/storage/v1/object/local-commerce-private/${objectName}`, { method: "POST", headers: roleHeaders(stack.ANON_KEY), body: Buffer.from("denied"), signal: AbortSignal.timeout(5_000) });
assert.ok([400, 401, 403].includes(anonymousUpload.status));
const serviceHeaders = { apikey: stack.SERVICE_ROLE_KEY, authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`, "content-type": "application/octet-stream" };
assert.ok((await fetch(`${stack.API_URL}/storage/v1/object/local-commerce-private/${objectName}`, { method: "POST", headers: serviceHeaders, body: Buffer.from("retained-security-probe"), signal: AbortSignal.timeout(5_000) })).status < 300);
const read = await fetch(`${stack.API_URL}/storage/v1/object/authenticated/local-commerce-private/${objectName}`, { headers: serviceHeaders, signal: AbortSignal.timeout(5_000) });
assert.equal(read.status, 200); assert.equal(await read.text(), "retained-security-probe");
assert.ok((await fetch(`${stack.API_URL}/storage/v1/object/local-commerce-private`, { method: "DELETE", headers: { ...serviceHeaders, "content-type": "application/json" }, body: JSON.stringify({ prefixes: [objectName] }), signal: AbortSignal.timeout(5_000) })).status < 300);
assert.equal(sql(`select count(*) from storage.objects where bucket_id='local-commerce-private' and name='${objectName}';`), "0");
console.info(JSON.stringify({ status: "PASS", projectId, ledger: 37, pending: 0, rls: "PASS", rpc: "PASS", privateStorage: "PASS", syntheticObjectRetained: false }));
