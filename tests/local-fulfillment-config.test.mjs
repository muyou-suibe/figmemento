import assert from "node:assert/strict";
import test from "node:test";

import {
  readLocalFulfillmentConfig,
  readTrustedLocalFulfillmentConfig,
} from "../app/config/local-fulfillment-runtime.ts";
import { ServerConfigurationError } from "../app/config/server.ts";
import { resolveLocalFulfillmentOperatorAuthority } from "../app/server/local-fulfillment-operator.server.ts";

test("Local Fulfillment source is explicit, development/test-only, and fail-closed", () => {
  assert.deepEqual(readLocalFulfillmentConfig({ LOCAL_FULFILLMENT_SOURCE: "local_fake" }, "development"), {
    source: "local_fake",
    runtimeMode: "development",
  });
  assert.deepEqual(readLocalFulfillmentConfig({ LOCAL_FULFILLMENT_SOURCE: "local_fake" }, "test"), {
    source: "local_fake",
    runtimeMode: "test",
  });
  assert.deepEqual(readLocalFulfillmentConfig({}, "development"), {
    source: "disabled",
    runtimeMode: "development",
  });

  assert.throws(
    () => readLocalFulfillmentConfig({ LOCAL_FULFILLMENT_SOURCE: "local_fake" }, "production"),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_FULFILLMENT_SOURCE",
  );
  assert.throws(
    () => readLocalFulfillmentConfig({ LOCAL_FULFILLMENT_SOURCE: "supabase" }, "development"),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_FULFILLMENT_SOURCE",
  );
  assert.throws(
    () => readLocalFulfillmentConfig({ LOCAL_FULFILLMENT_SOURCE: " local_fake " }, "production"),
    (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_FULFILLMENT_SOURCE",
  );
});

test("trusted Fulfillment config reads runtime mode from process.env", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(
      () => readTrustedLocalFulfillmentConfig({ LOCAL_FULFILLMENT_SOURCE: "local_fake" }),
      (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_FULFILLMENT_SOURCE",
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("runtime enablement does not grant operator authority", () => {
  const enabled = readLocalFulfillmentConfig({ LOCAL_FULFILLMENT_SOURCE: "local_fake" }, "test");
  assert.deepEqual(resolveLocalFulfillmentOperatorAuthority(enabled, undefined), { status: "unauthorized" });
  assert.deepEqual(resolveLocalFulfillmentOperatorAuthority(enabled, {
    verify: () => ({ actorKind: "customer", actorContextId: "customer-context" }),
  }), { status: "unauthorized" });

  const authorized = resolveLocalFulfillmentOperatorAuthority(enabled, {
    verify: () => ({ actorKind: "operator", actorContextId: "local-operator-1" }),
  });
  assert.deepEqual(authorized, {
    status: "authorized",
    authority: { actorKind: "operator", actorContextId: "local-operator-1" },
  });

  assert.deepEqual(resolveLocalFulfillmentOperatorAuthority(
    readLocalFulfillmentConfig({}, "test"),
    { verify: () => ({ actorKind: "operator", actorContextId: "local-operator-1" }) },
  ), { status: "disabled" });
});
