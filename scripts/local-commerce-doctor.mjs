import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  auditPortPlan,
  readLocalCommerceConfig,
  summarizeLocalCommerceConfig,
} from "../app/application/local-commerce-environment.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commerceRoot = path.join(repoRoot, "local", "commerce");
const supabaseBinary = path.join(repoRoot, "node_modules", ".bin", "supabase");
const jsonOutput = process.argv.includes("--json");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: commerceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      SUPABASE_TELEMETRY_DISABLED: "true",
    },
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

function listeningPorts() {
  const result = run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "n"]);
  if (!result.ok) return [];
  return [...result.output.matchAll(/n(?:\*|\[::\]|127\.0\.0\.1|localhost):([0-9]+)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isInteger);
}

const configResult = readLocalCommerceConfig(process.env);
const ports = configResult.status === "ready" ? auditPortPlan(configResult.config.ports, listeningPorts()) : null;
const docker = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
const cliInstalled = existsSync(supabaseBinary);

const blockers = [];
if (configResult.status !== "ready") blockers.push("configuration_invalid");
if (!docker.ok) blockers.push("docker_unavailable");
if (!cliInstalled) blockers.push("supabase_cli_unavailable");
if (ports?.status === "blocked") blockers.push("reserved_port_conflict");

const report = {
  status: blockers.length === 0 ? "READY" : "BLOCKED",
  workspace: commerceRoot,
  config: configResult.status === "ready" ? summarizeLocalCommerceConfig(configResult.config) : "invalid_or_incomplete",
  configIssues: configResult.status === "invalid" ? configResult.issues.map(({ code, name }) => ({ code, name })) : [],
  docker: docker.ok ? "available" : "unavailable",
  supabaseCli: cliInstalled ? "local_dependency_available" : "unavailable",
  portPreflight: ports ?? "not_run_until_configuration_is_valid",
  migrationExecuted: false,
  resetExecuted: false,
  remoteAccessed: false,
  blockers,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`LOCAL COMMERCE DOCTOR: ${report.status}`);
  console.log(`workspace: ${report.workspace}`);
  console.log(`config: ${configResult.status === "ready" ? "ready" : "invalid_or_incomplete"}`);
  if (configResult.status === "invalid") {
    console.log(`config issues: ${report.configIssues.map(({ code, name }) => `${code}:${name}`).join(", ")}`);
  }
  console.log(`docker: ${report.docker}`);
  console.log(`supabase cli: ${report.supabaseCli}`);
  console.log(`port preflight: ${ports ? ports.status : "not run"}`);
  console.log(`migration/reset/remote: ${report.migrationExecuted}/${report.resetExecuted}/${report.remoteAccessed}`);
  if (blockers.length > 0) console.log(`blockers: ${blockers.join(", ")}`);
}

process.exitCode = blockers.length === 0 ? 0 : 1;
