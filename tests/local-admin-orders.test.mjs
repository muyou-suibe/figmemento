import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADMIN_ORDERS_PAGE_SIZE,
  LOCAL_ADMIN_ORDER_CONTROL_DISPOSITIONS,
  LOCAL_ADMIN_ORDERS_SOURCE_NOTICE,
  normalizeAdminOrdersQuery,
} from "../app/application/admin-orders-read-repository.ts";
import {
  createLocalAdminOrdersFixtures,
  createLocalAdminOrdersReadRepository,
} from "../app/infrastructure/orders/local-admin-orders-read-repository.server.ts";

test("3.1: the provider-neutral read contract normalizes the real Orders filters and page size", () => {
  const query = normalizeAdminOrdersQuery({
    q: `  ${"x".repeat(100)}  `,
    fulfillment: "quality_check",
    payment: "paid",
    attention: "1",
    page: "2",
  });
  assert.equal(query.q.length, 80);
  assert.equal(query.searchTerm.length, 80);
  assert.equal(query.fulfillment, "quality_check");
  assert.equal(query.payment, "paid");
  assert.equal(query.attentionOnly, true);
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, ADMIN_ORDERS_PAGE_SIZE);

  assert.equal(normalizeAdminOrdersQuery({ attention: "true" }).attentionOnly, false);
  assert.equal(normalizeAdminOrdersQuery({ attention: "0" }).attentionOnly, false);
  assert.equal(normalizeAdminOrdersQuery({}).attentionOnly, false);

  const unsupported = normalizeAdminOrdersQuery({ q: "*", fulfillment: "unsupported", payment: "unsupported", page: "0" });
  assert.equal(unsupported.q, "*");
  assert.equal(unsupported.searchTerm, "*");
  assert.equal(unsupported.fulfillment, "");
  assert.equal(unsupported.payment, "");
  assert.equal(unsupported.page, 1);

  const punctuation = normalizeAdminOrdersQuery({ q: "order,(test).%" });
  assert.equal(punctuation.searchTerm, "order  test   ");
});

test("3.2: deterministic fixtures cover long content, payment/fulfillment/tracking states, line items, and digital display", async () => {
  const fixtures = createLocalAdminOrdersFixtures();
  assert.equal(fixtures.length, 24);
  assert.ok(fixtures.some((order) => order.publicReference.length > 60));
  assert.deepEqual(new Set(fixtures.map((order) => order.paymentStatus)), new Set(["paid", "unpaid", "failed"]));
  assert.ok(new Set(fixtures.map((order) => order.fulfillmentStatus)).size >= 5);
  assert.ok(new Set(fixtures.map((order) => order.tracking.status)).size >= 4);
  assert.ok(fixtures.some((order) => order.lineItems.some((item) => item.fulfillmentType === "digital")));
  assert.ok(fixtures.some((order) => order.lineItems.some((item) => item.customizationSummary.some((entry) => entry.value.length > 100))));
  assert.ok(fixtures.some((order) => order.needsAttention));
  assert.ok(fixtures.every((order) => order.customer.displayEmail.endsWith("@example.test")));

  const result = await createLocalAdminOrdersReadRepository().read({ page: 1 });
  assert.equal(result.status, "found");
  assert.equal(result.value.sourceNotice, LOCAL_ADMIN_ORDERS_SOURCE_NOTICE);
  assert.equal(result.value.items.length, 20);
});

test("3.1: pagination, filtered empty state, and exact bounded filters are deterministic", async () => {
  const repository = createLocalAdminOrdersReadRepository();
  const secondPage = await repository.read({ page: 2 });
  assert.equal(secondPage.status, "found");
  assert.equal(secondPage.value.items.length, 4);
  assert.equal(secondPage.value.hasPreviousPage, true);
  assert.equal(secondPage.value.hasNextPage, false);

  const beyondMaximum = await repository.read({ page: 99 });
  assert.equal(beyondMaximum.status, "found");
  assert.deepEqual(beyondMaximum.value.items, []);
  assert.equal(beyondMaximum.value.totalPages, 2);

  const filtered = await repository.read({ fulfillment: "delivered", payment: "paid" });
  assert.equal(filtered.status, "found");
  assert.ok(filtered.value.items.length > 0);
  assert.ok(filtered.value.items.every((order) => order.fulfillmentStatus === "delivered" && order.paymentStatus === "paid"));

  const empty = await repository.read({ q: "no-such-local-order" });
  assert.equal(empty.status, "found");
  assert.deepEqual(empty.value.items, []);
  assert.equal(empty.value.totalCount, 0);
  assert.equal(empty.value.totalPages, 1);
});

test("3.1: attention=1 uses the production fulfillment-status allowlist, not synthetic presentation flags", async () => {
  const repository = createLocalAdminOrdersReadRepository();
  const result = await repository.read({ attention: "1" });
  assert.equal(result.status, "found");
  assert.ok(result.value.items.length > 0);
  assert.ok(result.value.items.every((order) => ["awaiting_review", "quality_check", "issue"].includes(order.fulfillmentStatus)));

  const all = await repository.read();
  assert.equal(all.status, "found");
  const attentionReferences = new Set(result.value.items.map((order) => order.publicReference));
  for (const order of all.value.items) {
    if (!["awaiting_review", "quality_check", "issue"].includes(order.fulfillmentStatus)) {
      assert.equal(attentionReferences.has(order.publicReference), false);
    }
  }
});

test("3.1: search matches only order reference and customer email, with production punctuation normalization", async () => {
  const repository = createLocalAdminOrdersReadRepository();
  const reference = await repository.read({ q: "LOCAL-TEST-ORDER-001" });
  assert.equal(reference.status, "found");
  assert.equal(reference.value.totalCount, 1);

  const email = await repository.read({ q: "customer-01@example" });
  assert.equal(email.status, "found");
  assert.equal(email.value.totalCount, 1);

  const displayName = await repository.read({ q: "Local Test Customer 01" });
  assert.equal(displayName.status, "found");
  assert.equal(displayName.value.totalCount, 0);

  const punctuation = await repository.read({ q: "LOCAL-TEST-ORDER-001.%" });
  assert.equal(punctuation.status, "found");
  assert.equal(punctuation.value.totalCount, 0);
});

test("3.3: local Orders never exposes private photo locators or enters a Storage/provider seam", async () => {
  const repository = createLocalAdminOrdersReadRepository();
  const result = await repository.read({ q: "LOCAL-TEST-ORDER-001" });
  assert.equal(result.status, "found");
  const serialized = JSON.stringify(result.value);
  assert.doesNotMatch(serialized, /photoPath|privatePath|bucket|storageKey|objectKey|signedUrl/);
  assert.doesNotMatch(serialized, /sk_live|pk_live|secret|access[_-]?token|cookie/i);
  assert.match(serialized, /localSyntheticAsset/);
  assert.match(serialized, /previewAvailable/);

  const source = await readFile(new URL("../app/infrastructure/orders/local-admin-orders-read-repository.server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /getSupabaseServerClient|createSupabase|\.from\(["']orders|fetch\(|signedUrl|Storage/);
  assert.doesNotMatch(source, /LocalOrderRepository|createProductionOrder|orderRepository/);
});

test("3.1: export projection is bounded and protects synthetic text from spreadsheet formula execution", async () => {
  const fixture = createLocalAdminOrdersFixtures()[0];
  const formulaFixture = {
    ...fixture,
    publicReference: "=LOCAL-TEST-REFERENCE",
    customer: { ...fixture.customer, displayName: "@LOCAL CUSTOMER", displayEmail: "+customer@example.test" },
  };
  const result = await createLocalAdminOrdersReadRepository({ fixtures: [formulaFixture] }).readExportRows();
  assert.equal(result.status, "found");
  assert.deepEqual(result.value[0], {
    publicReference: "'=LOCAL-TEST-REFERENCE",
    customerName: "'@LOCAL CUSTOMER",
    customerEmail: "'+customer@example.test",
    paymentStatus: "paid",
    fulfillmentStatus: "awaiting_review",
    subtotalCents: 8990,
    discountCents: 0,
    shippingCents: 0,
    totalCents: 8990,
    currency: "USD",
    createdAt: "2026-08-28T08:00:00.000Z",
  });

  const minusResult = await createLocalAdminOrdersReadRepository({
    fixtures: [{ ...fixture, publicReference: "-LOCAL-TEST-REFERENCE" }],
  }).readExportRows();
  assert.equal(minusResult.status, "found");
  assert.equal(minusResult.value[0].publicReference, "'-LOCAL-TEST-REFERENCE");
});

test("3.2: empty and bounded error fixtures do not masquerade as successful data", async () => {
  const empty = await createLocalAdminOrdersReadRepository({ fixtures: [] }).read();
  assert.equal(empty.status, "found");
  assert.deepEqual(empty.value.items, []);
  assert.equal(empty.value.sourceNotice, LOCAL_ADMIN_ORDERS_SOURCE_NOTICE);

  const unavailable = await createLocalAdminOrdersReadRepository({ failure: "unavailable" }).read();
  assert.deepEqual(unavailable, { status: "unavailable", reason: "local_admin_orders_unavailable" });

  const failure = await createLocalAdminOrdersReadRepository({ failure: "source_failure" }).readExportRows();
  assert.deepEqual(failure, { status: "source_failure", operation: "admin_orders_export" });
});

test("3.4: every existing Orders control has an explicit non-mutating local disposition", () => {
  const controls = new Map(LOCAL_ADMIN_ORDER_CONTROL_DISPOSITIONS.map((entry) => [entry.control, entry]));
  assert.equal(controls.size, 7);
  assert.equal(controls.get("order_status_display").disposition, "READ_ONLY_DISPLAY");
  assert.equal(controls.get("payment_status_display").disposition, "READ_ONLY_DISPLAY");
  assert.equal(controls.get("fulfillment_status_control").disposition, "DISABLED_LOCAL_MODE");
  assert.equal(controls.get("photo_review_control").disposition, "DISABLED_LOCAL_MODE");
  assert.equal(controls.get("digital_delivery_control").disposition, "BOUNDED_UNAVAILABLE");
  assert.equal(controls.get("tracking_control").disposition, "DISABLED_LOCAL_MODE");
  assert.equal(controls.get("cleanup_uploads_control").disposition, "BOUNDED_UNAVAILABLE");

  const repository = createLocalAdminOrdersReadRepository();
  assert.equal("save" in repository, false);
  assert.equal("update" in repository, false);
  assert.equal("delete" in repository, false);
});
