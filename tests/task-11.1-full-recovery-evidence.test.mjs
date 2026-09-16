import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../openspec/changes/complete-local-commerce-persistence/", import.meta.url);

test("Task 11.1 evidence records a complete sanitized A-to-B durable commerce matrix", async () => {
  const evidence = JSON.parse(await readFile(new URL("task-11.1-full-recovery-evidence.json", root), "utf8"));
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.run, "run-5576dfd8");
  assert.equal(evidence.ledger, "37/37");
  assert.equal(evidence.pendingMigrations, 0);
  assert.notEqual(evidence.process.A.pid, evidence.process.B.pid);
  assert.equal(evidence.process.termination.pidAbsent, true);
  assert.equal(evidence.process.termination.portClosed, true);
  assert.equal(evidence.process.B.startedAfterAAbsent, true);
  assert.equal(evidence.credentialContinuity.relogin, false);
  assert.equal(evidence.credentialContinuity.replacementGuestAuthority, false);
  assert.equal(evidence.stableDigests.cartBefore, evidence.stableDigests.cartAfter);
  assert.equal(evidence.stableDigests.draftBefore, evidence.stableDigests.draftAfter);
  assert.equal(evidence.stableDigests.trackingBefore, evidence.stableDigests.trackingAfter);
  assert.equal(evidence.privateMedia.length, 4);
  assert.equal(evidence.orders.length, 4);
  assert.deepEqual(evidence.paymentHistory.mainOrderOutcomes, ["failed", "succeeded"]);
  assert.deepEqual(evidence.fulfillment.manifestVersions, [1, 2]);
  assert.equal(evidence.fulfillment.timeoutDecisionCount, 1);
  assert.equal(evidence.shipment.state, "delivered");
  assert.equal(evidence.shipment.events.length, 4);
  assert.equal(evidence.digital.spentTicketRejectedAfterB, true);
  assert.equal(evidence.digital.consumedAfterSecondPostRestartDownload, 2);
  assert.equal(evidence.excluded.reset, false);
  assert.equal(evidence.excluded.remoteAccess, false);
  assert.equal(evidence.excluded.supplierPersistence, false);

  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /service[_ -]?role|authorization.{0,8}bearer|eyJ[a-zA-Z0-9_-]{20,}/i);
  for (const forbidden of ["cookieValue", "rawToken", "sessionToken", "objectKey", "storageLocator", "signedUrl"])
    assert.equal(Object.hasOwn(evidence, forbidden), false);
});

test("Task 11.1 acceptance narrative indexes every mandatory recovered domain", async () => {
  const source = await readFile(new URL("task-11.1-full-recovery-acceptance.md", root), "utf8");
  for (const required of [
    "Status: **PASS**", "Guest Cart", "Draft/media", "Private bytes", "Member session",
    "Multi-Order grants", "Order snapshots", "Payment/action", "Review/manifest/revision",
    "Timeout", "Shipment/tracking", "Digital version/grant", "Ticket/quota", "Digital bytes",
    "no relogin", "No remote service", "Task 10.8",
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /service[_ -]?role\s*[:=]\s*\S+|authorization\s*[:=]\s*bearer\s+\S+|eyJ[a-zA-Z0-9_-]{20,}/i);
});
