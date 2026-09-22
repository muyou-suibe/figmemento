// Rollback-only fault probes against one exact disposable Phase 3 DB.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = process.argv.find(value => /^run-[0-9a-f]{8}$/.test(value));
assert.ok(run && process.argv.includes("--confirm-disposable"));
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
assert.equal(prep.config.projectId, `figmemento-local-commerce-test-${run}`);
const project = prep.config.projectId;
function command(binary, args, input) {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 15_000, maxBuffer: 2_000_000 });
  assert.equal(result.status, 0, result.error?.code ?? "bounded command failed");
  return result.stdout.trim();
}
const dbs = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${dir}`, "--format", "{{.ID}} {{.Names}}"]).split("\n")
  .filter(value => value.includes("supabase_db_")).map(value => value.split(" ")[0]);
assert.equal(dbs.length, 1);
const db = JSON.parse(command("docker", ["inspect", dbs[0]]))[0];
assert.equal(db.Config.Labels["com.supabase.cli.workdir"], dir);
assert.equal(db.State.Status, "running");
const sql = statement => command("docker", ["exec", "-i", db.Id, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
  "-U", "postgres", "-d", "postgres"], statement);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity(${literal(project)},${literal(prep.markerDigest)});`), "t");
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "48");
// Choose only a fresh synthetic successful Payment whose refund aggregate does
// not yet exist. This script never creates a business fixture or commits one.
const payment = sql(`select act.result#>>'{payment,paymentReference}'
  from local_commerce.payment_attempts pa join local_commerce.payment_actions act
    on act.project_id=pa.project_id and act.attempt_id=pa.id
  where pa.project_id=${literal(project)} and pa.outcome='succeeded'
    and not exists (select 1 from local_commerce.refund_aggregates r
      where r.project_id=pa.project_id and r.payment_attempt_id=pa.id)
  order by pa.created_at desc limit 1;`);
assert.match(payment, /^LP-LOCAL-[A-Z0-9]{16}$/);
const counts = () => sql(`select json_build_array(
  (select count(*) from local_commerce.refund_aggregates where project_id=${literal(project)}),
  (select count(*) from local_commerce.refund_ledger where project_id=${literal(project)}),
  (select count(*) from local_commerce.refund_actions where project_id=${literal(project)}));`);
const before = counts();
const points = [
  { table: "refund_ledger", operation: "insert" },
  { table: "refund_actions", operation: "insert" },
  { table: "refund_aggregates", operation: "update" },
];
for (const [index, point] of points.entries()) {
  const key = randomUUID().replaceAll("-", "").padEnd(64, "0");
  const result = sql(`begin;
    create function pg_temp.phase3_injected_failure() returns trigger language plpgsql as $$
    begin raise exception 'phase3 injected DB write fault'; end; $$;
    create trigger phase3_injected_failure before ${point.operation}
      on local_commerce.${point.table} for each row execute function pg_temp.phase3_injected_failure();
    select local_commerce.admin_refund_command(${literal(project)},${literal(prep.markerDigest)},
      'configured-admin',${literal(payment)},${literal(key)},1000,1)->>'status';
    select json_build_array(
      (select count(*) from local_commerce.refund_aggregates where project_id=${literal(project)}),
      (select count(*) from local_commerce.refund_ledger where project_id=${literal(project)}),
      (select count(*) from local_commerce.refund_actions where project_id=${literal(project)}));
    rollback;`).split("\n");
  assert.equal(result[0], "unavailable", `fault ${index}`);
  assert.equal(result[1], before, `no partial refund fact at fault ${index}`);
  assert.equal(counts(), before, `rollback-only after fault ${index}`);
}
const eventId = `fault-${randomUUID()}`;
const inboxBefore = sql(`select count(*) from local_commerce.webhook_inbox where project_id=${literal(project)};`);
const inboxFault = sql(`begin;
  create function pg_temp.phase3_inbox_failure() returns trigger language plpgsql as $$
  begin if new.state='reconciled' then raise exception 'phase3 injected inbox finalization fault'; end if;
    return new; end; $$;
  create trigger phase3_inbox_failure before update on local_commerce.webhook_inbox
    for each row execute function pg_temp.phase3_inbox_failure();
  select local_commerce.webhook_inbox_ingest(${literal(project)},${literal(prep.markerDigest)},
    'local_fixture',${literal(eventId)},'${"a".repeat(64)}',100,'payment.succeeded',
    '2026-09-22T00:00:00Z'::timestamptz,'payment',${literal(payment)},
    '{"amountCents":10500,"currency":"USD"}'::jsonb)->>'status';
  select local_commerce.webhook_inbox_claim(${literal(project)},${literal(prep.markerDigest)},
    'local_fixture',${literal(eventId)})->>'status';
  select local_commerce.webhook_inbox_finalize(${literal(project)},${literal(prep.markerDigest)},
    'local_fixture',${literal(eventId)},
    (select lease_token from local_commerce.webhook_inbox where project_id=${literal(project)}
      and external_event_id=${literal(eventId)}),
    (select version from local_commerce.webhook_inbox where project_id=${literal(project)}
      and external_event_id=${literal(eventId)}))->>'status';
  select state from local_commerce.webhook_inbox where project_id=${literal(project)}
    and external_event_id=${literal(eventId)};
  rollback;`).split("\n");
assert.deepEqual(inboxFault, ["found", "claimed", "unavailable", "processing"]);
assert.equal(sql(`select count(*) from local_commerce.webhook_inbox where project_id=${literal(project)};`), inboxBefore);
assert.equal(sql(`select count(*) from local_commerce.migration_ledger where version>48;`), "0");
console.info(JSON.stringify({ status: "PASS", run, ledger: "48/48", faultPoints: points.map(point =>
  `${point.table}:${point.operation}`).concat("webhook_inbox:finalize"), zeroPartialState: true, migrationExecuted: false }));
