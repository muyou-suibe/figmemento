import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  readLocalCheckoutConfig,
  readTrustedLocalCheckoutConfig,
} from "../app/config/local-checkout-runtime.ts";
import {
  calculateLocalDemoTotal,
  createNotActivatedTaxState,
  parseLocalCheckoutRequest,
} from "../app/domain/local-checkout.ts";
import {
  resolveLocalCouponFixture,
  resolveLocalShippingFixture,
} from "../app/infrastructure/local-checkout/local-checkout-fixtures.ts";

const validRequest = {
  email: "buyer@example.test",
  firstName: "Ava",
  lastName: "Buyer",
  country: "US",
  city: "Portland",
  addressLine1: "1 Demo Street",
  postalCode: "97201",
  shippingMethod: "local_standard",
};

test("bounded address parser accepts required fields and optional fields", () => {
  const result = parseLocalCheckoutRequest({
    ...validRequest,
    stateProvince: "OR",
    phone: "+1 555 0100",
    couponCode: "WELCOME10",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.address, {
    email: "buyer@example.test",
    firstName: "Ava",
    lastName: "Buyer",
    country: "US",
    stateProvince: "OR",
    city: "Portland",
    addressLine1: "1 Demo Street",
    postalCode: "97201",
    phone: "+1 555 0100",
  });
});

test("address parser rejects missing, malformed, unknown, and browser-authority fields", () => {
  const result = parseLocalCheckoutRequest({
    ...validRequest,
    email: "not-an-email",
    postalCode: undefined,
    subtotalCents: 1,
    discountAmount: 0,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((entry) => entry.message.includes("email")));
  assert.ok(result.issues.some((entry) => entry.message.includes("postalCode")));
  assert.ok(result.issues.some((entry) => entry.message.includes("subtotalCents")));
});

test("local shipping fixture is deterministic and rejects unsupported selections", () => {
  assert.deepEqual(resolveLocalShippingFixture({ country: "us", method: "local_standard" }), {
    status: "eligible",
    country: "US",
    method: "local_standard",
    amountCents: 500,
    currency: "USD",
    estimatedRange: "Local demo estimate: 5–10 business days",
    developmentOnly: true,
  });
  assert.deepEqual(resolveLocalShippingFixture({ country: "CA", method: "local_standard" }), {
    status: "unsupported",
    issueCode: "SHIPPING_UNAVAILABLE",
    developmentOnly: true,
  });
});

test("local coupon fixture keeps non-valid statuses non-blocking with zero discount", () => {
  assert.deepEqual(resolveLocalCouponFixture({ couponCode: "WELCOME10", subtotalCents: 10_000 }), {
    status: "valid", discountCents: 1_000, code: "WELCOME10", developmentOnly: true,
  });
  for (const code of ["UNKNOWN", "EXPIRED10", "NOT_APPLICABLE"]) {
    const result = resolveLocalCouponFixture({ couponCode: code, subtotalCents: 10_000 });
    assert.equal(result.discountCents, 0);
    assert.ok(["invalid", "expired", "not_applicable"].includes(result.status));
  }
  assert.deepEqual(resolveLocalCouponFixture({ subtotalCents: 10_000 }), {
    status: "not_selected", discountCents: 0, developmentOnly: true,
  });
});

test("tax is not activated and local demo arithmetic excludes tax", () => {
  assert.deepEqual(createNotActivatedTaxState(), { status: "not_activated", amountCents: null });
  assert.equal(calculateLocalDemoTotal({ subtotalCents: 10_000, shippingCents: 500, discountCents: 1_000 }), 9_500);
  assert.equal(calculateLocalDemoTotal({ subtotalCents: 100, shippingCents: 500, discountCents: 1_000 }), null);
});

test("local fake Checkout source is disabled by default and rejected in production", () => {
  assert.deepEqual(readLocalCheckoutConfig({ NODE_ENV: "development" }, "development"), {
    source: "disabled", runtimeMode: "development",
  });
  assert.deepEqual(readLocalCheckoutConfig({ NODE_ENV: "test", LOCAL_CHECKOUT_SOURCE: "local_fake" }, "test"), {
    source: "local_fake", runtimeMode: "test",
  });
  assert.throws(
    () => readLocalCheckoutConfig({ NODE_ENV: "production", LOCAL_CHECKOUT_SOURCE: "local_fake" }),
    /Local fake Checkout is allowed only in development or test/,
  );
  assert.throws(
    () => readLocalCheckoutConfig({ NODE_ENV: "development", LOCAL_CHECKOUT_SOURCE: "unknown" }),
    /LOCAL_CHECKOUT_SOURCE/,
  );
});

test("trusted Checkout runtime reader cannot be downgraded by an injected environment mode", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(
      () => readTrustedLocalCheckoutConfig({ NODE_ENV: "development", LOCAL_CHECKOUT_SOURCE: "local_fake" }),
      /Local fake Checkout is allowed only in development or test/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("Checkout Readiness remains a read-only GET surface", async () => {
  const source = await readFile(new URL("../app/api/checkout-readiness/route.ts", import.meta.url), "utf8");
  assert.match(source, /export async function GET\(/);
  assert.doesNotMatch(source, /export async function POST\(/);
  assert.doesNotMatch(source, /AcceptedCheckout|localDemoTotal/);
});
