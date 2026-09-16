import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  decideLocalCommerceInitialization,
  planMigrationLedger,
  sha256Text,
  validateMigrationManifest,
} from "../app/application/local-commerce-migration-ledger.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = path.join(repoRoot, "local", "commerce", "migrations");
const manifestPath = path.join(migrationsRoot, "manifest.json");
const command = process.argv[2] ?? "verify";

function readManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function verifyManifest() {
  const manifest = readManifest();
  const result = validateMigrationManifest(manifest);
  if (result.status !== "valid") {
    console.error(`LOCAL COMMERCE MIGRATIONS BLOCKED: ${result.detail}`);
    process.exitCode = 2;
    return;
  }

  for (const migration of manifest.migrations) {
    const filePath = path.join(migrationsRoot, migration.filename);
    if (!existsSync(filePath)) {
      console.error(`LOCAL COMMERCE MIGRATIONS BLOCKED: missing ${migration.filename}`);
      process.exitCode = 2;
      return;
    }
    const checksum = sha256Text(readFileSync(filePath, "utf8"));
    if (checksum !== migration.checksum) {
      console.error(`LOCAL COMMERCE MIGRATIONS BLOCKED: checksum mismatch at ${migration.filename}`);
      process.exitCode = 2;
      return;
    }
  }

  const synthetic = decideLocalCommerceInitialization({
    source: "synthetic",
    containsCustomerAccounts: false,
    containsOrders: false,
    containsPrivatePhotos: false,
    containsCredentials: false,
  });
  const imported = decideLocalCommerceInitialization({
    source: "customer_export",
    containsCustomerAccounts: true,
    containsOrders: true,
    containsPrivatePhotos: true,
    containsCredentials: true,
  });
  if (synthetic.status !== "allowed" || imported.status !== "blocked") {
    console.error("LOCAL COMMERCE MIGRATIONS BLOCKED: initialization safety contract failed");
    process.exitCode = 2;
    return;
  }

  console.log(`LOCAL COMMERCE MIGRATIONS: ${manifest.migrations.length} ordered migration(s) verified`);
  console.log("LOCAL COMMERCE MIGRATIONS: no database connection or migration execution performed");
}

if (["prepare-disposable", "apply-disposable", "plan-disposable"].includes(command)) {
  const action = { "prepare-disposable": "prepare", "apply-disposable": "start", "plan-disposable": "plan" }[command];
  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts/local-commerce-ledger-disposable.mjs"), action, ...process.argv.slice(3)], { stdio: "inherit", env: process.env });
  process.exitCode = result.status ?? 1;
} else if (command === "verify") {
  verifyManifest();
} else if (command === "plan") {
  const manifest = readManifest();
  const result = planMigrationLedger(manifest, [], manifest.projectId);
  if (result.status !== "ready") {
    console.error(`LOCAL COMMERCE MIGRATIONS BLOCKED: ${result.detail}`);
    process.exitCode = 2;
  } else {
    console.log(`LOCAL COMMERCE MIGRATIONS PLAN: apply ${result.apply.length}, skip ${result.skipped.length}`);
    console.log("LOCAL COMMERCE MIGRATIONS: plan only; no database connection or execution performed");
  }
} else {
  console.error("Usage: local-commerce-migrations.mjs <verify|plan|prepare-disposable|apply-disposable|plan-disposable>");
  process.exitCode = 2;
}
