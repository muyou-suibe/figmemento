import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readLocalFulfillmentConfig } from "../app/config/local-fulfillment-runtime.ts";
import {
  createLocalFulfillmentState,
  projectLocalFulfillmentState,
} from "../app/domain/local-fulfillment.ts";

const sourcePaths = [
  "app/config/local-fulfillment-runtime.ts",
  "app/domain/local-fulfillment.ts",
  "app/application/local-fulfillment-repository.ts",
  "app/application/local-fulfillment-customer-service.ts",
  "app/application/local-fulfillment-operator-service.ts",
  "app/infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts",
  "app/server/local-fulfillment-http.server.ts",
  "app/server/local-fulfillment-customer-http.server.ts",
  "app/server/local-fulfillment-operator-http.server.ts",
  "app/server/local-fulfillment-runtime.server.ts",
  "app/server/local-fulfillment-operator.server.ts",
  "app/server/local-fulfillment-development-operator.server.ts",
];

test("Batch A Fulfillment boundaries are pure/offline and do not call provider or persistence networks", async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("provider network is forbidden in Batch A");
  };
  try {
    const config = readLocalFulfillmentConfig({ LOCAL_FULFILLMENT_SOURCE: "local_fake" }, "test");
    const state = createLocalFulfillmentState({
      internalOrderId: "order-provider-stop-gate",
      publicOrderReference: "FM-LOCAL-ABCDEF0123456789",
      status: "photo_review",
      currentPreview: null,
      revisionRequestsUsed: 0,
      createdAt: "2026-08-26T10:00:00.000Z",
      updatedAt: "2026-08-26T10:00:00.000Z",
    });
    const projection = projectLocalFulfillmentState(state, "operator");
    assert.equal(config.source, "local_fake");
    assert.equal(projection.status, "found");
    assert.equal(fetchCalls, 0);
  } finally {
    if (previousFetch) globalThis.fetch = previousFetch;
    else delete globalThis.fetch;
  }
});

test("Batch A sources do not import legacy/provider/persistence boundaries or introduce production fulfillment states", async () => {
  const source = (await Promise.all(sourcePaths.map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:supabase|stripe|paypal|resend|17track|cloudflare|storage|orders|tracking)[^"']*["']/i);
  assert.doesNotMatch(source, /(?:globalThis\.)?fetch\s*\(/i);
  assert.doesNotMatch(source, /\b(?:shipped|in_transit|delivered|returned|refunded|order_items|supplier|factory|erp|migration|SQL|PaymentIntent|webhook|shipment|carrier|17TRACK)\b/i);
  assert.doesNotMatch(source, /(?:NEXT_PUBLIC_.*(?:FULFILLMENT|OPERATOR)|localStorage|sessionStorage|document\.cookie|password|secret|token|createClient|writeFile|readFile)/i);
});

test("Fulfillment source has no production provider, persistence, or downstream shipping operation", async () => {
  const source = (await Promise.all(sourcePaths.map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /(?:\b(?:Stripe|PayPal|Supabase|Resend|17TRACK|PaymentIntent|webhook|supplier|factory|ERP|procurement|warehouse|routing|shipment|delivery)\b|provider\s+client)/i);
  assert.doesNotMatch(source, /(?:\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\bfetch\s*\(|Deno\.serve|process\.cwd\s*\()/i);
  assert.doesNotMatch(source, /\b(?:shipment_created|shipped|in_transit|delivered)\b/i);
  assert.ok(sourcePaths.every((path) => !path.includes("admin")), "Fulfillment boundary must not expand the Admin surface");
});
