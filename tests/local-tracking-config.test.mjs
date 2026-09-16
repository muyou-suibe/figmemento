import assert from "node:assert/strict";
import test from "node:test";

import {
  readLocalTrackingConfig,
  readTrustedLocalTrackingConfig,
} from "../app/config/local-tracking-runtime.ts";
import { ServerConfigurationError } from "../app/config/server.ts";

test("Local Tracking is disabled without an explicit source", () => {
  assert.deepEqual(
    readLocalTrackingConfig({ NODE_ENV: "development" }, "development"),
    { source: "disabled", runtimeMode: "development" },
  );
});

test("local_fake Tracking is enabled only in development and test", () => {
  assert.deepEqual(
    readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_fake" }, "development"),
    { source: "local_fake", runtimeMode: "development" },
  );
  assert.deepEqual(
    readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_fake" }, "test"),
    { source: "local_fake", runtimeMode: "test" },
  );
});

test("production, unknown runtime, and unsupported sources fail closed", () => {
  assert.throws(
    () => readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_fake" }, "production"),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_TRACKING_SOURCE",
  );
  assert.throws(
    () => readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_fake" }),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_TRACKING_SOURCE",
  );
  assert.throws(
    () => readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "17track" }, "development"),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_TRACKING_SOURCE",
  );
});

test("trusted Tracking config uses direct process.env.NODE_ENV authority", () => {
  const previousMode = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(
      () => readTrustedLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_fake", NODE_ENV: "development" }),
      (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_TRACKING_SOURCE",
    );
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  }
});

test("configuration is bounded and does not copy provider or secret values", () => {
  const configuration = readLocalTrackingConfig({
    LOCAL_TRACKING_SOURCE: "local_fake",
    TRACKING_API_KEY: "must-not-be-copied",
    SUPABASE_SECRET_KEY: "must-not-be-copied",
  }, "test");
  assert.deepEqual(configuration, { source: "local_fake", runtimeMode: "test" });
  assert.equal("TRACKING_API_KEY" in configuration, false);
  assert.equal("SUPABASE_SECRET_KEY" in configuration, false);
  assert.equal("trackingNumber" in configuration, false);
  assert.equal("shipmentStatus" in configuration, false);
});
