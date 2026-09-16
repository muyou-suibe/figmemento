import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { planMigrationLedger, sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const commerceRoot = path.join(repoRoot, "local", "commerce");
const markerPath = path.join(commerceRoot, "runtime", "project-marker.json");
const configPath = path.join(commerceRoot, "supabase", "config.toml");
const cliPath = path.join(repoRoot, "node_modules", ".bin", "supabase");
const manifestPath = path.join(commerceRoot, "migrations", "manifest.json");
const evidencePath = path.join(
  process.env.TMPDIR || "/private/tmp",
  "figmemento-task-11.2-retained-start-diagnostic.json",
);

const expected = Object.freeze({
  projectId: "figmemento-local-commerce",
  projectKind: "retained_development",
  runId: "retained-development",
  environment: "development",
  postgresMajorVersion: 17,
  ports: [55420, 55421, 55422, 55423, 55424, 55425],
  volumes: [
    "supabase_db_figmemento-local-commerce",
    "supabase_storage_figmemento-local-commerce",
    "supabase_edge_runtime_figmemento-local-commerce",
  ],
});
const excludedServices = Object.freeze([
  "vector",
  "logflare",
  "studio",
  "realtime",
  "edge-runtime",
  "mailpit",
  "imgproxy",
  "postgres-meta",
  "supavisor",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitize(value) {
  return String(value ?? "")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, "$1[REDACTED]@")
    .replace(
      /(^|\n)([^\n]*(?:service[_ -]?role|anon[_ -]?key|password|secret|token|api[_ -]?key)[^=:\n]*[=:]\s*)([^\n]+)/gi,
      "$1$2[REDACTED]",
    )
    .replace(/[A-Za-z0-9_-]{80,}/g, "[REDACTED_LONG_VALUE]");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    timeout: options.timeout ?? 5_000,
    env: options.env ?? process.env,
  });
  return {
    status: result.status,
    signal: result.signal,
    error: result.error ? sanitize(result.error.message) : null,
    rawStdout: String(result.stdout ?? ""),
    rawStderr: String(result.stderr ?? ""),
    stdout: sanitize(result.stdout),
    stderr: sanitize(result.stderr),
  };
}

function docker(args, timeout = 5_000) {
  return run("docker", args, { timeout });
}

function listTargetContainers() {
  const result = docker([
    "ps",
    "-a",
    "--filter",
    `label=com.supabase.cli.project=${expected.projectId}`,
    "--format",
    "{{json .}}",
  ]);
  if (result.status !== 0) return { result, containers: [] };
  const containers = result.rawStdout
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { result, containers };
}

function inspectTargetContainer(id) {
  const result = docker(["container", "inspect", id], 8_000);
  if (result.status !== 0) return { status: "inspect_failed", id, error: result.stderr };
  const [container] = JSON.parse(result.rawStdout);
  const labels = container.Config?.Labels ?? {};
  if (
    labels["com.supabase.cli.project"] !== expected.projectId ||
    labels["com.supabase.cli.workdir"] !== commerceRoot
  ) {
    return { status: "identity_rejected", id };
  }
  return {
    status: "identified",
    id: container.Id,
    name: container.Name?.replace(/^\//, ""),
    image: container.Config?.Image,
    project: labels["com.supabase.cli.project"],
    workdir: labels["com.supabase.cli.workdir"],
    created: container.Created,
    startedAt: container.State?.StartedAt,
    runtimeStatus: container.State?.Status,
    running: container.State?.Running,
    restarting: container.State?.Restarting,
    exitCode: container.State?.ExitCode,
    health: container.State?.Health?.Status ?? null,
    healthLog: (container.State?.Health?.Log ?? []).slice(-5).map((entry) => ({
      start: entry.Start,
      end: entry.End,
      exitCode: entry.ExitCode,
      output: sanitize(entry.Output),
    })),
    ports: container.NetworkSettings?.Ports ?? {},
    mounts: (container.Mounts ?? []).map((mount) => ({
      type: mount.Type,
      name: mount.Name,
      destination: mount.Destination,
      rw: mount.RW,
    })),
  };
}

function boundedLogs(container) {
  if (container.status !== "identified") return null;
  const result = docker([
    "logs",
    "--since",
    "8m",
    "--tail",
    "160",
    container.id,
  ], 8_000);
  return {
    name: container.name,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function psql(container, sql) {
  return docker([
    "exec", "-i", container.id, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", "postgres", "-c", sql,
  ], 10_000);
}

function verifyDatabase(container, manifest, canonicalMarkerDigest) {
  if (
    container.status !== "identified" ||
    !container.running ||
    !container.name?.startsWith("supabase_db_") ||
    !container.mounts.some((mount) =>
      mount.type === "volume" &&
      mount.name === "supabase_db_figmemento-local-commerce" &&
      mount.destination === "/var/lib/postgresql/data")
  ) return null;

  const ready = docker(["exec", container.id, "pg_isready", "-U", "postgres", "-d", "postgres"]);
  if (ready.status !== 0) return null;
  const query = `select json_build_object(
    'postgresMajor',current_setting('server_version_num')::int/10000,
    'schemaExists',to_regnamespace('local_commerce') is not null,
    'ledgerExists',to_regclass('local_commerce.migration_ledger') is not null,
    'identityExists',to_regclass('local_commerce.project_identities') is not null,
    'identityVerified',local_commerce.verify_project_identity('${expected.projectId}','${canonicalMarkerDigest}'),
    'ledger',coalesce((select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger),'[]'::json),
    'identity',(select json_build_object('projectId',project_id,'environment',environment,'projectKind',project_kind,'schemaVersion',schema_version,'markerDigest',marker_digest,'lifecycle',lifecycle) from local_commerce.project_identities where project_id='${expected.projectId}')
  );`;
  const result = psql(container, query);
  if (result.status !== 0) {
    return { status: "FAILED", error: result.stderr || result.stdout };
  }
  const facts = JSON.parse(result.rawStdout);
  assert.equal(facts.postgresMajor, 17);
  assert.equal(facts.schemaExists, true);
  assert.equal(facts.ledgerExists, true);
  assert.equal(facts.identityExists, true);
  assert.equal(facts.identityVerified, true);
  assert.equal(facts.ledger.length, 37);
  assert.deepEqual(facts.ledger.map((entry) => entry.version), Array.from({ length: 37 }, (_, index) => index + 1));
  const plan = planMigrationLedger(manifest, facts.ledger, expected.projectId);
  assert.equal(plan.status, "ready");
  assert.equal(plan.apply.length, 0);
  assert.deepEqual(facts.identity, {
    projectId: expected.projectId,
    environment: expected.environment,
    projectKind: expected.projectKind,
    schemaVersion: 37,
    markerDigest: canonicalMarkerDigest,
    lifecycle: "active",
  });
  return { status: "PASS", verifiedAt: new Date().toISOString(), container: container.name, facts, pending: 0 };
}

function inspectVolumes() {
  return expected.volumes.map((name) => {
    const result = docker(["volume", "inspect", name]);
    assert.equal(result.status, 0, `missing retained volume: ${name}`);
    const [volume] = JSON.parse(result.rawStdout);
    assert.equal(volume.Labels?.["com.supabase.cli.project"], expected.projectId);
    assert.equal(volume.Labels?.["com.docker.compose.project"], expected.projectId);
    return {
      name: volume.Name,
      driver: volume.Driver,
      createdAt: volume.CreatedAt,
      labels: volume.Labels,
    };
  });
}

function occupiedReservedPorts() {
  const result = run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "n"]);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`lsof failed: ${result.stderr}`);
  }
  const occupied = new Set(
    [...result.stdout.matchAll(/n(?:\*|\[::\]|127\.0\.0\.1|localhost):([0-9]+)/g)].map(
      (match) => Number(match[1]),
    ),
  );
  return expected.ports.filter((port) => occupied.has(port));
}

function dockerResourceSnapshot(containers) {
  const identified = containers.filter((container) => container.status === "identified" && container.running);
  if (identified.length === 0) return [];
  const result = docker(["stats", "--no-stream", "--format", "{{json .}}", ...identified.map((container) => container.id)], 15_000);
  if (result.status !== 0) return [{ status: "unavailable", error: result.stderr }];
  return result.rawStdout.split(/\n+/).filter(Boolean).map((line) => {
    const row = JSON.parse(line);
    return { name: row.Name, cpu: row.CPUPerc, memory: row.MemUsage, memoryPercent: row.MemPerc };
  });
}

async function requiredServiceProbes() {
  const statusResult = run(realpathSync(cliPath), ["status", "-o", "json"], {
    cwd: commerceRoot,
    env: exactEnvironment,
    timeout: 20_000,
  });
  assert.equal(statusResult.status, 0, statusResult.stderr);
  const status = JSON.parse(statusResult.rawStdout);
  assert.equal(status.API_URL, "http://127.0.0.1:55421");
  const serverHeaders = {
    apikey: status.SERVICE_ROLE_KEY,
    authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
  };
  const probe = async (name, url, options = {}) => {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5_000) });
      const contentType = response.headers.get("content-type");
      const body = await response.text();
      return { name, status: response.status, contentType, body: sanitize(body).slice(0, 500) };
    } catch (error) {
      return { name, status: null, contentType: null, body: "", error: sanitize(error?.message) };
    }
  };
  const api = await probe("postgrest-via-kong", `${status.API_URL}/rest/v1/`, { headers: serverHeaders });
  const rpc = await probe("project-identity-rpc", `${status.API_URL}/rest/v1/rpc/verify_project_identity`, {
    method: "POST",
    headers: { ...serverHeaders, "content-type": "application/json", "content-profile": "local_commerce" },
    body: JSON.stringify({ p_project_id: expected.projectId, p_marker_digest: canonicalMarkerDigest }),
  });
  const auth = await probe("gotrue-via-kong", `${status.API_URL}/auth/v1/health`, { headers: { apikey: status.ANON_KEY } });
  const storage = await probe("storage-via-kong", `${status.API_URL}/storage/v1/status`, { headers: serverHeaders });
  const bucket = await probe("private-bucket", `${status.API_URL}/storage/v1/bucket/local-commerce-private`, { headers: serverHeaders });
  const passed = api.status >= 200 && api.status < 300 &&
    rpc.status === 200 && rpc.body === "true" &&
    auth.status >= 200 && auth.status < 300 &&
    storage.status >= 200 && storage.status < 300 &&
    bucket.status === 200 && (() => { try { return JSON.parse(bucket.body).public === false; } catch { return false; } })();
  return { status: passed ? "PASS" : "FAIL", probes: [api, rpc, auth, storage, bucket] };
}

assert.ok(existsSync(markerPath));
assert.ok(existsSync(configPath));
assert.ok(existsSync(cliPath));
assert.ok(existsSync(manifestPath));

const markerBytes = readFileSync(markerPath);
const marker = JSON.parse(markerBytes.toString("utf8"));
assert.equal(marker.projectId, expected.projectId);
assert.equal(marker.projectKind, expected.projectKind);
assert.equal(marker.runId, expected.runId);
assert.equal(marker.environment, expected.environment);
assert.equal(marker.postgresMajorVersion, expected.postgresMajorVersion);

const config = readFileSync(configPath, "utf8");
assert.equal(config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1], expected.projectId);
assert.equal(Number(config.match(/^major_version\s*=\s*(\d+)/m)?.[1]), 17);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.equal(manifest.projectId, expected.projectId);
assert.equal(manifest.schemaVersion, 37);
assert.equal(manifest.migrations.length, 37);
for (const migration of manifest.migrations) {
  assert.equal(
    sha256Text(readFileSync(path.join(commerceRoot, "migrations", migration.filename), "utf8")),
    migration.checksum,
  );
}
const canonicalMarkerDigest = sha256Text(JSON.stringify(marker));
assert.equal(canonicalMarkerDigest, "111be9eaf847cf677e06d9f162bf810848414e7de7af5b80856f2e48fc4d9f6d");

const preContainers = listTargetContainers();
assert.equal(preContainers.result.status, 0);
assert.equal(preContainers.containers.length, 0, "retained project already has containers");
assert.deepEqual(occupiedReservedPorts(), [], "a retained reserved port is occupied");

const cliVersion = run(realpathSync(cliPath), ["--version"]);
assert.equal(cliVersion.status, 0);
const dockerInfo = docker(["info", "--format", "{{json .}}"], 15_000);
assert.equal(dockerInfo.status, 0);
const dockerHost = JSON.parse(dockerInfo.rawStdout);
const preflight = {
  projectId: expected.projectId,
  workdir: commerceRoot,
  markerDigest: sha256(markerBytes),
  canonicalMarkerDigest,
  marker: {
    projectId: marker.projectId,
    projectKind: marker.projectKind,
    runId: marker.runId,
    environment: marker.environment,
    postgresMajorVersion: marker.postgresMajorVersion,
  },
  volumes: inspectVolumes(),
  runningContainerCount: 0,
  occupiedReservedPorts: [],
  cliPath: realpathSync(cliPath),
  cliVersion: cliVersion.stdout.trim(),
  exclusionProfile: excludedServices,
  dockerAllocation: { cpus: dockerHost.NCPU, memoryBytes: dockerHost.MemTotal },
};

const exactEnvironment = {
  ...process.env,
  SUPABASE_TELEMETRY_DISABLED: "true",
  LOCAL_COMMERCE_ENVIRONMENT: "development",
  LOCAL_COMMERCE_PROJECT_KIND: "retained_development",
  LOCAL_COMMERCE_PROJECT_ID: expected.projectId,
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

const startedAt = new Date().toISOString();
const child = spawn(realpathSync(cliPath), ["start", "-x", excludedServices.join(",")], {
  cwd: commerceRoot,
  env: exactEnvironment,
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const timeline = [];
const lastByContainer = new Map();
const logCaptures = new Map();
const resourceSnapshots = [];
let databaseVerification = null;
let childExit = null;
child.on("exit", (code, signal) => {
  childExit = { code, signal, at: new Date().toISOString() };
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const deadline = Date.now() + 240_000;
while (Date.now() < deadline) {
  const listed = listTargetContainers();
  const inspected = listed.containers.map((row) => inspectTargetContainer(row.ID));
  timeline.push({
    at: new Date().toISOString(),
    cliExited: childExit !== null,
    containers: inspected,
  });
  if (timeline.length % 5 === 0) {
    resourceSnapshots.push({ at: new Date().toISOString(), containers: dockerResourceSnapshot(inspected) });
  }
  for (const container of inspected) {
    if (container.status !== "identified") continue;
    lastByContainer.set(container.name, container);
    if (
      container.health === "unhealthy" ||
      container.runtimeStatus === "exited" ||
      container.restarting ||
      (timeline.length >= 12 && container.health === "starting")
    ) {
      logCaptures.set(container.name, boundedLogs(container));
    }
    if (!databaseVerification && container.name?.startsWith("supabase_db_")) {
      databaseVerification = verifyDatabase(container, manifest, canonicalMarkerDigest);
    }
  }
  if (childExit?.code === 0 && databaseVerification?.status === "PASS") break;
  if (childExit && inspected.length === 0) break;
  await wait(2_000);
}

if (!childExit) {
  child.kill("SIGTERM");
  await wait(2_000);
  childExit ??= { code: null, signal: "diagnostic_timeout", at: new Date().toISOString() };
}

for (const container of lastByContainer.values()) {
  if (!logCaptures.has(container.name)) {
    logCaptures.set(container.name, boundedLogs(container));
  }
}

const postContainers = listTargetContainers();
const postVolumes = inspectVolumes();
const postMarkerBytes = readFileSync(markerPath);
let requiredServices = null;
if (childExit?.code === 0 && databaseVerification?.status === "PASS") {
  requiredServices = await requiredServiceProbes();
}
const evidence = {
  classification: "TASK_11_2_MINIMAL_COMMERCE_PROFILE_START",
  startedAt,
  completedAt: new Date().toISOString(),
  preflight,
  launcher: {
    pid: child.pid,
    cliPath: realpathSync(cliPath),
    cwd: commerceRoot,
    args: ["start", "-x", excludedServices.join(",")],
  },
  cli: {
    exit: childExit,
    stdout: sanitize(stdout),
    stderr: sanitize(stderr),
  },
  timeline,
  databaseVerification,
  requiredServices,
  resourceSnapshots,
  boundedLogs: [...logCaptures.values()].filter(Boolean),
  postflight: {
    targetContainerCount: postContainers.containers.length,
    targetContainers: postContainers.containers,
    volumes: postVolumes,
    markerDigest: sha256(postMarkerBytes),
    occupiedReservedPorts: occupiedReservedPorts(),
  },
};

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  status: childExit?.code === 0 && requiredServices?.status === "PASS" ? "STARTED" : "FAILED",
  evidencePath,
  cliExit: childExit,
  observedContainers: [...lastByContainer.keys()].sort(),
  exclusionProfile: excludedServices,
  databaseVerification: databaseVerification?.status ?? "NOT_CAPTURED",
  requiredServices: requiredServices?.status ?? "NOT_CAPTURED",
  finalContainerCount: postContainers.containers.length,
  markerDigestUnchanged: preflight.markerDigest === evidence.postflight.markerDigest,
  volumeNamesUnchanged:
    preflight.volumes.map((item) => item.name).sort().join("|") ===
    postVolumes.map((item) => item.name).sort().join("|"),
}));
