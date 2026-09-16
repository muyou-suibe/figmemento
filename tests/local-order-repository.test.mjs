import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalMemoryLocalOrderRepository,
} from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";

const attemptA = "123e4567-e89b-42d3-a456-426614174000";
const attemptB = "123e4567-e89b-42d3-a456-426614174001";
const attemptC = "123e4567-e89b-42d3-a456-426614174002";

function draft(skuCode = "GLASS-LIGHT-PICTURE") {
  return {
    contact: {
      email: "guest@example.test",
      firstName: "Guest",
      lastName: "Buyer",
      country: "US",
      city: "Los Angeles",
      addressLine1: "1 Main Street",
      postalCode: "90001",
    },
    commercial: {
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
    },
    lines: [{
      productId: "product-1",
      productName: "Glass Light",
      productSlug: "glass-light-picture",
      variantId: "variant-1",
      skuCode,
      selectedOptions: [{ optionId: "size", valueId: "standard" }],
      quantity: 1,
      unitBasePriceCents: 8990,
      currency: "USD",
      fulfillmentType: "physical",
      lineSubtotalCents: 8990,
    }],
  };
}

function createRepository(options = {}) {
  return new LocalMemoryLocalOrderRepository({
    now: () => "2026-08-24T12:00:00.000Z",
    ...options,
  });
}

function createInput(repository, attemptId = attemptA, overrides = {}) {
  return repository.findOrCreate({
    creationAttemptId: attemptId,
    context: { cartId: "cart-1", authorityKey: "catalog-v1" },
    inputFingerprint: "fingerprint-1",
    snapshot: draft(),
    ...overrides,
  });
}

test("first repository create generates trusted identities and one Order", async () => {
  const repository = createRepository();
  const result = await createInput(repository);
  assert.equal(result.status, "created");
  assert.match(result.snapshot.publicReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
  assert.notEqual(result.snapshot.internalId, result.snapshot.publicReference);
  assert.equal(typeof result.browserCapability, "string");
  assert.match(result.snapshot.lines[0].orderItemId, /^[A-Za-z0-9_-]{16,200}$/);
  assert.equal(result.snapshot.lines[0].fulfillmentType, "physical");
  assert.equal(repository.getOrderCountForTests(), 1);
});

test("equivalent retry returns the same Order and reissues capability when absent", async () => {
  const repository = createRepository();
  const first = await createInput(repository);
  const retry = await createInput(repository, attemptA, { existingBrowserCapability: undefined });
  assert.equal(first.status, "created");
  assert.equal(retry.status, "existing");
  assert.equal(retry.snapshot.publicReference, first.snapshot.publicReference);
  assert.equal(retry.snapshot.lines[0].orderItemId, first.snapshot.lines[0].orderItemId);
  assert.equal(retry.browserCapability, first.browserCapability);
  assert.equal(retry.capabilityStatus, "reissued");
  assert.equal(repository.getOrderCountForTests(), 1);
});

test("equivalent retry with a stale capability reissues the bound capability", async () => {
  const repository = createRepository();
  const first = await createInput(repository);
  const retry = await createInput(repository, attemptA, { existingBrowserCapability: "stale-capability-123456" });
  assert.equal(retry.status, "existing");
  assert.equal(retry.browserCapability, first.browserCapability);
  assert.equal(retry.capabilityStatus, "reissued");
});

test("changed context or fingerprint is a bounded conflict", async () => {
  const repository = createRepository();
  const first = await createInput(repository);
  const changedContext = await createInput(repository, attemptA, {
    context: { cartId: "cart-2", authorityKey: "catalog-v1" },
  });
  const changedFingerprint = await createInput(repository, attemptA, {
    inputFingerprint: "fingerprint-2",
  });
  assert.equal(first.status, "created");
  assert.equal(changedContext.status, "conflict");
  assert.equal(changedFingerprint.status, "conflict");
  assert.equal(repository.getOrderCountForTests(), 1);
});

test("a distinct attempt can create Order B and the same capability authorizes A and B", async () => {
  const repository = createRepository();
  const first = await createInput(repository);
  const second = await createInput(repository, attemptB, {
    existingBrowserCapability: first.browserCapability,
  });
  assert.equal(first.status, "created");
  assert.equal(second.status, "created");
  assert.equal(repository.getOrderCountForTests(), 2);
  assert.equal(second.browserCapability, first.browserCapability);
  assert.equal(
    (await repository.findAuthorizedSnapshot(first.snapshot.publicReference, first.browserCapability)).status,
    "found",
  );
  assert.equal(
    (await repository.findAuthorizedSnapshot(second.snapshot.publicReference, second.browserCapability)).status,
    "found",
  );
});

test("concurrent equivalent creates commit at most one Order", async () => {
  const repository = createRepository();
  const results = await Promise.all(Array.from({ length: 10 }, () => createInput(repository)));
  assert.equal(repository.getOrderCountForTests(), 1);
  assert.equal(new Set(results.map((result) => result.status)).size, 2);
  assert.equal(new Set(results.map((result) => result.snapshot.publicReference)).size, 1);
});

test("failed commit leaves no Order, idempotency binding, or capability mapping", async () => {
  const failure = { enabled: true };
  const repository = createRepository({
    failureInjector: { beforeCommit: () => { if (failure.enabled) throw new Error("injected"); } },
  });
  const failed = await createInput(repository, attemptC);
  assert.equal(failed.status, "failed");
  assert.equal(repository.getOrderCountForTests(), 0);
  failure.enabled = false;
  const retried = await createInput(repository, attemptC);
  assert.equal(retried.status, "created");
  assert.equal(repository.getOrderCountForTests(), 1);
});

test("repository returns immutable copies and does not expose internal storage", async () => {
  const repository = createRepository();
  const first = await createInput(repository);
  assert.throws(() => {
    first.snapshot.lines[0].quantity = 8;
  }, TypeError);
  const read = await repository.findAuthorizedSnapshot(first.snapshot.publicReference, first.browserCapability);
  assert.equal(read.status, "found");
  assert.equal(read.snapshot.lines[0].quantity, 1);
  assert.equal(Object.isFrozen(read.snapshot), true);
});

test("distinct committed lines receive distinct stable identities, including duplicate selections", async () => {
  const repository = createRepository();
  const first = await createInput(repository, attemptA, {
    snapshot: {
      ...draft(),
      lines: [draft().lines[0], { ...draft().lines[0] }],
    },
  });
  assert.equal(first.status, "created");
  const [firstLine, secondLine] = first.snapshot.lines;
  assert.ok(firstLine && secondLine);
  assert.notEqual(firstLine.orderItemId, secondLine.orderItemId);

  const reread = await repository.findAuthorizedSnapshot(first.snapshot.publicReference, first.browserCapability);
  assert.equal(reread.status, "found");
  assert.deepEqual(reread.snapshot.lines.map((line) => line.orderItemId), [firstLine.orderItemId, secondLine.orderItemId]);
});

test("legacy incomplete snapshot remains readable without generated identity or fulfillment backfill", async () => {
  const repository = createRepository();
  const legacyLine = { ...draft().lines[0] };
  delete legacyLine.fulfillmentType;
  const legacy = await createInput(repository, attemptB, {
    snapshot: {
      ...draft(),
      lines: [legacyLine],
    },
  });
  assert.equal(legacy.status, "created");
  assert.equal("orderItemId" in legacy.snapshot.lines[0], false);
  assert.equal("fulfillmentType" in legacy.snapshot.lines[0], false);
});

test("mixed augmented snapshot fails closed instead of filling missing facts", async () => {
  const repository = createRepository();
  const legacyLine = { ...draft().lines[0] };
  delete legacyLine.fulfillmentType;
  const partial = await createInput(repository, attemptC, {
    snapshot: {
      ...draft(),
      lines: [
        { ...draft().lines[0], orderItemId: "client-provided-id" },
        legacyLine,
      ],
    },
  });
  assert.equal(partial.status, "failed");
  assert.equal(repository.getOrderCountForTests(), 0);
});

test("unknown capability and reference-only reads are non-enumerating failures", async () => {
  const repository = createRepository();
  const first = await createInput(repository);
  const other = await createInput(repository, attemptB, {
    existingBrowserCapability: undefined,
  });
  assert.equal(first.status, "created");
  assert.equal(other.status, "created");
  assert.equal(
    (await repository.findAuthorizedSnapshot(first.snapshot.publicReference, other.browserCapability)).status,
    "unavailable",
  );
  assert.equal(
    (await repository.findAuthorizedSnapshot(first.snapshot.publicReference, undefined)).status,
    "unavailable",
  );
});

test("fresh repository instance loses process-memory Orders", async () => {
  const firstRepository = createRepository();
  const first = await createInput(firstRepository);
  const restartedRepository = createRepository();
  assert.equal(
    (await restartedRepository.findAuthorizedSnapshot(first.snapshot.publicReference, first.browserCapability)).status,
    "unavailable",
  );
});

test("public reference collision retries without overwriting an existing Order", async () => {
  let publicCalls = 0;
  let internalCalls = 0;
  const ids = {
    nextInternalId: () => {
      internalCalls += 1;
      return `internal-${internalCalls}`;
    },
    nextPublicReference: () => {
      publicCalls += 1;
      return publicCalls < 3 ? "FM-LOCAL-ABCDEF0123456789" : "FM-LOCAL-BCDEF0123456789A";
    },
    nextBrowserCapability: () => `cap-${publicCalls}`,
    nextOrderItemId: () => `order-item-${publicCalls}-0000000000000001`,
  };
  const repository = createRepository({ ids });
  const first = await createInput(repository);
  const second = await createInput(repository, attemptB, {
    existingBrowserCapability: first.browserCapability,
  });
  assert.equal(first.status, "created");
  assert.equal(second.status, "created");
  assert.equal(publicCalls, 3);
  assert.equal(first.snapshot.publicReference, "FM-LOCAL-ABCDEF0123456789");
  assert.equal(second.snapshot.publicReference, "FM-LOCAL-BCDEF0123456789A");
  assert.notEqual(first.snapshot.publicReference, second.snapshot.publicReference);
  assert.equal(repository.getOrderCountForTests(), 2);
});
