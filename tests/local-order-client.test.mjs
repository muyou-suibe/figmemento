import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Local Checkout handoff uses one selector, retries transport loss, and sends only structural fields", async () => {
  const source = await readFile(new URL("../app/storefront/LocalCheckoutExperience.tsx", import.meta.url), "utf8");
  assert.match(source, /window\.crypto\.randomUUID\(\)/);
  assert.match(source, /creationAttemptId/);
  assert.match(source, /localOrderLifecycle === "submitting"/);
  assert.match(source, /localOrderLifecycle === "retryable"/);
  assert.match(source, /\/api\/local-orders/);
  assert.match(source, /\/order\/success\//);
  const orderBody = source.match(/const body = \{[\s\S]*?\n    \};\n    try \{/u)?.[0] ?? "";
  for (const forbidden of [
    "AcceptedCheckout",
    "localDemoTotalCents",
    "subtotalCents",
    "shippingCents",
    "discountCents",
    "receiptId",
    "paymentStatus",
  ]) {
    assert.doesNotMatch(orderBody, new RegExp(forbidden));
  }
});

test("Local Order Success renders protected projection and local Payment wording", async () => {
  const source = await readFile(new URL("../app/storefront/LocalOrderSuccessExperience.tsx", import.meta.url), "utf8");
  assert.match(source, /api\/local-orders/);
  assert.match(source, /api\/local-payments/);
  assert.match(source, /Pending payment/);
  assert.match(source, /No real money was charged/);
  assert.match(source, /localPaymentEnabled/);
  assert.match(source, /window\.crypto\.randomUUID\(\)/);
  assert.match(source, /transport_retry/);
  assert.match(source, /Local demo total/);
  for (const forbidden of ["Payment successful", "Payment received", "Production started", "Delivery scheduled", "receiptId", "storageKey", "ownerId"]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"));
  }
});

test("Checkout server composition exposes only an explicit local-order feature flag", async () => {
  const source = await readFile(new URL("../app/checkout/page.tsx", import.meta.url), "utf8");
  assert.match(source, /readTrustedLocalOrderConfig/);
  assert.match(source, /localOrderEnabled/);
  assert.doesNotMatch(source, /process\.env/);
});
