import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  addPreviewCartItem,
  applyPreviewFulfillmentAction,
  calculatePreviewCheckoutSummary,
  createPreviewCheckoutDraft,
  createPreviewFulfillmentState,
  evaluatePreviewCoupon,
  previewCartSubtotal,
  previewShippingOptions,
  removePreviewCartItem,
  updatePreviewCartQuantity,
} from "../preview/github-pages/demo-state.ts";
import { previewProductForSlug, previewPaymentFixtures, previewFulfillmentFixtures } from "../preview/github-pages/fixtures.ts";

function coupleLine() {
  const product = previewProductForSlug("couple-figure");
  assert.ok(product);
  const variant = product.variants[0];
  assert.ok(variant);
  return {
    productSlug: product.slug,
    productName: product.name,
    skuCode: variant.skuCode,
    optionLabel: "Mini",
    unitPriceCents: variant.priceCents,
    customizationSummary: ["Reference image selected · Local preview only"],
    imageSelected: true,
    requiresShipping: product.requiresShipping,
  };
}

test("Batch B Cart is an independent in-memory demo with real arithmetic", () => {
  const first = addPreviewCartItem([], coupleLine(), "line-a");
  const second = addPreviewCartItem(first, { ...coupleLine(), skuCode: "PREVIEW-COUPLE-STANDARD", optionLabel: "Standard", unitPriceCents: 8990 }, "line-b");
  assert.equal(second.length, 2);
  assert.equal(previewCartSubtotal(second), 15980);
  const quantityTwo = updatePreviewCartQuantity(second, "line-a", 1);
  assert.equal(quantityTwo.find((item) => item.lineId === "line-a")?.quantity, 2);
  const quantityOne = updatePreviewCartQuantity(quantityTwo, "line-a", -1);
  assert.equal(quantityOne.find((item) => item.lineId === "line-a")?.quantity, 1);
  assert.equal(removePreviewCartItem(quantityOne, "line-b").length, 1);
  assert.deepEqual(Object.keys(quantityOne[0]).sort(), ["customizationSummary", "imageSelected", "lineId", "optionLabel", "productName", "productSlug", "quantity", "requiresShipping", "skuCode", "unitPriceCents"].sort());
  assert.match(quantityOne[0].customizationSummary[0], /Local preview only/);
});

test("Batch B Checkout uses local shipping/coupon arithmetic and leaves tax inactive", () => {
  const items = addPreviewCartItem([], coupleLine(), "line-a");
  const draft = { ...createPreviewCheckoutDraft(), shippingOptionId: previewShippingOptions[1].id, couponCode: "DEMO10" };
  const summary = calculatePreviewCheckoutSummary(items, draft);
  assert.equal(summary.subtotalCents, 6990);
  assert.equal(summary.shippingCents, 1800);
  assert.equal(summary.coupon.status, "valid");
  assert.equal(summary.coupon.discountCents, 699);
  assert.equal(summary.taxStatus, "not_activated");
  assert.equal(summary.taxAmountCents, null);
  assert.equal(summary.localDemoTotalCents, 8091);
  assert.equal(evaluatePreviewCoupon("EXPIRED", 1000).status, "expired");
  assert.equal(evaluatePreviewCoupon("NOTREAL", 1000).status, "invalid");
  assert.equal(typeof summary.localDemoTotalCents, "number");
});

test("Batch B Payment and Fulfillment fixtures expose only presentation vocabulary", () => {
  assert.deepEqual(previewPaymentFixtures.map((fixture) => fixture.state), ["success", "failed", "cancelled"]);
  assert.deepEqual(previewFulfillmentFixtures.map((fixture) => fixture.state), ["photo_review", "preview_pending", "preview_revision_requested", "preview_approved", "in_production", "quality_check"]);
});

test("Batch B Fulfillment follows the bounded v1/v2/v3 two-revision flow", () => {
  let state = createPreviewFulfillmentState();
  state = applyPreviewFulfillmentAction(state, "publish_preview");
  assert.deepEqual(state, { state: "preview_pending", previewVersion: 1, revisionCount: 0 });
  state = applyPreviewFulfillmentAction(state, "request_revision");
  state = applyPreviewFulfillmentAction(state, "publish_preview");
  assert.deepEqual(state, { state: "preview_pending", previewVersion: 2, revisionCount: 1 });
  state = applyPreviewFulfillmentAction(state, "request_revision");
  state = applyPreviewFulfillmentAction(state, "publish_preview");
  assert.deepEqual(state, { state: "preview_pending", previewVersion: 3, revisionCount: 2 });
  assert.deepEqual(applyPreviewFulfillmentAction(state, "request_revision"), state);
  state = applyPreviewFulfillmentAction(state, "approve_preview");
  state = applyPreviewFulfillmentAction(state, "start_production");
  state = applyPreviewFulfillmentAction(state, "mark_quality_check");
  assert.deepEqual(state, { state: "quality_check", previewVersion: 3, revisionCount: 2 });
  assert.deepEqual(applyPreviewFulfillmentAction(state, "start_production"), state);
});

test("Batch B preview source remains client-only and cannot carry server authority", async () => {
  const sources = await Promise.all([
    readFile(new URL("../preview/github-pages/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../preview/github-pages/demo-state.ts", import.meta.url), "utf8"),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /\bfetch\s*\(|localStorage|sessionStorage|indexedDB|document\.cookie/i);
    assert.doesNotMatch(source, /\b(?:receiptId|ownerId|storageKey|paymentAttemptId|fulfillmentActionId)\b/);
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:app\/api|supabase|stripe|paypal|resend|17track|server)[^"']*["']/i);
  }
});

test("Batch B Pages workflow is manual, preview-only, and secret-free", async () => {
  const workflow = await readFile(new URL("../.github/workflows/github-pages-preview.yml", import.meta.url), "utf8");
  assert.match(workflow, /on:\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\b(?:push|pull_request|schedule):/);
  assert.match(workflow, /node-version:\s+22\.13\.0/);
  assert.match(workflow, /run:\s+npm ci/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path:\s+dist\/github-pages-preview/);
  assert.match(workflow, /contents:\s+read/);
  assert.match(workflow, /pages:\s+write/);
  assert.match(workflow, /id-token:\s+write/);
  assert.doesNotMatch(workflow, /actions:\s+read/);
  assert.doesNotMatch(workflow, /contents:\s+write/);
  assert.doesNotMatch(workflow, /issues:\s+write/);
  assert.doesNotMatch(workflow, /pull-requests:\s+write/);
  assert.doesNotMatch(workflow, /packages:\s+write/);
  assert.doesNotMatch(workflow, /secrets\.|SUPABASE|STRIPE|PAYPAL|R2|CLOUDFLARE_API_TOKEN/i);
});
