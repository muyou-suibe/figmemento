import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalOrderSnapshot,
  isCreationAttemptId,
  isLocalOrderPublicReference,
  parseLocalOrderCreateRequest,
  projectLocalOrderSnapshot,
} from "../app/domain/local-order.ts";

const attemptId = "123e4567-e89b-42d3-a456-426614174000";

function validCreateRequest() {
  return {
    creationAttemptId: attemptId,
    email: "guest@example.test",
    firstName: "Guest",
    lastName: "Buyer",
    country: "US",
    stateProvince: "CA",
    city: "Los Angeles",
    addressLine1: "1 Main Street",
    postalCode: "90001",
    phone: "+1 555 0100",
    shippingMethod: "local_standard",
  };
}

function commercial() {
  return {
    currency: "USD",
    subtotalCents: 8990,
    shipping: {
      status: "eligible",
      country: "US",
      method: "local_standard",
      amountCents: 900,
      currency: "USD",
      estimatedRange: "5-10 business days",
      developmentOnly: true,
    },
    coupon: { status: "not_selected", discountCents: 0, developmentOnly: true },
    tax: { status: "not_activated", amountCents: null },
    localArithmeticTotalCents: 9890,
    developmentOnly: true,
  };
}

function snapshotInput() {
  return {
    internalId: "local-internal-1",
    publicReference: "FM-LOCAL-ABCDEF0123456789",
    createdAt: "2026-08-24T12:00:00.000Z",
    contact: {
      email: "guest@example.test",
      firstName: "Guest",
      lastName: "Buyer",
      country: "US",
      city: "Los Angeles",
      addressLine1: "1 Main Street",
      postalCode: "90001",
    },
    commercial: commercial(),
    lines: [
      {
        productId: "product-1",
        productName: "Glass Light",
        productSlug: "glass-light-picture",
        variantId: "variant-1",
        skuCode: "GLASS-LIGHT-PICTURE",
        selectedOptions: [{ optionId: "size", valueId: "standard" }],
        quantity: 1,
        unitBasePriceCents: 8990,
        currency: "USD",
        lineSubtotalCents: 8990,
        customization: {
          configurationRevision: "rev-1",
          values: [
            { fieldId: "field-text", fieldCode: "message", kind: "short_text", value: "Hello" },
            {
              fieldId: "field-image",
              fieldCode: "photo",
              kind: "image",
              images: [{ receiptId: "receipt-private-1", crop: { x: 0, y: 0, width: 1, height: 1 } }],
            },
          ],
        },
      },
    ],
  };
}

test("creationAttemptId and local public references have bounded formats", () => {
  assert.equal(isCreationAttemptId(attemptId), true);
  assert.equal(isCreationAttemptId("123e4567-e89b-12d3-a456-426614174000"), false);
  assert.equal(isLocalOrderPublicReference("FM-LOCAL-ABCDEF0123456789"), true);
  assert.equal(isLocalOrderPublicReference("PG-123"), false);
});

test("Local Order parser accepts only structural checkout fields plus selector", () => {
  const parsed = parseLocalOrderCreateRequest(validCreateRequest());
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.creationAttemptId, attemptId);

  for (const forbidden of [
    { price: 1 },
    { orderReference: "FM-LOCAL-ABCDEF0123456789" },
    { localDemoTotal: 1 },
    { receiptId: "receipt-private-1" },
    { acceptedCheckout: { kind: "accepted_local_checkout" } },
    { paymentStatus: "paid" },
  ]) {
    assert.equal(parseLocalOrderCreateRequest({ ...validCreateRequest(), ...forbidden }).ok, false);
  }
});

test("Local Order snapshot is defensively copied and immutable", () => {
  const input = snapshotInput();
  const snapshot = createLocalOrderSnapshot(input);
  input.lines[0].selectedOptions[0].valueId = "changed";
  input.lines[0].customization.values[0].value = "changed";

  assert.equal(snapshot.lines[0].selectedOptions[0].valueId, "standard");
  assert.equal(snapshot.lines[0].customization.values[0].value, "Hello");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.lines[0].selectedOptions), true);
  assert.throws(() => {
    snapshot.lines[0].quantity = 2;
  }, TypeError);
});

test("public projection keeps configured lines separate and omits private receipt data", () => {
  const input = snapshotInput();
  input.lines.push({
    ...input.lines[0],
    variantId: "variant-2",
    skuCode: "GLASS-LIGHT-PICTURE-2",
    lineSubtotalCents: 8990,
  });
  const projection = projectLocalOrderSnapshot(createLocalOrderSnapshot(input));

  assert.equal(projection.lines.length, 2);
  assert.equal(projection.status, "pending_payment");
  assert.equal(projection.paymentStatus, "pending");
  assert.equal("internalId" in projection, false);
  assert.equal("receiptId" in projection.lines[0].customization[1], false);
  assert.deepEqual(projection.lines[0].customization[1], {
    fieldId: "field-image",
    fieldCode: "photo",
    kind: "image",
    imageCount: 1,
  });
});
