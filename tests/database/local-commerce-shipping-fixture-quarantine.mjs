// Acceptance-only cleanup for one exact synthetic shipping rule.
// The row and its purchase-time history remain intact; only current Catalog
// eligibility changes. Never select cleanup targets by a broad rule prefix.
import assert from "node:assert/strict";

const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

export function quarantineSyntheticShippingRule({ sql, project, id, ruleKey, method }) {
  assert.match(project, /^figmemento-local-commerce-test-run-[a-f0-9]{8}$/);
  assert.match(id, /^[a-f0-9-]{36}$/);
  assert.match(ruleKey, /^(?:c03|c07|c08|h03|phase1)-shipping-[a-f0-9]{32,36}$/);
  assert.match(method, /^[a-z][a-z0-9_]{0,63}$/);
  const target = `project_id=${literal(project)} and id=${literal(id)}::uuid`;
  const row = JSON.parse(sql(`select row_to_json(r) from (select id,rule_key,revision,definition,rule_status,version,lifecycle from local_commerce.catalog_pricing_rules where ${target}) r;`));
  assert.equal(row.rule_key, ruleKey);
  assert.equal(row.rule_status, "active");
  assert.equal(row.lifecycle, "active");
  assert.equal(row.definition.kind, "shipping");
  assert.equal(row.definition.country, "US");
  assert.equal(row.definition.method, method);
  sql(`begin;
do $quarantine$
declare affected integer;
begin
  update local_commerce.catalog_pricing_rules
    set rule_status='inactive'
    where ${target} and rule_key=${literal(ruleKey)} and lifecycle='active'
      and rule_status='active' and definition->>'kind'='shipping'
      and definition->>'country'='US' and definition->>'method'=${literal(method)};
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Exact synthetic shipping quarantine target mismatch'; end if;
end $quarantine$;
commit;`);
  const after = JSON.parse(sql(`select row_to_json(r) from (select id,rule_key,revision,definition,rule_status,version,lifecycle from local_commerce.catalog_pricing_rules where ${target}) r;`));
  assert.equal(after.rule_status, "inactive");
  assert.equal(after.version, row.version + 1);
  for (const key of ["id", "rule_key", "revision", "definition", "lifecycle"]) assert.deepEqual(after[key], row[key]);
}
