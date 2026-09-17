import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { acceptConfiguredItemHandoff } from "../app/application/configured-item-handoff-acceptance.ts";
import { loadPublicProductDetailWithCustomization } from "../app/application/customization-product-detail.ts";
import {
  customizationFieldSourceFailure,
} from "../app/application/customization-field-repository.ts";
import { createCustomerUploadHttpHandler } from "../app/server/customer-upload-http-handler.server.ts";
import { FixtureCustomizationFieldRepository } from "../app/infrastructure/customization/development-customization-field-repository.ts";
import {
  createProductionCustomizationFieldRepository,
  createServerCustomizationFieldRepository,
} from "../app/infrastructure/customization/server-customization-field-repository.ts";
import { POST as uploadRoute } from "../app/api/uploads/route.ts";
import { runLocalCustomerUploadSmoke } from "../app/testing/customer-upload-local-smoke-harness.ts";

const productId = "product-frame";
const configurationRevision = "revision-current";
const origin = "https://photogift.test";

const catalogDetail = {
  category: {
    id: "category-gifts",
    slug: "gifts",
    name: "Gifts",
    description: "Thoughtful gifts",
    seo: {},
    lifecycle: "published",
  },
  product: {
    id: productId,
    slug: "custom-frame",
    categoryId: "category-gifts",
    name: "Custom Frame",
    description: "A custom frame",
    seo: {},
    lifecycle: "published",
  },
  listingPrice: { kind: "single", priceCents: 5_990, currency: "USD" },
  options: [{ id: "option-size", productId, code: "size", name: "Size", kind: "size", required: true, position: 0 }],
  optionValues: [{ id: "value-small", productId, optionId: "option-size", code: "small", label: "Small", position: 0 }],
  variants: [{
    id: "variant-small",
    productId,
    skuCode: "FRAME-SMALL",
    priceCents: 5_990,
    currency: "USD",
    weightGrams: 300,
    isActive: true,
    isAvailable: true,
    isDefault: true,
    supplyMethod: "made_to_order",
    selectedOptions: [{ optionId: "option-size", valueId: "value-small" }],
  }],
  assets: [{
    id: "asset-marketing",
    productId,
    mediaType: "image",
    role: "thumbnail",
    position: 0,
    visibility: "public",
    source: { kind: "public_reference", value: "marketing:frame/thumbnail" },
  }],
  fulfillment: {
    id: "fulfillment-frame",
    productId,
    fulfillmentType: "physical",
    requiresShipping: true,
    productionMode: "custom_manufacturing",
    leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
  },
};

function catalogRepository() {
  return {
    async findPublicProductBySlug() {
      return { status: "found", value: catalogDetail };
    },
  };
}

function customizationRepository(result) {
  return {
    async getCustomizationFieldsForProduct() {
      return result;
    },
  };
}

function requestWithFile() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "portrait.png", { type: "image/png" }));
  return new Request(`${origin}/api/uploads`, {
    method: "POST",
    body: form,
    headers: { origin, "sec-fetch-site": "same-origin" },
  });
}

function observedRequest() {
  let formDataCalls = 0;
  const request = requestWithFile();
  return {
    request: new Proxy(request, {
      get(target, property) {
        if (property === "formData") {
          return async () => {
            formDataCalls += 1;
            return target.formData();
          };
        }
        return Reflect.get(target, property, target);
      },
    }),
    formDataCalls: () => formDataCalls,
  };
}

function existingOwnerService() {
  return {
    async ensureGuestDraftOwnerContext() {
      return { status: "existing", value: { ownerId: "owner-a", context: "server-only-context" } };
    },
    getSetCookieHeader() {
      return "guest-owner=server-only-context; Path=/; HttpOnly; SameSite=Lax";
    },
  };
}

function handoff(overrides = {}) {
  return {
    productId,
    variantId: "variant-small",
    skuCode: "FRAME-SMALL",
    selectedOptions: [{ optionId: "option-size", valueId: "value-small" }],
    configurationRevision,
    customizationValues: [{
      fieldId: "field-name",
      fieldCode: "name",
      kind: "short_text",
      value: "Ada",
    }],
    ...overrides,
  };
}

function acceptanceDependencies(fieldResult) {
  const calls = { fields: 0, receipts: 0 };
  return {
    calls,
    dependencies: {
      catalogRepository: {
        async findPublicProductById() {
          return { status: "found", value: catalogDetail };
        },
      },
      customizationFieldRepository: {
        async getCustomizationFieldsForProduct() {
          calls.fields += 1;
          return fieldResult;
        },
      },
      receiptRepository: {
        async findOwnedReceipt() {
          calls.receipts += 1;
          return { status: "not_found" };
        },
      },
    },
  };
}

test("9.4 production field source selects only the authoritative repository and preserves its result", async () => {
  const results = [
    { status: "not_found" },
    customizationFieldSourceFailure(),
    { status: "invalid_configuration", issues: [{ path: "$.fields", code: "invalid_value", message: "Invalid authoritative configuration." }] },
  ];
  for (const expected of results) {
    let authoritativeFactoryCalls = 0;
    const authoritative = {
      async getCustomizationFieldsForProduct() {
        return expected;
      },
    };
    const selected = createProductionCustomizationFieldRepository(() => {
        authoritativeFactoryCalls += 1;
        return authoritative;
      });
    assert.equal(selected.source, "supabase");
    assert.equal(selected.repository, authoritative);
    assert.equal(selected.repository instanceof FixtureCustomizationFieldRepository, false);
    assert.equal(authoritativeFactoryCalls, 1);
    assert.deepEqual(await selected.repository.getCustomizationFieldsForProduct(productId), expected);
  }
});

test("9.4 authoritative source failure never constructs a fixture fallback", async () => {
  let authoritativeCalls = 0;
  const selected = createProductionCustomizationFieldRepository(() => {
      authoritativeCalls += 1;
      return { async getCustomizationFieldsForProduct() { return customizationFieldSourceFailure(); } };
    });
  const result = await selected.repository.getCustomizationFieldsForProduct(productId);
  assert.deepEqual(result, customizationFieldSourceFailure());
  assert.equal(authoritativeCalls, 1);
  assert.equal(selected.repository instanceof FixtureCustomizationFieldRepository, false);
});

test("9.4 production repository construction failure stays a construction failure", () => {
  assert.throws(
    () => createServerCustomizationFieldRepository({ NODE_ENV: "production" }),
    /Catalog source is unavailable until provider activation is authorized/,
  );
});

test("9.4 production explicitly rejects fixture selection while development/test fixture mode remains available", async () => {
  assert.throws(
    () => createServerCustomizationFieldRepository(
      { NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "fixture" },
      undefined,
      () => { throw new Error("must not construct authority"); },
    ),
    /Catalog source is unavailable until provider activation is authorized/,
  );

  const fixture = createServerCustomizationFieldRepository({
    NODE_ENV: "test",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
  });
  assert.equal(fixture.source, "fixture");
  assert.ok(fixture.repository instanceof FixtureCustomizationFieldRepository);
  assert.equal((await fixture.repository.getCustomizationFieldsForProduct("fixture-product-couple-figure")).status, "found");
});

test("9.4 public Product Detail keeps source failure, invalid configuration, not configured, and configured-empty distinct", async () => {
  const cases = [
    [customizationFieldSourceFailure(), { status: "source_failure", operation: "customization_field_configuration.read" }],
    [{ status: "invalid_configuration", issues: [{ path: "$.fields", code: "invalid_value", message: "Invalid authoritative configuration." }] }, "invalid_configuration"],
    [{ status: "not_found" }, { status: "found", customization: { status: "not_configured" } }],
    [{ status: "found", value: { productId, configurationRevision, fields: [] } }, { status: "found", customization: { status: "configured", configurationRevision, fields: [] } }],
  ];
  for (const [fieldResult, expectation] of cases) {
    const result = await loadPublicProductDetailWithCustomization(
      catalogRepository(),
      customizationRepository(fieldResult),
      "custom-frame",
    );
    if (expectation === "invalid_configuration") {
      assert.equal(result.status, expectation);
      continue;
    }
    if (expectation.status === "source_failure") {
      assert.deepEqual(result, expectation);
      continue;
    }
    assert.equal(result.status, expectation.status);
    assert.deepEqual(result.value.customization, expectation.customization);
    if (expectation.customization.status === "not_configured") {
      assert.deepEqual(Object.keys(result.value.customization), ["status"]);
    }
  }
});

test("9.4 Product Detail source coherence and construction failure remain fail-closed", async () => {
  const page = await readFile(new URL("../app/product/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /createServerCustomizationFieldRepository\(runtimeEnvironment\)/);
  assert.match(page, /customizationSource\.source !== source\.value\.source/);
  assert.match(page, /if \(customizationSource\.source !== source\.value\.source\) return <CatalogStatus kind="source_failure" \/>/);
  assert.match(page, /try \{[\s\S]*createServerCustomizationFieldRepository[\s\S]*catch \{[\s\S]*CatalogStatus kind="source_failure"/);
  assert.doesNotMatch(page, /createDevelopmentCustomizationFieldRepository|customer-upload-fakes|customer-upload-local-smoke-harness/);
});

test("9.4 Task 8.1 keeps field not_found, source_failure, invalid_configuration, and explicit configured-empty separate", async () => {
  const cases = [
    [{ status: "not_found" }, { status: "rejected", reason: "customization_not_configured" }],
    [customizationFieldSourceFailure(), { status: "rejected", reason: "source_failure" }],
    [{ status: "invalid_configuration", issues: [] }, { status: "rejected", reason: "invalid_customization" }],
  ];
  for (const [fieldResult, expected] of cases) {
    const value = acceptanceDependencies(fieldResult);
    const result = await acceptConfiguredItemHandoff({
      rawInput: handoff(),
      verifiedOwnerId: "owner-a",
      observedAt: "2026-08-14T00:00:00.000Z",
    }, value.dependencies);
    assert.deepEqual(result, expected);
    assert.equal(value.calls.receipts, 0);
  }

  const configuredEmpty = acceptanceDependencies({
    status: "found",
    value: { productId, configurationRevision, fields: [] },
  });
  const accepted = await acceptConfiguredItemHandoff({
    rawInput: handoff({ customizationValues: [] }),
    verifiedOwnerId: "owner-a",
    observedAt: "2026-08-14T00:00:00.000Z",
  }, configuredEmpty.dependencies);
  assert.equal(accepted.status, "accepted");
  assert.deepEqual(accepted.handoff.customizationValues, []);
});

test("9.4 production customization code has no legacy JSON, seed, Product-name inference, or fixture fallback authority", async () => {
  const paths = [
    "../app/infrastructure/customization/server-customization-field-repository.ts",
    "../app/infrastructure/customization/supabase-customization-field-repository.ts",
    "../app/infrastructure/customization/supabase-customization-field-mapper.ts",
    "../app/application/customization-product-detail.ts",
    "../app/application/configured-item-handoff-acceptance.ts",
  ];
  const source = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /customization_schema|seed\.sql|readFile\(|products\.customization_schema/i);
  assert.doesNotMatch(source, /product\.(?:name|slug|category|description)|infer.*(?:photo|image|field)/i);
  assert.doesNotMatch(source, /catch\s*\{[\s\S]{0,240}(?:fixture|seed|customization_schema)/i);
  assert.doesNotMatch(source, /createDevelopmentCustomizationFieldRepository\([^)]*\)\s*(?:\?\?|\|\||\?)/i);
});

test("9.4 real upload route remains source-stopped and never uses generic constraints or legacy upload authority", async () => {
  const previousSecret = process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET;
  const previousTtl = process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS;
  process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET = "offline-production-source-regression-secret-material-1234567890";
  process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS = "3600";
  try {
    const request = observedRequest();
    const response = await uploadRoute(request.request);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Customer upload is temporarily unavailable." });
    assert.equal(request.formDataCalls(), 0);
  } finally {
    if (previousSecret === undefined) delete process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET;
    else process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET = previousSecret;
    if (previousTtl === undefined) delete process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS;
    else process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS = previousTtl;
  }

  const route = await readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8");
  assert.match(route, /readCustomerUploadConfig/);
  assert.match(route, /configuration\.source !== "local_fake"/);
  assert.match(route, /createServerCustomerUploadFieldResolver/);
  assert.doesNotMatch(route, /createDevelopmentCustomizationFieldRepository|customer-upload-fakes|customer-upload-failure-controls|customer-upload-local-smoke-harness|SUPABASE_UPLOAD_BUCKET|photoPath|storageKey|objectKey|bucket/i);
});

test("9.4 upload field not_found, source_failure, and resolver throw stop before acceptance, provider construction, and multipart parsing", async () => {
  for (const mode of ["not_found", "source_failure", "throw"]) {
    const calls = { acceptanceFactory: 0, acceptance: 0, resolver: 0 };
    const handler = createCustomerUploadHttpHandler({
      ownerService: existingOwnerService(),
      async resolveFieldConstraints() {
        calls.resolver += 1;
        if (mode === "throw") throw new Error("authoritative resolver failure");
        return { status: mode };
      },
      createAcceptanceDependencies() {
        calls.acceptanceFactory += 1;
        throw new Error("provider construction must not occur");
      },
      async acceptImageUpload() {
        calls.acceptance += 1;
        return { status: "accepted", receipt: {} , warnings: [] };
      },
    });
    const request = observedRequest();
    const response = await handler(request.request);
    assert.equal(response.status, mode === "not_found" ? 404 : 503);
    assert.equal(calls.resolver, 1);
    assert.equal(calls.acceptanceFactory, 0);
    assert.equal(calls.acceptance, 0);
    assert.equal(request.formDataCalls(), 0);
  }
});

test("9.4 local smoke remains explicit and local-only while production routes do not import it", async () => {
  const result = await runLocalCustomerUploadSmoke({
    environment: { NODE_ENV: "test", PHOTOGIFT_PRODUCT_SOURCE: "fixture" },
  });
  assert.equal(result.status, "passed");
  await assert.rejects(
    runLocalCustomerUploadSmoke({ environment: { NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "fixture" } }),
    /Fixture product source is allowed only in development or test/,
  );

  const [route, page, harness] = await Promise.all([
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/product/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/testing/customer-upload-local-smoke-harness.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${route}\n${page}`, /customer-upload-local-smoke-harness|customer-upload-fakes|customer-upload-failure-controls|development-customization-field-fixtures/i);
  assert.match(harness, /createDevelopmentCustomizationFieldRepository/);
});

test("9.4 normalized checkout remains a literal 503 fail-closed boundary", async () => {
  const source = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  const responseExpression = source.match(/return Response\.json\(\s*\{\s*error:\s*"Personalized checkout is temporarily unavailable\."\s*\},\s*\{\s*status:\s*503\s*\}\s*,\s*\);/s)?.[0];
  assert.ok(responseExpression);
  assert.doesNotMatch(responseExpression, /\$\{|body\.|receipt|provider|storage|sql|secret|fixture/i);
});
