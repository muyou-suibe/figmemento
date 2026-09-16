import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const projectId = "figmemento-local-commerce";
const commerceRoot = path.join(root, "local", "commerce");
const databaseVolume = "supabase_db_figmemento-local-commerce";
const stackScript = path.join(root, "scripts", "local-commerce-stack.mjs");
const ledgerScript = path.join(root, "scripts", "local-commerce-ledger-retained.mjs");

if (!process.argv.includes("--confirm-retained-initialization")) {
  throw new Error("Explicit retained initialization confirmation required");
}

const exactEnvironment = {
  ...process.env,
  SUPABASE_TELEMETRY_DISABLED: "true",
  LOCAL_COMMERCE_ENVIRONMENT: "development",
  LOCAL_COMMERCE_PROJECT_KIND: "retained_development",
  LOCAL_COMMERCE_PROJECT_ID: projectId,
  LOCAL_COMMERCE_RUN_ID: "retained-development",
  LOCAL_COMMERCE_DB_MAJOR_VERSION: "17",
  LOCAL_COMMERCE_SHADOW_DB_PORT: "55420",
  LOCAL_COMMERCE_API_PORT: "55421",
  LOCAL_COMMERCE_DB_PORT: "55422",
  LOCAL_COMMERCE_STUDIO_PORT: "55423",
  LOCAL_COMMERCE_SMTP_PORT: "55424",
  LOCAL_COMMERCE_IMAGE_HELPER_PORT: "55425",
  LOCAL_COMMERCE_API_URL: "http://127.0.0.1:55421",
  LOCAL_COMMERCE_RPC_URL: "http://127.0.0.1:55421",
  LOCAL_COMMERCE_STORAGE_URL: "http://127.0.0.1:55421/storage/v1",
  LOCAL_COMMERCE_IMAGE_HELPER_URL: "http://127.0.0.1:55425",
};

function run(binary, args, options = {}) {
  return spawnSync(binary, args, {
    cwd: root,
    env: exactEnvironment,
    encoding: "utf8",
    timeout: options.timeout ?? 10_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${(result.error?.message || result.stderr || "failed").split("\n")[0]}`);
  }
  return result.stdout.trim();
}

function targetContainers(all = false) {
  const result = run("docker", [all ? "ps" : "ps", ...(all ? ["-a"] : []), "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.ID}}"]);
  return requireSuccess(result, "container inventory").split("\n").filter(Boolean);
}

function exactRunningDatabase() {
  const ids = targetContainers();
  if (ids.length === 0) return null;
  const inspected = JSON.parse(requireSuccess(run("docker", ["inspect", ...ids]), "container inspect"));
  const matches = inspected.filter((container) =>
    container.Config?.Labels?.["com.supabase.cli.project"] === projectId &&
    container.Config?.Labels?.["com.supabase.cli.workdir"] === commerceRoot &&
    container.Name?.startsWith("/supabase_db_") &&
    container.State?.Running === true &&
    container.Mounts?.some((mount) =>
      mount.Type === "volume" && mount.Name === databaseVolume && mount.Destination === "/var/lib/postgresql/data"));
  assert.ok(matches.length <= 1, "multiple exact retained databases");
  return matches[0] ?? null;
}

function databaseReady(id) {
  const result = run("docker", ["exec", id, "pg_isready", "-U", "postgres", "-d", "postgres"], { timeout: 5_000 });
  return result.status === 0;
}

function ledger(command, extra = []) {
  return run(process.execPath, [ledgerScript, command, ...extra], { timeout: command === "apply" ? 900_000 : 30_000 });
}

assert.equal(targetContainers(true).length, 0, "retained containers already exist");
for (const volume of [
  databaseVolume,
  "supabase_storage_figmemento-local-commerce",
  "supabase_edge_runtime_figmemento-local-commerce",
]) {
  const inspected = JSON.parse(requireSuccess(run("docker", ["volume", "inspect", volume]), `volume ${volume}`));
  assert.equal(inspected[0]?.Labels?.["com.supabase.cli.project"], projectId);
}

const start = spawn(process.execPath, [stackScript, "start"], {
  cwd: root,
  env: exactEnvironment,
  stdio: ["ignore", "pipe", "pipe"],
});
let startOutput = "";
for (const stream of [start.stdout, start.stderr]) {
  stream.on("data", (chunk) => { startOutput = (startOutput + chunk).slice(-16_000); });
}
let startExit = null;
start.once("exit", (code, signal) => { startExit = { code, signal }; });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let database = null;
for (let attempt = 0; attempt < 90 && startExit === null; attempt += 1) {
  database = exactRunningDatabase();
  if (database && databaseReady(database.Id)) break;
  await delay(1_000);
}

if (!database || !databaseReady(database.Id)) {
  throw new Error(`Exact retained PostgreSQL did not become ready during normal stack start: ${startOutput.split("\n").at(-1)}`);
}
assert.equal(database.Config?.Image?.includes("postgres:17") || database.Config?.Image?.includes("postgres-17"), true, "PostgreSQL 17 image required");

const preflight = ledger("preflight");
requireSuccess(preflight, "fresh retained schema preflight");
console.log(preflight.stdout.trim());

const applied = ledger("apply", ["--confirm-retained-initialization"]);
requireSuccess(applied, "retained migration apply");
console.log(applied.stdout.trim());

const startDeadline = Date.now() + 240_000;
while (startExit === null && Date.now() < startDeadline) await delay(1_000);
if (startExit === null) {
  throw new Error("Normal retained stack start did not complete after schema initialization");
}
if (startExit.code !== 0) {
  throw new Error(`Normal retained stack start failed after schema initialization: ${startOutput.split("\n").filter(Boolean).at(-1)}`);
}

const plan = ledger("plan");
requireSuccess(plan, "retained ledger plan");
console.log(plan.stdout.trim());
console.log(JSON.stringify({ status: "INITIALIZED", launcherPid: start.pid, stackStart: startExit, projectId }));
