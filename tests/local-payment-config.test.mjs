import assert from "node:assert/strict";
import test from "node:test";

import {
  readLocalPaymentConfig,
  readTrustedLocalPaymentConfig,
} from "../app/config/local-payment-runtime.ts";
import { ServerConfigurationError } from "../app/config/server.ts";

test("Local Payment is disabled when no explicit source is selected", () => {
  assert.deepEqual(
    readLocalPaymentConfig({ NODE_ENV: "development" }, "development"),
    { source: "disabled", runtimeMode: "development" },
  );
});

test("local_fake is enabled only in development and test", () => {
  assert.deepEqual(
    readLocalPaymentConfig({ LOCAL_PAYMENT_SOURCE: "local_fake" }, "development"),
    { source: "local_fake", runtimeMode: "development" },
  );
  assert.deepEqual(
    readLocalPaymentConfig({ LOCAL_PAYMENT_SOURCE: "local_fake" }, "test"),
    { source: "local_fake", runtimeMode: "test" },
  );
});

test("production and unsupported sources fail closed", () => {
  assert.throws(
    () => readLocalPaymentConfig({ LOCAL_PAYMENT_SOURCE: "local_fake" }, "production"),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_PAYMENT_SOURCE",
  );
  assert.throws(
    () => readLocalPaymentConfig({ LOCAL_PAYMENT_SOURCE: "stripe" }, "development"),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_PAYMENT_SOURCE",
  );
  assert.throws(
    () => readLocalPaymentConfig({ LOCAL_PAYMENT_SOURCE: "supabase" }, "development"),
    /LOCAL_PAYMENT_SOURCE/,
  );
});

test("trusted configuration uses direct process.env.NODE_ENV authority", () => {
  const previousMode = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(
      () => readTrustedLocalPaymentConfig({ LOCAL_PAYMENT_SOURCE: "local_fake", NODE_ENV: "development" }),
      (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_PAYMENT_SOURCE",
    );
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  }
});

test("configuration result is bounded and cannot imply payment authority or copy secrets", () => {
  const configuration = readLocalPaymentConfig({
    LOCAL_PAYMENT_SOURCE: "local_fake",
    SECRET_VALUE: "must-not-be-copied",
  }, "test");
  assert.deepEqual(configuration, { source: "local_fake", runtimeMode: "test" });
  assert.equal("SECRET_VALUE" in configuration, false);
  assert.equal("paymentStatus" in configuration, false);
  assert.equal("orderStatus" in configuration, false);
});
