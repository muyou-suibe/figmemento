import assert from "node:assert/strict";
import test from "node:test";

import {
  readLocalOrderConfig,
  readTrustedLocalOrderConfig,
} from "../app/config/local-order-runtime.ts";
import { ServerConfigurationError } from "../app/config/server.ts";

test("Local Order runtime is disabled by default", () => {
  assert.deepEqual(
    readLocalOrderConfig({ NODE_ENV: "development" }, "development"),
    { source: "disabled", runtimeMode: "development" },
  );
});

test("explicit local_fake is enabled only in development and test", () => {
  assert.deepEqual(
    readLocalOrderConfig({ LOCAL_ORDER_SOURCE: "local_fake" }, "development"),
    { source: "local_fake", runtimeMode: "development" },
  );
  assert.deepEqual(
    readLocalOrderConfig({ LOCAL_ORDER_SOURCE: "local_fake" }, "test"),
    { source: "local_fake", runtimeMode: "test" },
  );
  assert.throws(
    () => readLocalOrderConfig({ LOCAL_ORDER_SOURCE: "local_fake" }, "production"),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_ORDER_SOURCE",
  );
  assert.throws(
    () => readLocalOrderConfig({ LOCAL_ORDER_SOURCE: "local_fake" }),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_ORDER_SOURCE",
  );
});

test("invalid local Order source is rejected without environment disclosure", () => {
  assert.throws(
    () => readLocalOrderConfig({ LOCAL_ORDER_SOURCE: "supabase", SECRET_VALUE: "hidden" }, "development"),
    (error) => {
      assert.ok(error instanceof ServerConfigurationError);
      assert.equal(error.key, "LOCAL_ORDER_SOURCE");
      assert.doesNotMatch(error.message, /hidden/);
      return true;
    },
  );
});

test("trusted configuration uses direct process.env.NODE_ENV authority", () => {
  const previousMode = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.throws(
      () => readTrustedLocalOrderConfig({ LOCAL_ORDER_SOURCE: "local_fake", NODE_ENV: "development" }),
      (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_ORDER_SOURCE",
    );
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  }
});

test("configuration result does not copy the runtime environment", () => {
  const environment = {
    LOCAL_ORDER_SOURCE: "local_fake",
    NODE_ENV: "test",
    SECRET_VALUE: "must-not-be-copied",
  };
  const configuration = readLocalOrderConfig(environment, "test");
  assert.deepEqual(configuration, { source: "local_fake", runtimeMode: "test" });
  assert.equal("SECRET_VALUE" in configuration, false);
});
