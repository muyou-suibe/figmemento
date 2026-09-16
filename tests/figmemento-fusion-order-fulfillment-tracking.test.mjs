import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Fusion Batch E scopes the real Order, Fulfillment, and Tracking surfaces", async () => {
  const [orderPage, order, fulfillmentPage, fulfillment, trackingPage, tracking] = await Promise.all([
    source("app/order/success/[reference]/page.tsx"),
    source("app/storefront/LocalOrderSuccessExperience.tsx"),
    source("app/local-fulfillment/operator/page.tsx"),
    source("app/storefront/LocalFulfillmentOperatorTool.tsx"),
    source("app/local-tracking/operator/page.tsx"),
    source("app/storefront/LocalTrackingExperience.tsx"),
  ]);

  assert.match(orderPage, /fusionOrderPage/);
  assert.match(order, /styles\.fusionOrder/);
  assert.match(order, /Local Payment simulation/);
  assert.match(order, /Approve Preview/);
  assert.match(fulfillmentPage, /fusionFulfillmentPage/);
  assert.match(fulfillment, /styles\.fusionFulfillment/);
  assert.match(trackingPage, /fusionTrackingPage/);
  assert.match(tracking, /styles\.fusionTracking/);
  for (const action of ["enter_photo_review", "publish_preview", "start_production", "mark_quality_check"]) {
    assert.match(fulfillment, new RegExp(action));
  }
  for (const actionLabel of ["Create Shipment", "Mark Shipped", "Mark In Transit", "Mark Delivered"]) {
    assert.match(tracking, new RegExp(actionLabel));
  }
  assert.match(tracking, /Delivered terminal state/);
  assert.doesNotMatch(`${orderPage}\n${order}\n${fulfillment}\n${tracking}`, /NEXT_PUBLIC|localStorage|sessionStorage|process\.env|Stripe|PayPal|supabaseAdmin|storageKey|supplier|factory/i);
});

test("Fusion Batch E preserves the existing lifecycle and authority copy", async () => {
  const [order, fulfillment, tracking] = await Promise.all([
    source("app/storefront/LocalOrderSuccessExperience.tsx"),
    source("app/storefront/LocalFulfillmentOperatorTool.tsx"),
    source("app/storefront/LocalTrackingExperience.tsx"),
  ]);
  for (const state of ["photo_review", "preview_pending", "preview_revision_requested", "preview_approved", "in_production", "quality_check"]) assert.match(fulfillment, new RegExp(state));
  for (const state of ["shipment_created", "shipped", "in_transit", "delivered"]) assert.match(tracking, new RegExp(state));
  assert.match(order, /paymentStatus === "succeeded"/);
  assert.match(order, /fulfillmentActionId/);
  assert.match(fulfillment, /Server-side local operator authority/);
  assert.match(tracking, /Server-side operator authority/);
  assert.match(tracking, /no further local Tracking action is available/);
  assert.doesNotMatch(`${order}\n${fulfillment}\n${tracking}`, /createOrder|createPayment|createShipment\(|productionProvider|shippingProvider|trackingProvider/i);
});

test("Fusion Batch E styles are scoped, token-backed, responsive, and accessible", async () => {
  const css = await source("app/storefront/catalog-storefront.module.css");
  const batchE = css.slice(css.indexOf("FUSION ORDER + FULFILLMENT + TRACKING — BATCH E"));
  assert.notEqual(batchE, css, "Batch E CSS marker must be present");
  for (const selector of [
    ".fusionOrder",
    ".fusionOrderPage",
    ".fusionFulfillment",
    ".fusionFulfillmentPage",
    ".fusionTracking",
    ".fusionTrackingPage",
    ".fusionOrder .checkoutSummary",
    ".fusionFulfillment .operatorToolActions",
    ".fusionTracking .trackingTimeline",
    ".fusionTracking .trackingTerminal",
  ]) assert.match(batchE, new RegExp(selector.replaceAll(".", "\\.") + "\\b"));
  for (const breakpoint of ["960px", "720px", "520px"]) assert.match(batchE, new RegExp(`@media \\(max-width: ${breakpoint}\\)`));
  assert.match(batchE, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(batchE, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(batchE, /var\(--fusion-(?:paper|ink|terra|copper|gold|honey|line|shadow-card|shadow-lift|tap)/);
  assert.match(batchE, /overflow-wrap: anywhere/);
  assert.match(batchE, /border-radius: var\(--fusion-radius-control\)/);
  assert.doesNotMatch(batchE, /linear-gradient|fonts\.googleapis\.com|import\.meta\.env|process\.env/);
});

test("Fusion Batch E binds customer and operator views to the existing local authority boundaries", async () => {
  const [orderPage, order, fulfillmentPage, fulfillment, trackingPage, tracking] = await Promise.all([
    source("app/order/success/[reference]/page.tsx"),
    source("app/storefront/LocalOrderSuccessExperience.tsx"),
    source("app/local-fulfillment/operator/page.tsx"),
    source("app/storefront/LocalFulfillmentOperatorTool.tsx"),
    source("app/local-tracking/operator/page.tsx"),
    source("app/storefront/LocalTrackingExperience.tsx"),
  ]);
  assert.match(order, /api\/local-orders/);
  assert.match(order, /api\/local-fulfillment/);
  assert.match(order, /LocalCustomerTracking/);
  assert.match(fulfillment, /fetch\(`\/api\/local-fulfillment\/operator/);
  assert.match(tracking, /fetch\(`\/api\/local-tracking\/operator/);
  assert.match(orderPage, /fusionOrderPage/);
  assert.match(fulfillmentPage, /fusionFulfillmentPage/);
  assert.match(trackingPage, /fusionTrackingPage/);
  const combined = `${orderPage}\n${order}\n${fulfillmentPage}\n${fulfillment}\n${trackingPage}\n${tracking}`;
  assert.doesNotMatch(combined, /NEXT_PUBLIC|localStorage|sessionStorage|Stripe|PayPal|supabaseAdmin|providerPath|supplier|factory|warehouse/i);
  assert.doesNotMatch(combined, /Free worldwide shipping|50 countries|guaranteed delivery|bestseller/i);
});
