import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LocalOrderCreationService } from "../app/application/local-order-creation.ts";
import { LocalPaymentService } from "../app/application/local-payment-service.ts";
import { LocalFulfillmentCustomerService, parseLocalFulfillmentCustomerActionInput } from "../app/application/local-fulfillment-customer-service.ts";
import { LocalFulfillmentOperatorService, parseLocalFulfillmentOperatorActionInput } from "../app/application/local-fulfillment-operator-service.ts";
import { LocalSupplierOperatorService } from "../app/application/local-supplier-operator-service.ts";
import { createLocalConfiguredItemReadAdapter } from "../app/application/local-configured-item-read-port.ts";
import { makeSupplierCatalogMappingKey, normalizeLocalSupplierSourceFixtures } from "../app/domain/supplier-operations.ts";
import { resolveLocalCouponFixture, resolveLocalShippingFixture } from "../app/infrastructure/local-checkout/local-checkout-fixtures.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { LocalMemoryLocalFulfillmentRepository } from "../app/infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts";
import { LocalMemoryLocalSupplierAssignmentRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-assignment-repository.server.ts";
import { LocalMemoryLocalSupplierProductionRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-production-repository.server.ts";
import { LocalMemoryLocalSupplierWorkOrderRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-work-order-repository.server.ts";
import { LOCAL_SUPPLIER_SOURCE_FIXTURES } from "../app/infrastructure/suppliers/local-supplier-source-fixtures.ts";
import {
  buildAdvanceProductionAction,
  buildAssignSupplierAction,
  buildCreateWorkOrderAction,
  buildReadyForOutboundAction,
  buildRecordQcAction,
  buildRecordReceiptAction,
} from "../app/client/local-supplier-operator-actions.ts";
import { createLocalFulfillmentRuntime } from "../app/server/local-fulfillment-runtime.server.ts";

const CONFIGURATION_RUNTIME = { source: "local_fake", runtimeMode: "test" };
const OPERATOR_AUTHORITY = { actorKind: "operator", actorContextId: "batch-h-operator" };
const OPERATOR_VERIFIER = { verify: () => OPERATOR_AUTHORITY };
const PRODUCT = {
  id: "product-batch-h",
  slug: "batch-h-configured-gift",
  categoryId: "category-batch-h",
  name: "Batch H Configured Gift",
  description: "TEST-ONLY integration product.",
  seo: {},
  lifecycle: "published",
};
const VARIANT = {
  id: "variant-batch-h",
  productId: PRODUCT.id,
  skuCode: "BATCH-H-SKU",
  priceCents: 8990,
  currency: "USD",
  weightGrams: 500,
  isActive: true,
  isAvailable: true,
  isDefault: true,
  supplyMethod: "made_to_order",
  selectedOptions: [],
};
const DETAIL = {
  category: {
    id: PRODUCT.categoryId,
    slug: "batch-h-gifts",
    name: "Batch H Gifts",
    description: "TEST-ONLY category.",
    seo: {},
    lifecycle: "published",
  },
  product: PRODUCT,
  listingPrice: { kind: "single", priceCents: VARIANT.priceCents, currency: VARIANT.currency },
  options: [],
  optionValues: [],
  variants: [VARIANT],
  assets: [],
  fulfillment: {
    id: "fulfillment-batch-h",
    productId: PRODUCT.id,
    fulfillmentType: "physical",
    requiresShipping: true,
    productionMode: "custom_manufacturing",
    leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
  },
};
const CUSTOMIZATION_CONFIGURATION = {
  productId: PRODUCT.id,
  configurationRevision: "batch-h-configuration-v1",
  fields: [{
    id: "field-batch-h-note",
    productId: PRODUCT.id,
    code: "note",
    label: "Customer note",
    kind: "short_text",
    required: false,
    isActive: true,
    position: 0,
    configurationRevision: "batch-h-configuration-v1",
    constraints: { maxLength: 80 },
  }],
};

function ids() {
  return {
    nextInternalId: () => "local-order-batch-h-1",
    nextPublicReference: () => "FM-LOCAL-ABCDEFGHIJKLMNOP",
    nextBrowserCapability: () => "batch-h-browser-capability-1",
    nextOrderItemId: () => "local-order-item-batch-h-1",
  };
}

function cart() {
  const selectedCustomization = {
    fieldId: "field-batch-h-note",
    fieldCode: "note",
    kind: "short_text",
    value: "A real configured Batch H test item",
  };
  return {
    cartId: "cart-batch-h",
    lines: [{
      lineId: "cart-line-batch-h",
      handoff: {
        productId: PRODUCT.id,
        variantId: VARIANT.id,
        skuCode: VARIANT.skuCode,
        selectedOptions: [],
        configurationRevision: CUSTOMIZATION_CONFIGURATION.configurationRevision,
        customizationValues: [selectedCustomization],
      },
      snapshot: {
        productId: PRODUCT.id,
        productName: PRODUCT.name,
        productSlug: PRODUCT.slug,
        variantId: VARIANT.id,
        skuCode: VARIANT.skuCode,
        selectedOptions: [],
        unitPriceCents: VARIANT.priceCents,
        currency: VARIANT.currency,
        availability: "available",
      },
      customization: {
        configuration: { sku: VARIANT.skuCode, options: [], needsReview: false },
        personalization: { status: "current", rows: [] },
      },
      quantity: 2,
    }],
  };
}

function createSupplierDataset() {
  const mappingKey = makeSupplierCatalogMappingKey({
    productId: PRODUCT.id,
    productSlug: PRODUCT.slug,
    catalogVariantId: VARIANT.id,
    skuCode: VARIANT.skuCode,
    selectedOptions: [],
    supplierOfferId: "offer-batch-h-test-only",
    supplierOfferVariantId: "supplier-variant-batch-h-test-only",
  });
  return {
    suppliers: [{
      kind: "supplier",
      supplierId: "supplier-batch-h-test-only",
      displayName: "TEST-ONLY Model C Supplier",
      platform: "1688",
      sourceUrl: null,
      status: "active",
      canShipToShanghaiWarehouse: true,
      videoCapability: "unknown",
      returnReworkPolicy: null,
      notes: "Explicit TEST-ONLY mapping; not a business approval.",
      provenance: [],
    }],
    offers: [{
      kind: "supplier_offer",
      offerId: "offer-batch-h-test-only",
      supplierId: "supplier-batch-h-test-only",
      sourceProductLabel: "TEST-ONLY approved Model C mapping",
      fulfillmentType: "physical",
      status: "active",
      catalogMapping: {
        status: "approved",
        productId: PRODUCT.id,
        productSlug: PRODUCT.slug,
        catalogVariantId: VARIANT.id,
        skuCode: VARIANT.skuCode,
        selectedOptions: [],
        supplierOfferId: "offer-batch-h-test-only",
        supplierOfferVariantId: "supplier-variant-batch-h-test-only",
        mappingKey,
        reason: "TEST-ONLY mapping for local integration acceptance; not an approved supplier mapping.",
      },
      minProductionBusinessDays: 2,
      maxProductionBusinessDays: 4,
      canShipToShanghaiWarehouse: true,
      sourcePackagedWeightText: "TEST-ONLY 60g",
      notes: "TEST-ONLY fixture.",
      provenance: [],
    }],
    variants: [{
      kind: "supplier_offer_variant",
      supplierOfferVariantId: "supplier-variant-batch-h-test-only",
      offerId: "offer-batch-h-test-only",
      supplierSpecificationKey: "batch-h-standard",
      label: "TEST-ONLY standard",
      status: "active",
      supplierCostCents: 1200,
      currency: "CNY",
      pricingBasis: "variant_fixed",
      priceUnit: "per_unit",
      optionSurchargeCents: null,
      packagedWeightGrams: 60,
      packagedWeightRawText: "TEST-ONLY 60g",
      packagedWeightReviewStatus: "approved",
      minProductionBusinessDays: 2,
      maxProductionBusinessDays: 4,
      dimensionsCm: null,
      rawSourceValue: "TEST-ONLY fixture.",
      reviewStatus: "approved",
      provenance: [],
    }],
  };
}

async function createIntegration() {
  const orders = new LocalMemoryLocalOrderRepository({ ids: ids(), now: () => "2026-09-05T10:00:00.000Z" });
  const currentCart = cart();
  const creationService = new LocalOrderCreationService({
    repository: orders,
    cartReader: { async getCart() { return { status: "found", value: structuredClone(currentCart) }; } },
    catalogRepository: { async findPublicProductById() { return { status: "found", value: DETAIL }; } },
    customizationFieldRepository: { async getCustomizationFieldsForProduct() { return { status: "found", value: CUSTOMIZATION_CONFIGURATION }; } },
    shippingResolver: resolveLocalShippingFixture,
    couponResolver: resolveLocalCouponFixture,
    now: () => "2026-09-05T10:00:00.000Z",
  });
  const created = await creationService.create("cart-batch-h", {
    creationAttemptId: "123e4567-e89b-42d3-a456-426614174981",
    address: {
      email: "batch-h@example.test",
      firstName: "Batch",
      lastName: "H",
      country: "US",
      city: "New York",
      addressLine1: "1 Batch H Street",
      postalCode: "10001",
    },
    shippingMethod: "local_standard",
  });
  assert.equal(created.status, "created", JSON.stringify(created));
  if (created.status !== "created") throw new Error("Batch H Order creation failed.");

  const payments = new LocalMemoryLocalPaymentRepository(orders, { now: () => "2026-09-05T10:01:00.000Z" });
  const paymentService = new LocalPaymentService({
    readConfig: () => CONFIGURATION_RUNTIME,
    getOrderRepository: () => orders,
    getPaymentRepository: () => payments,
  });
  const payment = await paymentService.execute({
    publicReference: created.snapshot.publicReference,
    paymentAttemptId: "payment-attempt-batch-h-1",
    outcome: "success",
    browserCapability: created.browserCapability,
  });
  assert.equal(payment.status, "committed", JSON.stringify(payment));
  if (payment.status !== "committed") throw new Error("Batch H Payment failed.");

  const fulfillments = new LocalMemoryLocalFulfillmentRepository(orders, { now: () => "2026-09-05T10:02:00.000Z" });
  const fulfillmentRuntime = createLocalFulfillmentRuntime({
    configuration: CONFIGURATION_RUNTIME,
    orders,
    repository: fulfillments,
    now: () => "2026-09-05T10:02:00.000Z",
  });
  const fulfillmentOperator = new LocalFulfillmentOperatorService({ runtime: fulfillmentRuntime, verifier: OPERATOR_VERIFIER });
  const customerFulfillment = new LocalFulfillmentCustomerService({
    readConfig: () => CONFIGURATION_RUNTIME,
    getOrderRepository: () => orders,
    getFulfillmentRepository: () => fulfillments,
  });

  const supplierDataset = createSupplierDataset();
  const assignments = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "supplier-assignment-batch-h-1", now: () => "2026-09-05T10:03:00.000Z" });
  const workOrders = new LocalMemoryLocalSupplierWorkOrderRepository({ nextWorkOrderId: () => "supplier-work-order-batch-h-1", now: () => "2026-09-05T10:04:00.000Z" });
  const production = new LocalMemoryLocalSupplierProductionRepository({
    nextOperationId: () => "supplier-production-operation-batch-h-1",
    nextWarehouseReceiptId: () => "warehouse-receipt-batch-h-1",
    now: () => "2026-09-05T10:05:00.000Z",
  });
  const supplierRuntime = {
    configuration: CONFIGURATION_RUNTIME,
    dataset: supplierDataset,
    orders,
    configuredItems: createLocalConfiguredItemReadAdapter(orders),
    fulfillments,
    assignments,
    workOrders,
    production,
  };
  const supplierOperator = new LocalSupplierOperatorService({ runtime: supplierRuntime, verifier: OPERATOR_VERIFIER });
  const snapshot = orders.findSnapshotForFulfillmentById(created.snapshot.internalId);
  assert.equal(snapshot.status, "found");
  if (snapshot.status !== "found") throw new Error("Batch H canonical Order disappeared.");
  const order = snapshot.snapshot;
  const productionUnit = { canonicalOrder: { internalOrderId: order.internalId, publicReference: order.publicReference }, orderItemId: order.lines[0].orderItemId };
  const fields = {
    internalOrderId: order.internalId,
    publicOrderReference: order.publicReference,
    orderItemId: order.lines[0].orderItemId,
  };

  return { orders, order, created, payments, fulfillments, fulfillmentOperator, customerFulfillment, supplierOperator, supplierRuntime, assignments, workOrders, production, productionUnit, fields };
}

function parsedOperatorAction(publicReference, actionKind, fulfillmentActionId) {
  const parsed = parseLocalFulfillmentOperatorActionInput({ fulfillmentActionId, actionKind }, publicReference);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (!parsed.ok) throw new Error("Operator Fulfillment action did not parse.");
  return parsed.value;
}

function parsedCustomerAction(publicReference, actionKind, fulfillmentActionId, expectedPreviewVersion = 1) {
  const parsed = parseLocalFulfillmentCustomerActionInput({ fulfillmentActionId, actionKind, expectedPreviewVersion }, publicReference);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (!parsed.ok) throw new Error("Customer Fulfillment action did not parse.");
  return parsed.value;
}

function assertSupplierCommitted(result, expectedStatus) {
  assert.equal(result.status, "committed", JSON.stringify(result));
  if (expectedStatus) {
    const committedStatus = result.result?.result?.status ?? result.result?.status;
    assert.equal(committedStatus, expectedStatus, JSON.stringify(result));
  }
}

test("Batch H: real local Order-to-warehouse chain uses canonical authorities and reaches ready_for_outbound", async () => {
  const fx = await createIntegration();
  const reference = fx.order.publicReference;

  const configured = fx.supplierRuntime.configuredItems.findConfiguredItem({
    internalOrderId: fx.order.internalId,
    publicOrderReference: reference,
    orderItemId: fx.productionUnit.orderItemId,
  });
  assert.equal(configured.status, "found");
  if (configured.status !== "found") return;
  assert.equal(configured.item.skuCode, VARIANT.skuCode);
  assert.equal(configured.item.quantity, 2);
  assert.equal(configured.item.customizationValues[0].value, "A real configured Batch H test item");
  assert.equal(fx.order.status, "paid");
  assert.equal(fx.order.paymentStatus, "succeeded");

  assertSupplierCommitted(await fx.fulfillmentOperator.mutate({
    publicOrderReference: reference,
    action: parsedOperatorAction(reference, "enter_photo_review", "fulfillment-enter-batch-h-1"),
  }), "photo_review");
  assertSupplierCommitted(await fx.fulfillmentOperator.mutate({
    publicOrderReference: reference,
    action: parsedOperatorAction(reference, "publish_preview", "fulfillment-publish-batch-h-1"),
  }), "preview_pending");
  const approved = await fx.customerFulfillment.mutate({
    publicOrderReference: reference,
    browserCapability: fx.created.browserCapability,
    action: parsedCustomerAction(reference, "approve_preview", "fulfillment-approve-batch-h-1"),
  });
  assert.equal(approved.status, "committed", JSON.stringify(approved));

  const inspected = fx.supplierOperator.inspectCandidates({ productionUnit: fx.productionUnit, shanghaiWarehouseRequired: true });
  assert.equal(inspected.status, "found", JSON.stringify(inspected));
  if (inspected.status !== "found") return;
  assert.equal(inspected.value.candidateResult.status, "eligible");
  assert.equal(inspected.value.candidateResult.candidates.length, 1);
  const candidate = inspected.value.candidateResult.candidates[0];
  assert.equal(candidate.supplierSpecificationKey, "batch-h-standard");
  const assignmentInput = buildAssignSupplierAction(
    fx.fields,
    "supplier-assignment-action-batch-h-1",
    { supplierId: candidate.supplierId, offerId: candidate.offerId, supplierOfferVariantId: candidate.supplierOfferVariantId },
    true,
  );
  const assigned = await fx.supplierOperator.execute(assignmentInput);
  assertSupplierCommitted(assigned);
  assert.equal((await fx.supplierOperator.execute(assignmentInput)).status, "replayed");

  const workOrderInput = buildCreateWorkOrderAction(fx.fields, "supplier-work-order-action-batch-h-1");
  const workOrder = await fx.supplierOperator.execute(workOrderInput);
  assertSupplierCommitted(workOrder);
  assert.equal((await fx.supplierOperator.execute(workOrderInput)).status, "replayed");
  const workOrderProjection = fx.supplierOperator.read();
  assert.equal(workOrderProjection.status, "found");
  if (workOrderProjection.status !== "found") return;
  assert.equal(workOrderProjection.value.queues.workOrders.length, 1);
  assert.equal(workOrderProjection.value.queues.workOrders[0].productionUnit.orderItemId, fx.productionUnit.orderItemId);

  const transitionSteps = [
    ["unassigned", "assigned"],
    ["assigned", "work_order_ready"],
    ["work_order_ready", "submitted_to_supplier"],
    ["submitted_to_supplier", "supplier_confirmed"],
  ];
  for (const [currentStatus, nextStatus] of transitionSteps) {
    const result = await fx.supplierOperator.execute(buildAdvanceProductionAction(
      fx.fields,
      `supplier-production-action-batch-h-${nextStatus}`,
      currentStatus,
      nextStatus,
    ));
    assertSupplierCommitted(result, nextStatus);
  }

  const premature = await fx.supplierOperator.execute(buildAdvanceProductionAction(
    fx.fields,
    "supplier-production-action-batch-h-premature-in-production",
    "supplier_confirmed",
    "in_production",
  ));
  assert.equal(premature.status, "rejected", JSON.stringify(premature));
  assert.equal(premature.issues[0].code, "customer_production_not_started");

  const customerStarted = await fx.fulfillmentOperator.mutate({
    publicOrderReference: reference,
    action: parsedOperatorAction(reference, "start_production", "fulfillment-start-production-batch-h-1"),
  });
  assert.equal(customerStarted.status, "committed", JSON.stringify(customerStarted));
  const started = await fx.supplierOperator.execute(buildAdvanceProductionAction(
    fx.fields,
    "supplier-production-action-batch-h-in-production",
    "supplier_confirmed",
    "in_production",
  ));
  assertSupplierCommitted(started, "in_production");

  for (const [currentStatus, nextStatus] of [["in_production", "supplier_completed"], ["supplier_completed", "en_route_to_warehouse"]]) {
    const result = await fx.supplierOperator.execute(buildAdvanceProductionAction(
      fx.fields,
      `supplier-production-action-batch-h-${nextStatus}`,
      currentStatus,
      nextStatus,
    ));
    assertSupplierCommitted(result, nextStatus);
  }

  const operation = fx.production.findByProductionUnit(fx.productionUnit);
  assert.equal(operation.status, "found");
  if (operation.status !== "found") return;
  const refs = {
    supplierAssignmentId: operation.operation.assignmentId,
    supplierWorkOrderId: operation.operation.workOrderId,
    supplierProductionOperationId: operation.operation.operationId,
  };
  const wrongQuantity = await fx.supplierOperator.execute(buildRecordReceiptAction({
    fields: fx.fields,
    warehouseReceiptActionId: "warehouse-receipt-action-batch-h-wrong-quantity",
    ...refs,
    expectedQuantity: 1,
    receivedQuantity: 1,
    damageReported: false,
    notes: null,
  }));
  assert.equal(wrongQuantity.status, "rejected", JSON.stringify(wrongQuantity));
  assert.equal(wrongQuantity.issues[0].code, "invalid_quantity");
  assert.deepEqual(fx.production.getWarehouseCountsForTests(), { receiptCount: 0, receiptBindingCount: 0, qcBindingCount: 0, outboundBindingCount: 0 });

  const receiptInput = buildRecordReceiptAction({
    fields: fx.fields,
    warehouseReceiptActionId: "warehouse-receipt-action-batch-h-1",
    ...refs,
    expectedQuantity: 2,
    receivedQuantity: 2,
    damageReported: false,
    notes: null,
  });
  const receipt = await fx.supplierOperator.execute(receiptInput);
  assertSupplierCommitted(receipt);
  assert.equal((await fx.supplierOperator.execute(receiptInput)).status, "replayed");
  const withReceipt = fx.supplierOperator.read();
  assert.equal(withReceipt.status, "found");
  if (withReceipt.status !== "found") return;
  const warehouse = withReceipt.value.queues.warehouse[0];
  assert.equal(warehouse.expectedQuantity, 2);
  assert.equal(warehouse.receivedQuantity, 2);
  assert.equal(warehouse.damageReported, false);
  assert.equal(warehouse.qcStatus, "pending");

  const qcInput = buildRecordQcAction({
    fields: fx.fields,
    warehouseQcActionId: "warehouse-qc-action-batch-h-1",
    warehouseReceiptId: warehouse.warehouseReceiptId,
    ...refs,
    qcDecision: "accepted",
    notes: null,
  });
  const qc = await fx.supplierOperator.execute(qcInput);
  assertSupplierCommitted(qc);
  assert.equal((await fx.supplierOperator.execute(qcInput)).status, "replayed");
  const withQc = fx.supplierOperator.read();
  assert.equal(withQc.status, "found");
  if (withQc.status !== "found") return;
  const qcWarehouse = withQc.value.queues.warehouse[0];
  assert.equal(qcWarehouse.qcStatus, "accepted");

  const outboundInput = buildReadyForOutboundAction({
    fields: fx.fields,
    warehouseOutboundActionId: "warehouse-outbound-action-batch-h-1",
    warehouseReceiptId: qcWarehouse.warehouseReceiptId,
    ...refs,
  });
  const outbound = await fx.supplierOperator.execute(outboundInput);
  assertSupplierCommitted(outbound);
  assert.equal((await fx.supplierOperator.execute(outboundInput)).status, "replayed");

  const final = fx.supplierOperator.read();
  assert.equal(final.status, "found");
  if (final.status !== "found") return;
  assert.equal(final.value.queues.readyForOutbound.length, 1);
  assert.equal(final.value.queues.readyForOutbound[0].currentStatus, "ready_for_outbound");
  assert.equal(final.value.queues.workOrders[0].economics.supplierProductionCost.status, "known");
  const serialized = JSON.stringify(final.value);
  for (const forbidden of ["Shipment", "Tracking", "carrier", "trackingNumber"]) assert.equal(serialized.includes(forbidden), false, forbidden);

  const customerRead = await fx.customerFulfillment.read({ publicOrderReference: reference, browserCapability: fx.created.browserCapability });
  assert.equal(customerRead.status, "found");
  if (customerRead.status === "found") assert.equal(customerRead.value.status, "in_production");
  assert.equal(fx.orders.getOrderLifecycleTransitionCountForTests(), 1);
});

test("Batch H: final authority, snapshot, restart, source coverage, and stop-gate matrix remains fail closed", async () => {
  const fx = await createIntegration();
  const reference = fx.order.publicReference;
  const unit = fx.productionUnit;

  const browserOverride = fx.supplierOperator.inspectCandidates({
    productionUnit: unit,
    shanghaiWarehouseRequired: true,
    productId: PRODUCT.id,
  });
  assert.equal(browserOverride.status, "invalid");
  assert.equal(browserOverride.issues[0].code, "authority_field");

  const unauthorisedRuntime = new LocalSupplierOperatorService({ runtime: fx.supplierRuntime, verifier: undefined });
  assert.equal(unauthorisedRuntime.read().status, "unavailable");
  assert.equal((await unauthorisedRuntime.execute({ action: "inspect_candidates", input: { productionUnit: unit, shanghaiWarehouseRequired: true } })).status, "unavailable");

  const initialItem = fx.supplierRuntime.configuredItems.findConfiguredItem({ internalOrderId: fx.order.internalId, publicOrderReference: reference, orderItemId: unit.orderItemId });
  assert.equal(initialItem.status, "found");
  const initialSerialized = initialItem.status === "found" ? JSON.stringify(initialItem.item) : "";
  fx.supplierRuntime.dataset = {
    ...fx.supplierRuntime.dataset,
    variants: [{ ...fx.supplierRuntime.dataset.variants[0], supplierCostCents: 1, packagedWeightGrams: 999, reviewStatus: "provisional" }],
  };
  const afterSupplierEdit = fx.supplierRuntime.configuredItems.findConfiguredItem({ internalOrderId: fx.order.internalId, publicOrderReference: reference, orderItemId: unit.orderItemId });
  assert.equal(afterSupplierEdit.status, "found");
  assert.equal(afterSupplierEdit.status === "found" ? JSON.stringify(afterSupplierEdit.item) : "", initialSerialized);
  assert.equal(fx.order.lines[0].skuCode, VARIANT.skuCode);
  assert.equal(fx.order.lines[0].quantity, 2);

  const restarted = new LocalSupplierOperatorService({
    runtime: {
      ...fx.supplierRuntime,
      assignments: new LocalMemoryLocalSupplierAssignmentRepository(),
      workOrders: new LocalMemoryLocalSupplierWorkOrderRepository(),
      production: new LocalMemoryLocalSupplierProductionRepository(),
    },
    verifier: OPERATOR_VERIFIER,
  });
  const afterRestart = await restarted.execute({ action: "create_work_order", input: { workOrderActionId: "supplier-work-order-action-after-restart", productionUnit: unit } });
  assert.equal(afterRestart.status, "unavailable");

  const normalized = normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES);
  assert.equal(normalized.ok, true);
  if (normalized.ok) {
    assert.deepEqual([normalized.value.suppliers.length, normalized.value.offers.length, normalized.value.variants.length], [8, 13, 31]);
    assert.equal(normalized.value.offers.filter((offer) => offer.catalogMapping.status === "approved").length, 0);
  }

  const sourceChecks = await Promise.all([
    readFile(new URL("../app/application/local-supplier-operator-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/local-supplier-work-order-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/local-supplier-production-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/local-supplier-warehouse-service.ts", import.meta.url), "utf8"),
  ]);
  assert.equal(sourceChecks.some((source) => /fetch\(|stripe|paypal|supabase|migration/i.test(source)), false);
  assert.equal(sourceChecks.every((source) => !/localStorage|sessionStorage/.test(source)), true);

  const customerOnlyInput = { publicOrderReference: reference, browserCapability: fx.created.browserCapability };
  const customerRead = await fx.customerFulfillment.read(customerOnlyInput);
  assert.equal(customerRead.status, "unavailable");
  assert.equal(fx.order.status, "paid");
  assert.equal(fx.order.paymentStatus, "succeeded");
  assert.equal(fx.payments.getPaymentAttemptCountForTests(), 1);
});
