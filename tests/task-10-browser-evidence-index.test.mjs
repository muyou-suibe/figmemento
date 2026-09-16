import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../openspec/changes/complete-local-commerce-persistence/", import.meta.url);
const indexUrl = new URL("task-10.8-browser-experience-evidence-index.md", root);
const screenshots = new Map([
  ["desktop-before-shipment.png", "c95925eb471d6fcf0c5ce63ee4d97fb0c3bfcc53624b63bd8f5213d191595be3"],
  ["desktop-shipment-created.png", "bb4b733ef03bb69794178867a2dae55175b81ae6117c768f7864a4d4bdaa93f0"],
  ["desktop-shipped.png", "fe74a50987e0a9b382c81765c8e6daecbaaffa78c9ec321756b3ac6d5a4a66d8"],
  ["desktop-in-transit.png", "b68d2506336ac0d3098fb04a7288d22c376e0f6d34ed26a3ee2009cb3e194d9a"],
  ["desktop-delivered.png", "e1730a2ab71709a87d7f2b1d78bcec93209424534922a8c0d14bec416cc69eff"],
]);

test("Task 10.8 evidence index is complete, privacy-bounded, and records the narrow A-to-B dependency slice", async () => {
  const source = await readFile(indexUrl, "utf8");
  for (const required of [
    "run-5576dfd8", "PID 5170", "PID 9102", "Keyboard/button equivalence",
    "DB-disabled race suite", "Admin Catalog authority separation", "Status: PASS", "PID 17675", "PID 17748",
    "Task 11.1 remains unchecked", "same Chrome process/profile", "Foreign browser",
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /service[_ -]?role\s*[:=]\s*\S+|authorization\s*[:=]\s*bearer\s+\S+|eyJ[a-zA-Z0-9_-]{20,}/i);
});

test("Task 10.8 restart-slice artifact proves exact A termination before B without claiming Task 11.1", async () => {
  const evidence = JSON.parse(await readFile(new URL("task-10.8-restart-slice-evidence.json", root), "utf8"));
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.processA.pid, 17675);
  assert.equal(evidence.processATermination.absent, true);
  assert.equal(evidence.processATermination.portClosed, true);
  assert.equal(evidence.processB.pid, 17748);
  assert.notEqual(evidence.processA.pid, evidence.processB.pid);
  assert.equal(evidence.originalBrowserAuthority.sameCookieValues, true);
  assert.equal(evidence.draft.version, 3);
  assert.equal(evidence.draft.confirmedRevision, 3);
  assert.equal(evidence.draft.slots.length, 2);
  assert.equal(evidence.exactRecovery.privatePreviewBytesAndDigests, true);
  assert.equal(evidence.foreignOwner.draftProjection, "not_found");
  assert.equal(evidence.foreignOwner.previewStatus, 404);
  assert.equal(evidence.excluded.task11_1CompletionClaim, true);
  const forbiddenPropertyNames = new Set([
    "cookieValue",
    "serviceRole",
    "objectKey",
    "storageLocator",
    "signedUrl",
  ]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbiddenPropertyNames.has(key), false, `forbidden evidence property: ${key}`);
      visit(nested);
    }
  };
  visit(evidence);
});

test("Task 10.8 safe screenshot artifacts retain exact accepted PNG bytes and 2400x1436 dimensions", async () => {
  for (const [name, digest] of screenshots) {
    const bytes = await readFile(new URL(`evidence/task-10.8/${name}`, root));
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), 2400);
    assert.equal(bytes.readUInt32BE(20), 1436);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest);
  }
});
