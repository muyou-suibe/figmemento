import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  auditPortPlan,
  createProjectMarker,
  evaluateDestructiveReset,
  evaluateMarkerInitialization,
  readLocalCommerceConfig,
} from "../app/application/local-commerce-environment.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCommerceRoot = path.join(repoRoot, "local", "commerce");
const disposableWorkdirRoot = path.join(defaultCommerceRoot, "runtime", "disposable");
const configuredWorkdir = process.env.LOCAL_COMMERCE_WORKDIR?.trim();
const commerceRoot = path.resolve(
  configuredWorkdir
    ? path.isAbsolute(configuredWorkdir)
      ? configuredWorkdir
      : path.join(defaultCommerceRoot, configuredWorkdir)
    : defaultCommerceRoot,
);
if (configuredWorkdir && !commerceRoot.startsWith(`${disposableWorkdirRoot}${path.sep}`)) {
  console.error("LOCAL COMMERCE BLOCKED: disposable workdir must remain inside local/commerce/runtime/disposable");
  process.exit(2);
}
const markerRoot = path.join(defaultCommerceRoot, "runtime");
const configuredMarkerPath = process.env.LOCAL_COMMERCE_MARKER_PATH?.trim();
const markerPath = path.resolve(
  configuredMarkerPath
    ? path.isAbsolute(configuredMarkerPath)
      ? configuredMarkerPath
      : path.join(commerceRoot, configuredMarkerPath)
    : path.join(markerRoot, "project-marker.json"),
);
if (markerPath !== markerRoot && !markerPath.startsWith(`${markerRoot}${path.sep}`)) {
  console.error("LOCAL COMMERCE BLOCKED: marker path must remain inside local/commerce/runtime");
  process.exit(2);
}
const supabaseBinary = path.join(repoRoot, "node_modules", ".bin", "supabase");
const command = process.argv[2] ?? "health";

function run(args) {
  return spawnSync(supabaseBinary, args, {
    cwd: commerceRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" },
  });
}

function listeningPorts() {
  const result = spawnSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "n"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return [...(result.stdout ?? "").matchAll(/n(?:\*|\[::\]|127\.0\.0\.1|localhost):([0-9]+)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isInteger);
}

function requireConfig() {
  const result = readLocalCommerceConfig(process.env);
  if (result.status !== "ready") {
    console.error("LOCAL COMMERCE BLOCKED: invalid or incomplete local configuration");
    process.exit(2);
  }
  return result.config;
}

function requireCli() {
  if (!existsSync(supabaseBinary)) {
    console.error("LOCAL COMMERCE BLOCKED: repository Supabase CLI dependency is unavailable");
    process.exit(2);
  }
}

function requireProjectConfig(config) {
  const configPath = path.join(commerceRoot, "supabase", "config.toml");
  if (!existsSync(configPath)) {
    console.error("LOCAL COMMERCE BLOCKED: Supabase project config is unavailable");
    process.exit(2);
  }
  const projectId = readFileSync(configPath, "utf8").match(/^project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (projectId !== config.projectId) {
    console.error("LOCAL COMMERCE BLOCKED: Supabase project ID does not match the validated configuration");
    process.exit(2);
  }
}

function readMarker() {
  if (!existsSync(markerPath)) return null;
  try {
    return JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    return null;
  }
}

if (command === "prepare-disposable") {
  const config = requireConfig();
  if (config.projectKind !== "disposable_test" || config.environment !== "test") {
    console.error("LOCAL COMMERCE PREPARE BLOCKED: disposable test configuration is required");
    process.exit(2);
  }
  const expectedWorkdir = path.join(disposableWorkdirRoot, config.runId);
  if (commerceRoot !== expectedWorkdir) {
    console.error("LOCAL COMMERCE PREPARE BLOCKED: workdir must match the exact run ID");
    process.exit(2);
  }
  if (existsSync(commerceRoot)) {
    console.error("LOCAL COMMERCE PREPARE BLOCKED: disposable workdir already exists");
    process.exit(2);
  }
  const templatePath = path.join(defaultCommerceRoot, "supabase", "config.toml");
  const template = readFileSync(templatePath, "utf8");
  const projectConfig = template.replace(
    /^project_id\s*=\s*"[^"]+"\s*$/m,
    `project_id = "${config.projectId}"`,
  );
  const migrationSourceRoot = path.join(defaultCommerceRoot, "migrations");
  if (!existsSync(migrationSourceRoot)) {
    console.error("LOCAL COMMERCE PREPARE BLOCKED: approved migration source is unavailable");
    process.exit(2);
  }
  const migrationFiles = readdirSync(migrationSourceRoot)
    .filter((name) => /^\d+_[A-Za-z0-9._-]+\.sql$/.test(name))
    .sort();
  if (migrationFiles.length === 0) {
    console.error("LOCAL COMMERCE PREPARE BLOCKED: approved migrations are unavailable");
    process.exit(2);
  }
  const migrationTargetRoot = path.join(commerceRoot, "supabase", "migrations");
  mkdirSync(path.join(commerceRoot, "supabase"), { recursive: true });
  mkdirSync(migrationTargetRoot, { recursive: true });
  writeFileSync(path.join(commerceRoot, "supabase", "config.toml"), projectConfig, {
    encoding: "utf8",
    flag: "wx",
  });
  for (const migrationFile of migrationFiles) {
    copyFileSync(
      path.join(migrationSourceRoot, migrationFile),
      path.join(migrationTargetRoot, migrationFile),
    );
  }
  console.log("LOCAL COMMERCE DISPOSABLE WORKDIR: PREPARED");
} else if (command === "start") {
  const config = requireConfig();
  requireProjectConfig(config);
  const ports = auditPortPlan(config.ports, listeningPorts());
  if (ports.status !== "ready") {
    console.error("LOCAL COMMERCE BLOCKED: a reserved port is already in use");
    process.exit(2);
  }
  requireCli();
  const result = run(["start"]);
  console.log(result.status === 0 ? "LOCAL COMMERCE START: PASS" : "LOCAL COMMERCE START: FAIL");
  process.exitCode = result.status ?? 1;
} else if (command === "stop") {
  const config = requireConfig();
  requireProjectConfig(config);
  requireCli();
  const result = run(["stop"]);
  console.log(result.status === 0 ? "LOCAL COMMERCE STOP: PASS" : "LOCAL COMMERCE STOP: FAIL");
  process.exitCode = result.status ?? 1;
} else if (command === "health") {
  const config = requireConfig();
  requireProjectConfig(config);
  requireCli();
  const result = run(["status", "-o", "json"]);
  console.log(result.status === 0 ? "LOCAL COMMERCE HEALTH: PASS" : "LOCAL COMMERCE HEALTH: FAIL");
  process.exitCode = result.status ?? 1;
} else if (command === "reset") {
  const config = requireConfig();
  requireProjectConfig(config);
  const decision = evaluateDestructiveReset({
    config,
    marker: readMarker(),
    currentRunId: process.env.LOCAL_COMMERCE_RUN_ID,
    allowDisposableReset: process.env.LOCAL_COMMERCE_ALLOW_DISPOSABLE_RESET === "true",
    confirmedDisposableTarget: process.argv.includes("--confirm-disposable"),
  });
  if (decision.status !== "allowed") {
    console.error(`LOCAL COMMERCE RESET BLOCKED: ${decision.code}`);
    process.exit(2);
  }
  if (!process.argv.includes("--execute")) {
    console.error("LOCAL COMMERCE RESET BLOCKED: --execute is required");
    process.exit(2);
  }
  requireCli();
  const result = run(["db", "reset", "--local"]);
  console.log(result.status === 0 ? "LOCAL COMMERCE RESET: PASS" : "LOCAL COMMERCE RESET: FAIL");
  process.exitCode = result.status ?? 1;
} else if (command === "init-marker") {
  const configResult = readLocalCommerceConfig(process.env);
  if (configResult.status === "ready") requireProjectConfig(configResult.config);
  const existingMarker = readMarker();
  const decision = evaluateMarkerInitialization({
    config: configResult,
    existingMarker,
    confirmedNewProject: process.argv.includes("--confirm-new-project"),
  });
  if (decision.status !== "allowed" || configResult.status !== "ready") {
    console.error(`LOCAL COMMERCE MARKER BLOCKED: ${decision.code}`);
    process.exit(2);
  }
  mkdirSync(path.dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify(createProjectMarker(configResult.config, new Date().toISOString()), null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log("LOCAL COMMERCE MARKER: INITIALIZED");
} else {
  console.error("Usage: local-commerce-stack.mjs <prepare-disposable|start|stop|health|reset|init-marker>");
  process.exitCode = 2;
}
