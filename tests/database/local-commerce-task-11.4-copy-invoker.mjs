// Acceptance-only server-command invoker for Task 11.4 race G. Raw owner
// authority arrives transiently over IPC, is never logged or persisted, and is
// freshly verified in this OS process before constructing the existing media
// authority.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";

import { resolveGuestResourceOwner } from "../../app/application/guest-resource-ownership.server.ts";
import { createLocalPersistentMediaAuthority } from "../../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts";
import { createConfiguredGuestDraftOwnerService } from "../../app/lib/guest-draft-owner.ts";

const run = process.env.LOCAL_COMMERCE_RUN_ID;
const projectId = process.env.LOCAL_COMMERCE_PROJECT_ID;
assert.equal(run, "run-93f6c1a2");
assert.equal(projectId, "figmemento-local-commerce-test-run-93f6c1a2");
assert.equal(process.env.NODE_ENV, "test");
assert.equal(process.cwd(), path.resolve("."));
assert.ok(process.send);

process.send({ type: "ready", pid: process.pid, run, projectId, cwd: process.cwd(), startedAt: new Date().toISOString() });
process.once("message", async (message) => {
  const releasedAt = new Date().toISOString();
  let stage = "message_validation";
  let safeReason;
  try {
    assert.ok(message && typeof message === "object");
    stage = "guest_context_decode";
    const context = decodeURIComponent(message.guestContext);
    const request = message.request;
    stage = "owner_verification";
    const verifyOwner = async () => {
      const resolved = await resolveGuestResourceOwner({ projectId, context,
        ownerService: createConfiguredGuestDraftOwnerService(process.env) });
      if (resolved.status !== "authorized") safeReason = resolved.reason;
      return resolved.status === "authorized" ? { owner: resolved.owner, expiresAt: resolved.owner.expiresAt } : null;
    };
    const independentlyVerified = await verifyOwner();
    assert.ok(independentlyVerified);
    stage = "copy_command";
    const result = await createLocalPersistentMediaAuthority(process.env, verifyOwner).copy(request);
    process.send({ type: "result", pid: process.pid, releasedAt, exitedAt: new Date().toISOString(),
      ownerDigest: createHash("sha256").update(independentlyVerified.owner.ownerId).digest("hex"), result });
  } catch {
    process.send({ type: "failure", pid: process.pid, releasedAt, exitedAt: new Date().toISOString(), error: "copy_invocation_failed", stage, safeReason });
    process.exitCode = 1;
  } finally {
    process.disconnect();
  }
});
