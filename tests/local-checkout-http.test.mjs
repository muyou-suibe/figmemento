import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LocalCheckoutEvaluator } from "../app/application/local-checkout-evaluator.ts";
import { createLocalCustomerUploadRuntime } from "../app/infrastructure/customer-upload/local-customer-upload-runtime.server.ts";
import { createLocalCheckoutHttpHandler } from "../app/server/local-checkout-http.server.ts";

const productId = "product-ready";
const variantId = "variant-ready";
const categoryId = "category-ready";
const skuCode = "SKU-READY";
const category = {
  id: categoryId,
  slug: "gifts",
  name: "Gifts",
  description: "A test category.",
  seo: {},
  lifecycle: "published",
};
const product = {
  id: productId,
  slug: "ready-gift",
  categoryId,
  name: "Ready Gift",
  description: "A test product.",
  seo: {},
  lifecycle: "published",
};
const variant = {
  id: variantId,
  productId,
  skuCode,
  priceCents: 2_500,
  currency: "USD",
  weightGrams: 500,
  isActive: true,
  isAvailable: true,
  isDefault: true,
  supplyMethod: "made_to_order",
  selectedOptions: [],
};
const detail = {
  category,
  product,
  listingPrice: { kind: "single", priceCents: variant.priceCents, currency: "USD" },
  options: [],
  optionValues: [],
  variants: [variant],
  assets: [],
  fulfillment: {
    id: "fulfillment-ready",
    productId,
    fulfillmentType: "physical",
    requiresShipping: true,
    productionMode: "custom_manufacturing",
    leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
  },
};
const textField = {
  id: "field-note",
  productId,
  code: "note",
  label: "Note",
  kind: "short_text",
  required: false,
  isActive: true,
  position: 0,
  configurationRevision: "revision-a",
  constraints: { maxLength: 80 },
};
const imageField = {
  id: "field-image",
  productId,
  code: "photo",
  label: "Photo",
  kind: "image",
  required: true,
  isActive: true,
  position: 0,
  configurationRevision: "revision-a",
  constraints: {
    allowedMimeTypes: ["image/png"],
    maxBytes: 10_000,
    minDimensions: { width: 1, height: 1 },
    minImageCount: 1,
    maxImageCount: 1,
    cropEnabled: false,
  },
};

const textHandoff = {
  productId,
  variantId,
  skuCode,
  selectedOptions: [],
  configurationRevision: "revision-a",
  customizationValues: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Ada" }],
};
const imageHandoff = {
  productId,
  variantId,
  skuCode,
  selectedOptions: [],
  configurationRevision: "revision-a",
  customizationValues: [{ fieldId: "field-image", fieldCode: "photo", kind: "image", images: [{ receiptId: "private-receipt" }] }],
};

function line(handoff = textHandoff, overrides = {}) {
  return {
    lineId: "line-a",
    handoff,
    snapshot: {
      productId,
      productName: product.name,
      productSlug: product.slug,
      variantId,
      skuCode,
      selectedOptions: [],
      unitPriceCents: variant.priceCents,
      currency: "USD",
      availability: "available",
    },
    customization: {
      configuration: { sku: skuCode, options: [], needsReview: false },
      personalization: { status: "current", rows: [{ kind: "short_text", label: "Note", state: "provided" }] },
    },
    quantity: 1,
    ...overrides,
  };
}

const basePayload = {
  email: "buyer@example.test",
  firstName: "Ava",
  lastName: "Buyer",
  country: "US",
  city: "Portland",
  addressLine1: "1 Demo Street",
  postalCode: "97201",
  shippingMethod: "local_standard",
};

const receiptRepository = {
  async findOwnedReceipt() {
    return {
      status: "found",
      value: {
        receiptId: "private-receipt",
        contentType: "image/png",
        byteSize: 100,
        dimensions: { width: 100, height: 100 },
        createdAt: "2026-08-23T00:00:00.000Z",
        expiresAt: "2027-08-25T00:00:00.000Z",
        lifecycle: "active",
      },
    };
  },
};

function makeHandler({
  currentLine = line(),
  fields = [textField],
  catalog = detail,
  catalogResult,
  uploadAuthority = null,
  configSource = "local_fake",
} = {}) {
  const calls = {
    getCart: 0,
    createCart: 0,
    catalog: 0,
    customization: 0,
    owner: 0,
    evaluate: 0,
  };
  const cartProvider = {
    async getCart() {
      calls.getCart += 1;
      return { status: "found", value: { cartId: "cart-ready", lines: [structuredClone(currentLine)] } };
    },
    async createCart() {
      calls.createCart += 1;
      return { status: "source_failure" };
    },
  };
  const handler = createLocalCheckoutHttpHandler({
    readConfig: () => ({ source: configSource, runtimeMode: "test" }),
    getCartProvider: () => cartProvider,
    createCatalogRepository: async () => {
      calls.catalog += 1;
      if (catalogResult) return catalogResult;
      return { status: "found", value: { source: "fixture", repository: {
        async findPublicProductById() { return { status: "found", value: catalog }; },
      } } };
    },
    createCustomizationRepository: () => ({ source: "fixture", repository: {
      async getCustomizationFieldsForProduct() {
        calls.customization += 1;
        return { status: "found", value: { productId, configurationRevision: "revision-a", fields } };
      },
    } }),
    resolveUploadAuthority: async () => {
      calls.owner += 1;
      return uploadAuthority;
    },
    createEvaluator: (dependencies) => {
      calls.evaluate += 1;
      return new LocalCheckoutEvaluator(dependencies);
    },
  });
  return { handler, calls };
}

function request(body = basePayload, headers = {}) {
  return new Request("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      cookie: "figmemento-local-cart=cart-ready-123456789012",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("cross-origin rejection happens before config, Cart, Catalog, owner, or evaluator construction", async () => {
  const value = makeHandler();
  const response = await value.handler(request(basePayload, { origin: "https://attacker.test" }));
  assert.equal(response.status, 403);
  assert.deepEqual(value.calls, { getCart: 0, createCart: 0, catalog: 0, customization: 0, owner: 0, evaluate: 0 });
});

test("invalid input and browser authority fields are rejected before privileged construction", async () => {
  const forbiddenBrowserAuthority = {
    productId: "browser-product",
    variantId: "browser-variant",
    skuCode: "BROWSER-SKU",
    priceCents: 1,
    currency: "EUR",
    subtotalCents: 0,
    shippingAmountCents: 0,
    discountCents: 99_999,
    tax: 0,
    localDemoTotalCents: 0,
    finalTotalCents: 0,
    cartId: "browser-cart",
    ownerId: "browser-owner",
    receiptId: "browser-receipt",
  };
  for (const [key, authority] of Object.entries(forbiddenBrowserAuthority)) {
    const value = makeHandler();
    const response = await value.handler(request({ ...basePayload, [key]: authority }));
    assert.equal(response.status, 400, key);
    const body = await response.json();
    assert.equal(body.status, "blocked", key);
    assert.ok(body.issues.some((entry) => entry.code === "INVALID_CHECKOUT_INPUT"), key);
    assert.deepEqual(value.calls, {
      getCart: 0,
      createCart: 0,
      catalog: 0,
      customization: 0,
      owner: 0,
      evaluate: 0,
    }, key);
  }
});

test("valid text flow returns a safe accepted projection and ignores browser totals", async () => {
  const value = makeHandler();
  const response = await value.handler(request({ ...basePayload, couponCode: "UNKNOWN" }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "accepted");
  assert.equal(body.coupon.status, "invalid");
  assert.equal(body.coupon.discountCents, 0);
  assert.equal(body.localDemoTotalCents, 3_000);
  assert.equal(body.tax.status, "not_activated");
  assert.equal(body.tax.amountCents, null);
  assert.equal(body.fixtureNotice, "DEVELOPMENT / TEST ONLY");
  assert.doesNotMatch(JSON.stringify(body), /receiptId|ownerId|storageKey|bucket|handoff|cookie|secret|provider locator/i);
});

test("valid image flow requires and uses verified owner-scoped receipt authority without exposing it", async () => {
  const value = makeHandler({
    currentLine: line(imageHandoff),
    fields: [imageField],
    uploadAuthority: { ownerId: "verified-owner", receiptRepository },
  });
  const response = await value.handler(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "accepted");
  assert.doesNotMatch(JSON.stringify(body), /private-receipt|verified-owner|receiptId|ownerId/i);
  assert.equal(value.calls.owner, 1);
});

test("checkout identity never substitutes for image receipt ownership", async () => {
  const value = makeHandler({ currentLine: line(imageHandoff), fields: [imageField] });
  const response = await value.handler(request({
    ...basePayload,
    email: "someone-else@example.test",
    addressLine1: "999 Different Address",
  }));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, "unavailable");
  assert.equal(body.issues[0].code, "UPLOAD_UNAVAILABLE");
  assert.equal(value.calls.owner, 1);
  assert.doesNotMatch(JSON.stringify(body), /ownerId|receiptId|storageKey|bucket|provider|cookie|secret/i);
});

test("a fresh process-local receipt repository fails closed for an old image receipt", async () => {
  const accepted = makeHandler({
    currentLine: line(imageHandoff),
    fields: [imageField],
    uploadAuthority: { ownerId: "verified-owner", receiptRepository },
  });
  assert.equal((await accepted.handler(request())).status, 200);

  const freshRuntime = createLocalCustomerUploadRuntime();
  const afterRestart = makeHandler({
    currentLine: line(imageHandoff),
    fields: [imageField],
    uploadAuthority: {
      ownerId: "verified-owner",
      receiptRepository: freshRuntime.receiptRepository,
    },
  });
  const response = await afterRestart.handler(request());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.status, "blocked");
  assert.equal(body.issues[0].code, "UPLOAD_INVALID");
  assert.doesNotMatch(JSON.stringify(body), /private-receipt|verified-owner|receiptId|ownerId|storageKey|bucket|provider/i);
});

test("stale catalog, unsupported shipping, and unavailable runtime remain safe failures", async () => {
  const stale = makeHandler({ catalog: { ...detail, variants: [{ ...variant, priceCents: 2_600 }] } });
  const staleResponse = await stale.handler(request());
  assert.equal(staleResponse.status, 409);
  assert.equal((await staleResponse.json()).issues[0].code, "STALE_CATALOG");

  const unsupported = makeHandler();
  const unsupportedResponse = await unsupported.handler(request({ ...basePayload, shippingMethod: "unsupported_method" }));
  assert.equal(unsupportedResponse.status, 409);
  assert.equal((await unsupportedResponse.json()).issues[0].code, "SHIPPING_UNAVAILABLE");

  const disabled = makeHandler({ configSource: "disabled" });
  const disabledResponse = await disabled.handler(request());
  assert.equal(disabledResponse.status, 503);
  assert.equal((await disabledResponse.json()).issues[0].code, "CHECKOUT_UNAVAILABLE");

  const sourceFailure = makeHandler({ catalogResult: { status: "source_failure" } });
  const sourceFailureResponse = await sourceFailure.handler(request());
  assert.equal(sourceFailureResponse.status, 503);
  const sourceFailureBody = await sourceFailureResponse.json();
  assert.equal(sourceFailureBody.status, "unavailable");
  assert.equal(sourceFailureBody.issues[0].code, "CATALOG_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(sourceFailureBody), /fixture|supabase|provider|secret/i);
});

test("checkout page contains the bounded form and local-only wording", async () => {
  const page = await readFile(new URL("../app/checkout/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../app/storefront/LocalCheckoutExperience.tsx", import.meta.url), "utf8");
  assert.match(page, /LocalCheckoutExperience/);
  for (const field of ["Email", "First name", "Last name", "Country", "State \/ province", "City", "Address line 1", "Postal code", "Phone", "Shipping method", "Coupon code"]) {
    assert.match(component, new RegExp(field));
  }
  assert.match(component, /Tax is not activated in this local demo/);
  assert.match(component, /Local demo total/);
  assert.match(component, /DEVELOPMENT \/ TEST ONLY/);
  assert.doesNotMatch(component, /Amount Due|Payable Total|Charged Total|Place Order|Pay Now|Buy Now/);
});
