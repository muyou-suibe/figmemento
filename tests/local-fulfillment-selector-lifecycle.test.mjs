import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getOrCreateFulfillmentSelector,
  settleFulfillmentSelector,
} from "../app/client/local-fulfillment-selector-lifecycle.ts";

function ids(values) {
  const iterator = values[Symbol.iterator]();
  return () => iterator.next().value;
}

test("customer selector retains transport retries, clears rejection, and creates a new explicit attempt", () => {
  const createId = ids(["customer-A", "customer-B"]);
  const input = { actionKind: "approve_preview", expectedPreviewVersion: 1 };
  const first = getOrCreateFulfillmentSelector(null, input, createId);
  const afterTransportFailure = settleFulfillmentSelector(first, "transport_retry");
  assert.equal(afterTransportFailure, first);
  assert.equal(getOrCreateFulfillmentSelector(afterTransportFailure, input, createId), first);

  const afterConfirmedRejection = settleFulfillmentSelector(afterTransportFailure, "definitive_rejection");
  assert.equal(afterConfirmedRejection, null);
  const next = getOrCreateFulfillmentSelector(afterConfirmedRejection, input, createId);
  assert.equal(next.fulfillmentActionId, "customer-B");
  assert.notEqual(next.fulfillmentActionId, first.fulfillmentActionId);
});

test("operator selector retains transport retries, clears rejection, and creates a new explicit attempt", () => {
  const createId = ids(["operator-O1", "operator-O2"]);
  const input = { actionKind: "enter_photo_review" };
  const first = getOrCreateFulfillmentSelector(null, input, createId);
  assert.equal(settleFulfillmentSelector(first, "transport_retry"), first);
  assert.equal(getOrCreateFulfillmentSelector(first, input, createId), first);

  assert.equal(settleFulfillmentSelector(first, "definitive_rejection"), null);
  const next = getOrCreateFulfillmentSelector(null, input, createId);
  assert.equal(next.fulfillmentActionId, "operator-O2");
  assert.notEqual(next.fulfillmentActionId, first.fulfillmentActionId);
});

test("committed and replayed responses clear the selector, while revision input remains part of identity", () => {
  const createId = ids(["revision-A", "revision-B", "revision-C"]);
  const firstInput = { actionKind: "request_revision", expectedPreviewVersion: 1, revisionNote: "Adjust the crop." };
  const first = getOrCreateFulfillmentSelector(null, firstInput, createId);
  assert.equal(settleFulfillmentSelector(first, "committed"), null);
  const replayAttempt = getOrCreateFulfillmentSelector(first, firstInput, createId);
  assert.equal(replayAttempt, first);
  assert.equal(settleFulfillmentSelector(replayAttempt, "replayed"), null);

  const changedNote = getOrCreateFulfillmentSelector(first, { ...firstInput, revisionNote: "Adjust the light." }, createId);
  assert.equal(changedNote.fulfillmentActionId, "revision-B");
  assert.notEqual(changedNote.fulfillmentActionId, first.fulfillmentActionId);
  const changedVersion = getOrCreateFulfillmentSelector(changedNote, { ...firstInput, expectedPreviewVersion: 2 }, createId);
  assert.equal(changedVersion.fulfillmentActionId, "revision-C");
});

test("customer and operator components keep rapid duplicate protection and distinguish transport from rejection", async () => {
  const [customer, operator] = await Promise.all([
    readFile(new URL("../app/storefront/LocalOrderSuccessExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/LocalFulfillmentOperatorTool.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(customer, /fulfillmentInFlight\.current/);
  assert.match(customer, /disabled=\{fulfillmentLifecycle === "submitting"\}/);
  assert.match(customer, /settleFulfillmentSelector\(fulfillmentAttempt\.current, "definitive_rejection"\)/);
  assert.match(customer, /settleFulfillmentSelector\(attempt, "transport_retry"\)/);
  assert.match(operator, /lifecycle === "submitting"/);
  assert.match(operator, /disabled=\{lifecycle === "submitting"\}/);
  assert.match(operator, /settleFulfillmentSelector\(attempt\.current, "definitive_rejection"\)/);
  assert.match(operator, /settleFulfillmentSelector\(currentAttempt, "transport_retry"\)/);
});
