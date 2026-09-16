import assert from "node:assert/strict";
import test from "node:test";

import { readLocalTrackingConfig } from "../app/config/local-tracking-runtime.ts";
import { resolveLocalTrackingOperatorAuthority } from "../app/server/local-tracking-operator.server.ts";

const enabled = readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_fake" }, "test");

test("Tracking runtime enablement alone does not grant operator authority", () => {
  assert.deepEqual(resolveLocalTrackingOperatorAuthority(enabled, undefined), { status: "unauthorized" });
  assert.deepEqual(resolveLocalTrackingOperatorAuthority(enabled, {
    verify: () => ({ actorKind: "customer", actorContextId: "customer-context" }),
  }), { status: "unauthorized" });
  assert.deepEqual(resolveLocalTrackingOperatorAuthority(enabled, {
    verify: () => ({ actorKind: "operator", actorContextId: "short" }),
  }), { status: "unauthorized" });
});

test("a separate server-only operator verifier can authorize a bounded context", () => {
  assert.deepEqual(resolveLocalTrackingOperatorAuthority(enabled, {
    verify: () => ({ actorKind: "operator", actorContextId: "local-tracking-operator" }),
  }), {
    status: "authorized",
    authority: { actorKind: "operator", actorContextId: "local-tracking-operator" },
  });
});

test("disabled or failing verifier paths fail closed", () => {
  assert.deepEqual(resolveLocalTrackingOperatorAuthority(
    readLocalTrackingConfig({}, "test"),
    { verify: () => ({ actorKind: "operator", actorContextId: "local-tracking-operator" }) },
  ), { status: "disabled" });
  assert.deepEqual(resolveLocalTrackingOperatorAuthority(enabled, {
    verify: () => { throw new Error("operator verifier failure"); },
  }), { status: "unauthorized" });
});

test("the operator seam returns only the bounded server authority shape", () => {
  assert.deepEqual(resolveLocalTrackingOperatorAuthority(enabled, {
    verify: () => ({ actorKind: "operator", actorContextId: "local-tracking-operator", capability: "browser-value" }),
  }), {
    status: "authorized",
    authority: { actorKind: "operator", actorContextId: "local-tracking-operator" },
  });
});
