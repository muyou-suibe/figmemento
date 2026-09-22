// One-time, exact-ID quarantine of two proven H03 synthetic coupon fixtures.
// This does not change coupon semantics or touch any other pricing rule.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = "run-b74c8e21";
const project = `figmemento-local-commerce-test-${run}`;
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
assert.ok(process.argv.includes("--confirm-exact-coupon-quarantine"));
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
assert.equal(prep.config.projectId, project);
assert.equal(prep.config.postgresMajorVersion, 17);
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(manifest.schemaVersion, 46);
assert.equal(manifest.migrations.length, 46);

function command(binary, args, input) {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 20_000, maxBuffer: 4_000_000 });
  assert.equal(result.status, 0, `${binary} failed: ${result.error?.code ?? result.stderr?.slice(-500)}`);
  return result.stdout.trim();
}
const exact = command("docker", ["ps", "-q"]).split("\n").filter(Boolean)
  .map(id => JSON.parse(command("docker", ["inspect", id]))[0])
  .filter(item => item.Config.Labels?.["com.supabase.cli.workdir"] === dir
    && item.Name.startsWith("/supabase_db_") && item.State.Status === "running");
assert.equal(exact.length, 1);
assert.equal(exact[0].Mounts.some(mount => mount.Name === "supabase_db_figmemento-local-commerce-test-run-b74c8"), true);
const sql = statement => command("docker", ["exec", "-i", exact[0].Id, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], statement);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity(${literal(project)},${literal(prep.markerDigest)});`), "t");
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, 46);
for (const [index, migration] of manifest.migrations.entries()) {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
}

const expected = [
  ["17ed741c-3275-411b-945d-7e956f5368ba", "h03-coupon-4fe84ebb422e43abbe179f9802facf77", "h03-product-4fe84ebb422e43abbe179f9802facf77"],
  ["55a62d99-1183-4d85-859c-db99c86b8247", "h03-coupon-25085f9176d54df9bb8bc02040c8bace", "h03-product-25085f9176d54df9bb8bc02040c8bace"],
];
const guards = expected.map(([id, key]) => `(id=${literal(id)}::uuid and rule_key=${literal(key)})`).join(" or ");
const predicate = `project_id=${literal(project)} and (${guards})`;
const before = JSON.parse(sql(`select json_agg(to_jsonb(r) order by r.id) from local_commerce.catalog_pricing_rules r where ${predicate};`));
assert.equal(before.length, 2);
for (const [id, key, slug] of expected) {
  assert.match(key, /^h03-coupon-[a-f0-9]{32}$/);
  const row = before.find(item => item.id === id);
  assert.ok(row);
  assert.equal(row.rule_key, key);
  assert.equal(row.revision, 1);
  assert.equal(row.version, 1);
  assert.equal(row.lifecycle, "active");
  assert.equal(row.rule_status, "active");
  assert.equal(row.definition.kind, "coupon");
  assert.equal(row.definition.code, "TEST10");
  assert.equal(row.definition.currency, "USD");
  assert.equal(row.definition.discountType, "percent");
  assert.equal(row.definition.discountValue, 10);
  assert.equal(sql(`select count(*) from local_commerce.catalog_products where project_id=${literal(project)} and slug=${literal(slug)};`), "1");
}
assert.equal(sql(`select count(*) from local_commerce.catalog_pricing_rules where project_id=${literal(project)} and lifecycle='active' and rule_status='active' and definition->>'kind'='coupon' and definition->>'code'='TEST10';`), "2");

sql(`begin;
do $quarantine$
declare matched integer; affected integer;
begin
  select count(*) into matched from local_commerce.catalog_pricing_rules
    where ${predicate} and lifecycle='active' and rule_status='active'
      and definition->>'kind'='coupon' and definition->>'code'='TEST10';
  if matched <> 2 then raise exception 'Exact coupon quarantine precondition failed'; end if;
  update local_commerce.catalog_pricing_rules set rule_status='inactive'
    where ${predicate} and lifecycle='active' and rule_status='active'
      and definition->>'kind'='coupon' and definition->>'code'='TEST10';
  get diagnostics affected = row_count;
  if affected <> 2 then raise exception 'Exact coupon quarantine count failed'; end if;
end $quarantine$;
commit;`);
const after = JSON.parse(sql(`select json_agg(to_jsonb(r) order by r.id) from local_commerce.catalog_pricing_rules r where ${predicate};`));
assert.equal(after.length, 2);
for (let index = 0; index < 2; index += 1) {
  assert.equal(after[index].rule_status, "inactive");
  assert.equal(after[index].version, before[index].version + 1);
  for (const key of Object.keys(before[index]).filter(key => !["rule_status", "version", "updated_at"].includes(key))) {
    assert.deepEqual(after[index][key], before[index][key], `only status/version/timestamp may change: ${key}`);
  }
}
assert.equal(sql(`select count(*) from local_commerce.catalog_pricing_rules where project_id=${literal(project)} and lifecycle='active' and rule_status='active' and definition->>'kind'='coupon' and definition->>'code'='TEST10';`), "0");
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "46");
console.info("EXACT SYNTHETIC COUPON QUARANTINE PASS", JSON.stringify({ run, project, rows: 2, preserved: 2, activeTest10: 0, ledger: "46/46" }));
