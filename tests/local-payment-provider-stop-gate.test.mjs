import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LocalPaymentService } from "../app/application/local-payment-service.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";

const creationAttemptId = "123e4567-e89b-42d3-a456-426614174280";

function snapshotDraft() {
  return {
    contact: {
      email: "stop-gate@example.test",
      firstName: "Stop",
      lastName: "Gate",
      country: "US",
      city: "Los Angeles",
      addressLine1: "1 Main Street",
      postalCode: "90001",
    },
    commercial: {
      currency: "USD",
      subtotalCents: 3_990,
      shipping: {
        status: "eligible",
        country: "US",
        method: "local_standard",
        amountCents: 500,
        currency: "USD",
        estimatedRange: "5-10 business days",
        developmentOnly: true,
      },
      coupon: { status: "not_selected", discountCents: 0, developmentOnly: true },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 4_490,
      developmentOnly: true,
    },
    lines: [{
      productId: "product-stop-gate",
      productName: "Stop Gate Fixture",
      productSlug: "stop-gate-fixture",
      variantId: "variant-stop-gate",
      skuCode: "STOP-GATE-FIXTURE",
      selectedOptions: [],
      quantity: 1,
      unitBasePriceCents: 3_990,
      currency: "USD",
      lineSubtotalCents: 3_990,
    }],
  };
}

async function createRuntime() {
  const orders = new LocalMemoryLocalOrderRepository({ now: () => "2026-08-26T14:00:00.000Z" });
  const created = await orders.findOrCreate({
    creationAttemptId,
    context: { cartId: "cart-stop-gate", authorityKey: "catalog-stop-gate" },
    inputFingerprint: "stop-gate-fingerprint",
    snapshot: snapshotDraft(),
  });
  assert.equal(created.status, "created");
  const payments = new LocalMemoryLocalPaymentRepository(orders, {
    now: () => "2026-08-26T14:01:00.000Z",
  });
  const service = new LocalPaymentService({
    readConfig: () => ({ source: "local_fake", runtimeMode: "test" }),
    getOrderRepository: () => orders,
    getPaymentRepository: () => payments,
  });
  return { orders, payments, order: created, service };
}

test("Local Payment commits through local boundaries without provider or network calls", async () => {
  const runtime = await createRuntime();
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("provider network is forbidden in the Local Payment core");
  };
  try {
    const result = await runtime.service.execute({
      publicReference: runtime.order.snapshot.publicReference,
      paymentAttemptId: "stop-gate-payment-A",
      outcome: "success",
      browserCapability: runtime.order.browserCapability,
    });
    assert.equal(result.status, "committed");
    assert.equal(result.order.status, "paid");
    assert.equal(result.payment.simulatedCurrency, "USD");
    assert.equal(fetchCalls, 0);
    assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
    const read = runtime.orders.findSnapshotForPayment(runtime.order.snapshot.internalId);
    assert.equal(read.status, "found");
    assert.equal(read.snapshot.status, "paid");
  } finally {
    if (previousFetch) globalThis.fetch = previousFetch;
    else delete globalThis.fetch;
  }
});

test("Local Payment source modules do not import or invoke production provider boundaries", async () => {
  const paths = [
    "../app/domain/local-payment.ts",
    "../app/application/local-payment-repository.ts",
    "../app/application/local-payment-service.ts",
    "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts",
    "../app/server/local-payment-authority.server.ts",
    "../app/server/local-payment-http.server.ts",
    "../app/server/local-payment-runtime.server.ts",
    "../app/api/local-payments/route.ts",
  ];
  const source = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:supabase|stripe|paypal|resend|17track|cloudflare)[^"']*["']/i);
  assert.doesNotMatch(source, /(?:globalThis\.)?fetch\s*\(/i);
  assert.doesNotMatch(source, /(?:@supabase\/supabase-js|SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY|PAYPAL_[A-Z_]+|RESEND_API_KEY|TRACKING_API_KEY)/i);
});

test("Local Payment route does not compose production Order persistence or downstream mutations", async () => {
  const [route, service, runtime] = await Promise.all([
    readFile(new URL("../app/api/local-payments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/local-payment-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/local-payment-runtime.server.ts", import.meta.url), "utf8"),
  ]);
  const source = `${route}\n${service}\n${runtime}`;
  assert.doesNotMatch(source, /(?:from\s+["'][^"']*(?:orders|supabase|stripe|paypal|fulfillment|tracking)[^"']*["']|@supabase\/supabase-js|STRIPE_SECRET_KEY|PAYPAL_[A-Z_]+|order_items|fetch\s*\()/i);
  assert.match(route, /createLocalPaymentMutationHttpHandler/);
  assert.match(service, /getOrderRepository/);
  assert.match(runtime, /LocalMemoryLocalPaymentRepository/);
});
