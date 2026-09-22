// One-time, exact-ID quarantine of four proven synthetic acceptance fixtures.
// No DELETE, no broad selector mutation, and no retained/remote project access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = "run-b74c8e21";
const project = `figmemento-local-commerce-test-${run}`;
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
assert.ok(process.argv.includes("--confirm-exact-quarantine"));
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
  ["790c57cc-d81f-4c76-a05b-752511045a65", "h03-shipping-4fe84ebb422e43abbe179f9802facf77", "h03-product-4fe84ebb422e43abbe179f9802facf77"],
  ["87264b34-23c4-4e19-8d24-ecd51332f6fe", "h03-shipping-25085f9176d54df9bb8bc02040c8bace", "h03-product-25085f9176d54df9bb8bc02040c8bace"],
  ["c0acdf93-bda1-4c04-8957-39599393e9ba", "c08-shipping-14b5416f3ab5448ea79ef39fb9156a3c", "c08-product-14b5416f3ab5448ea79ef39fb9156a3c"],
  ["c6df928c-7a3e-4672-b6ff-06dc7a86bca0", "c08-shipping-428c3c2302f94cc4b328b9b0a0db6703", "c08-product-428c3c2302f94cc4b328b9b0a0db6703"],
];
const ids = expected.map(([id]) => `${literal(id)}::uuid`).join(",");
const predicate = `project_id=${literal(project)} and id in (${ids})`;
const before = JSON.parse(sql(`select json_agg(to_jsonb(r) order by r.id) from local_commerce.catalog_pricing_rules r where ${predicate};`));
assert.equal(before.length, 4);
for (const [id, key, slug] of expected) {
  const row = before.find(item => item.id === id);
  assert.ok(row);
  assert.equal(row.rule_key, key);
  assert.equal(row.revision, 1);
  assert.equal(row.version, 1);
  assert.equal(row.lifecycle, "active");
  assert.equal(row.rule_status, "active");
  assert.equal(row.definition.kind, "shipping");
  assert.equal(row.definition.country, "US");
  assert.equal(row.definition.method, "local_standard");
  assert.equal(sql(`select count(*) from local_commerce.catalog_products where project_id=${literal(project)} and slug=${literal(slug)};`), "1");
}
assert.equal(sql(`select count(*) from local_commerce.catalog_pricing_rules where project_id=${literal(project)} and lifecycle='active' and rule_status='active' and definition->>'kind'='shipping' and definition->>'country'='US' and definition->>'method'='local_standard';`), "4");

sql(`begin;
do $quarantine$
declare matched integer; affected integer;
begin
  select count(*) into matched from local_commerce.catalog_pricing_rules
    where ${predicate} and lifecycle='active' and rule_status='active'
      and definition->>'kind'='shipping' and definition->>'country'='US'
      and definition->>'method'='local_standard';
  if matched <> 4 then raise exception 'Exact shipping quarantine precondition failed'; end if;
  update local_commerce.catalog_pricing_rules set rule_status='inactive'
    where ${predicate} and lifecycle='active' and rule_status='active'
      and definition->>'kind'='shipping' and definition->>'country'='US'
      and definition->>'method'='local_standard';
  get diagnostics affected = row_count;
  if affected <> 4 then raise exception 'Exact shipping quarantine count failed'; end if;
end $quarantine$;
commit;`);
const after = JSON.parse(sql(`select json_agg(to_jsonb(r) order by r.id) from local_commerce.catalog_pricing_rules r where ${predicate};`));
assert.equal(after.length, 4);
for (let index = 0; index < 4; index += 1) {
  assert.equal(after[index].rule_status, "inactive");
  assert.equal(after[index].version, before[index].version + 1);
  for (const key of Object.keys(before[index]).filter(key => !["rule_status", "version", "updated_at"].includes(key))) {
    assert.deepEqual(after[index][key], before[index][key], `only status/version/timestamp may change: ${key}`);
  }
}
assert.equal(sql(`select count(*) from local_commerce.catalog_pricing_rules where project_id=${literal(project)} and lifecycle='active' and rule_status='active' and definition->>'kind'='shipping' and definition->>'country'='US' and definition->>'method'='local_standard';`), "0");
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "46");
console.info("EXACT SYNTHETIC SHIPPING QUARANTINE PASS", JSON.stringify({ run, project, rows: 4, preserved: 4, activeDuplicates: 0, ledger: "46/46" }));
