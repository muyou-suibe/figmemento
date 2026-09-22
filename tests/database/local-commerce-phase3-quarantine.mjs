// Acceptance-only quarantine of explicitly named synthetic Phase 3 shipping
// fixtures. Never deletes a row or selects mutation targets by broad prefix.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { quarantineSyntheticShippingRule } from "./local-commerce-shipping-fixture-quarantine.mjs";

const run = process.argv.find(value => /^run-[0-9a-f]{8}$/.test(value));
assert.ok(run && process.argv.includes("--confirm-disposable"));
const targetIds = process.argv.filter(value => /^id=[0-9a-f-]{36}$/.test(value)).map(value => value.slice(3));
assert.ok(targetIds.length > 0 && targetIds.length <= 10);
assert.equal(new Set(targetIds).size, targetIds.length);
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const project = `figmemento-local-commerce-test-${run}`;
assert.equal(prep.config.projectId, project);
function command(binary, args, input) {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.error?.code ?? "bounded command failed");
  return result.stdout.trim();
}
const dbs = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${dir}`, "--format", "{{.ID}} {{.Names}}"]).split("\n")
  .filter(value => value.includes("supabase_db_")).map(value => value.split(" ")[0]);
assert.equal(dbs.length, 1);
const db = JSON.parse(command("docker", ["inspect", dbs[0]]))[0];
assert.equal(db.Config.Labels["com.supabase.cli.workdir"], dir);
const sql = statement => command("docker", ["exec", "-i", db.Id, "psql", "-X", "-qAt",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], statement);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
assert.equal(sql(`select local_commerce.verify_project_identity(${literal(project)},${literal(prep.markerDigest)});`), "t");
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "48");
for (const id of targetIds) {
  const row = JSON.parse(sql(`select row_to_json(r) from (select id,rule_key,definition->>'method' as method
    from local_commerce.catalog_pricing_rules where project_id=${literal(project)} and id=${literal(id)}::uuid) r;`));
  assert.match(row.rule_key, /^phase3-shipping-[a-f0-9]{32}$/);
  assert.equal(row.method, `phase3_${row.rule_key.slice("phase3-shipping-".length)}`);
  quarantineSyntheticShippingRule({ sql, project, id, ruleKey: row.rule_key, method: row.method });
}
console.info(JSON.stringify({ status: "PASS", run, exactSyntheticRulesQuarantined: targetIds.length,
  historicalRowsPreserved: true, deletedRows: 0, retainedTouched: false }));
