import { createHash } from "node:crypto";

export const LOCAL_COMMERCE_MIGRATION_MANIFEST_FORMAT =
  "figmemento-local-commerce-migration-manifest/v1" as const;
export const LOCAL_COMMERCE_LEDGER_FORMAT =
  "figmemento-local-commerce-migration-ledger/v1" as const;
export const LOCAL_COMMERCE_SCHEMA = "local_commerce" as const;

export interface LocalCommerceMigrationDefinition {
  version: number;
  migrationId: string;
  filename: string;
  checksum: string;
  rollback: string;
  forwardFix: string;
}

export interface LocalCommerceMigrationManifest {
  format: typeof LOCAL_COMMERCE_MIGRATION_MANIFEST_FORMAT;
  schema: typeof LOCAL_COMMERCE_SCHEMA;
  projectId: string;
  schemaVersion: number;
  migrations: readonly LocalCommerceMigrationDefinition[];
}

export interface LocalCommerceAppliedMigration {
  version: number;
  migrationId: string;
  checksum: string;
  projectId: string;
}

export type LocalCommerceMigrationPlan =
  | {
      status: "ready";
      apply: readonly LocalCommerceMigrationDefinition[];
      skipped: readonly LocalCommerceMigrationDefinition[];
    }
  | {
      status: "blocked";
      code:
        | "invalid_manifest"
        | "project_mismatch"
        | "ledger_project_mismatch"
        | "ledger_version_gap"
        | "checksum_mismatch"
        | "migration_identity_mismatch";
      version?: number;
      detail: string;
    };

export interface LocalCommerceInitializationInput {
  source: "synthetic" | "customer_export" | "unknown";
  containsCustomerAccounts: boolean;
  containsOrders: boolean;
  containsPrivatePhotos: boolean;
  containsCredentials: boolean;
}

export type LocalCommerceInitializationDecision =
  | { status: "allowed"; code: "synthetic_initialization_allowed" }
  | {
      status: "blocked";
      code:
        | "non_synthetic_initialization"
        | "customer_data_export_rejected"
        | "credential_export_rejected";
    };

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function validateMigrationManifest(
  manifest: LocalCommerceMigrationManifest,
): { status: "valid" } | { status: "invalid"; detail: string } {
  if (manifest.format !== LOCAL_COMMERCE_MIGRATION_MANIFEST_FORMAT) {
    return { status: "invalid", detail: "unsupported migration manifest format" };
  }
  if (manifest.schema !== LOCAL_COMMERCE_SCHEMA || !manifest.projectId.trim()) {
    return { status: "invalid", detail: "schema or project identity is invalid" };
  }
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 0) {
    return { status: "invalid", detail: "schemaVersion must be a non-negative integer" };
  }
  if (manifest.migrations.length !== manifest.schemaVersion) {
    return { status: "invalid", detail: "schemaVersion must equal the ordered migration count" };
  }

  const versions = new Set<number>();
  const migrationIds = new Set<string>();
  for (const [index, migration] of manifest.migrations.entries()) {
    const expectedVersion = index + 1;
    if (migration.version !== expectedVersion) {
      return { status: "invalid", detail: `migration ${index} is not version ${expectedVersion}` };
    }
    if (versions.has(migration.version) || migrationIds.has(migration.migrationId)) {
      return { status: "invalid", detail: `duplicate migration identity at version ${migration.version}` };
    }
    if (!/^[0-9]{4}_[a-z0-9-]+\.sql$/.test(migration.filename)) {
      return { status: "invalid", detail: `unsafe migration filename at version ${migration.version}` };
    }
    if (!SHA256_PATTERN.test(migration.checksum)) {
      return { status: "invalid", detail: `invalid checksum at version ${migration.version}` };
    }
    if (!migration.rollback.trim() || !migration.forwardFix.trim()) {
      return { status: "invalid", detail: `rollback/forward-fix guidance missing at version ${migration.version}` };
    }
    versions.add(migration.version);
    migrationIds.add(migration.migrationId);
  }

  return { status: "valid" };
}

export function planMigrationLedger(
  manifest: LocalCommerceMigrationManifest,
  applied: readonly LocalCommerceAppliedMigration[],
  expectedProjectId: string,
): LocalCommerceMigrationPlan {
  const manifestValidation = validateMigrationManifest(manifest);
  if (manifestValidation.status !== "valid") {
    return { status: "blocked", code: "invalid_manifest", detail: manifestValidation.detail };
  }
  if (manifest.projectId !== expectedProjectId) {
    return {
      status: "blocked",
      code: "project_mismatch",
      detail: "manifest project does not match the selected local project",
    };
  }

  const appliedByVersion = new Map<number, LocalCommerceAppliedMigration>();
  for (const entry of applied) {
    if (entry.projectId !== expectedProjectId) {
      return {
        status: "blocked",
        code: "ledger_project_mismatch",
        version: entry.version,
        detail: "applied migration belongs to another local project",
      };
    }
    if (appliedByVersion.has(entry.version)) {
      return {
        status: "blocked",
        code: "ledger_version_gap",
        version: entry.version,
        detail: "migration ledger contains a duplicate version",
      };
    }
    appliedByVersion.set(entry.version, entry);
  }

  const apply: LocalCommerceMigrationDefinition[] = [];
  const skipped: LocalCommerceMigrationDefinition[] = [];
  for (let version = 1; version <= applied.length; version += 1) {
    if (!appliedByVersion.has(version)) {
      return { status: "blocked", code: "ledger_version_gap", version, detail: "applied migrations must form an exact ordered prefix" };
    }
  }
  for (const migration of manifest.migrations) {
    const existing = appliedByVersion.get(migration.version);
    if (!existing) {
      if (migration.version !== apply.length + skipped.length + 1) {
        return {
          status: "blocked",
          code: "ledger_version_gap",
          version: migration.version,
          detail: "migration ledger cannot skip an earlier ordered migration",
        };
      }
      apply.push(migration);
      continue;
    }
    if (existing.migrationId !== migration.migrationId) {
      return {
        status: "blocked",
        code: "migration_identity_mismatch",
        version: migration.version,
        detail: "applied migration identity differs from the manifest",
      };
    }
    if (existing.checksum !== migration.checksum) {
      return {
        status: "blocked",
        code: "checksum_mismatch",
        version: migration.version,
        detail: "an applied migration was edited after it was recorded",
      };
    }
    skipped.push(migration);
  }

  for (const entry of applied) {
    if (!manifest.migrations.some((migration) => migration.version === entry.version)) {
      return {
        status: "blocked",
        code: "ledger_version_gap",
        version: entry.version,
        detail: "ledger contains a migration absent from the manifest",
      };
    }
  }

  return { status: "ready", apply, skipped };
}

export function decideLocalCommerceInitialization(
  input: LocalCommerceInitializationInput,
): LocalCommerceInitializationDecision {
  if (input.source !== "synthetic") {
    return { status: "blocked", code: "non_synthetic_initialization" };
  }
  if (input.containsCredentials) {
    return { status: "blocked", code: "credential_export_rejected" };
  }
  if (
    input.containsCustomerAccounts ||
    input.containsOrders ||
    input.containsPrivatePhotos
  ) {
    return { status: "blocked", code: "customer_data_export_rejected" };
  }
  return { status: "allowed", code: "synthetic_initialization_allowed" };
}
