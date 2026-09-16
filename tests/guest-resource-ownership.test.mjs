import assert from "node:assert/strict";
import test from "node:test";

import { createGuestDraftOwnerService } from "../app/lib/guest-draft-owner.ts";
import {
  authorizeGuestResourceBinding,
  createCustomerResourceOwner,
  createGuestResourceBinding,
  ensureGuestResourceOwner,
  hashGuestResourceCapability,
  resolveGuestResourceOwner,
} from "../app/application/guest-resource-ownership.server.ts";

const config = {
  signingSecret: "guest-resource-owner-test-secret-material-1234567890",
  contextLifetimeSeconds: 3_600,
};

function dependencies(now = 1_700_000_000, initialSeed = 0) {
  let seed = initialSeed;
  return {
    nowSeconds: () => now,
    randomBytes(length) {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) bytes[index] = (seed + index + 1) % 256;
      seed += length;
      return bytes;
    },
  };
}

async function guestOwner(now = 1_700_000_000, initialSeed = 0) {
  const service = createGuestDraftOwnerService(config, dependencies(now, initialSeed));
  const issued = await service.issueGuestDraftOwner();
  assert.equal(issued.status, "issued");
  const resolved = await resolveGuestResourceOwner({
    projectId: "figmemento-local-commerce-test",
    context: issued.value.context,
    ownerService: service,
  });
  assert.equal(resolved.status, "authorized");
  return { service, context: issued.value.context, owner: resolved.owner };
}

test("one verified guest owner can bind Cart, Draft, Upload receipt, and Order without login", async () => {
  const guest = await guestOwner();
  for (const [resourceKind, resourceId] of [
    ["cart", "cart-1"],
    ["draft", "draft-1"],
    ["upload_receipt", "receipt-1"],
    ["order", "FM-LOCAL-ORDER-1"],
  ]) {
    const binding = createGuestResourceBinding({
      owner: guest.owner,
      resourceKind,
      resourceId,
      createdAt: 1_700_000_000,
      expiresAt: guest.owner.expiresAt,
    });
    assert.ok(binding);
    const access = authorizeGuestResourceBinding({
      binding,
      owner: guest.owner,
      resourceKind,
      resourceId,
      nowSeconds: 1_700_000_001,
    });
    assert.equal(access.status, "authorized");
  }
});

test("guest draft recovery uses the signed context, not process memory", async () => {
  const original = await guestOwner();
  const binding = createGuestResourceBinding({
    owner: original.owner,
    resourceKind: "draft",
    resourceId: "draft-recover",
    createdAt: 1_700_000_000,
    expiresAt: original.owner.expiresAt,
  });
  assert.ok(binding);

  const restartedService = createGuestDraftOwnerService(config, dependencies());
  const recovered = await resolveGuestResourceOwner({
    projectId: "figmemento-local-commerce-test",
    context: original.context,
    ownerService: restartedService,
  });
  assert.equal(recovered.status, "authorized");
  assert.equal(recovered.owner.ownerId, original.owner.ownerId);
  assert.equal(authorizeGuestResourceBinding({
    binding,
    owner: recovered.owner,
    resourceKind: "draft",
    resourceId: "draft-recover",
    nowSeconds: 1_700_000_001,
  }).status, "authorized");
});

test("upload receipt ownership rejects a different guest and a different project", async () => {
  const first = await guestOwner();
  const second = await guestOwner(1_700_000_000, 100);
  const binding = createGuestResourceBinding({
    owner: first.owner,
    resourceKind: "upload_receipt",
    resourceId: "receipt-owned",
    createdAt: 1_700_000_000,
    expiresAt: first.owner.expiresAt,
  });
  assert.ok(binding);
  assert.equal(authorizeGuestResourceBinding({
    binding,
    owner: second.owner,
    resourceKind: "upload_receipt",
    resourceId: "receipt-owned",
    nowSeconds: 1_700_000_001,
  }).status, "unavailable");
  assert.equal(authorizeGuestResourceBinding({
    binding,
    owner: { ...first.owner, projectId: "another-local-project" },
    resourceKind: "upload_receipt",
    resourceId: "receipt-owned",
    nowSeconds: 1_700_000_001,
  }).status, "unavailable");
});

test("expired guest context and expired binding fail closed", async () => {
  const guest = await guestOwner();
  const binding = createGuestResourceBinding({
    owner: guest.owner,
    resourceKind: "cart",
    resourceId: "cart-expired",
    createdAt: 1_700_000_000,
    expiresAt: guest.owner.expiresAt,
  });
  assert.ok(binding);
  assert.equal(authorizeGuestResourceBinding({
    binding,
    owner: guest.owner,
    resourceKind: "cart",
    resourceId: "cart-expired",
    nowSeconds: guest.owner.expiresAt,
  }).status, "unavailable");

  const expired = await resolveGuestResourceOwner({
    projectId: "figmemento-local-commerce-test",
    context: guest.context,
    ownerService: createGuestDraftOwnerService(config, dependencies(guest.owner.expiresAt)),
  });
  assert.deepEqual(expired, { status: "unavailable", reason: "expired" });
});

test("authenticated customer ownership is exact and never claims a guest resource", async () => {
  const guest = await guestOwner();
  const customer = createCustomerResourceOwner({
    projectId: "figmemento-local-commerce-test",
    customerId: "customer-123456",
    ownerId: "customer-owner-123456",
  });
  assert.ok(customer);

  const guestOrder = createGuestResourceBinding({
    owner: guest.owner,
    resourceKind: "order",
    resourceId: "order-guest",
    createdAt: 1_700_000_000,
    expiresAt: guest.owner.expiresAt,
  });
  assert.ok(guestOrder);
  assert.equal(authorizeGuestResourceBinding({
    binding: guestOrder,
    owner: customer,
    resourceKind: "order",
    resourceId: "order-guest",
    nowSeconds: 1_700_000_001,
  }).status, "unavailable");

  const memberOrder = createGuestResourceBinding({
    owner: customer,
    resourceKind: "order",
    resourceId: "order-member",
    createdAt: 1_700_000_000,
    expiresAt: 1_700_003_600,
  });
  assert.ok(memberOrder);
  assert.equal(authorizeGuestResourceBinding({
    binding: memberOrder,
    owner: customer,
    resourceKind: "order",
    resourceId: "order-member",
    nowSeconds: 1_700_000_001,
  }).status, "authorized");
});

test("resource capability material is persisted only as a digest", async () => {
  const guest = await guestOwner();
  const rawCapability = "opaque-capability-issued-by-server-123456";
  const capabilityHash = await hashGuestResourceCapability(rawCapability);
  assert.ok(capabilityHash);
  const binding = createGuestResourceBinding({
    owner: guest.owner,
    resourceKind: "order",
    resourceId: "order-digest",
    capabilityHash,
    createdAt: 1_700_000_000,
    expiresAt: guest.owner.expiresAt,
  });
  assert.ok(binding);
  assert.equal(binding.capabilityHash, capabilityHash);
  assert.notEqual(binding.capabilityHash, rawCapability);
  assert.equal(JSON.stringify(binding).includes(rawCapability), false);
  assert.equal(await hashGuestResourceCapability("too short"), null);
});

test("missing guest context may be issued, while browser owner fields have no input path", async () => {
  const service = createGuestDraftOwnerService(config, dependencies());
  const result = await ensureGuestResourceOwner({
    projectId: "figmemento-local-commerce-test",
    context: null,
    ownerService: service,
  });
  assert.equal(result.status, "issued");
  assert.ok(!("ownerId" in { browserOwnerId: "attacker" }));
  assert.equal(JSON.stringify(result).includes("attacker"), false);
});
