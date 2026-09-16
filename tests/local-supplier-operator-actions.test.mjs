import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAdvanceProductionAction,
  buildAssignSupplierAction,
  buildCreateWorkOrderAction,
  buildInspectCandidatesAction,
  buildInitializeSupplierProductionAction,
  buildResolveProductionUnitsAction,
  buildReadyForOutboundAction,
  buildRecordQcAction,
  buildRecordReceiptAction,
  productionActionKind,
} from "../app/client/local-supplier-operator-actions.ts";

const FIELDS = {
  internalOrderId: "local-order-operator-actions-1",
  publicOrderReference: "FM-LOCAL-ABCDEFGHIJKLMNOP",
  orderItemId: "order-item-operator-actions-1",
};

const UNIT = {
  canonicalOrder: {
    internalOrderId: FIELDS.internalOrderId,
    publicReference: FIELDS.publicOrderReference,
  },
  orderItemId: FIELDS.orderItemId,
};

const CANDIDATE = {
  supplierId: "supplier-1",
  offerId: "offer-1",
  supplierOfferVariantId: "supplier-variant-1",
};

test("operator candidate request carries only canonical identity and warehouse requirement", () => {
  assert.deepEqual(buildResolveProductionUnitsAction(FIELDS.publicOrderReference), {
    action: "resolve_production_units",
    input: { publicOrderReference: FIELDS.publicOrderReference },
  });
  assert.deepEqual(buildInspectCandidatesAction(FIELDS, true), {
    action: "inspect_candidates",
    input: { productionUnit: UNIT, shanghaiWarehouseRequired: true },
  });
  assert.deepEqual(buildAssignSupplierAction(FIELDS, "assignment-action-0001", CANDIDATE, true), {
    action: "assign",
    input: {
      assignmentActionId: "assignment-action-0001",
      productionUnit: UNIT,
      selectedCandidate: CANDIDATE,
      shanghaiWarehouseRequired: true,
    },
  });
});

test("operator lifecycle payloads do not carry canonical facts or operator authority", () => {
  const requests = [
    buildCreateWorkOrderAction(FIELDS, "work-order-action-0001"),
    buildInitializeSupplierProductionAction(FIELDS, "production-init-action-0001"),
    buildAdvanceProductionAction(FIELDS, "production-action-0001", "assigned", "work_order_ready"),
    buildRecordReceiptAction({
      fields: FIELDS,
      warehouseReceiptActionId: "warehouse-receipt-action-0001",
      supplierAssignmentId: "assignment-1",
      supplierWorkOrderId: "work-order-1",
      supplierProductionOperationId: "operation-1",
      expectedQuantity: 2,
      receivedQuantity: 2,
      damageReported: false,
      notes: null,
    }),
    buildRecordQcAction({
      fields: FIELDS,
      warehouseQcActionId: "warehouse-qc-action-0001",
      warehouseReceiptId: "receipt-1",
      supplierAssignmentId: "assignment-1",
      supplierWorkOrderId: "work-order-1",
      supplierProductionOperationId: "operation-1",
      qcDecision: "accepted",
      notes: null,
    }),
    buildReadyForOutboundAction({
      fields: FIELDS,
      warehouseOutboundActionId: "warehouse-outbound-action-0001",
      warehouseReceiptId: "receipt-1",
      supplierAssignmentId: "assignment-1",
      supplierWorkOrderId: "work-order-1",
      supplierProductionOperationId: "operation-1",
    }),
  ];
  for (const request of requests) {
    const serialized = JSON.stringify(request.input);
    assert.equal("operatorAuthority" in request.input, false);
    for (const forbidden of ["productId", "productSlug", "catalogVariantId", "skuCode", "selectedOptions", "configuration", "quantity"]) {
      assert.equal(serialized.includes(`\"${forbidden}\"`), false, `${request.action} leaked ${forbidden}`);
    }
  }
  const receiptRequest = requests.find((request) => request.action === "record_receipt");
  assert.ok(receiptRequest);
  assert.equal(receiptRequest.input.expectedQuantity, 2, "receipt uses the server-projected quantity as an explicit checked input");
});

test("operator action IDs are explicit and can be reused unchanged for transport retry", () => {
  const first = buildCreateWorkOrderAction(FIELDS, "retryable-work-order-action");
  const retry = buildCreateWorkOrderAction(FIELDS, "retryable-work-order-action");
  assert.deepEqual(retry, first);
});

test("operator initialization is the explicit unassigned-to-assigned action", () => {
  assert.deepEqual(buildInitializeSupplierProductionAction(FIELDS, "production-init-action-0001"), {
    action: "advance_production",
    input: {
      supplierOperationActionId: "production-init-action-0001",
      productionUnit: UNIT,
      expectedCurrentStatus: "unassigned",
      nextStatus: "assigned",
    },
  });
});

test("operator production next action keeps the warehouse receipt behind en-route transition", () => {
  assert.equal(productionActionKind("supplier_completed", "en_route_to_warehouse"), "advance_production");
  assert.equal(productionActionKind("en_route_to_warehouse", "warehouse_received"), "record_receipt");
  assert.equal(productionActionKind("ready_for_outbound", null), null);
});

test("operator surface exposes all F.1 actions with native controls and no browser persistence", async () => {
  const client = await readFile(new URL("../app/storefront/LocalSupplierOperatorTool.tsx", import.meta.url), "utf8");
  const actions = await readFile(new URL("../app/client/local-supplier-operator-actions.ts", import.meta.url), "utf8");
  assert.match(client, /Inspect Candidates/);
  assert.match(client, /Assign Supplier/);
  assert.match(client, /Create WorkOrder/);
  assert.match(client, /Initialize Supplier Production/);
  assert.match(client, /Record Receipt/);
  assert.match(client, /Accept QC/);
  assert.match(client, /Block QC/);
  assert.match(client, /Mark Ready for Outbound/);
  assert.match(client, /Retry same supplier request/);
  assert.match(actions, /expectedCurrentStatus/);
  assert.doesNotMatch(client, /<select/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|URLSearchParams/);
  assert.match(client, /DEVELOPMENT \/ TEST ONLY/);
  assert.match(client, /supplierOfferVariantId/);
  assert.match(client, /supplierSpecificationKey/);
  assert.match(client, /No supplier API, warehouse provider, Shipment, or Tracking integration/);
});
