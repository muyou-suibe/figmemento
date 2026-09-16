import { sha256Text, validateMigrationManifest } from "../app/application/local-commerce-migration-ledger.ts";
import { literal } from "./local-commerce-ledger-wrapper.mjs";

export const RETAINED_LEDGER_IDENTITY = Object.freeze({
  projectId: "figmemento-local-commerce",
  environment: "development",
  projectKind: "retained_development",
  runId: "retained-development",
  postgresMajorVersion: 17,
});

function assertRetainedMarker(marker, markerDigest) {
  if (
    marker?.projectId !== RETAINED_LEDGER_IDENTITY.projectId ||
    marker?.environment !== RETAINED_LEDGER_IDENTITY.environment ||
    marker?.projectKind !== RETAINED_LEDGER_IDENTITY.projectKind ||
    marker?.runId !== RETAINED_LEDGER_IDENTITY.runId ||
    marker?.postgresMajorVersion !== RETAINED_LEDGER_IDENTITY.postgresMajorVersion ||
    !/^[a-f0-9]{64}$/.test(markerDigest) ||
    sha256Text(JSON.stringify(marker)) !== markerDigest
  ) {
    throw new Error("Invalid retained ledger identity");
  }
}

// Retained-development wrappers are intentionally separate from the
// disposable-only wrapper. Original migration bytes remain checksum authority;
// generated SQL is execution input and is never a replacement migration.
export function retainedLedgerWrappers(manifest, sources, marker, markerDigest) {
  if (
    validateMigrationManifest(manifest).status !== "valid" ||
    manifest.projectId !== RETAINED_LEDGER_IDENTITY.projectId
  ) {
    throw new Error("Invalid retained migration manifest");
  }
  assertRetainedMarker(marker, markerDigest);

  return manifest.migrations.map((entry, index) => {
    const source = sources[index];
    if (typeof source !== "string" || sha256Text(source) !== entry.checksum) {
      throw new Error("Source checksum mismatch");
    }

    // Migration 0007 is the single reviewed source with outer transaction
    // control. Its body is folded into this wrapper's atomic transaction.
    const body = entry.version === 7
      ? source.replace(/^begin;\s*$/mi, "").replace(/^commit;\s*$/mi, "")
      : source;
    if (/^\s*(?:commit|rollback|begin)\s*;/mi.test(body) || /^\s*\\/m.test(body)) {
      throw new Error("Unsupported transaction control");
    }

    const project = literal(RETAINED_LEDGER_IDENTITY.projectId);
    const prior = manifest.migrations
      .slice(0, index)
      .map((migration) => `(${migration.version},${literal(migration.migrationId)},${literal(migration.checksum)},${project})`)
      .join(",");
    const guard = index === 0
      ? "if to_regnamespace('local_commerce') is not null then raise exception 'fresh schema required'; end if;"
      : `if (select count(*) from local_commerce.migration_ledger) <> ${index} or exists (
          select version,migration_id,checksum,project_id from local_commerce.migration_ledger
          except values ${prior}) then raise exception 'ledger mismatch'; end if;`;
    const identityGuard = index > 1
      ? `if not exists(select 1 from local_commerce.project_identities where project_id=${project} and marker_digest=${literal(markerDigest)} and project_kind='retained_development' and environment='development' and lifecycle='active' and schema_version=${index}) then raise exception 'retained identity mismatch'; end if;`
      : "";
    const initializeIdentity = index === 1
      ? `insert into local_commerce.project_identities(project_id,environment,project_kind,schema_version,marker_digest,lifecycle) values(${project},'development','retained_development',2,${literal(markerDigest)},'active');`
      : "";

    return `-- Generated retained-development wrapper; source SHA256 ${entry.checksum}\n` +
      `begin;\nselect pg_advisory_xact_lock(7141001);\n` +
      `do $gate$ begin ${guard} ${identityGuard} end $gate$;\n` +
      `${body}\n${initializeIdentity}\n` +
      `insert into local_commerce.migration_ledger(version,migration_id,filename,checksum,project_id,schema_version,rollback_guidance,forward_fix_guidance) values(${entry.version},${literal(entry.migrationId)},${literal(entry.filename)},${literal(entry.checksum)},${project},${manifest.schemaVersion},${literal(entry.rollback)},${literal(entry.forwardFix)});\n` +
      `${index >= 1 ? `update local_commerce.project_identities set schema_version=${entry.version} where project_id=${project};\n` : ""}` +
      `commit;\n`;
  });
}
