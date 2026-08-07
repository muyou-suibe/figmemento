import assert from "node:assert/strict";
import test from "node:test";

import { createSignedAdminSession, verifySignedAdminSession } from "../app/application/admin-session.ts";
import { omitPrivateOrderLookupFields } from "../app/application/order-lookup.ts";
import { calculateCouponDiscount, calculateServerProductSubtotal } from "../app/application/pricing.ts";
import { decideExistingWebhookAction, verifyStripeSignature } from "../app/application/stripe-webhook.ts";
import { maximumUploadBytes, storeValidatedUpload } from "../app/application/upload-validation.ts";

test("order subtotal uses server product prices rather than browser values", () => {
  const browserPayload = [{ slug: "gift", price_cents: 1, quantity: 2 }];
  const serverProducts = [{ slug: "gift", price_cents: 2500 }];
  const subtotal = calculateServerProductSubtotal(serverProducts, (slug) => browserPayload.find((item) => item.slug === slug)?.quantity ?? 1);
  assert.equal(subtotal, 5000);
  assert.notEqual(subtotal, browserPayload[0].price_cents * browserPayload[0].quantity);
});

test("coupon calculation revalidates the existing percent and fixed rules", () => {
  assert.equal(calculateCouponDiscount({ discount_type: "percent", discount_value: 10 }, 4999), 499);
  assert.equal(calculateCouponDiscount({ discount_type: "fixed", discount_value: 1000 }, 500), 500);
});

test("invalid uploads are rejected before a storage adapter is invoked", async () => {
  let storageCalls = 0;
  const fakeStore = async () => {
    storageCalls += 1;
    return { storageKey: "should-not-be-created" };
  };

  const unsupported = await storeValidatedUpload({ type: "text/plain", size: 10 }, fakeStore);
  const oversized = await storeValidatedUpload({ type: "image/jpeg", size: maximumUploadBytes + 1 }, fakeStore);
  assert.equal(unsupported.valid, false);
  assert.equal(oversized.valid, false);
  assert.equal(storageCalls, 0);
});

test("Stripe webhook rejects an invalid signature without external calls", async () => {
  assert.equal(await verifyStripeSignature("{}", "t=1700000000,v1=invalid", "test-secret", 1700000000), false);
});

test("existing Stripe webhook replay decisions are idempotent", () => {
  assert.equal(decideExistingWebhookAction({ eventType: "checkout.session.completed", paymentStatus: "paid", orderStatus: "paid" }), "duplicate");
  assert.equal(decideExistingWebhookAction({ eventType: "checkout.session.completed", paymentStatus: "unpaid", orderStatus: "pending_payment" }), "complete");
  assert.equal(decideExistingWebhookAction({ eventType: "checkout.session.expired", paymentStatus: "paid", orderStatus: "paid" }), "ignore");
  assert.equal(decideExistingWebhookAction({ eventType: "checkout.session.expired", paymentStatus: "unpaid", orderStatus: "pending_payment" }), "expire");
});

test("guest order lookup omits internal identifiers and customer email", () => {
  assert.deepEqual(
    omitPrivateOrderLookupFields({
      id: "internal-id",
      customer_email: "private@example.com",
      order_number: "PG-ORDER-1",
      payment_status: "paid",
      order_items: [{ id: "internal-item" }],
    }),
    { order_number: "PG-ORDER-1", payment_status: "paid" },
  );
});

test("admin sessions reject missing credentials and invalid tokens", async () => {
  const now = 1_700_000_000;
  assert.equal(await verifySignedAdminSession("token", null, now), false);
  assert.equal(await verifySignedAdminSession("invalid", "test-password", now), false);
  const token = await createSignedAdminSession("test-password", now);
  assert.equal(await verifySignedAdminSession(token, "test-password", now), true);
  assert.equal(await verifySignedAdminSession(token, "wrong-password", now), false);
});
