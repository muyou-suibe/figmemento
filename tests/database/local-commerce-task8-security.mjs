import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = "run-5576dfd8";
const project = `figmemento-local-commerce-test-${run}`;
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const db = "3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4";
function docker(args, input) { const r = spawnSync("docker", args, { input, encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 }); assert.equal(r.status, 0, r.error?.code ?? r.stderr); return r.stdout.trim(); }
const inspected = JSON.parse(docker(["inspect", db]))[0];
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], dir);
const sql = (query) => docker(["exec", "-i", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
const ledger = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
assert.equal(manifest.schemaVersion, 30); assert.equal(ledger.length, 30);
manifest.migrations.forEach((m, i) => { assert.equal(ledger[i].checksum, m.checksum); assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest("hex"), m.checksum); });
assert.equal(sql("select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='local_commerce' and c.relname in ('shipments','shipment_events','shipment_actions');"), "t");
for (const signature of [
  "local_commerce.shipment_command(text,text,text,text,text,text,text,integer,text,text)",
  "local_commerce.read_customer_tracking(text,text,text,text,uuid,text,timestamptz,text,text)",
  "local_commerce.admin_orders_read(text,text,text,text,text,text,text,boolean,integer,integer)",
]) {
  assert.equal(sql(`select has_function_privilege('public','${signature}','execute') or has_function_privilege('anon','${signature}','execute') or has_function_privilege('authenticated','${signature}','execute');`), "f");
  assert.equal(sql(`select has_function_privilege('service_role','${signature}','execute');`), "t");
}
assert.equal(sql("select count(*) from information_schema.tables where table_schema='local_commerce' and table_name like '%supplier%';"), "0");
assert.equal(sql("select count(*) from (select project_id,fulfillment_id,count(*) n from local_commerce.shipments group by project_id,fulfillment_id having count(*)>1) q;"), "0");
assert.equal(sql("select count(*) from (select s.id,array_agg(e.event_type order by e.version) events from local_commerce.shipments s join local_commerce.shipment_events e on e.project_id=s.project_id and e.shipment_id=s.id group by s.id) q where events not in (array['shipment_created'],array['shipment_created','shipped'],array['shipment_created','shipped','in_transit'],array['shipment_created','shipped','in_transit','delivered']);"), "0");
console.info(JSON.stringify({ status: "PASS", task: "8.7-security", run, project, ledger: 30, pending: 0, rls: true, restrictedRpc: true, oneShipmentPerFulfillment: true, orderedEvents: true, supplierTables: 0, checksums: "30/30" }));
