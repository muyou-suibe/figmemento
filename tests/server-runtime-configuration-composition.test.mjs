import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { validateLocalPersistentAuthoritySet } from "../app/application/local-persistent-commerce-composition.server.ts";
import {
  composeServerRuntimeConfiguration,
  resolveCanonicalLocalCommerceCapability,
  projectPublicRuntimeConfiguration,
} from "../app/config/server-runtime-composition.server.ts";

const markerDigest = "a".repeat(64);
const retainedPersistentEnvironment = {
  NODE_ENV: "development",
  APP_DEPLOYMENT_ENV: "development",
  NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "http://127.0.0.1:3000",
  CUSTOMER_AUTH_SOURCE: "local_persistent",
  CART_SOURCE: "local_persistent",
  PHOTOGIFT_PRODUCT_SOURCE: "local_persistent",
  LOCAL_CHECKOUT_SOURCE: "local_persistent",
  CUSTOMER_UPLOAD_SOURCE: "local_persistent",
  LOCAL_ORDER_SOURCE: "local_persistent",
  LOCAL_PAYMENT_SOURCE: "local_persistent",
  LOCAL_FULFILLMENT_SOURCE: "local_persistent",
  LOCAL_TRACKING_SOURCE: "local_persistent",
  ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
  LOCAL_COMMERCE_ENVIRONMENT: "development",
  LOCAL_COMMERCE_PROJECT_KIND: "retained_development",
  LOCAL_COMMERCE_PROJECT_ID: "figmemento-local-commerce",
  LOCAL_COMMERCE_RUN_ID: "retained-development",
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
  LOCAL_COMMERCE_MARKER_DIGEST: markerDigest,
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: "server-role-value-never-public",
  LOCAL_COMMERCE_IMAGE_HELPER_SECRET: "a".repeat(43),
  LOCAL_ORDER_CAPABILITY_SECRET: "ab".repeat(32),
  LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600",
  PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: "guest-owner-secret-value-never-public-123",
  PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
};

function issueCodes(result) {
  assert.equal(result.status, "unavailable");
  return result.issues.map((issue) => issue.code);
}

test("K08 composes one valid retained local-development authority", () => {
  const result = composeServerRuntimeConfiguration(retainedPersistentEnvironment);
  assert.equal(result.status, "ready");
  assert.equal(result.value.runtimeMode, "development");
  assert.equal(result.value.localPersistent.projectId, "figmemento-local-commerce");
  assert.deepEqual(result.value.localPersistent.selectedCapabilities.sort(), [
    "admin", "auth", "cart", "catalog", "checkout", "fulfillment", "order", "payment", "tracking", "upload",
  ]);
});

test("K08 rejects missing mandatory persistent configuration", () => {
  const result = composeServerRuntimeConfiguration({
    ...retainedPersistentEnvironment,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: undefined,
  });
  assert.ok(issueCodes(result).includes("missing_required_secret"));
  assert.ok(result.issues.some((issue) => issue.name === "LOCAL_COMMERCE_SERVICE_ROLE_KEY"));
});

test("K08 rejects wrong project identity and malformed marker", () => {
  for (const patch of [
    { LOCAL_COMMERCE_PROJECT_ID: "another-project" },
    { LOCAL_COMMERCE_MARKER_DIGEST: "not-a-marker-digest" },
  ]) {
    const result = composeServerRuntimeConfiguration({ ...retainedPersistentEnvironment, ...patch });
    assert.ok(issueCodes(result).includes("local_persistent_unavailable"));
  }

  const authority = {
    capability: "catalog",
    projectId: "figmemento-local-commerce",
    markerDigest,
    runtimeMode: "development",
    apiUrl: "http://127.0.0.1:55421",
    rpcUrl: "http://127.0.0.1:55421",
    storageUrl: "http://127.0.0.1:55421/storage/v1",
  };
  assert.deepEqual(
    validateLocalPersistentAuthoritySet([
      authority,
      { ...authority, capability: "cart", markerDigest: "b".repeat(64) },
    ]),
    { status: "unavailable", issues: [{ code: "authority_marker_mismatch", capability: "cart" }] },
  );
});

test("K08 rejects unknown mode and production retaining local authority", () => {
  const unknown = composeServerRuntimeConfiguration({
    ...retainedPersistentEnvironment,
    NODE_ENV: "mystery",
    APP_DEPLOYMENT_ENV: "mystery",
  });
  assert.ok(issueCodes(unknown).includes("invalid_runtime_mode"));

  const production = composeServerRuntimeConfiguration({
    ...retainedPersistentEnvironment,
    NODE_ENV: "production",
    APP_DEPLOYMENT_ENV: "production",
    NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "https://figmemento.com",
  });
  assert.ok(issueCodes(production).includes("local_source_not_allowed"));
});

test("K08 rejects mixed persistent/provider authority", () => {
  const result = composeServerRuntimeConfiguration({
    ...retainedPersistentEnvironment,
    PHOTOGIFT_PRODUCT_SOURCE: "supabase",
  });
  assert.ok(issueCodes(result).includes("local_persistent_unavailable"));
});

test("K08 rejects malformed, mismatched, and remote local endpoints", () => {
  for (const patch of [
    { LOCAL_COMMERCE_API_URL: "not a URL" },
    { LOCAL_COMMERCE_API_URL: "http://127.0.0.1:55429" },
    { LOCAL_COMMERCE_API_URL: "https://commerce.example.test:55421" },
    { NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "https://preview.example.test" },
  ]) {
    const result = composeServerRuntimeConfiguration({ ...retainedPersistentEnvironment, ...patch });
    assert.equal(result.status, "unavailable");
  }
});

test("K08 defers provider-backed authority instead of reporting ready + inactive", () => {
  const configured = composeServerRuntimeConfiguration({
    NODE_ENV: "production",
    APP_DEPLOYMENT_ENV: "production",
    NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "https://figmemento.com",
    STRIPE_SECRET_KEY: "configured-but-not-activated",
    RESEND_API_KEY: "configured-but-not-activated",
  });
  assert.equal(configured.status, "unavailable");
  assert.ok(issueCodes(configured).includes("provider_authority_deferred"));

  const explicit = composeServerRuntimeConfiguration({
    NODE_ENV: "production",
    APP_DEPLOYMENT_ENV: "production",
    NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "https://figmemento.com",
    PHOTOGIFT_PRODUCT_SOURCE: "supabase",
  });
  assert.ok(issueCodes(explicit).includes("provider_authority_deferred"));

  const activation = composeServerRuntimeConfiguration({
    NODE_ENV: "production",
    APP_DEPLOYMENT_ENV: "production",
    NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "https://figmemento.com",
    STRIPE_SOURCE: "enabled",
  });
  assert.ok(issueCodes(activation).includes("provider_activation_not_supported"));
});

test("K08 does not treat provider credentials as activation", () => {
  const result = composeServerRuntimeConfiguration({
    NODE_ENV: "production",
    APP_DEPLOYMENT_ENV: "production",
    NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "https://figmemento.com",
    STRIPE_SECRET_KEY: "credential-present-but-not-authorized",
    SUPABASE_SECRET_KEY: "credential-present-but-not-authorized",
  });
  assert.equal(result.status, "unavailable");
  assert.ok(issueCodes(result).includes("provider_authority_deferred"));
});

test("K08 validates guest, image-helper, and Order capability configuration only when selected", () => {
  const guestMissing = composeServerRuntimeConfiguration({
    ...retainedPersistentEnvironment,
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: undefined,
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: undefined,
  });
  assert.ok(issueCodes(guestMissing).includes("missing_required_secret"));
  assert.ok(guestMissing.issues.some((issue) => issue.name === "PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET"));

  const invalidImage = composeServerRuntimeConfiguration({
    ...retainedPersistentEnvironment,
    LOCAL_COMMERCE_IMAGE_HELPER_SECRET: "too-short",
  });
  assert.ok(issueCodes(invalidImage).includes("invalid_required_configuration"));
  assert.ok(invalidImage.issues.some((issue) => issue.name === "LOCAL_COMMERCE_IMAGE_HELPER_SECRET"));

  const invalidOrder = composeServerRuntimeConfiguration({
    ...retainedPersistentEnvironment,
    LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "not-a-duration",
  });
  assert.ok(issueCodes(invalidOrder).includes("invalid_required_configuration"));
  assert.ok(invalidOrder.issues.some((issue) => issue.name === "LOCAL_ORDER_CAPABILITY_TTL_SECONDS"));

  const authOnly = composeServerRuntimeConfiguration({
    NODE_ENV: "test",
    APP_DEPLOYMENT_ENV: "test",
    NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "http://localhost:3000",
    CUSTOMER_AUTH_SOURCE: "local_persistent",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
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
    LOCAL_COMMERCE_MARKER_DIGEST: markerDigest,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: "auth-only-role",
  });
  assert.equal(authOnly.status, "ready");
});

test("K08 public projection contains no server or provider credential", () => {
  const result = composeServerRuntimeConfiguration({
    ...retainedPersistentEnvironment,
    ADMIN_PASSWORD: "admin-value-never-public",
    STRIPE_SECRET_KEY: "stripe-value-never-public",
  });
  assert.equal(result.status, "ready");
  const projection = JSON.stringify(projectPublicRuntimeConfiguration(result.value));
  for (const secret of [
    markerDigest,
    "server-role-value-never-public",
    "image-helper-value-never-public",
    "order-capability-value-never-public",
    "admin-value-never-public",
    "stripe-value-never-public",
  ]) {
    assert.doesNotMatch(projection, new RegExp(secret));
  }
  assert.deepEqual(Object.keys(JSON.parse(projection)).sort(), ["brandName", "deploymentEnvironment", "siteUrl"]);
});

test("K08 rejects browser-visible authority selectors", () => {
  const result = composeServerRuntimeConfiguration({
    NODE_ENV: "development",
    APP_DEPLOYMENT_ENV: "development",
    NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "http://localhost:3000",
    NEXT_PUBLIC_LOCAL_COMMERCE_PROJECT_ID: "figmemento-local-commerce",
  });
  assert.ok(issueCodes(result).includes("browser_authority_forbidden"));
});

test("K08 preserves accepted local fixture composition", () => {
  const result = composeServerRuntimeConfiguration({
    NODE_ENV: "test",
    APP_DEPLOYMENT_ENV: "test",
    NEXT_PUBLIC_DEPLOYMENT_ORIGIN: "http://localhost:3000",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
    CART_SOURCE: "local_fake",
    LOCAL_CHECKOUT_SOURCE: "local_fake",
    LOCAL_ORDER_SOURCE: "local_fake",
    LOCAL_PAYMENT_SOURCE: "local_fake",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.value.localPersistent, null);
  assert.equal(result.value.sources.catalog, "fixture");
  assert.equal(result.value.sources.cart, "local_fake");
});

test("K08 exposes one canonical tri-state seam to real authority consumers", async () => {
  for (const capability of ["admin", "auth", "cart", "catalog", "checkout", "fulfillment", "order", "payment", "tracking", "upload"]) {
    assert.equal(resolveCanonicalLocalCommerceCapability(capability, retainedPersistentEnvironment), "selected", capability);
  }
  assert.equal(resolveCanonicalLocalCommerceCapability("cart", { ...retainedPersistentEnvironment, CART_SOURCE: "local_fake" }), "not_selected");
  assert.equal(resolveCanonicalLocalCommerceCapability("cart", {
    ...retainedPersistentEnvironment,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: undefined,
  }), "unavailable");

  const authorityConsumers = [
    "app/api/cart/route.ts",
    "app/api/checkout-readiness/route.ts",
    "app/api/uploads/route.ts",
    "app/api/customer-uploads/preview/route.ts",
    "app/server/customer-auth-runtime.server.ts",
    "app/server/local-checkout-http.server.ts",
    "app/server/local-order-http.server.ts",
    "app/server/local-payment-http.server.ts",
    "app/server/local-fulfillment-customer-http.server.ts",
    "app/server/local-fulfillment-operator-http.server.ts",
    "app/server/local-tracking-customer-http.server.ts",
    "app/server/local-tracking-operator-http.server.ts",
    "app/server/local-persistent-draft-http.server.ts",
    "app/server/local-persistent-digital-publication.server.ts",
    "app/server/local-persistent-digital-revocation.server.ts",
    "app/server/local-persistent-admin-timeout.server.ts",
    "app/infrastructure/catalog/server-catalog-repository.ts",
    "app/infrastructure/customization/server-customization-field-repository.ts",
  ];
  for (const relativePath of authorityConsumers) {
    const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
    assert.match(source, /resolveCanonicalLocalCommerceCapability/, relativePath);
    assert.doesNotMatch(source, /process\.env\.[A-Z_]+\?\.trim\(\)\s*[!=]==?\s*["']local_persistent|environment\.[A-Z_]+\?\.trim\(\)\s*[!=]==?\s*["']local_persistent/, relativePath);
  }
});

test("K08 server secrets and composition imports are absent from client-marked modules", async () => {
  const root = new URL("../app/", import.meta.url);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => `${entry.parentPath}/${entry.name}`);
  const forbidden = /server-runtime-composition\.server|LOCAL_COMMERCE_SERVICE_ROLE_KEY|LOCAL_COMMERCE_IMAGE_HELPER_SECRET|LOCAL_ORDER_CAPABILITY_SECRET|PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET|SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|RESEND_API_KEY|TRACKING_API_KEY/;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/^\s*["']use client["']/.test(source)) assert.doesNotMatch(source, forbidden, file);
  }
});
