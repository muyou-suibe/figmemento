import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { projectSupplierEconomics, readSupplierCustomerRevenue } from "../app/application/local-supplier-economics.ts";
import { LocalSupplierOperatorService } from "../app/application/local-supplier-operator-service.ts";
import { normalizeLocalSupplierSourceFixtures, makeSupplierCatalogMappingKey } from "../app/domain/supplier-operations.ts";
import { LOCAL_SUPPLIER_SOURCE_FIXTURES } from "../app/infrastructure/suppliers/local-supplier-source-fixtures.ts";
import { LocalMemoryLocalSupplierAssignmentRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-assignment-repository.server.ts";
import { LocalMemoryLocalSupplierWorkOrderRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-work-order-repository.server.ts";
import { LocalMemoryLocalSupplierProductionRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-production-repository.server.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { projectLocalOrderSnapshot } from "../app/domain/local-order.ts";
import { createLocalFulfillmentState, projectLocalFulfillmentState } from "../app/domain/local-fulfillment.ts";
import { projectLocalShipment } from "../app/domain/local-tracking.ts";

const normalized = normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES);
assert.equal(normalized.ok, true);
const real = normalized.value;
const facts = (overrides = {}) => ({ ...real.variants[0], ...overrides });
const project = (overrides = {}) => projectSupplierEconomics(facts(overrides), "current_source");

async function environment() {
  const orders = new LocalMemoryLocalOrderRepository();
  const catalog = { productId: "test-economics-product", productName: "TEST economics item", productSlug: "test-economics", variantId: "test-catalog-variant", skuCode: "TEST-ECONOMICS", selectedOptions: [], unitBasePriceCents: 8990, currency: "USD", fulfillmentType: "physical" };
  const created = await orders.findOrCreate({
    creationAttemptId: "123e4567-e89b-42d3-a456-426614174000",
    context: { cartId: "economics-cart", authorityKey: "economics-test" }, inputFingerprint: "economics-fingerprint",
    snapshot: {
      contact: { email: "customer@example.test", firstName: "Test", lastName: "Buyer", country: "US", city: "Austin", addressLine1: "1 Test Street", postalCode: "78701" },
      commercial: { currency: "USD", subtotalCents: 26970, shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 0, currency: "USD", estimatedRange: "test", developmentOnly: true }, coupon: { status: "not_selected", discountCents: 0, developmentOnly: true }, tax: { status: "not_activated", amountCents: null }, localArithmeticTotalCents: 26970, developmentOnly: true },
      lines: [1, 2].map((quantity) => ({ ...catalog, quantity, lineSubtotalCents: 8990 * quantity, customization: { configurationRevision: "test-revision", values: [] } })),
    },
  });
  assert.equal(created.status, "created");
  const paid = new LocalMemoryLocalPaymentRepository(orders).commit({ internalOrderId: created.snapshot.internalId, orderReference: created.snapshot.publicReference, paymentAttemptId: "test-economics-payment-1", outcome: "success", authorityContext: "test-economics-authority" });
  assert.equal(paid.status, "committed");
  const order = paid.orderSnapshot;
  const unit = { canonicalOrder: { internalOrderId: order.internalId, publicReference: order.publicReference }, orderItemId: order.lines[1].orderItemId };
  const variant = { ...real.variants[0], status: "active", reviewStatus: "approved" };
  const sourceOffer = real.offers.find((offer) => offer.offerId === variant.offerId);
  const mappingFacts = { productId: catalog.productId, productSlug: catalog.productSlug, catalogVariantId: catalog.variantId, skuCode: catalog.skuCode, selectedOptions: [], supplierOfferId: sourceOffer.offerId, supplierOfferVariantId: variant.supplierOfferVariantId };
  const dataset = {
    suppliers: [{ ...real.suppliers.find((supplier) => supplier.supplierId === sourceOffer.supplierId), status: "active", canShipToShanghaiWarehouse: true }],
    offers: [{ ...sourceOffer, status: "active", canShipToShanghaiWarehouse: true, catalogMapping: { ...mappingFacts, status: "approved", mappingKey: makeSupplierCatalogMappingKey(mappingFacts), reason: "TEST ONLY APPROVED MAPPING" } }], variants: [variant],
  };
  const state = createLocalFulfillmentState({ internalOrderId: order.internalId, publicOrderReference: order.publicReference, status: "preview_approved", currentPreview: { kind: "local_fulfillment_preview", previewVersion: 1, displayLabel: "TEST preview", publishedAt: "2026-09-05T00:00:00.000Z", developmentOnly: true }, revisionRequestsUsed: 0, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" });
  const runtime = { configuration: { source: "local_fake", runtimeMode: "test" }, dataset, orders, assignments: new LocalMemoryLocalSupplierAssignmentRepository(), workOrders: new LocalMemoryLocalSupplierWorkOrderRepository(), production: new LocalMemoryLocalSupplierProductionRepository(), fulfillments: { findByOrderIdentity: () => ({ status: "found", aggregate: { state } }) } };
  const service = new LocalSupplierOperatorService({ runtime, verifier: { verify: () => ({ actorKind: "operator", actorContextId: "test-economics-operator" }) } });
  const assigned = service.assign({ assignmentActionId: "test-economics-assignment", productionUnit: unit, shanghaiWarehouseRequired: true, selectedCandidate: { supplierId: sourceOffer.supplierId, offerId: sourceOffer.offerId, supplierOfferVariantId: variant.supplierOfferVariantId } });
  assert.equal(assigned.status, "committed", JSON.stringify(assigned));
  return { orders, order, unit, catalog, runtime, service, state };
}

test("G known fixed and variant costs preserve source currency, basis and surcharge", () => {
  for (const pricingBasis of ["fixed", "variant_fixed"]) {
    const value = project({ supplierCostCents: 13000, pricingBasis, priceUnit: "per_unit", optionSurchargeCents: 600 });
    assert.deepEqual(value.supplierProductionCost, { status: "known", amountCents: 13000, currency: "CNY", pricingBasis, priceUnit: "per_unit", unitCostCents: 13000, optionSurchargeCents: 600 });
  }
});

test("G null and unsafe costs are unknown, whereas an explicit zero remains distinct", () => {
  for (const supplierCostCents of [null, undefined, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const value = project({ supplierCostCents });
    assert.equal(value.supplierProductionCost.status, "unknown");
    assert.equal(value.supplierProductionCost.amountCents, null);
    assert.equal(value.supplierProductionCost.unitCostCents, null);
  }
  assert.equal(project({ supplierCostCents: 0 }).supplierProductionCost.status, "known");
  assert.equal(project({ currency: null }).supplierProductionCost.status, "unknown");
  assert.equal(project({ currency: "EUR" }).supplierProductionCost.status, "unknown");
});

test("G area pricing retains the rate and cannot become a fixed unit cost", () => {
  const area = project({ pricingBasis: "area_based", priceUnit: "per_area", supplierCostCents: 12200 });
  assert.equal(area.supplierProductionCost.status, "area_based");
  assert.equal(area.supplierProductionCost.amountCents, 12200);
  assert.equal(area.supplierProductionCost.unitCostCents, null);
  assert.equal(area.supplierProductionCost.priceUnit, "per_area");
  assert.equal(project({ pricingBasis: "area_based", priceUnit: "per_unit" }).supplierProductionCost.unitCostCents, null);
});

test("G manual quote and unknown price units never imply a zero or fixed cost", () => {
  const manual = project({ supplierCostCents: null, pricingBasis: "manual_quote_required", priceUnit: "manual_quote" });
  assert.equal(manual.supplierProductionCost.status, "manual_quote_required");
  assert.equal(manual.supplierProductionCost.amountCents, null);
  assert.equal(manual.supplierProductionCost.unitCostCents, null);
  assert.equal(project({ priceUnit: "unknown" }).supplierProductionCost.unitCostCents, null);
});

test("G revenue and supplier currency remain isolated; landed cost and margin stay unavailable", () => {
  for (const currency of ["USD", "CNY"]) {
    const value = projectSupplierEconomics(facts({ currency }), "committed_assignment", { status: "known", amountCents: 8990, currency: "USD", quantity: 1 });
    assert.equal(value.customerRevenue.currency, "USD");
    assert.equal(value.supplierProductionCost.currency, currency);
    assert.deepEqual(value.landedCost, { status: "unavailable" });
    assert.deepEqual(value.grossMargin, { status: "unavailable" });
    assert.doesNotMatch(JSON.stringify(value), /exchangeRate|convertedAmount|profitCents|marginPercent/);
  }
});

test("G production windows retain bounds and incomplete or invalid ranges remain unavailable", () => {
  assert.deepEqual(project({ minProductionBusinessDays: 3, maxProductionBusinessDays: 4 }).productionLeadTime, { status: "known", minProductionBusinessDays: 3, maxProductionBusinessDays: 4 });
  for (const [min, max] of [[null, 4], [3, null], [4, 3], [-1, 4], [3, Infinity]]) {
    assert.equal(project({ minProductionBusinessDays: min, maxProductionBusinessDays: max }).productionLeadTime.status, "unavailable");
  }
  assert.doesNotMatch(JSON.stringify(project()), /deliveryEta|arrivalDate|shippingDays|completionDate/);
});

test("G real source variants preserve distinct weights, raw approximate wording, and null dimensions", () => {
  for (const [offerId, expected] of [["offer-quanzhou-3d-pet", [60, 100, 150]], ["offer-quanzhou-bobblehead", [70, 110, 150]], ["offer-tmall-puzzle", [400, 550, 1000]], ["offer-taobao-wood-engraving", [400, 500, 600]]]) {
    const values = real.variants.filter((v) => v.offerId === offerId).map((v) => projectSupplierEconomics(v, "current_source"));
    assert.deepEqual(values.map((v) => v.packagedWeight.grams), expected);
    for (const value of values) {
      assert.match(value.packagedWeight.rawText, /约/);
      assert.equal(value.packagedWeight.reviewStatus, "provisional");
      assert.equal(value.packagedWeight.approvalRequired, true);
      assert.equal(value.dimensionsCm, null);
    }
  }
  for (const v of real.variants.filter((v) => v.offerId === "offer-jinhua-3d-pet")) {
    const value = projectSupplierEconomics(v, "current_source");
    assert.equal(value.packagedWeight.grams, null);
    assert.equal(value.packagedWeight.status, "unavailable");
  }
});

test("G legacy snapshots lacking review fields stay explicitly unknown without source reconstruction", () => {
  const value = project({ packagedWeightRawText: undefined, packagedWeightReviewStatus: undefined, reviewStatus: undefined });
  assert.equal(value.packagedWeight.rawText, null);
  assert.equal(value.packagedWeight.reviewStatus, "unknown");
  assert.equal(value.packagedWeight.approvalRequired, true);
  assert.equal(value.factReviewStatus, "unknown");
});

test("G historical assignment and WorkOrder economics survive edits/deletion of current supplier data", async () => {
  const fx = await environment();
  const created = await fx.service.execute({ action: "create_work_order", input: { workOrderActionId: "test-economics-work-order", productionUnit: fx.unit } });
  assert.equal(created.status, "committed", JSON.stringify(created));
  const before = fx.service.read().value.queues;
  assert.equal(before.assigned[0].economics.packagedWeight.rawText, "约50g");
  assert.equal(before.assigned[0].economics.packagedWeight.reviewStatus, "provisional");
  assert.deepEqual(before.workOrders[0].economics, before.assigned[0].economics);
  // Normalization freezes a dataset revision. Publish a new current revision,
  // leaving the original assignment and original source revision untouched.
  fx.runtime.dataset = { ...fx.runtime.dataset, variants: [{ ...fx.runtime.dataset.variants[0], supplierCostCents: 1, currency: "USD", pricingBasis: "area_based", priceUnit: "per_area", packagedWeightGrams: 999, packagedWeightRawText: "changed", packagedWeightReviewStatus: "approved", minProductionBusinessDays: 90, maxProductionBusinessDays: 100 }] };
  const current = fx.service.read().value;
  assert.equal(current.variants[0].economics.supplierProductionCost.amountCents, 1);
  assert.deepEqual(current.queues.assigned, before.assigned);
  assert.deepEqual(current.queues.workOrders, before.workOrders);
  fx.runtime.dataset = { ...fx.runtime.dataset, variants: [], offers: [] };
  assert.deepEqual(fx.service.read().value.queues.assigned, before.assigned);
  assert.deepEqual(fx.service.read().value.queues.workOrders, before.workOrders);
});

test("G real committed Order resolves duplicate Product/SKU lines by exact item and ignores Catalog price drift", async () => {
  const fx = await environment();
  const before = fx.service.read().value.queues.assigned[0].economics.customerRevenue;
  assert.deepEqual(before, { status: "known", amountCents: 17980, currency: "USD", quantity: 2 });
  const firstUnit = { ...fx.unit, orderItemId: fx.order.lines[0].orderItemId };
  assert.equal(readSupplierCustomerRevenue(fx.orders, firstUnit).amountCents, 8990);
  fx.catalog.unitBasePriceCents = 1;
  fx.catalog.currency = "CNY";
  Object.defineProperty(fx.runtime, "catalog", { get() { throw new Error("Catalog must not be consulted"); } });
  assert.deepEqual(fx.service.read().value.queues.assigned[0].economics.customerRevenue, before);
  const helper = await readFile(new URL("../app/application/local-supplier-economics.ts", import.meta.url), "utf8");
  assert.doesNotMatch(helper, /from .*catalog|fetch\(|localStorage|findConfiguredItem/);
});

test("G wrong identity, duplicate item IDs, missing/invalid revenue and read failure are bounded unavailable", async () => {
  const fx = await environment();
  for (const unit of [{ ...fx.unit, orderItemId: "unknown-item-identity" }, { ...fx.unit, canonicalOrder: { ...fx.unit.canonicalOrder, internalOrderId: "other-order" } }, { ...fx.unit, canonicalOrder: { ...fx.unit.canonicalOrder, publicReference: "FM-LOCAL-ABCDEFGHIJKLMNOP" } }]) {
    assert.deepEqual(readSupplierCustomerRevenue(fx.orders, unit), { status: "unavailable" });
  }
  const line = fx.order.lines[1];
  for (const lines of [[{ ...line, orderItemId: undefined }], [line, line], ...[null, -1, 1.5, NaN, Infinity].map((lineSubtotalCents) => [{ ...line, lineSubtotalCents }]), [{ ...line, currency: "CNY" }], [{ ...line, quantity: 1 }]]) {
    const source = { findSnapshotForFulfillmentById: () => ({ status: "found", snapshot: { ...fx.order, lines } }) };
    assert.deepEqual(readSupplierCustomerRevenue(source, fx.unit), { status: "unavailable" });
  }
  fx.runtime.orders = { findSnapshotForFulfillmentById() { throw new Error("private dependency details"); } };
  const read = fx.service.read();
  assert.equal(read.status, "found");
  assert.deepEqual(read.value.queues.assigned[0].economics.customerRevenue, { status: "unavailable" });
});

test("G real fixtures and bounded source review never approve a catalog mapping", () => {
  assert.deepEqual([real.suppliers.length, real.offers.length, real.variants.length], [8, 13, 31]);
  assert.equal(real.offers.filter((o) => o.catalogMapping.status === "approved").length, 0);
  const value = project();
  assert.equal(value.factReviewStatus, "provisional");
  assert.equal(value.provenance[0].sourceRow, 4);
  assert.ok(value.provenance[0].reviewNote);
  assert.deepEqual(Object.keys(value.provenance[0]).sort(), ["sourceRow", "sourceUrl", "reviewStatus", "reviewNote", "quotedPrice", "packagedWeight", "fastestProductionDays", "slowestProductionDays"].sort());
});

test("G customer Order/Fulfillment/Tracking projectors redact supplier sourcing and economics after assignment", async () => {
  const fx = await environment();
  const economics = fx.service.read().value.queues.assigned[0].economics;
  const privateFields = { supplierId: "supplier-private", supplierCostCents: 12345, sourceUrl: "https://private-source.test", economics };
  const orderPublic = projectLocalOrderSnapshot({ ...fx.order, ...privateFields, lines: fx.order.lines.map((line) => ({ ...line, ...privateFields })) });
  const fulfillmentPublic = projectLocalFulfillmentState({ ...fx.state, ...privateFields }, "customer");
  const trackingPublic = projectLocalShipment({ ...privateFields, canonicalOrder: fx.unit.canonicalOrder, publicShipmentReference: "FM-LOCAL-SHP-TEST00000001", carrier: { displayLabel: "Local test carrier" }, trackingNumber: "TEST-LOCAL-123", status: "shipment_created", events: [], createdAt: "2026-09-05T00:00:00.000Z", shippedAt: null, inTransitAt: null, deliveredAt: null });
  for (const value of [orderPublic, fulfillmentPublic, trackingPublic]) assert.doesNotMatch(JSON.stringify(value), /supplier|pricingBasis|packagedWeight|productionBusinessDays|provenance|landedCost|grossMargin|private-source/i);
});

test("G unauthorized operator cannot read economics or canonical revenue", async () => {
  const fx = await environment();
  fx.runtime.orders = { findSnapshotForFulfillmentById() { assert.fail("unauthorized canonical read"); } };
  const service = new LocalSupplierOperatorService({ runtime: fx.runtime, verifier: undefined });
  assert.equal(service.read().status, "unavailable");
});

test("G operator economics render actual React markup with distinct authority, uncertainty and no fabricated amounts", async () => {
  const server = await createServer({ root: process.cwd(), configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false, watch: null } });
  try {
    const { SupplierEconomicsDetails } = await server.ssrLoadModule("/app/storefront/SupplierEconomicsDetails.tsx");
    const render = (value) => renderToStaticMarkup(createElement(SupplierEconomicsDetails, { value }));
    const html = render(projectSupplierEconomics(facts(), "committed_assignment", { status: "known", amountCents: 8990, currency: "USD", quantity: 1 }));
    for (const text of ["Committed assignment economics", "USD 89.90", "CNY 160.00", "per_unit", "约50g", "provisional", "approval required", "production only", "before Order-level", "Landed cost / gross margin", "Unknown"]) assert.ok(html.includes(text), text);
    assert.match(html, /<details><summary>/);
    const area = render(project({ pricingBasis: "area_based", priceUnit: "per_area" }));
    assert.match(area, /Area-based pricing — fixed unit cost unavailable/);
    assert.doesNotMatch(area, /Supplier production cost per unit/);
    const manual = render(project({ pricingBasis: "manual_quote_required", priceUnit: "manual_quote", supplierCostCents: null }));
    assert.match(manual, /Manual quote required/);
    assert.doesNotMatch(manual, /CNY 0\.00|USD 0\.00/);
    const current = render(project());
    assert.match(current, /Current source evidence/);
    assert.doesNotMatch(current, /Customer item revenue/);
  } finally { await server.close(); }
});
