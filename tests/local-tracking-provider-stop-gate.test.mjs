import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readLocalTrackingConfig } from "../app/config/local-tracking-runtime.ts";
import { resolveLocalTrackingOperatorAuthority } from "../app/server/local-tracking-operator.server.ts";

const sourcePaths = [
  "app/config/local-tracking-runtime.ts",
  "app/server/local-tracking-operator.server.ts",
];

const trackingImplementationPaths = [
  "app/application/local-tracking-customer-service.ts",
  "app/application/local-tracking-operator-service.ts",
  "app/application/local-tracking-repository.ts",
  "app/client/local-tracking-selector-lifecycle.ts",
  "app/config/local-tracking-runtime.ts",
  "app/domain/local-tracking.ts",
  "app/infrastructure/local-tracking/local-memory-local-tracking-repository.server.ts",
  "app/server/local-tracking-customer-http.server.ts",
  "app/server/local-tracking-development-operator.server.ts",
  "app/server/local-tracking-operator-http.server.ts",
  "app/server/local-tracking-operator.server.ts",
  "app/server/local-tracking-runtime.server.ts",
  "app/api/local-tracking/[reference]/route.ts",
  "app/api/local-tracking/operator/[reference]/route.ts",
  "app/local-tracking/operator/page.tsx",
  "app/storefront/LocalTrackingExperience.tsx",
];

test("Tracking Batch A is offline and does not fall back to a provider", async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("provider network is forbidden in Tracking Batch A");
  };
  try {
    const configuration = readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_fake" }, "test");
    const authorization = resolveLocalTrackingOperatorAuthority(configuration, undefined);
    assert.equal(configuration.source, "local_fake");
    assert.deepEqual(authorization, { status: "unauthorized" });
    assert.equal(fetchCalls, 0);
  } finally {
    if (previousFetch) globalThis.fetch = previousFetch;
    else delete globalThis.fetch;
  }
});

test("Tracking Batch A modules contain no persistence, provider, or deployment operations", async () => {
  const source = (await Promise.all(sourcePaths.map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:supabase|stripe|paypal|resend|17track|cloudflare|storage|orders|fulfillment|shipment)[^"']*["']/i);
  assert.doesNotMatch(source, /(?:globalThis\.)?fetch\s*\(/i);
  assert.doesNotMatch(source, /\b(?:SQL|migration|order_items|supplier|factory|erp|warehouse|webhook|17TRACK|AfterShip|EasyPost|Shippo|UPS|FedEx|DHL|USPS|trackingNumber|shipmentStatus)\b/i);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage|document\.cookie|password|secret|token|createClient|writeFile|readFile)/i);
});

test("Tracking Batch A has no lifecycle or mutable upstream state", async () => {
  const source = (await Promise.all(sourcePaths.map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /\b(?:shipment_created|shipped|in_transit|delivered|quality_check|paid|succeeded)\b/);
  assert.doesNotMatch(source, /(?:\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\bfetch\s*\()/i);
});

test("current Tracking implementation remains provider-, persistence-, and deployment-stopped", async () => {
  const sourceByPath = new Map(await Promise.all(trackingImplementationPaths.map(async (path) => [
    path,
    await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
  ])));
  const source = [...sourceByPath.values()].join("\n");
  const serverSource = trackingImplementationPaths
    .filter((path) => path.startsWith("app/application/") || path.startsWith("app/infrastructure/") || path.startsWith("app/server/") || path.startsWith("app/api/"))
    .map((path) => sourceByPath.get(path) ?? "")
    .join("\n");

  assert.doesNotMatch(source, /(?:from|import|require)\s*["'`](?:[^"'`]*\/)?(?:@supabase|supabase-js|stripe|paypal|resend|17track|aftership|easypost|shippo|ups|fedex|dhl|usps|cloudflare|r2|d1|drizzle|sqlite)[^"'`]*["'`]/i);
  assert.doesNotMatch(source, /(?:https?:\/\/|wss?:\/\/)[^\s"'`]*(?:17track|aftership|easypost|shippo|ups|fedex|dhl|usps|supabase|stripe|paypal|resend|cloudflare|r2|d1|drizzle|sqlite)[^\s"'`]*/i);
  assert.doesNotMatch(source, /(?:17track|aftership|easypost|shippo|ups|fedex|dhl|usps|supabase|stripe|paypal|resend|cloudflare|r2|d1|drizzle|sqlite)[^\n;]*(?:api|client|endpoint|webhook|poll|token|key|request|response)/i);
  assert.doesNotMatch(source, /(?:supplier|factory|erp|warehouse|dns|deployment|postage|customs|backfill)[^\n;]*(?:api|client|endpoint|webhook|poll|token|key|request|response|write|create|update|delete)/i);
  assert.doesNotMatch(serverSource, /\bfetch\s*\(|\b(?:insert|update|delete|truncate)\s*\(/i);
  assert.doesNotMatch(source, /writeFile|readFile|localStorage|sessionStorage|document\.cookie/i);
});
