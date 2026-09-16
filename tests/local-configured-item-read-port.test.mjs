import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createLocalConfiguredItemReadAdapter,
} from "../app/application/local-configured-item-read-port.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";

const attempt = (suffix) => `123e4567-e89b-42d3-a456-4266141740${String(suffix).padStart(2, "2")}`;

function draft({ lines = [line()] } = {}) {
  return {
    contact: {
      email: "customer@example.test",
      firstName: "Test",
      lastName: "Customer",
      country: "US",
      city: "Austin",
      addressLine1: "1 Main Street",
      postalCode: "78701",
    },
    commercial: {
      currency: "USD",
      subtotalCents: 8990 * lines.reduce((total, entry) => total + entry.quantity, 0),
      shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 0, currency: "USD", estimatedRange: "5-10 business days", developmentOnly: true },
      coupon: { status: "not_selected", discountCents: 0, developmentOnly: true },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 8990 * lines.reduce((total, entry) => total + entry.quantity, 0),
      developmentOnly: true,
    },
    lines,
  };
}

function line(overrides = {}) {
  return {
    productId: "product-read-port",
    productName: "Historical Configured Product",
    productSlug: "historical-configured-product",
    variantId: "variant-read-port",
    skuCode: "READ-PORT-SKU",
    selectedOptions: [],
    quantity: 1,
    unitBasePriceCents: 8990,
    currency: "USD",
    fulfillmentType: "physical",
    lineSubtotalCents: 8990,
    customization: {
      configurationRevision: "configuration-read-port",
      values: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Committed text" }],
    },
    ...overrides,
  };
}

async function createOrder(repository, suffix, options = {}) {
  const result = await repository.findOrCreate({
    creationAttemptId: attempt(suffix),
    context: { cartId: `cart-read-port-${suffix}`, authorityKey: "read-port-authority" },
    inputFingerprint: `read-port-fingerprint-${suffix}`,
    snapshot: draft(options),
  });
  assert.equal(result.status, "created");
  return result;
}

test("exact internal Order + public reference + orderItemId returns a minimal immutable projection", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const created = await createOrder(repository, 1);
  const adapter = createLocalConfiguredItemReadAdapter(repository);
  const result = adapter.findConfiguredItem({
    internalOrderId: created.snapshot.internalId,
    publicOrderReference: created.snapshot.publicReference,
    orderItemId: created.snapshot.lines[0].orderItemId,
  });

  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.deepEqual(result.item, {
    internalOrderId: created.snapshot.internalId,
    publicOrderReference: created.snapshot.publicReference,
    orderItemId: created.snapshot.lines[0].orderItemId,
    productId: "product-read-port",
    productName: "Historical Configured Product",
    productSlug: "historical-configured-product",
    variantId: "variant-read-port",
    skuCode: "READ-PORT-SKU",
    selectedOptions: [],
    quantity: 1,
    fulfillmentType: "physical",
    configurationRevision: "configuration-read-port",
    customizationValues: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Committed text" }],
  });
  assert.equal(Object.isFrozen(result.item), true);
  assert.equal(Object.isFrozen(result.item.customizationValues), true);
  assert.equal(Object.isFrozen(result.item.customizationValues[0]), true);
  assert.throws(() => { result.item.productName = "changed"; }, TypeError);
});

test("wrong Order identity, public reference, item, and cross-Order item are all unavailable", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const first = await createOrder(repository, 2);
  const second = await createOrder(repository, 3);
  const adapter = createLocalConfiguredItemReadAdapter(repository);
  const valid = {
    internalOrderId: first.snapshot.internalId,
    publicOrderReference: first.snapshot.publicReference,
    orderItemId: first.snapshot.lines[0].orderItemId,
  };
  for (const input of [
    { ...valid, internalOrderId: second.snapshot.internalId },
    { ...valid, publicOrderReference: second.snapshot.publicReference },
    { ...valid, orderItemId: "missing-order-item-id" },
    { ...valid, orderItemId: second.snapshot.lines[0].orderItemId },
  ]) {
    assert.deepEqual(adapter.findConfiguredItem(input), { status: "unavailable" });
  }
});

test("duplicate Product lines resolve independently by stored orderItemId, never by first SKU", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const created = await createOrder(repository, 4, { lines: [line({ customization: { configurationRevision: "configuration-a", values: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "A" }] } }), line({ customization: { configurationRevision: "configuration-b", values: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "B" }] } })] });
  const adapter = createLocalConfiguredItemReadAdapter(repository);
  const first = adapter.findConfiguredItem({ internalOrderId: created.snapshot.internalId, publicOrderReference: created.snapshot.publicReference, orderItemId: created.snapshot.lines[0].orderItemId });
  const second = adapter.findConfiguredItem({ internalOrderId: created.snapshot.internalId, publicOrderReference: created.snapshot.publicReference, orderItemId: created.snapshot.lines[1].orderItemId });
  assert.equal(first.status, "found");
  assert.equal(second.status, "found");
  if (first.status !== "found" || second.status !== "found") return;
  assert.equal(first.item.orderItemId === second.item.orderItemId, false);
  assert.equal(first.item.configurationRevision, "configuration-a");
  assert.equal(second.item.configurationRevision, "configuration-b");
});

test("historical reads remain identical after current Product, Catalog, pricing, schema, and Supplier facts drift", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const created = await createOrder(repository, 7, {
    lines: [line({
      productName: "Committed Product Name",
      productSlug: "committed-product-slug",
      skuCode: "COMMITTED-SKU",
      selectedOptions: [{ optionId: "size", valueId: "standard" }],
      customization: {
        configurationRevision: "configuration-committed",
        values: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Historical value" }],
      },
    })],
  });
  const adapter = createLocalConfiguredItemReadAdapter(repository);
  const identity = {
    internalOrderId: created.snapshot.internalId,
    publicOrderReference: created.snapshot.publicReference,
    orderItemId: created.snapshot.lines[0].orderItemId,
  };
  const first = adapter.findConfiguredItem(identity);
  assert.equal(first.status, "found");

  const currentExternalFacts = {
    productName: "Renamed current Product",
    productSlug: "renamed-current-product",
    skuCode: "CURRENT-SKU",
    selectedOptions: [{ optionId: "size", valueId: "deluxe" }],
    priceCents: 12990,
    customizationRevision: "configuration-current",
    supplierSpecificationKey: "supplier-current-key",
  };
  Object.assign(currentExternalFacts, {
    productName: "Deleted Product",
    productSlug: "deleted-product",
    skuCode: "DELETED-SKU",
    selectedOptions: [],
    priceCents: 1,
    customizationRevision: "deleted-schema",
    supplierSpecificationKey: "deleted-supplier-mapping",
  });

  const second = adapter.findConfiguredItem(identity);
  assert.equal(second.status, "found");
  if (first.status !== "found" || second.status !== "found") return;
  assert.deepEqual(second.item, first.item);
  assert.equal(second.item.productName, "Committed Product Name");
  assert.equal(second.item.productSlug, "committed-product-slug");
  assert.equal(second.item.skuCode, "COMMITTED-SKU");
  assert.deepEqual(second.item.selectedOptions, [{ optionId: "size", valueId: "standard" }]);
  assert.equal(second.item.quantity, 1);
  assert.equal(second.item.fulfillmentType, "physical");
  assert.equal(second.item.configurationRevision, "configuration-committed");
  assert.equal("unitBasePriceCents" in second.item, false);
  assert.equal("currency" in second.item, false);
  assert.deepEqual(repository.findSnapshotForFulfillmentById(created.snapshot.internalId), {
    status: "found",
    snapshot: created.snapshot,
  });
});

test("duplicate stored orderItemId values fail closed instead of selecting the first line", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const created = await createOrder(repository, 8, { lines: [line(), line({ customization: { configurationRevision: "configuration-b", values: [] } })] });
  const duplicatedItemId = created.snapshot.lines[0].orderItemId;
  const malformedSnapshot = {
    ...created.snapshot,
    lines: [
      created.snapshot.lines[0],
      { ...created.snapshot.lines[1], orderItemId: duplicatedItemId },
    ],
  };
  const adapter = createLocalConfiguredItemReadAdapter({
    findSnapshotForFulfillmentById: () => ({ status: "found", snapshot: malformedSnapshot }),
  });
  assert.deepEqual(adapter.findConfiguredItem({
    internalOrderId: malformedSnapshot.internalId,
    publicOrderReference: malformedSnapshot.publicReference,
    orderItemId: duplicatedItemId,
  }), { status: "unavailable" });
});

test("legacy snapshots remain customer-readable but unavailable through the configured-item authority", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const legacyLine = line();
  delete legacyLine.fulfillmentType;
  const created = await createOrder(repository, 5, { lines: [legacyLine] });
  assert.equal("orderItemId" in created.snapshot.lines[0], false);
  const customerRead = await repository.findAuthorizedSnapshot(created.snapshot.publicReference, created.browserCapability);
  assert.equal(customerRead.status, "found");
  const adapter = createLocalConfiguredItemReadAdapter(repository);
  assert.deepEqual(adapter.findConfiguredItem({ internalOrderId: created.snapshot.internalId, publicOrderReference: created.snapshot.publicReference, orderItemId: "legacy-order-item-id" }), { status: "unavailable" });
});

test("missing or malformed canonical facts fail closed without a partial projection", () => {
  const validOrderItemId = "malformed-order-item";
  const malformedLines = [
    { ...line(), orderItemId: undefined },
    { ...line(), orderItemId: validOrderItemId, fulfillmentType: undefined },
    { ...line(), orderItemId: validOrderItemId, fulfillmentType: "warehouse" },
    { ...line(), orderItemId: validOrderItemId, productId: undefined },
    { ...line(), orderItemId: validOrderItemId, variantId: undefined },
    { ...line(), orderItemId: validOrderItemId, skuCode: undefined },
    { ...line(), orderItemId: validOrderItemId, selectedOptions: "size=small" },
    { ...line(), orderItemId: validOrderItemId, selectedOptions: [{ optionId: "size", valueId: "small" }, { optionId: "size", valueId: "large" }] },
    { ...line(), orderItemId: validOrderItemId, quantity: 0 },
    { ...line(), orderItemId: validOrderItemId, quantity: 1.5 },
    { ...line(), orderItemId: validOrderItemId, customization: { configurationRevision: undefined, values: [] } },
    { ...line(), orderItemId: validOrderItemId, customization: { configurationRevision: "bad revision", values: [] } },
    { ...line(), orderItemId: validOrderItemId, customization: undefined },
    { ...line(), orderItemId: validOrderItemId, customization: { configurationRevision: "configuration-bad", values: [{ kind: "unknown" }] } },
  ];
  for (const [index, malformedLine] of malformedLines.entries()) {
    const snapshot = {
      internalId: `malformed-order-${index}`,
      publicReference: "FM-LOCAL-MALFORMED1234",
      lines: [malformedLine],
    };
    const adapter = createLocalConfiguredItemReadAdapter({ findSnapshotForFulfillmentById: () => ({ status: "found", snapshot }) });
    assert.deepEqual(adapter.findConfiguredItem({ internalOrderId: snapshot.internalId, publicOrderReference: snapshot.publicReference, orderItemId: validOrderItemId }), { status: "unavailable" });
  }
  const validLine = line({ orderItemId: validOrderItemId });
  const validSnapshot = { internalId: "valid-order-for-invalid-input", publicReference: "FM-LOCAL-MALFORMED1234", lines: [validLine] };
  const adapter = createLocalConfiguredItemReadAdapter({ findSnapshotForFulfillmentById: () => ({ status: "found", snapshot: validSnapshot }) });
  assert.deepEqual(adapter.findConfiguredItem({ internalOrderId: validSnapshot.internalId, publicOrderReference: validSnapshot.publicReference, orderItemId: "short" }), { status: "unavailable" });
});

test("safe image receipt and crop data are retained while provider and unrelated Order data are excluded", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const created = await createOrder(repository, 6, { lines: [line({ customization: { configurationRevision: "configuration-image", values: [{ fieldId: "field-image", fieldCode: "reference", kind: "image", images: [{ receiptId: "receipt-safe", crop: { x: 0, y: 0, width: 1, height: 1 } }] }] } })] });
  const adapter = createLocalConfiguredItemReadAdapter(repository);
  const result = adapter.findConfiguredItem({ internalOrderId: created.snapshot.internalId, publicOrderReference: created.snapshot.publicReference, orderItemId: created.snapshot.lines[0].orderItemId });
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.deepEqual(result.item.customizationValues[0], { fieldId: "field-image", fieldCode: "reference", kind: "image", images: [{ receiptId: "receipt-safe", crop: { x: 0, y: 0, width: 1, height: 1 } }] });
  const serialized = JSON.stringify(result.item);
  for (const forbidden of ["email", "addressLine1", "phone", "paymentStatus", "capability", "signedUrl", "storageKey", "bucket", "providerLocator", "supplierCost"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("nested configured-item results are isolated and remain historical after caller mutation attempts", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const created = await createOrder(repository, 9, {
    lines: [line({
      selectedOptions: [{ optionId: "size", valueId: "standard" }],
      customization: {
        configurationRevision: "configuration-nested",
        values: [
          { fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Keep me" },
          { fieldId: "field-image", fieldCode: "reference", kind: "image", images: [{ receiptId: "receipt-nested", crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }] },
        ],
      },
    })],
  });
  const adapter = createLocalConfiguredItemReadAdapter(repository);
  const identity = {
    internalOrderId: created.snapshot.internalId,
    publicOrderReference: created.snapshot.publicReference,
    orderItemId: created.snapshot.lines[0].orderItemId,
  };
  const first = adapter.findConfiguredItem(identity);
  assert.equal(first.status, "found");
  if (first.status !== "found") return;
  assert.equal(Object.isFrozen(first.item.selectedOptions), true);
  assert.equal(Object.isFrozen(first.item.customizationValues[1].images), true);
  assert.equal(Object.isFrozen(first.item.customizationValues[1].images[0].crop), true);
  assert.throws(() => first.item.selectedOptions.push({ optionId: "finish", valueId: "matte" }), TypeError);
  assert.throws(() => { first.item.customizationValues[0].value = "rewritten"; }, TypeError);
  assert.throws(() => { first.item.customizationValues[1].images[0].crop.x = 0.9; }, TypeError);

  const second = adapter.findConfiguredItem(identity);
  const separateReader = createLocalConfiguredItemReadAdapter(repository);
  const separate = separateReader.findConfiguredItem(identity);
  assert.deepEqual(second, first);
  assert.deepEqual(separate, first);
  assert.deepEqual(repository.findSnapshotForFulfillmentById(created.snapshot.internalId), {
    status: "found",
    snapshot: created.snapshot,
  });
});

test("a downstream production seam consumes canonical history and ignores replacement quantity/configuration", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const created = await createOrder(repository, 10, { lines: [line({
    selectedOptions: [{ optionId: "size", valueId: "standard" }],
    customization: {
      configurationRevision: "configuration-production-input",
      values: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Canonical production input" }],
    },
  })] });
  const adapter = createLocalConfiguredItemReadAdapter(repository);
  const identity = {
    internalOrderId: created.snapshot.internalId,
    publicOrderReference: created.snapshot.publicReference,
    orderItemId: created.snapshot.lines[0].orderItemId,
  };
  const untrustedDownstreamRequest = {
    ...identity,
    quantity: 11,
    productId: "browser-replacement-product",
    selectedOptions: [{ optionId: "size", valueId: "deluxe" }],
    customizationValues: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Browser replacement" }],
  };
  const result = adapter.findConfiguredItem(untrustedDownstreamRequest);
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.item.quantity, 1);
  assert.equal(result.item.productId, "product-read-port");
  assert.equal(result.item.variantId, "variant-read-port");
  assert.equal(result.item.skuCode, "READ-PORT-SKU");
  assert.deepEqual(result.item.selectedOptions, [{ optionId: "size", valueId: "standard" }]);
  assert.deepEqual(result.item.customizationValues, [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Canonical production input" }]);
  assert.equal(result.item.fulfillmentType, "physical");
  assert.equal("selectedSpecificationKey" in result.item, false);
});

test("the adapter has no Catalog, Cart, Supplier, browser-storage, or HTTP authority dependency", async () => {
  const source = await readFile(new URL("../app/application/local-configured-item-read-port.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /PublicCatalogReadRepository|ProductRepository|ShoppingCart|CheckoutEvaluator|localStorage|sessionStorage|Request|fetch\s*\(/);
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:catalog|supplier|shopping-cart)[^"']*["']/i);
  assert.match(source, /findSnapshotForFulfillmentById/);
});
