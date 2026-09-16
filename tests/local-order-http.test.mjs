import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalOrderCreateHttpHandler,
  createLocalOrderReadHttpHandler,
} from "../app/server/local-order-http.server.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";

const productId = "product-ready";
const variantId = "variant-ready";
const cartId = "cart-ready-12345678901234567890";
const attemptA = "123e4567-e89b-42d3-a456-426614174020";
const attemptB = "123e4567-e89b-42d3-a456-426614174021";

const detail = {
  category: {
    id: "category-ready",
    slug: "gifts",
    name: "Gifts",
    description: "A test category.",
    seo: {},
    lifecycle: "published",
  },
  product: {
    id: productId,
    slug: "ready-gift",
    categoryId: "category-ready",
    name: "Ready Gift",
    description: "A test product.",
    seo: {},
    lifecycle: "published",
  },
  listingPrice: { kind: "single", priceCents: 2_500, currency: "USD" },
  options: [],
  optionValues: [],
  variants: [{
    id: variantId,
    productId,
    skuCode: "SKU-READY",
    priceCents: 2_500,
    currency: "USD",
    weightGrams: 500,
    isActive: true,
    isAvailable: true,
    isDefault: true,
    supplyMethod: "made_to_order",
    selectedOptions: [],
  }],
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

const requestBody = {
  email: "demo@example.test",
  firstName: "Demo",
  lastName: "Shopper",
  country: "US",
  city: "New York",
  addressLine1: "1 Demo Street",
  postalCode: "10001",
  shippingMethod: "local_standard",
};

function cartRecord(customizationValues = []) {
  return {
    cartId,
    lines: [{
      lineId: "line-a",
      handoff: {
        productId,
        variantId,
        skuCode: "SKU-READY",
        selectedOptions: [],
        configurationRevision: "revision-a",
        customizationValues,
      },
      snapshot: {
        productId,
        productName: "Ready Gift",
        productSlug: "ready-gift",
        variantId,
        skuCode: "SKU-READY",
        selectedOptions: [],
        unitPriceCents: 2_500,
        currency: "USD",
        availability: "available",
      },
      customization: {
        configuration: { sku: "SKU-READY", options: [], needsReview: false },
        personalization: { status: "empty_configuration", rows: [] },
      },
      quantity: 1,
    }],
  };
}

function makeRuntime({ repository = new LocalMemoryLocalOrderRepository(), customizationValues = [], customizationFields = [], overrides = {} } = {}) {
  const cart = cartRecord(customizationValues);
  let cartReads = 0;
  const cartProvider = {
    async getCart() {
      cartReads += 1;
      return { status: "found", value: structuredClone(cart) };
    },
    async createCart() { return { status: "source_failure" }; },
    async addLine() { return { status: "source_failure" }; },
    async updateLine() { return { status: "source_failure" }; },
    async removeLine() { return { status: "source_failure" }; },
    async clearCart() { return { status: "source_failure" }; },
  };
  const calls = { catalog: 0, customization: 0, owner: 0 };
  const handler = createLocalOrderCreateHttpHandler({
    readConfig: () => ({ source: "local_fake", runtimeMode: "test" }),
    getCartProvider: () => cartProvider,
    createCatalogRepository: async () => {
      calls.catalog += 1;
      return { status: "found", value: { repository: { async findPublicProductById() { return { status: "found", value: detail }; } }, source: "fixture" } };
    },
    createCustomizationRepository: () => {
      calls.customization += 1;
      return { repository: { async getCustomizationFieldsForProduct() { return { status: "found", value: { productId, configurationRevision: "revision-a", fields: customizationFields } }; } }, source: "fixture" };
    },
    resolveUploadAuthority: async () => {
      calls.owner += 1;
      return null;
    },
    getRepository: () => repository,
    ...overrides,
  });
  const readHandler = createLocalOrderReadHttpHandler({
    readConfig: () => ({ source: "local_fake", runtimeMode: "test" }),
    getRepository: () => repository,
  });
  return { handler, readHandler, repository, cart, cartReads, calls };
}

function request(body = requestBody, headers = {}) {
  return new Request("http://localhost:3000/api/local-orders", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      cookie: `figmemento-local-cart=${cartId}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("create and protected read share one process-memory repository", async () => {
  const runtime = makeRuntime();
  const created = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptA }));
  assert.equal(created.status, 200);
  const body = await created.json();
  assert.match(body.publicReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
  assert.equal("browserCapability" in body, false);
  assert.doesNotMatch(JSON.stringify(body), /receiptId|ownerId|storageKey|bucket|capability/i);

  const cookie = created.headers.get("set-cookie");
  assert.match(cookie ?? "", /HttpOnly/);
  assert.match(cookie ?? "", /SameSite=Lax/);
  assert.match(cookie ?? "", /Path=\//);
  const read = await runtime.readHandler(
    new Request(`http://localhost:3000/api/local-orders/${body.publicReference}`, { headers: { cookie } }),
    body.publicReference,
  );
  assert.equal(read.status, 200);
  assert.equal((await read.json()).publicReference, body.publicReference);
  assert.equal(runtime.repository.getOrderCountForTests(), 1);
});

test("shipping-required text-only HTTP creation needs no CustomerUpload owner or receipt", async () => {
  const textValue = { fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "A handwritten memory" };
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
  const runtime = makeRuntime({ customizationValues: [textValue], customizationFields: [textField] });
  const created = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptB }));
  assert.equal(created.status, 200);
  const body = await created.json();
  assert.equal(body.status, "pending_payment");
  assert.equal(body.paymentStatus, "pending");
  assert.equal(body.commercial.shipping.method, "local_standard");
  assert.equal(body.lines[0].customization[0].kind, "short_text");
  assert.equal(body.lines[0].customization[0].value, "A handwritten memory");
  assert.doesNotMatch(JSON.stringify(body), /receiptId|ownerId|storageKey|bucket|capability/i);
  assert.equal(runtime.repository.getOrderCountForTests(), 1);
});

test("lost response retry restores access and does not duplicate the Local Order", async () => {
  const runtime = makeRuntime();
  const first = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptA }));
  const firstBody = await first.json();
  const retry = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptA }));
  const retryBody = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(retryBody.publicReference, firstBody.publicReference);
  assert.ok(retry.headers.get("set-cookie"));
  assert.equal(runtime.repository.getOrderCountForTests(), 1);
});

test("wrong or missing capability cannot enumerate a known Local Order", async () => {
  const runtime = makeRuntime();
  const created = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptA }));
  const body = await created.json();
  const missing = await runtime.readHandler(
    new Request("http://localhost:3000/api/local-orders/read"),
    body.publicReference,
  );
  const wrong = await runtime.readHandler(
    new Request("http://localhost:3000/api/local-orders/read", { headers: { cookie: "figmemento-local-order-access=wrong-capability-123456" } }),
    body.publicReference,
  );
  assert.equal(missing.status, 404);
  assert.equal(wrong.status, 404);
  assert.deepEqual(await missing.json(), await wrong.json());
});

test("one browser capability reads multiple Local Orders without invalidating the first", async () => {
  const runtime = makeRuntime();
  const first = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptA }));
  const firstBody = await first.json();
  const cookie = first.headers.get("set-cookie");
  const second = await runtime.handler(request({ ...requestBody, firstName: "Second", creationAttemptId: attemptB }, { cookie: `${cookie}; figmemento-local-cart=${cartId}` }));
  const secondBody = await second.json();
  assert.equal(second.status, 200);
  assert.notEqual(secondBody.publicReference, firstBody.publicReference);
  const firstRead = await runtime.readHandler(
    new Request("http://localhost:3000/api/local-orders/read", { headers: { cookie } }),
    firstBody.publicReference,
  );
  const secondRead = await runtime.readHandler(
    new Request("http://localhost:3000/api/local-orders/read", { headers: { cookie } }),
    secondBody.publicReference,
  );
  assert.equal(firstRead.status, 200);
  assert.equal(secondRead.status, 200);
  assert.equal(runtime.repository.getOrderCountForTests(), 2);
});

test("same selector with changed structural input is a bounded conflict", async () => {
  const runtime = makeRuntime();
  const first = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptA }));
  assert.equal(first.status, 200);
  const changed = await runtime.handler(request({ ...requestBody, email: "changed@example.test", creationAttemptId: attemptA }));
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).issues[0].code, "conflict");
  assert.equal(runtime.repository.getOrderCountForTests(), 1);
});

test("same-origin and browser-authority guards run before privileged construction", async () => {
  const runtime = makeRuntime();
  const rejected = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptB, subtotalCents: 1 }, { origin: "https://attacker.example" }));
  assert.equal(rejected.status, 403);
  assert.equal(runtime.calls.catalog, 0);
  const invalid = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptB, subtotalCents: 1 }));
  assert.equal(invalid.status, 400);
  assert.equal(runtime.calls.catalog, 0);
});

test("restart loses Local Orders and reads fail closed", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const runtime = makeRuntime({ repository });
  const created = await runtime.handler(request({ ...requestBody, creationAttemptId: attemptA }));
  const body = await created.json();
  const afterRestart = makeRuntime({ repository: new LocalMemoryLocalOrderRepository() });
  const lost = await afterRestart.readHandler(
    new Request("http://localhost:3000/api/local-orders/read", { headers: { cookie: created.headers.get("set-cookie") } }),
    body.publicReference,
  );
  assert.equal(lost.status, 404);
});
