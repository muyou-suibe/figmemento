import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Tracking surfaces use safe fixture language and terminal wording", async () => {
  const customer = await readFile(new URL("../app/storefront/LocalTrackingExperience.tsx", import.meta.url), "utf8");
  const success = await readFile(new URL("../app/storefront/LocalOrderSuccessExperience.tsx", import.meta.url), "utf8");
  for (const source of [customer, success]) { assert.match(source, /DEVELOPMENT \/ TEST ONLY/); assert.doesNotMatch(source, /AfterShip|EasyPost|Shippo|operatorSecret|capability=/i); }
  assert.match(customer, /17TRACK lookup/);
  assert.match(customer, /Quality check complete · Shipment not yet created/);
  assert.match(customer, /Delivered terminal state/);
  assert.match(customer, /overflow-wrap|trackingTimeline/);
});
