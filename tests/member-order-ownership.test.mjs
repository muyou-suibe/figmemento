import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeMemberOrderRead,
  createMemberOrderBinding,
  resolveVerifiedMemberOrderSession,
} from "../app/application/member-order-ownership.server.ts";
import {
  createGuestDraftOwnerService,
} from "../app/lib/guest-draft-owner.ts";
import {
  createGuestResourceBinding,
  hashGuestResourceCapability,
  resolveGuestResourceOwner,
} from "../app/application/guest-resource-ownership.server.ts";

const projectId = "figmemento-local-commerce-test";
const nowMilliseconds = 1_700_000_000_000;
const nowSeconds = 1_700_000_000;

function persistentSession(overrides = {}) {
  return {
    projectId,
    sessionId: "session-12345678",
    customerId: "customer-123456",
    ownerId: "owner-12345678",
    subjectHash: "a".repeat(64),
    issuedAt: new Date(nowMilliseconds - 1_000).toISOString(),
    expiresAt: new Date(nowMilliseconds + 3_600_000).toISOString(),
    revokedAt: null,
    ...overrides,
  };
}

function memberSession(overrides = {}) {
  const result = resolveVerifiedMemberOrderSession({
    projectId,
    session: persistentSession(overrides),
    nowMilliseconds,
  });
  assert.equal(result.status, "authorized");
  return result.session;
}

async function capability(label) {
  const digest = await hashGuestResourceCapability(`server-issued-${label}-capability-123456`);
  assert.ok(digest);
  return digest;
}

async function memberBinding(overrides = {}) {
  const session = memberSession();
  const binding = createMemberOrderBinding({
    session,
    internalOrderId: "order-internal-123456",
    publicReference: "FM-LOCAL-1234567890ABCDEF",
    capabilityHash: await capability("member"),
    createdAt: nowSeconds,
    expiresAt: session.expiresAt,
    ...overrides,
  });
  assert.ok(binding);
  return { session, binding };
}

test("member creation binds the Order to the verified opaque customer subject", async () => {
  const { session, binding } = await memberBinding();
  const result = authorizeMemberOrderRead({
    binding,
    session,
    internalOrderId: binding.internalOrderId,
    publicReference: binding.publicReference,
    capabilityHash: binding.capabilityHash,
    nowSeconds: nowSeconds + 1,
  });
  assert.equal(result.status, "authorized");
  assert.equal(binding.ownerId, session.ownerId);
  assert.equal(binding.customerId, session.customerId);
  assert.equal(binding.projectId, projectId);
});

test("expired member session rejects an otherwise matching Order binding", async () => {
  const { binding } = await memberBinding();
  const expired = memberSession({
    expiresAt: new Date((nowSeconds + 10) * 1000).toISOString(),
  });
  assert.equal(authorizeMemberOrderRead({
    binding,
    session: expired,
    internalOrderId: binding.internalOrderId,
    publicReference: binding.publicReference,
    capabilityHash: binding.capabilityHash,
    nowSeconds: nowSeconds + 10,
  }).status, "unavailable");
});

test("a member session cannot claim a guest Order", async () => {
  const guestService = createGuestDraftOwnerService({
    signingSecret: "member-order-owner-test-secret-material-1234567890",
    contextLifetimeSeconds: 3_600,
  }, {
    nowSeconds: () => nowSeconds,
    randomBytes: (length) => new Uint8Array(length).fill(7),
  });
  const issued = await guestService.issueGuestDraftOwner();
  assert.equal(issued.status, "issued");
  const guestOwner = await resolveGuestResourceOwner({
    projectId,
    context: issued.value.context,
    ownerService: guestService,
  });
  assert.equal(guestOwner.status, "authorized");
  const guestBinding = createGuestResourceBinding({
    owner: guestOwner.owner,
    resourceKind: "order",
    resourceId: "order-guest-123456",
    capabilityHash: await capability("guest"),
    createdAt: nowSeconds,
    expiresAt: guestOwner.owner.expiresAt,
  });
  assert.ok(guestBinding);
  const member = memberSession();
  assert.equal(authorizeMemberOrderRead({
    binding: guestBinding,
    session: member,
    internalOrderId: "order-guest-123456",
    publicReference: "FM-LOCAL-1234567890ABCDEF",
    capabilityHash: guestBinding.capabilityHash,
    nowSeconds: nowSeconds + 1,
  }).status, "unavailable");
});

test("same email has no claim or merge path for a guest Order", async () => {
  const { session, binding } = await memberBinding();
  assert.equal("email" in binding, false);
  assert.equal(authorizeMemberOrderRead({
    binding,
    session,
    email: "same@example.test",
    internalOrderId: binding.internalOrderId,
    publicReference: binding.publicReference,
    capabilityHash: binding.capabilityHash,
    nowSeconds: nowSeconds + 1,
  }).status, "authorized");
});

test("a different customer session cannot read the member Order", async () => {
  const { binding } = await memberBinding();
  const other = memberSession({
    sessionId: "session-other-1234",
    customerId: "customer-other-1234",
    ownerId: "owner-other-1234",
  });
  assert.equal(authorizeMemberOrderRead({
    binding,
    session: other,
    internalOrderId: binding.internalOrderId,
    publicReference: binding.publicReference,
    capabilityHash: binding.capabilityHash,
    nowSeconds: nowSeconds + 1,
  }).status, "unavailable");
});

test("forged owner identity cannot satisfy the exact member binding", async () => {
  const { session, binding } = await memberBinding();
  const forged = { ...session, ownerId: "owner-forged-1234" };
  assert.equal(authorizeMemberOrderRead({
    binding,
    session: forged,
    internalOrderId: binding.internalOrderId,
    publicReference: binding.publicReference,
    capabilityHash: binding.capabilityHash,
    nowSeconds: nowSeconds + 1,
  }).status, "unavailable");
});

test("a capability digest cannot be replayed against another member Order binding", async () => {
  const { session, binding } = await memberBinding();
  const otherCapability = await capability("other-order");
  assert.notEqual(otherCapability, binding.capabilityHash);
  assert.equal(authorizeMemberOrderRead({
    binding,
    session,
    internalOrderId: binding.internalOrderId,
    publicReference: binding.publicReference,
    capabilityHash: otherCapability,
    nowSeconds: nowSeconds + 1,
  }).status, "unavailable");
});
