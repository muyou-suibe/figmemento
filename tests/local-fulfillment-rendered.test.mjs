import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Order Success renders the bounded local Fulfillment customer boundary", async () => {
  const page = await source("app/order/success/[reference]/page.tsx");
  const experience = await source("app/storefront/LocalOrderSuccessExperience.tsx");
  assert.match(page, /LocalOrderSuccessExperience/);
  assert.match(experience, /Photo review and preview/);
  assert.match(experience, /DEVELOPMENT \/ TEST ONLY/);
  assert.match(experience, /Approve Preview/);
  assert.match(experience, /Request Revision/);
  assert.match(experience, /Shipping \/ Tracking not started in this local stage/);
  assert.doesNotMatch(experience, /internalOrderId|actorContextId|storageKey|receiptId|signedUrl|supplier|factory|trackingNumber/i);
});

test("local operator page is a minimal development/test tool", async () => {
  const page = await source("app/local-fulfillment/operator/page.tsx");
  const tool = await source("app/storefront/LocalFulfillmentOperatorTool.tsx");
  assert.match(page, /LocalFulfillmentOperatorTool/);
  for (const action of ["enter_photo_review", "publish_preview", "start_production", "mark_quality_check"]) {
    assert.match(tool, new RegExp(action));
  }
  assert.match(tool, /Server-side local operator authority/);
  assert.doesNotMatch(tool, /NEXT_PUBLIC|localStorage|sessionStorage|document\.cookie|password|secret|token|trackingNumber|storageKey|provider/i);
});
