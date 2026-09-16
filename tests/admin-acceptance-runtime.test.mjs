import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  readAdminAcceptanceConfiguration,
  resolveAdminAcceptanceSource,
} from "../app/config/admin-acceptance-runtime.server.ts";

function factories(calls, options = {}) {
  return {
    production() {
      calls.production += 1;
      if (options.productionFailure) throw new Error("production provider failure");
      return "production-value";
    },
    localFake() {
      calls.localFake += 1;
      if (options.localFailure) throw new Error("local provider failure");
      return "local-value";
    },
  };
}

test("Task 1.2: absent selector preserves the production/default classification", () => {
  assert.deepEqual(
    readAdminAcceptanceConfiguration({}, "development"),
    { status: "production_default", source: "production", runtimeMode: "development" },
  );
  assert.deepEqual(
    readAdminAcceptanceConfiguration({}, "production"),
    { status: "production_default", source: "production", runtimeMode: "production" },
  );
});

test("Task 1.2: local_fake is accepted only in development and test", () => {
  assert.deepEqual(
    readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_fake" }, "development"),
    { status: "local_fake", source: "local_fake", runtimeMode: "development" },
  );
  assert.deepEqual(
    readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_fake" }, "test"),
    { status: "local_fake", source: "local_fake", runtimeMode: "test" },
  );
});

test("Task 1.2: production and unknown runtime reject local_fake without changing it to production", () => {
  for (const mode of ["production", "unknown-runtime"]) {
    const result = readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_fake" }, mode);
    assert.deepEqual(result, {
      status: "configuration_failure",
      key: "ADMIN_ACCEPTANCE_SOURCE",
      reason: "local_source_not_allowed",
      runtimeMode: mode === "production" ? "production" : "unknown",
    });
  }
});

test("Task 1.2: unknown values fail closed instead of selecting either source", () => {
  for (const value of ["abc", "true", "1", "local", "fake", "fixture"]) {
    assert.deepEqual(
      readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: value }, "development"),
      {
        status: "configuration_failure",
        key: "ADMIN_ACCEPTANCE_SOURCE",
        reason: "unknown_source",
        runtimeMode: "development",
      },
    );
  }
});

test("Task 1.3: authorized source policy invokes only the selected deferred factory", () => {
  const localCalls = { production: 0, localFake: 0 };
  assert.deepEqual(
    resolveAdminAcceptanceSource(
      "authorized",
      factories(localCalls),
      { ADMIN_ACCEPTANCE_SOURCE: "local_fake" },
      "development",
    ),
    { status: "resolved", source: "local_fake", value: "local-value" },
  );
  assert.deepEqual(localCalls, { production: 0, localFake: 1 });

  const productionCalls = { production: 0, localFake: 0 };
  assert.deepEqual(
    resolveAdminAcceptanceSource("authorized", factories(productionCalls), {}, "production"),
    { status: "resolved", source: "production", value: "production-value" },
  );
  assert.deepEqual(productionCalls, { production: 1, localFake: 0 });
});

test("Task 1.3: unauthorized and invalid-session gates invoke zero privileged factories", () => {
  for (const authorization of ["unauthorized", "authentication_failure"]) {
    const calls = { production: 0, localFake: 0 };
    assert.deepEqual(
      resolveAdminAcceptanceSource(
        authorization,
        factories(calls),
        { ADMIN_ACCEPTANCE_SOURCE: "local_fake" },
        "development",
      ),
      { status: authorization },
    );
    assert.deepEqual(calls, { production: 0, localFake: 0 });
  }
});

test("Task 1.4: explicit configuration failures invoke no source and do not fall back", () => {
  const calls = { production: 0, localFake: 0 };
  assert.deepEqual(
    resolveAdminAcceptanceSource(
      "authorized",
      factories(calls),
      { ADMIN_ACCEPTANCE_SOURCE: "local_fake" },
      "production",
    ),
    { status: "configuration_failure", key: "ADMIN_ACCEPTANCE_SOURCE", reason: "local_source_not_allowed" },
  );
  assert.deepEqual(calls, { production: 0, localFake: 0 });
});

test("Task 1.4: source failures are bounded and never retried through the other source", () => {
  const localCalls = { production: 0, localFake: 0 };
  assert.deepEqual(
    resolveAdminAcceptanceSource(
      "authorized",
      factories(localCalls, { localFailure: true }),
      { ADMIN_ACCEPTANCE_SOURCE: "local_fake" },
      "test",
    ),
    { status: "source_failure", source: "local_fake" },
  );
  assert.deepEqual(localCalls, { production: 0, localFake: 1 });

  const productionCalls = { production: 0, localFake: 0 };
  assert.deepEqual(
    resolveAdminAcceptanceSource(
      "authorized",
      factories(productionCalls, { productionFailure: true }),
      {},
      "production",
    ),
    { status: "source_failure", source: "production" },
  );
  assert.deepEqual(productionCalls, { production: 1, localFake: 0 });
});

test("Task 1.4: selector is not request-controlled or client-visible", async () => {
  const source = await readFile(new URL("../app/config/admin-acceptance-runtime.server.ts", import.meta.url), "utf8");
  assert.match(source, /ADMIN_ACCEPTANCE_SOURCE/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_/);
  assert.doesNotMatch(source, /URLSearchParams|Request\b|cookies\(|localStorage|sessionStorage|window\.|document\./);
  assert.doesNotMatch(source, /console\.(log|warn|error)/);
  assert.match(source, /process\.env\.NODE_ENV/);
  assert.match(source, /environment\.ADMIN_ACCEPTANCE_SOURCE/);
});
