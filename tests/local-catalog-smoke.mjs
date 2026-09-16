import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, cp, lstat, mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureNotice = "DEVELOPMENT / TEST ONLY";
const fixtureExplanation = "Development fixture catalog — this content is not a production catalog source.";
const runtimeEntries = [
  ".openai",
  "app",
  "build",
  "public",
  "worker",
  ".gitignore",
  "eslint.config.mjs",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "tsconfig.json",
  "vite.config.ts",
];

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose, reject) => {
    if (!server.listening) {
      resolveClose();
      return;
    }
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

async function allocatePort() {
  const server = createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}

async function optionalStat(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function statIsUnchanged(before, after) {
  if (before === null || after === null) return before === after;
  return before.size === after.size && before.mtimeMs === after.mtimeMs;
}

async function prepareIsolatedProject(tempRoot, sentinelPort, appPort) {
  const project = join(tempRoot, "project");
  await mkdir(project);
  await cp(join(workspace, "package.json"), join(project, "package.json"), {
    recursive: false,
  });
  for (const entry of runtimeEntries.filter((candidate) => candidate !== "package.json")) {
    await cp(join(workspace, entry), join(project, entry), { recursive: true });
  }
  await symlink(join(workspace, "node_modules"), join(project, "node_modules"), "dir");

  const isolatedEnvironmentPath = join(project, ".env.local");
  try {
    await access(isolatedEnvironmentPath);
    throw new Error("Refusing to overwrite an existing isolated .env.local file.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const sentinelUrl = `http://127.0.0.1:${sentinelPort}`;
  await writeFile(
    isolatedEnvironmentPath,
    [
      "PHOTOGIFT_PRODUCT_SOURCE=fixture",
      `NEXT_PUBLIC_SUPABASE_URL=${sentinelUrl}`,
      "SUPABASE_SECRET_KEY=local-smoke-sentinel-not-a-provider-secret",
      `NEXT_PUBLIC_DEPLOYMENT_ORIGIN=http://127.0.0.1:${appPort}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );
  return { project, isolatedEnvironmentPath, sentinelUrl };
}

function childEnvironment() {
  const allowed = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SHELL", "TERM", "CODEX_SANDBOX"];
  const environment = Object.fromEntries(
    allowed.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]]),
  );
  return {
    ...environment,
    CI: "1",
    NO_COLOR: "1",
  };
}

function waitForExit(child) {
  return new Promise((resolveExit) => {
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
}

async function terminateProcessGroup(child, exitPromise) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  const exited = await Promise.race([
    exitPromise.then(() => true),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), 5_000)),
  ]);
  if (exited) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  await exitPromise;
}

async function fetchUntilReady(url, childExitPromise, logs) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const outcome = await Promise.race([
      fetch(url, { signal: AbortSignal.timeout(2_000) })
        .then(async (response) => ({ type: "response", response, body: await response.text() }))
        .catch(() => ({ type: "retry" })),
      childExitPromise.then((exit) => ({ type: "exit", exit })),
    ]);
    if (outcome.type === "exit") {
      throw new Error(`Development server exited before readiness (${JSON.stringify(outcome.exit)}).\n${logs()}`);
    }
    if (outcome.type === "response" && outcome.response.status === 200 && outcome.body.includes(fixtureNotice)) {
      return { status: outcome.response.status, body: outcome.body };
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Timed out waiting for fixture-backed development server.\n${logs()}`);
}

function assertRoute(result, route, requiredContent) {
  assert.equal(result.status, 200, `${route} should return HTTP 200`);
  assert.match(result.contentType, /^text\/html\b/i, `${route} should return HTML`);
  assert.ok(result.body.includes(fixtureNotice), `${route} should display the fixture notice`);
  assert.ok(result.body.includes(fixtureExplanation), `${route} should explain the fixture notice`);
  for (const text of requiredContent) {
    assert.ok(result.body.includes(text), `${route} should contain '${text}'`);
  }
  assert.doesNotMatch(result.body, /collection is temporarily unavailable/i);
  assert.doesNotMatch(result.body, /https:\/\/example\.com/i);
}

async function run() {
  const workspaceEnvironmentPath = join(workspace, ".env.local");
  const workspaceEnvironmentBefore = await optionalStat(workspaceEnvironmentPath);
  const tempRoot = await mkdtemp(join(tmpdir(), "photogift-local-demo-"));
  let sentinel;
  let child;
  let childExitPromise;
  let stdout = "";
  let stderr = "";
  let observedRequestCount = 0;
  let cleanupPromise;
  let summary;

  const logs = () => `stdout:\n${stdout.slice(-8_000)}\nstderr:\n${stderr.slice(-8_000)}`;
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      if (child && childExitPromise) await terminateProcessGroup(child, childExitPromise);
      if (sentinel) await closeServer(sentinel);
      await rm(tempRoot, { recursive: true, force: true });
      try {
        await lstat(tempRoot);
        throw new Error("Temporary smoke directory was not removed.");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const workspaceEnvironmentAfter = await optionalStat(workspaceEnvironmentPath);
      assert.equal(
        statIsUnchanged(workspaceEnvironmentBefore, workspaceEnvironmentAfter),
        true,
        "Workspace .env.local must remain untouched",
      );
    })();
    return cleanupPromise;
  };

  const stopForSignal = (signal) => {
    void cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", stopForSignal);
  process.once("SIGTERM", stopForSignal);

  try {
    sentinel = createServer((_request, response) => {
      observedRequestCount += 1;
      response.writeHead(503, { "content-type": "text/plain", connection: "close" });
      response.end("Local observation sentinel only; no Supabase response is simulated.");
    });
    const sentinelPort = await listen(sentinel);
    const appPort = await allocatePort();
    const isolated = await prepareIsolatedProject(tempRoot, sentinelPort, appPort);
    assert.ok(isolated.sentinelUrl.startsWith("http://127.0.0.1:"));
    assert.equal(basename(isolated.isolatedEnvironmentPath), ".env.local");

    child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(appPort)],
      {
        cwd: isolated.project,
        env: childEnvironment(),
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-20_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-20_000); });
    childExitPromise = waitForExit(child);

    const baseUrl = `http://127.0.0.1:${appPort}`;
    const homepage = await fetchUntilReady(`${baseUrl}/`, childExitPromise, logs);
    const routeDefinitions = [
      ["/", ["Custom Couple Figure"]],
      ["/shop", ["Custom Couple Figure"]],
      ["/category/3d-figures", ["3D Figures", "Custom Couple Figure"]],
      ["/product/couple-figure", [
        "Custom Couple Figure",
        "Size",
        "Mini",
        "Standard",
        "Deluxe",
        "Delivery format",
        "Physical",
        "Production",
        "Custom Manufacturing",
        "Production lead time",
        "5–10 business days",
        "Shipping",
        "Required",
        "thumbnail media unavailable",
      ]],
    ];
    const routeResults = [];
    for (const [route, requiredContent] of routeDefinitions) {
      const responseResult = route === "/"
        ? homepage
        : await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(10_000) }).then(async (response) => ({
            status: response.status,
            body: await response.text(),
            contentType: response.headers.get("content-type") ?? "",
          }));
      const normalized = {
        status: responseResult.status,
        body: responseResult.body,
        contentType: responseResult.contentType ?? "text/html",
      };
      assertRoute(normalized, route, requiredContent);
      if (route === "/product/couple-figure") {
        assert.match(normalized.body, /<button[^>]*disabled[^>]*>\s*Deluxe\s*<\/button>/i);
        assert.ok(normalized.body.includes("From $69.90"));
      }
      routeResults.push({ route, status: normalized.status, content: "PASS" });
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    assert.equal(observedRequestCount, 0, "Fixture smoke must make zero Supabase sentinel requests");
    summary = {
      result: "PASS",
      routes: routeResults,
      observedSupabaseRequestCount: observedRequestCount,
      liveProviderUsed: false,
      workspaceEnvironmentPreserved: true,
      temporaryEnvironment: "isolated",
    };
  } finally {
    process.removeListener("SIGINT", stopForSignal);
    process.removeListener("SIGTERM", stopForSignal);
    await cleanup();
  }

  console.log(JSON.stringify({ ...summary, cleanup: "PASS" }, null, 2));
}

await run();
