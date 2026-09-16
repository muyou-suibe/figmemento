import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

assert.deepEqual(process.argv.slice(2), ["run-93f6c1a2", "--confirm-disposable"]);
assert.equal(process.env.TASK_11_4_EQUIVALENT_IDENTITY_VERIFIED, "1");

const run = "run-93f6c1a2";
const projectId = `figmemento-local-commerce-test-${run}`;
const root = path.resolve(".");
const workdir = path.join(root, "local/commerce/runtime/disposable", run);
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const serviceKey = process.env.LOCAL_COMMERCE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.LOCAL_COMMERCE_ACCEPTANCE_JWT_SECRET;
const databaseId = process.env.TASK_11_4_VERIFIED_DB_CONTAINER_ID;
assert.ok(serviceKey && jwtSecret && databaseId);
assert.equal(preparation.config.projectId, projectId);

function docker(args, input) {
  const result = spawnSync("docker", args, { cwd: root, input, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, (result.stderr || "bounded Docker command failed").split("\n")[0]);
  return result.stdout.trim();
}
const inspected = JSON.parse(docker(["inspect", databaseId]))[0];
assert.equal(inspected.Id, databaseId);
assert.equal(inspected.Config?.Labels?.["com.supabase.cli.workdir"], workdir);
assert.equal(inspected.State?.Running, true);
const sql = (query) => docker(["exec", "-i", databaseId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t");
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "37");

const tables = JSON.parse(sql(`select json_agg(json_build_object(
  'name',c.relname,'rls',c.relrowsecurity,
  'public',has_table_privilege('public',c.oid,'select,insert,update,delete'),
  'anon',has_table_privilege('anon',c.oid,'select,insert,update,delete'),
  'authenticated',has_table_privilege('authenticated',c.oid,'select,insert,update,delete'),
  'serviceRole',has_table_privilege('service_role',c.oid,'select,insert,update,delete')) order by c.relname)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='local_commerce' and c.relkind in ('r','p');`));
assert.ok(tables.length > 0);
for (const table of tables) {
  assert.equal(table.rls, true, `${table.name}: RLS disabled`);
  assert.equal(table.public, false, `${table.name}: PUBLIC table privilege`);
  assert.equal(table.anon, false, `${table.name}: anon table privilege`);
  assert.equal(table.authenticated, false, `${table.name}: authenticated table privilege`);
}

const policies = JSON.parse(sql(`select coalesce(json_agg(json_build_object('table',tablename,'name',policyname,'roles',roles) order by tablename,policyname),'[]'::json)
  from pg_policies where schemaname='local_commerce';`));
for (const policy of policies) {
  assert.deepEqual(policy.roles, ["service_role"], `${policy.table}.${policy.name}: browser policy`);
}

const functions = JSON.parse(sql(`select json_agg(json_build_object(
  'signature',p.oid::regprocedure::text,'securityDefiner',p.prosecdef,
  'searchPath',coalesce(array_to_string(p.proconfig,','),''),
  'public',has_function_privilege('public',p.oid,'execute'),
  'anon',has_function_privilege('anon',p.oid,'execute'),
  'authenticated',has_function_privilege('authenticated',p.oid,'execute'),
  'serviceRole',has_function_privilege('service_role',p.oid,'execute')) order by p.oid::regprocedure::text)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='local_commerce';`));
assert.ok(functions.length > 0);
for (const fn of functions) {
  assert.equal(fn.public, false, `${fn.signature}: PUBLIC execute`);
  assert.equal(fn.anon, false, `${fn.signature}: anon execute`);
  assert.equal(fn.authenticated, false, `${fn.signature}: authenticated execute`);
  if (fn.securityDefiner) assert.match(fn.searchPath.replaceAll(" ", ""), /search_path=(?:pg_catalog(?:,local_commerce)?|local_commerce,pg_catalog)/, `${fn.signature}: unsafe search_path`);
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const tokenFor = (payload) => {
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  return `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
};
const anonKey = tokenFor({ role: "anon", iss: "supabase", exp: Math.floor(Date.now() / 1000) + 300 });
const authenticated = tokenFor({ role: "authenticated", aud: "authenticated", sub: randomUUID(), exp: Math.floor(Date.now() / 1000) + 300 });
const api = preparation.config.endpoints.apiUrl;
const roleHeaders = (token) => ({ apikey: anonKey, authorization: `Bearer ${token}`, "accept-profile": "local_commerce", "content-profile": "local_commerce", "content-type": "application/json" });
const directResults = [];
for (const [role, token] of [["anon", anonKey], ["authenticated", authenticated]]) {
  for (const table of tables) {
    for (const [method, body] of [["GET", undefined], ["POST", {}], ["PATCH", {}], ["DELETE", undefined]]) {
      const response = await fetch(`${api}/rest/v1/${table.name}?limit=0`, { method, headers: roleHeaders(token), ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5_000) });
      const responseBody = await response.text();
      assert.ok([401, 403, 404].includes(response.status) || (method === "GET" && response.status === 200 && responseBody === "[]"), `${role} ${method} ${table.name}: ${response.status}`);
      directResults.push({ role, method, table: table.name, status: response.status });
    }
  }
}

const identityBody = { p_project_id: projectId, p_marker_digest: preparation.markerDigest };
for (const [role, token] of [["anon", anonKey], ["authenticated", authenticated]]) {
  const response = await fetch(`${api}/rest/v1/rpc/verify_project_identity`, { method: "POST", headers: roleHeaders(token), body: JSON.stringify(identityBody), signal: AbortSignal.timeout(5_000) });
  await response.arrayBuffer();
  assert.ok([401, 403].includes(response.status), `${role} restricted RPC: ${response.status}`);
}

const bucketPublic = sql("select public from storage.buckets where id='local-commerce-private';");
assert.equal(bucketPublic, "f");
const storagePolicies = JSON.parse(sql(`select coalesce(json_agg(json_build_object('table',tablename,'name',policyname,'roles',roles) order by tablename,policyname),'[]'::json)
  from pg_policies where schemaname='storage' and tablename in ('buckets','objects') and policyname like 'local_commerce%';`));
for (const policy of storagePolicies) assert.deepEqual(policy.roles, ["service_role"], `${policy.table}.${policy.name}: browser Storage policy`);
const objectName = `${projectId}/security/task-11.6-${randomUUID()}.bin`;
const missingObjectName = `${projectId}/security/task-11.6-missing-${randomUUID()}.bin`;
const probeBytes = "task-11.6-private-storage-probe";
const probeDigest = createHash("sha256").update(probeBytes).digest("hex");
const serviceStorageHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/octet-stream" };
const storageResults = [];
let cleanupStatus = null;
try {
  const serviceUpload = await fetch(`${api}/storage/v1/object/local-commerce-private/${objectName}`, { method: "POST", headers: serviceStorageHeaders, body: probeBytes, signal: AbortSignal.timeout(5_000) });
  assert.ok(serviceUpload.status < 300, `service Storage upload: ${serviceUpload.status}`);
  await serviceUpload.arrayBuffer();
  for (const [role, token] of [["unauthenticated", null], ["anon", anonKey], ["authenticated", authenticated]]) {
    const headers = token ? { apikey: anonKey, authorization: `Bearer ${token}` } : {};
    let existingReadStatus = null;
    let missingReadStatus = null;
    for (const [operation, url, options] of [
      ["list", `${api}/storage/v1/object/list/local-commerce-private`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ prefix: projectId, limit: 1 }) }],
      ["read-existing", `${api}/storage/v1/object/authenticated/local-commerce-private/${objectName}`, { method: "GET", headers }],
      ["read-missing", `${api}/storage/v1/object/authenticated/local-commerce-private/${missingObjectName}`, { method: "GET", headers }],
      ["overwrite", `${api}/storage/v1/object/local-commerce-private/${objectName}`, { method: "PUT", headers: { ...headers, "content-type": "application/octet-stream", "x-upsert": "true" }, body: "denied" }],
      ["delete", `${api}/storage/v1/object/local-commerce-private`, { method: "DELETE", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ prefixes: [objectName] }) }],
    ]) {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5_000) });
      const responseBody = await response.text();
      const emptyRlsResult = ["list", "delete"].includes(operation) && response.status === 200 && responseBody === "[]";
      assert.ok(emptyRlsResult || [400, 401, 403, 404].includes(response.status), `${role} Storage ${operation}: ${response.status}`);
      if (operation === "read-existing") existingReadStatus = response.status;
      if (operation === "read-missing") missingReadStatus = response.status;
      storageResults.push({ role, operation, status: response.status });
    }
    assert.equal(existingReadStatus, missingReadStatus, `${role}: Storage existence oracle`);
    const serviceRead = await fetch(`${api}/storage/v1/object/authenticated/local-commerce-private/${objectName}`, { headers: serviceStorageHeaders, signal: AbortSignal.timeout(5_000) });
    assert.equal(serviceRead.status, 200);
    assert.equal(createHash("sha256").update(await serviceRead.text()).digest("hex"), probeDigest);
  }
} finally {
  const cleanup = await fetch(`${api}/storage/v1/object/local-commerce-private`, { method: "DELETE", headers: { ...serviceStorageHeaders, "content-type": "application/json" }, body: JSON.stringify({ prefixes: [objectName] }), signal: AbortSignal.timeout(5_000) });
  cleanupStatus = cleanup.status;
  await cleanup.arrayBuffer();
}
assert.ok(cleanupStatus < 300, `service Storage cleanup: ${cleanupStatus}`);
assert.equal(sql(`select count(*) from storage.objects where bucket_id='local-commerce-private' and name='${objectName}';`), "0");

const supplier = JSON.parse(sql(`select json_build_object(
  'tables',(select count(*) from information_schema.tables where table_schema='local_commerce' and table_name like '%supplier%'),
  'functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='local_commerce' and p.proname like '%supplier%'));`));
assert.deepEqual(supplier, { tables: 0, functions: 0 });

const clientRoot = path.join(root, "dist/client");
const clientFiles = [];
const collectFiles = (directory) => {
  for (const name of readdirSync(directory)) {
    const target = path.join(directory, name);
    if (statSync(target).isDirectory()) collectFiles(target);
    else clientFiles.push(target);
  }
};
collectFiles(clientRoot);
for (const filename of clientFiles) {
  const bytes = readFileSync(filename);
  for (const secret of [serviceKey, jwtSecret, anonKey, authenticated, objectName]) {
    assert.equal(bytes.includes(Buffer.from(secret)), false, `${path.relative(clientRoot, filename)} contains transient server authority`);
  }
}

console.info(JSON.stringify({ status: "PASS", task: "11.6-complete-schema-security-inventory", run, projectId,
  postgres: 17, ledger: 37, pending: 0, tables: tables.length, policies: policies.length, functions: functions.length,
  rls: { allEnabled: true, browserTablePrivileges: false, directHttpChecks: directResults.length },
  rpc: { browserExecutePrivileges: false, representativeHttpDenied: true },
  storage: { privateBucket: true, browserOperationsDenied: storageResults.length, syntheticProbeRemoved: true }, supplier,
  clientBuild: { filesScanned: clientFiles.length, transientSecretsFound: 0 },
  secretsReported: false, businessMutationsCommitted: false }));
