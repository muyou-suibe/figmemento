import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LOCAL_CUSTOMER_UPLOAD_SMOKE_FIXTURE_PRODUCT_ID,
  runLocalCustomerUploadSmoke,
} from "../app/testing/customer-upload-local-smoke-harness.ts";

const fixtureEnvironment = {
  NODE_ENV: "test",
  PHOTOGIFT_PRODUCT_SOURCE: "fixture",
};

const forbiddenResponseKeys = [
  "bucket",
  "storageKey",
  "storage_key",
  "objectKey",
  "object_key",
  "path",
  "provider",
  "previewUrl",
  "signedUrl",
  "ownerId",
];

test("Task 6.4 local smoke composes explicit fixture field authority, the real HTTP boundary, authoritative inspection, acceptance, and separate in-memory resources", async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error("LIVE NETWORK FORBIDDEN IN TASK 6.4");
  };
  try {
    const result = await runLocalCustomerUploadSmoke({ environment: fixtureEnvironment });
    assert.deepEqual(result, {
      status: "passed",
      fixtureProductId: "fixture-product-couple-figure",
      fixtureFieldId: "fixture-customization-field-couple-figure-reference-images",
      fixtureFieldCode: "development-reference-images",
      configurationRevision: "fixture-customization-revision-couple-figure-v1",
      httpStatus: 201,
      receiptLifecycle: "active",
      contentType: "image/png",
      byteSize: 58,
      objectRoundTripVerified: true,
      ownerScopedReceiptVerified: true,
    });
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Task 6.4 local smoke derives the fixture image minimum and rejects an under-dimension image with zero fake persistence", async () => {
  const result = await runLocalCustomerUploadSmoke({
    environment: fixtureEnvironment,
    syntheticImageMode: "below-fixture-minimum",
  });
  assert.deepEqual(result, {
    status: "upload_rejected",
    fixtureProductId: "fixture-product-couple-figure",
    fixtureFieldId: "fixture-customization-field-couple-figure-reference-images",
    fixtureFieldCode: "development-reference-images",
    configurationRevision: "fixture-customization-revision-couple-figure-v1",
    httpStatus: 400,
    objectCount: 0,
    receiptCount: 0,
  });
});

test("Task 6.4 local smoke refuses non-fixture and production source selection before fake resource construction", async () => {
  await assert.rejects(
    runLocalCustomerUploadSmoke({ environment: { NODE_ENV: "test" } }),
    /explicit fixture source selection/,
  );
  await assert.rejects(
    runLocalCustomerUploadSmoke({ environment: { NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "fixture" } }),
    /Fixture product source is allowed only in development or test/,
  );
});

test("Task 6.4 harness output stays bounded and production routes do not import local smoke or fake adapters", async () => {
  const result = await runLocalCustomerUploadSmoke({ environment: fixtureEnvironment });
  const output = JSON.stringify(result);
  for (const key of forbiddenResponseKeys) assert.doesNotMatch(output, new RegExp(`\\"${key}\\"`, "i"));
  assert.doesNotMatch(output, /cookie|token|secret|fixture-minimum|local-fixture-image|\\"bytes\\"/i);

  const [harness, uploadRoute, previewRoute] = await Promise.all([
    readFile(new URL("../app/testing/customer-upload-local-smoke-harness.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/customer-uploads/preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(harness, /LOCAL \/ TEST ONLY\. NON-PRODUCTION/);
  assert.match(harness, /createDevelopmentCustomizationFieldRepository/);
  assert.match(harness, /createCustomerUploadHttpHandler/);
  assert.match(harness, /createDeterministicCustomerUploadFakes/);
  assert.doesNotMatch(harness, /@supabase\/supabase-js|getSupabaseServerClient|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|Stripe|PayPal|createSignedUrl/i);
  assert.doesNotMatch(harness, /customization_schema|order_uploads|photoPath|ProductAsset|supplier/i);
  assert.doesNotMatch(`${uploadRoute}\n${previewRoute}`, /customer-upload-local-smoke-harness|customer-upload-fakes|customer-upload-failure-controls/i);
  assert.equal(LOCAL_CUSTOMER_UPLOAD_SMOKE_FIXTURE_PRODUCT_ID, "fixture-product-couple-figure");
});
