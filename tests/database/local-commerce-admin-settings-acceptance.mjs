import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { retainedLedgerWrappers } from "../../scripts/local-commerce-retained-ledger-wrapper.mjs";

const root = process.cwd();
const projectId = "figmemento-local-commerce";
const expectedWorkdir = path.join(root, "local", "commerce");
const expectedDbName = "/supabase_db_figmemento-local-commerce";
const expectedVolume = "supabase_db_figmemento-local-commerce";
const mode = process.argv.includes("--apply-authorized-0038") ? "apply" : "auto";

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

const environment = readLocalEnvironment();

function run(binary, args, input = "") {
  const result = spawnSync(binary, args, { cwd: root, env: environment, encoding: "utf8", input, timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || `${binary} failed`);
  return result.stdout.trim();
}

function psql(database, sql) {
  return run("docker", ["exec", "-i", database, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], sql);
}

function exactDatabase() {
  const ids = run("docker", ["ps", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
  assert.ok(ids.length > 0, "expected retained-development containers matching the exact project label");
  const containers = JSON.parse(run("docker", ["inspect", ...ids]));
  const databases = containers.filter((container) => {
    const labels = container.Config?.Labels ?? {};
    return labels["com.supabase.cli.project"] === projectId
      && labels["com.supabase.cli.workdir"] === expectedWorkdir
      && container.Name === expectedDbName
      && container.State?.Running === true
      && container.Mounts?.some((mount) => mount.Type === "volume" && mount.Name === expectedVolume && mount.Destination === "/var/lib/postgresql/data");
  });
  assert.equal(databases.length, 1, "expected exactly one exact retained PostgreSQL container");
  return databases[0].Id;
}

function loadMigrationState() {
  const markerBytes = readFileSync(path.join(root, "local/commerce/runtime/project-marker.json"));
  const marker = JSON.parse(markerBytes);
  const markerDigest = sha256Text(JSON.stringify(marker));
  assert.equal(marker.projectId, projectId);
  assert.equal(marker.environment, "development");
  assert.equal(marker.projectKind, "retained_development");
  assert.equal(marker.runId, "retained-development");
  assert.equal(marker.postgresMajorVersion, 17);
  assert.equal(markerDigest, environment.LOCAL_COMMERCE_MARKER_DIGEST);
  const manifest = JSON.parse(readFileSync(path.join(root, "local/commerce/migrations/manifest.json"), "utf8"));
  const sources = manifest.migrations.map((migration) => readFileSync(path.join(root, "local/commerce/migrations", migration.filename), "utf8"));
  const wrappers = retainedLedgerWrappers(manifest, sources, marker, markerDigest);
  return { markerDigest, manifest, wrappers };
}

function securityAssertionsSql() {
  return `
do $assert$ begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='local_commerce' and c.relname='admin_settings' and c.relrowsecurity) then raise exception 'admin_settings RLS missing'; end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='local_commerce' and c.relname='admin_settings_actions' and c.relrowsecurity) then raise exception 'admin_settings_actions RLS missing'; end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='local_commerce' and p.proname='admin_settings_read' and p.prosecdef and p.proconfig @> array['search_path=local_commerce, pg_catalog']) then raise exception 'admin_settings_read security boundary missing'; end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='local_commerce' and p.proname='admin_settings_command' and p.prosecdef and p.proconfig @> array['search_path=local_commerce, pg_catalog']) then raise exception 'admin_settings_command security boundary missing'; end if;
  if has_table_privilege('anon','local_commerce.admin_settings','select') or has_table_privilege('authenticated','local_commerce.admin_settings','insert') then raise exception 'browser table privilege widened'; end if;
  if has_function_privilege('anon','local_commerce.admin_settings_read(text,text)','execute') or has_function_privilege('authenticated','local_commerce.admin_settings_command(text,text,text,text,text,text,integer,text)','execute') then raise exception 'browser RPC privilege widened'; end if;
  if not has_function_privilege('service_role','local_commerce.admin_settings_read(text,text)','execute') or not has_function_privilege('service_role','local_commerce.admin_settings_command(text,text,text,text,text,text,integer,text)','execute') then raise exception 'service role RPC privilege missing'; end if;
end $assert$;
`;
}

test(`H19 ${mode === "apply" ? "authorized migration apply" : "retained database acceptance"} against exact retained local database`, () => {
  const database = exactDatabase();
  const state = loadMigrationState();
  assert.equal(state.manifest.schemaVersion, 38);
  assert.equal(state.manifest.migrations.length, 38);
  const baseline = psql(database, "select current_setting('server_version_num')::int/10000; select count(*) from local_commerce.migration_ledger; select max(version) from local_commerce.migration_ledger; select schema_version from local_commerce.project_identities where project_id='figmemento-local-commerce' and environment='development' and project_kind='retained_development' and lifecycle='active';");
  const [postgresMajor, ledgerCount, maxVersion, schemaVersion] = baseline.split("\n");
  assert.equal(postgresMajor, "17");
  assert.equal(ledgerCount, maxVersion);
  assert.ok(["37", "38"].includes(maxVersion));

  if (mode === "auto" && maxVersion === "38") {
    assert.equal(schemaVersion, "38");
    const ledger = JSON.parse(psql(database, "select coalesce(json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version),'[]') from local_commerce.migration_ledger;"));
    assert.deepEqual(ledger, state.manifest.migrations.map((migration) => ({
      version: migration.version,
      migrationId: migration.migrationId,
      checksum: migration.checksum,
      projectId,
    })));
    psql(database, securityAssertionsSql());
    console.log(JSON.stringify({ status: "APPLIED_VERIFICATION", projectId, databaseIdPrefix: database.slice(0, 12), postgresMajor: 17, ledger: "38/38", pending: 0, markerVerified: true, security: "PASS", mutation: "none" }));
    return;
  }

  assert.equal(maxVersion, "37");
  assert.equal(schemaVersion, "37");

  if (mode !== "apply") {
    const rollbackWrapper = state.wrappers[37].replace(/\ncommit;\n$/, `\n${securityAssertionsSql()}rollback;\n`);
    psql(database, rollbackWrapper);
    assert.equal(psql(database, "select count(*) from local_commerce.migration_ledger; select max(version) from local_commerce.migration_ledger;"), "37\n37");
  } else {
    psql(database, state.wrappers[37]);
    assert.equal(psql(database, "select count(*) from local_commerce.migration_ledger; select max(version) from local_commerce.migration_ledger; select schema_version from local_commerce.project_identities where project_id='figmemento-local-commerce' and lifecycle='active';"), "38\n38\n38");
    psql(database, securityAssertionsSql());
  }
  console.log(JSON.stringify({ status: mode === "apply" ? "APPLIED" : "ROLLBACK_ONLY_PASS", projectId, databaseIdPrefix: database.slice(0, 12), postgresMajor: 17, ledger: mode === "apply" ? "38/38" : "37/37", pending: mode === "apply" ? 0 : 1, markerVerified: true, security: "PASS", mutation: mode === "apply" ? "authorized-0038-only" : "rolled-back" }));
});
