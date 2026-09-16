import assert from "node:assert/strict";
import test from "node:test";

import {
  persistentDependenciesFor,
  resolveLocalPersistentComposition,
  validateLocalPersistentAuthoritySet,
} from "../app/application/local-persistent-commerce-composition.server.ts";

const digest = "a".repeat(64);
const base = {
  NODE_ENV: "test",
  LOCAL_COMMERCE_ENVIRONMENT: "test",
  LOCAL_COMMERCE_PROJECT_KIND: "disposable_test",
  LOCAL_COMMERCE_PROJECT_ID: "figmemento-local-commerce-test-run-ab12cd34",
  LOCAL_COMMERCE_RUN_ID: "run-ab12cd34",
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
  LOCAL_COMMERCE_MARKER_DIGEST: digest,
};

function selected(overrides = {}) {
  return { ...base, ...Object.fromEntries([
    ["CUSTOMER_AUTH_SOURCE", "local_persistent"],
    ["CART_SOURCE", "local_persistent"],
    ["PHOTOGIFT_PRODUCT_SOURCE", "local_persistent"],
    ["LOCAL_CHECKOUT_SOURCE", "local_persistent"],
    ["CUSTOMER_UPLOAD_SOURCE", "local_persistent"],
    ["LOCAL_ORDER_SOURCE", "local_persistent"],
    ["LOCAL_PAYMENT_SOURCE", "local_persistent"],
    ["LOCAL_FULFILLMENT_SOURCE", "local_persistent"],
    ["LOCAL_TRACKING_SOURCE", "local_persistent"],
    ["ADMIN_ACCEPTANCE_SOURCE", "local_persistent"],
  ]), ...overrides };
}

test("absent persistent selectors preserve existing composition", () => {
  assert.deepEqual(resolveLocalPersistentComposition({ NODE_ENV: "test" }), { status: "not_selected" });
});

test("persistent selectors require explicit local configuration and expose no credential", () => {
  const result = resolveLocalPersistentComposition(selected(), { requiredCapabilities: ["checkout"] });
  assert.equal(result.status, "ready");
  assert.equal(result.value.projectId, base.LOCAL_COMMERCE_PROJECT_ID);
  assert.deepEqual(result.value.selectedCapabilities, ["auth", "cart", "catalog", "checkout", "upload", "order", "payment", "fulfillment", "tracking", "admin"]);
  assert.doesNotMatch(JSON.stringify(result), /service.?role|secret|password|token|credential/i);
});

test("persistent runtime rejects production, staging, and unknown process modes", () => {
  for (const mode of ["production", "staging", "unknown"]) {
    const result = resolveLocalPersistentComposition(selected({ NODE_ENV: mode }));
    assert.equal(result.status, "unavailable");
    assert.ok(result.issues.some((issue) => issue.code === "persistent_runtime_required"));
  }
});

test("persistent checkout cannot use a fake or absent dependency", () => {
  const result = resolveLocalPersistentComposition(
    selected({ CART_SOURCE: "local_fake" }),
    { requiredCapabilities: ["checkout"] },
  );
  assert.equal(result.status, "unavailable");
  assert.ok(result.issues.some((issue) => issue.code === "dependency_source_mismatch"));
});

test("missing, malformed, and non-loopback local configuration fail closed", () => {
  const missingDigest = resolveLocalPersistentComposition(selected({ LOCAL_COMMERCE_MARKER_DIGEST: undefined }));
  assert.equal(missingDigest.status, "unavailable");
  assert.ok(missingDigest.issues.some((issue) => issue.code === "marker_digest_required"));

  const malformedDigest = resolveLocalPersistentComposition(selected({ LOCAL_COMMERCE_MARKER_DIGEST: "not-a-digest" }));
  assert.equal(malformedDigest.status, "unavailable");
  assert.ok(malformedDigest.issues.some((issue) => issue.code === "marker_digest_invalid"));

  const remote = resolveLocalPersistentComposition(selected({ LOCAL_COMMERCE_API_URL: "https://example.test:55421" }));
  assert.equal(remote.status, "unavailable");
  assert.ok(remote.issues.some((issue) => issue.code === "local_commerce_configuration_invalid"));
});

test("authority descriptors reject cross-project, marker, runtime, or endpoint mixing", () => {
  const first = {
    capability: "cart",
    projectId: "project-a",
    markerDigest: digest,
    runtimeMode: "test",
    apiUrl: "http://127.0.0.1:55421",
    rpcUrl: "http://127.0.0.1:55421",
    storageUrl: "http://127.0.0.1:55421/storage/v1",
  };
  for (const change of [
    { projectId: "project-b" },
    { markerDigest: "b".repeat(64) },
    { runtimeMode: "development" },
    { apiUrl: "http://127.0.0.1:55431" },
  ]) {
    const result = validateLocalPersistentAuthoritySet([first, { ...first, capability: "checkout", ...change }]);
    assert.equal(result.status, "unavailable");
  }
});

test("dependency graph remains explicit and does not select capabilities", () => {
  // Text-only Checkout is supported; image lines separately enforce durable receipts.
  assert.deepEqual(persistentDependenciesFor("checkout"), ["auth", "cart", "catalog"]);
  assert.deepEqual(persistentDependenciesFor("tracking"), ["auth", "order", "payment", "fulfillment"]);
});
