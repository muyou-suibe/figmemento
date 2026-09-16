import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readLocalAnalyticsConfig } from "../app/config/local-analytics-runtime.ts";
import { parseLocalAnalyticsEvent } from "../app/domain/local-analytics.ts";
import { LocalMemoryAnalyticsRepository } from "../app/infrastructure/analytics/local-memory-analytics-repository.server.ts";
import { createLocalAnalyticsHttpHandler } from "../app/server/local-analytics-http.server.ts";
import { LocalMemoryNotificationOutbox } from "../app/infrastructure/notifications/local-memory-notification-outbox.server.ts";
import { LocalMemoryCustomerPointsRepository } from "../app/infrastructure/customer-points/local-memory-customer-points-repository.server.ts";
import { evaluateLocalPromotion } from "../app/application/local-promotion.ts";
import { parseProductReviewRequest } from "../app/domain/product-review.ts";
import { LocalMemoryProductReviewRepository } from "../app/infrastructure/reviews/local-memory-product-review-repository.server.ts";

function analyticsRequest(body, options = {}) {
  return new Request("http://localhost:3000/api/local-analytics", {
    method: options.method ?? "POST",
    headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/json", ...options.headers },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

test("analytics parser accepts bounded provider-neutral events and rejects PII/provider fields", () => {
  assert.deepEqual(parseLocalAnalyticsEvent({ eventName: "add_to_cart", productId: "fixture-product-couple-figure", metadata: { skuCode: "DEV-COUPLE" } }), {
    ok: true,
    value: { eventName: "add_to_cart", productId: "fixture-product-couple-figure", metadata: { skuCode: "DEV-COUPLE" } },
  });
  assert.equal(parseLocalAnalyticsEvent({ eventName: "unknown" }).ok, false);
  assert.equal(parseLocalAnalyticsEvent({ eventName: "purchase", orderReference: "FM-LOCAL-ABC1234567890XYZ", email: "person@example.com" }).ok, false);
  assert.equal(parseLocalAnalyticsEvent({ eventName: "purchase", orderReference: "FM-LOCAL-ABC1234567890XYZ" }).ok, true);
});

test("local analytics runtime is explicit and production cannot use local_fake", () => {
  assert.deepEqual(readLocalAnalyticsConfig({ NODE_ENV: "test", LOCAL_ANALYTICS_SOURCE: "local_fake" }, "test"), { source: "local_fake", runtimeMode: "test" });
  assert.deepEqual(readLocalAnalyticsConfig({ NODE_ENV: "development" }, "development"), { source: "disabled", runtimeMode: "development" });
  assert.throws(() => readLocalAnalyticsConfig({ NODE_ENV: "production", LOCAL_ANALYTICS_SOURCE: "local_fake" }, "production"), /allowed only in development or test/);
});

test("local analytics HTTP boundary records events only for same-origin local source", async () => {
  const repository = new LocalMemoryAnalyticsRepository();
  const handler = createLocalAnalyticsHttpHandler({
    readConfig: () => ({ source: "local_fake", runtimeMode: "test" }),
    getRepository: () => repository,
    createId: () => "analytics-test-1",
    now: () => "2026-09-10T00:00:00.000Z",
  });
  const accepted = await handler(analyticsRequest({ eventName: "view_item", productId: "fixture-product-glass-light-picture" }));
  assert.equal(accepted.status, 202);
  assert.equal(repository.list().length, 1);
  const denied = await handler(analyticsRequest({ eventName: "view_item" }, { headers: { origin: "https://attacker.test" } }));
  assert.equal(denied.status, 403);
  const disabled = await createLocalAnalyticsHttpHandler({ readConfig: () => ({ source: "disabled", runtimeMode: "production" }), getRepository: () => repository })(analyticsRequest({ eventName: "view_item" }));
  assert.equal(disabled.status, 503);
});

test("local notification outbox is queued-only and clones payloads", () => {
  const outbox = new LocalMemoryNotificationOutbox();
  const message = outbox.enqueue({ recipient: "person@example.com", type: "order_created", reference: "FM-LOCAL-ABC1234567890XYZ", payload: { totalCents: "3990" }, createdAt: "2026-09-10T00:00:00.000Z" });
  assert.equal(message.status, "queued_local");
  assert.equal(outbox.list()[0].payload.totalCents, "3990");
  assert.equal(outbox.list()[0].developmentOnly, undefined);
});

test("points earn, reserve, settle, release, and remain idempotent", () => {
  const points = new LocalMemoryCustomerPointsRepository();
  const customerId = "customer-local-123";
  const orderReference = "FM-LOCAL-ABC1234567890XYZ";
  assert.equal(points.reserveForOrder({ customerId, orderReference, points: 0, now: "2026-09-10T00:00:00.000Z" }).status, "reserved");
  points.settleOrder({ customerId, orderReference, subtotalCents: 12_345, now: "2026-09-10T00:00:00.000Z" });
  points.settleOrder({ customerId, orderReference, subtotalCents: 12_345, now: "2026-09-10T00:00:00.000Z" });
  const summary = points.getSummary(customerId);
  assert.equal(summary.balance, 123);
  assert.equal(summary.ledger.filter((entry) => entry.reason === "purchase_earned").length, 1);
  assert.equal(points.reserveForOrder({ customerId, orderReference: "FM-LOCAL-ZYX9876543210ABC", points: 20, now: "2026-09-10T00:00:00.000Z" }).status, "reserved");
  points.releaseOrder({ customerId, orderReference: "FM-LOCAL-ZYX9876543210ABC" });
  assert.equal(points.getSummary(customerId).balance, 123);
});

test("local promotion policy is deterministic for WELCOME10, threshold, and points", () => {
  assert.equal(evaluateLocalPromotion({ couponCode: "WELCOME10", subtotalCents: 10_000, firstOrderEligible: true, pointsBalance: 0, requestedPoints: 0 }).coupon.discountCents, 1_000);
  assert.equal(evaluateLocalPromotion({ couponCode: "WELCOME10", subtotalCents: 10_000, firstOrderEligible: false, pointsBalance: 0, requestedPoints: 0 }).coupon.status, "not_applicable");
  assert.equal(evaluateLocalPromotion({ subtotalCents: 7_900, firstOrderEligible: false, pointsBalance: 500, requestedPoints: 500 }).promotionDiscountCents, 500);
  const points = evaluateLocalPromotion({ subtotalCents: 5_000, firstOrderEligible: false, pointsBalance: 500, requestedPoints: 500 });
  assert.equal(points.pointsRedeemed, 500);
  assert.equal(points.pointsDiscountCents, 500);
});

test("review parser and repository preserve delivered-order review identity without fabricated reviews", () => {
  const parsed = parseProductReviewRequest({ publicOrderReference: "FM-LOCAL-ABC1234567890XYZ", orderItemId: "order-item-local-1234", productId: "fixture-product-couple-figure", rating: 5, title: "Lovely", body: "A real local note." });
  assert.equal(parsed.ok, true);
  const repository = new LocalMemoryProductReviewRepository();
  const input = { productId: "fixture-product-couple-figure", orderItemId: "order-item-local-1234", customerId: "customer-local-123", rating: 5, title: "Lovely", body: "A real local note.", createdAt: "2026-09-10T00:00:00.000Z" };
  assert.equal(repository.create(input).status, "created");
  assert.equal(repository.create(input).status, "duplicate");
  assert.equal(repository.listPublished(input.productId).length, 1);
  assert.equal(parseProductReviewRequest({ publicOrderReference: "FM-LOCAL-ABC1234567890XYZ", orderItemId: "order-item-local-1234", productId: input.productId, rating: 5, body: "x", verifiedBuyer: true }).ok, false);
});

test("product detail exposes explicit not-configured state instead of silently offering purchase", async () => {
  const source = await readFile(new URL("../app/storefront/ProductDetailExperience.tsx", import.meta.url), "utf8");
  assert.match(source, /customization\.status === "not_configured"/);
  assert.match(source, /Customization is explicitly unavailable/);
});
