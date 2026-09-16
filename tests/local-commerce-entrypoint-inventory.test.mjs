import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LOCAL_COMMERCE_ENTRYPOINT_INVENTORY } from "../app/server/local-commerce-entrypoint-inventory.server.ts";

test("Task 8.1 inventory has unique routes and exact route method exports", async () => {
  assert.equal(LOCAL_COMMERCE_ENTRYPOINT_INVENTORY.length, 46);
  assert.equal(new Set(LOCAL_COMMERCE_ENTRYPOINT_INVENTORY.map((item) => item.route)).size, 46);

  for (const item of LOCAL_COMMERCE_ENTRYPOINT_INVENTORY) {
    const source = await readFile(new URL(`../${item.file}`, import.meta.url), "utf8");
    for (const method of item.methods) {
      assert.match(source, new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`), `${item.file} must export ${method}`);
    }
  }
});

test("persistent mutations are canonical, explicitly deferred, unsupported, or legacy-isolated", () => {
  const mutations = LOCAL_COMMERCE_ENTRYPOINT_INVENTORY.filter((item) => item.operation !== "read");
  assert.ok(mutations.length > 0);
  for (const item of mutations) {
    assert.ok(
      ["canonical", "deferred_fail_closed", "supplier_unsupported", "legacy_isolated", "catalog_separate", "ancillary_isolated"].includes(item.persistentSupport),
      `${item.route} lacks a bounded persistent mutation classification`,
    );
    assert.notEqual(item.canonicalBoundary.trim(), "");
  }
});

test("Supplier is unsupported for persistent commerce and cannot silently fall back", () => {
  const supplier = LOCAL_COMMERCE_ENTRYPOINT_INVENTORY.find((item) => item.route === "/api/local-suppliers/operator");
  assert.equal(supplier?.persistentSupport, "supplier_unsupported");
  assert.equal(supplier?.fallbackRisk, "none");
});

test("legacy Order, lookup, cleanup, and webhook routes stay isolated while digital publication is explicitly composed", async () => {
  const legacyFiles = LOCAL_COMMERCE_ENTRYPOINT_INVENTORY
    .filter((item) => item.persistentSupport === "legacy_isolated")
    .map((item) => item.file);
  assert.deepEqual(legacyFiles.sort(), [
    "app/api/admin/cleanup-uploads/route.ts",
    "app/api/admin/orders/route.ts",
    "app/api/coupons/validate/route.ts",
    "app/api/order-lookup/route.ts",
    "app/api/orders/route.ts",
    "app/api/webhooks/stripe/route.ts",
  ]);
  for (const file of legacyFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /local_commerce|LOCAL_ORDER_SOURCE|LOCAL_PAYMENT_SOURCE|LOCAL_FULFILLMENT_SOURCE|LOCAL_TRACKING_SOURCE/);
  }

  const lookup = await readFile(new URL("../app/api/order-lookup/route.ts", import.meta.url), "utf8");
  assert.match(lookup, /\^PG-/);
  const digital = await readFile(new URL("../app/api/admin/digital-delivery/route.ts", import.meta.url), "utf8");
  assert.match(digital, /\^PG-/);
  assert.match(digital, /source\.source === "local_persistent"/);
  const digitalInventory = LOCAL_COMMERCE_ENTRYPOINT_INVENTORY.find((item) => item.route === "/api/admin/digital-delivery");
  assert.equal(digitalInventory?.persistentSupport, "canonical");
  assert.equal(digitalInventory?.sourceAuthority, "ADMIN_ACCEPTANCE_SOURCE");
});

test("persistent Admin and Tracking sources remain explicit development/test-only boundaries", async () => {
  const adminConfig = await readFile(new URL("../app/config/admin-acceptance-runtime.server.ts", import.meta.url), "utf8");
  const trackingConfig = await readFile(new URL("../app/config/local-tracking-runtime.ts", import.meta.url), "utf8");
  assert.match(adminConfig, /source:\s*"local_persistent"/);
  assert.match(adminConfig, /unknown_source/);
  assert.match(trackingConfig, /"local_persistent"/);
  assert.match(trackingConfig, /development|test/);
  assert.match(trackingConfig, /Invalid server configuration/);
});
