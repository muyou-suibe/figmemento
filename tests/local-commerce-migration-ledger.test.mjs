import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  decideLocalCommerceInitialization,
  planMigrationLedger,
  sha256Text,
  validateMigrationManifest,
} from "../app/application/local-commerce-migration-ledger.ts";

const root = path.resolve(process.cwd());
const manifest = JSON.parse(
  readFileSync(path.join(root, "local/commerce/migrations/manifest.json"), "utf8"),
);
const sqlPath = path.join(root, "local/commerce/migrations", manifest.migrations[0].filename);

test("the local migration manifest is ordered, versioned, and checksum-addressed", () => {
  assert.deepEqual(validateMigrationManifest(manifest), { status: "valid" });
  assert.equal(sha256Text(readFileSync(sqlPath, "utf8")), manifest.migrations[0].checksum);
  assert.equal(manifest.schema, "local_commerce");
  assert.equal(manifest.projectId, "figmemento-local-commerce");
});

test("a fresh project plans every migration exactly once", () => {
  const plan = planMigrationLedger(manifest, [], manifest.projectId);
  assert.equal(plan.status, "ready");
  if (plan.status === "ready") {
    assert.deepEqual(plan.apply.map((migration) => migration.version), Array.from({length: manifest.schemaVersion}, (_, i) => i + 1));
    assert.deepEqual(plan.skipped, []);
  }
});

test("an applied migration is skipped only when identity and checksum still match", () => {
  const plan = planMigrationLedger(
    manifest,
    [{
      version: 1,
      migrationId: manifest.migrations[0].migrationId,
      checksum: manifest.migrations[0].checksum,
      projectId: manifest.projectId,
    }],
    manifest.projectId,
  );
  assert.equal(plan.status, "ready");
  if (plan.status === "ready") {
    assert.deepEqual(plan.apply.map((migration) => migration.version), Array.from({length: manifest.schemaVersion - 1}, (_, i) => i + 2));
    assert.deepEqual(plan.skipped.map((migration) => migration.version), [1]);
  }
});

test("project drift, checksum drift, and identity drift fail closed", () => {
  assert.equal(planMigrationLedger(manifest, [], "another-project").status, "blocked");
  assert.equal(
    planMigrationLedger(
      manifest,
      [{ version: 1, migrationId: manifest.migrations[0].migrationId, checksum: "0".repeat(64), projectId: manifest.projectId }],
      manifest.projectId,
    ).status,
    "blocked",
  );
  assert.equal(
    planMigrationLedger(
      manifest,
      [{ version: 1, migrationId: "different", checksum: manifest.migrations[0].checksum, projectId: manifest.projectId }],
      manifest.projectId,
    ).status,
    "blocked",
  );
});

test("the manifest rejects out-of-order migrations and applied checksum edits", () => {
  const outOfOrder = { ...manifest, migrations: [{ ...manifest.migrations[0], version: 2 }], schemaVersion: 1 };
  assert.equal(validateMigrationManifest(outOfOrder).status, "invalid");
  const edited = {
    ...manifest,
    migrations: [{ ...manifest.migrations[0], checksum: "a".repeat(64) }, manifest.migrations[1]],
  };
  assert.equal(
    planMigrationLedger(
      edited,
      [{
        version: 1,
        migrationId: manifest.migrations[0].migrationId,
        checksum: manifest.migrations[0].checksum,
        projectId: manifest.projectId,
      }],
      edited.projectId,
    ).status,
    "blocked",
  );
  assert.notEqual(sha256Text(readFileSync(sqlPath, "utf8")), edited.migrations[0].checksum);
});

test("synthetic initialization is allowed but customer exports and credentials are rejected", () => {
  assert.deepEqual(
    decideLocalCommerceInitialization({
      source: "synthetic",
      containsCustomerAccounts: false,
      containsOrders: false,
      containsPrivatePhotos: false,
      containsCredentials: false,
    }),
    { status: "allowed", code: "synthetic_initialization_allowed" },
  );
  assert.equal(
    decideLocalCommerceInitialization({
      source: "customer_export",
      containsCustomerAccounts: true,
      containsOrders: true,
      containsPrivatePhotos: true,
      containsCredentials: true,
    }).status,
    "blocked",
  );
});

test("the ledger SQL is local-only and constrains checksums and service access", () => {
  const sql = readFileSync(sqlPath, "utf8");
  assert.match(sql, /create schema if not exists local_commerce/i);
  assert.match(sql, /create table if not exists local_commerce\.migration_ledger/i);
  assert.match(sql, /migration_ledger_checksum_check/i);
  assert.match(sql, /revoke all on schema local_commerce from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update on table local_commerce\.migration_ledger to service_role/i);
  assert.doesNotMatch(sql, /create\s+table[^;]*(customer|orders|photos)/i);
  assert.doesNotMatch(sql, /insert\s+into\s+[^;]+(customer|orders|photos)/i);
});
