import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { LocalFulfillmentCustomerService } from "../app/application/local-fulfillment-customer-service.ts";
import { parseLocalFulfillmentActionInput } from "../app/domain/local-fulfillment.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { LocalMemoryLocalFulfillmentRepository } from "../app/infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts";
import { createLocalFulfillmentCustomerHttpHandler } from "../app/server/local-fulfillment-customer-http.server.ts";

let sequence = 700;

function draft() {
  return {
    contact: {
      email: "http-customer@example.test",
      firstName: "HTTP",
      lastName: "Customer",
      country: "US",
      city: "Los Angeles",
      addressLine1: "1 Main Street",
      postalCode: "90001",
    },
    commercial: {
      currency: "USD",
      subtotalCents: 8990,
      shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 900, currency: "USD", estimatedRange: "5-10 business days", developmentOnly: true },
      coupon: { status: "not_selected", discountCents: 0, developmentOnly: true },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 9890,
      developmentOnly: true,
    },
    lines: [{
      productId: "product-http-fulfillment",
      productName: "HTTP Fulfillment Gift",
      productSlug: "http-fulfillment-gift",
      variantId: "variant-http-fulfillment",
      skuCode: "HTTP-FULFILLMENT-GIFT",
      selectedOptions: [],
      quantity: 1,
      unitBasePriceCents: 8990,
      currency: "USD",
      lineSubtotalCents: 8990,
    }],
  };
}

async function createRuntime() {
  const orders = new LocalMemoryLocalOrderRepository({ now: () => "2026-08-26T13:00:00.000Z" });
  const created = await orders.findOrCreate({
    creationAttemptId: `123e4567-e89b-42d3-a456-42661418${String(sequence++).padStart(4, "0")}`,
    context: { cartId: `http-customer-cart-${sequence}`, authorityKey: "http-customer-fulfillment-test" },
    inputFingerprint: `http-customer-fingerprint-${sequence}`,
    snapshot: draft(),
  });
  assert.equal(created.status, "created");
  if (created.status !== "created") throw new Error("Order fixture creation failed");
  const payments = new LocalMemoryLocalPaymentRepository(orders, { now: () => "2026-08-26T13:01:00.000Z" });
  const payment = payments.commit({
    internalOrderId: created.snapshot.internalId,
    orderReference: created.snapshot.publicReference,
    paymentAttemptId: `http-customer-payment-${sequence++}`,
    outcome: "success",
    authorityContext: "http-customer-payment-test",
  });
  assert.equal(payment.status, "committed");
  if (payment.status !== "committed") throw new Error("Payment fixture creation failed");
  const repository = new LocalMemoryLocalFulfillmentRepository(orders);
  const service = new LocalFulfillmentCustomerService({
    readConfig: () => ({ source: "local_fake", runtimeMode: "test" }),
    getOrderRepository: () => orders,
    getFulfillmentRepository: () => repository,
  });
  const handler = createLocalFulfillmentCustomerHttpHandler({ createService: () => service });
  return { orders, order: payment.orderSnapshot, capability: created.browserCapability, repository, handler };
}

function operatorCommit(runtime, overrides = {}) {
  const parsed = parseLocalFulfillmentActionInput({
    publicOrderReference: runtime.order.publicReference,
    fulfillmentActionId: "http-operator-action-0001",
    actionKind: "enter_photo_review",
    ...overrides,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("Operator fixture action failed");
  return runtime.repository.commit({
    internalOrderId: runtime.order.internalId,
    orderReference: runtime.order.publicReference,
    actorKind: "operator",
    actorContextId: "operator-context",
    action: parsed.value,
    publishedAt: "2026-08-26T13:02:00.000Z",
  });
}

function customerRequest(runtime, method, body, headers = {}) {
  return new Request(`http://localhost:3000/api/local-fulfillment/${runtime.order.publicReference}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      cookie: `figmemento-local-order-access=${runtime.capability}`,
      ...headers,
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

function approveBody(id = "http-customer-approve-0001", version = 1) {
  return { fulfillmentActionId: id, actionKind: "approve_preview", expectedPreviewVersion: version };
}

test("customer HTTP GET returns a safe projection after operator admission", async () => {
  const runtime = await createRuntime();
  assert.equal(operatorCommit(runtime).status, "committed");
  assert.equal(operatorCommit(runtime, { actionKind: "publish_preview", fulfillmentActionId: "http-operator-publish-0001" }).status, "committed");
  const response = await runtime.handler(customerRequest(runtime, "GET"), runtime.order.publicReference);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "preview_pending");
  assert.equal(body.currentPreviewVersion, 1);
  assert.deepEqual(body.allowedActions, ["approve_preview", "request_revision"]);
  assert.doesNotMatch(JSON.stringify(body), /internalOrderId|actorContextId|figmemento-local-order-access|capability|actionBindings|revisionRecords|ownerId|receiptId|storageKey|bucket|provider|private/i);
});

test("customer HTTP approval preserves exact replay after state changes", async () => {
  const runtime = await createRuntime();
  operatorCommit(runtime);
  operatorCommit(runtime, { actionKind: "publish_preview", fulfillmentActionId: "http-operator-publish-0002" });
  const first = await runtime.handler(customerRequest(runtime, "POST", approveBody()), runtime.order.publicReference);
  const replay = await runtime.handler(customerRequest(runtime, "POST", approveBody()), runtime.order.publicReference);
  const newer = await runtime.handler(customerRequest(runtime, "POST", approveBody("http-customer-approve-0002")), runtime.order.publicReference);
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal((await first.clone().json()).status, "committed");
  assert.equal((await replay.clone().json()).status, "replayed");
  assert.deepEqual((await replay.json()).result, (await first.json()).result);
  assert.equal(newer.status, 409);
});

test("customer HTTP uses bounded same-origin and parser guards before service construction", async () => {
  const runtime = await createRuntime();
  let serviceConstructed = 0;
  const handler = createLocalFulfillmentCustomerHttpHandler({
    createService: () => {
      serviceConstructed += 1;
      throw new Error("service must not be constructed");
    },
  });
  const valid = approveBody("http-guard-approve-0001");
  const crossOrigin = await handler(customerRequest(runtime, "POST", valid, { origin: "https://evil.example" }), runtime.order.publicReference);
  const crossOriginGet = await handler(customerRequest(runtime, "GET", undefined, { origin: "https://evil.example" }), runtime.order.publicReference);
  const noOriginPost = await handler(new Request(`http://localhost:3000/api/local-fulfillment/${runtime.order.publicReference}`, { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", cookie: `figmemento-local-order-access=${runtime.capability}` }, body: JSON.stringify(valid) }), runtime.order.publicReference);
  const nonJson = await handler(customerRequest(runtime, "POST", JSON.stringify(valid), { "content-type": "text/plain" }), runtime.order.publicReference);
  const malformed = await handler(customerRequest(runtime, "POST", "{"), runtime.order.publicReference);
  const unknownField = await handler(customerRequest(runtime, "POST", { ...valid, targetState: "preview_approved" }), runtime.order.publicReference);
  const operatorAction = await handler(customerRequest(runtime, "POST", { fulfillmentActionId: "http-guard-operator-0001", actionKind: "publish_preview" }), runtime.order.publicReference);
  const oversized = await handler(customerRequest(runtime, "POST", "x".repeat(16 * 1024 + 1)), runtime.order.publicReference);
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOriginGet.status, 403);
  assert.equal(noOriginPost.status, 403);
  assert.equal(nonJson.status, 400);
  assert.equal(malformed.status, 400);
  assert.equal(unknownField.status, 400);
  assert.equal(operatorAction.status, 400);
  assert.equal(oversized.status, 400);
  assert.equal(serviceConstructed, 0);
});

test("missing, wrong, unknown, and not-admitted customer access share bounded unavailable responses", async () => {
  const runtime = await createRuntime();
  const missing = await runtime.handler(new Request(`http://localhost:3000/api/local-fulfillment/${runtime.order.publicReference}`), runtime.order.publicReference);
  const wrong = await runtime.handler(customerRequest(runtime, "GET", undefined, { cookie: "figmemento-local-order-access=wrong-capability-123456" }), runtime.order.publicReference);
  const unknown = await runtime.handler(new Request("http://localhost:3000/api/local-fulfillment/FM-LOCAL-AAAAAAAAAAAAAAAA", { headers: { cookie: `figmemento-local-order-access=${runtime.capability}` } }), "FM-LOCAL-AAAAAAAAAAAAAAAA");
  const notAdmitted = await runtime.handler(customerRequest(runtime, "GET"), runtime.order.publicReference);
  assert.equal(missing.status, 404);
  assert.equal(wrong.status, 404);
  assert.equal(unknown.status, 404);
  assert.equal(notAdmitted.status, 404);
  const missingBody = await missing.json();
  assert.deepEqual(missingBody, await wrong.json());
  assert.deepEqual(missingBody, await unknown.json());
  assert.deepEqual(missingBody, await notAdmitted.json());
});

test("customer HTTP source remains separate from operator, upload, storage, and production boundaries", async () => {
  const paths = [
    "../app/application/local-fulfillment-customer-service.ts",
    "../app/server/local-fulfillment-customer-http.server.ts",
  ];
  const source = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /customer-upload|storage|signedUrl|supabase|stripe|paypal|supplier|factory|shipping|tracking|webhook|operator.*route|dangerouslySetInnerHTML/i);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|Authorization/i);
});
