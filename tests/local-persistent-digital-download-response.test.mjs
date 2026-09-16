import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Task 9.5 exports explicit GET and non-claiming HEAD", async () => {
  const route = await source("app/api/local-orders/[reference]/digital-delivery/download/route.ts");
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function HEAD/);
});

test("Task 9.5 recognizes probes and requires explicit download intent", async () => {
  const server = await source("app/server/local-persistent-digital-download.server.ts");
  for (const value of ["prefetch", "preload", "prerender", "x-moz", "x-figmemento-download-intent", "explicit"]) assert.match(server, new RegExp(value));
  assert.match(server, /request\.method === "HEAD"[\s\S]+safeEmpty/);
  assert.match(server, /request\.headers\.has\("range"\)[\s\S]+safeEmpty\(416\)/);
});

test("Task 9.5 successful response uses bounded private download headers", async () => {
  const server = await source("app/server/local-persistent-digital-download.server.ts");
  for (const value of ["content-disposition", "attachment", "x-content-type-options", "nosniff",
    "private, no-store", "referrer-policy", "no-referrer", "accept-ranges", "none"]) assert.match(server, new RegExp(value));
});

test("Task 9.5 exposes no locator, redirect, signed URL, or UI prefetch", async () => {
  const server = await source("app/server/local-persistent-digital-download.server.ts");
  const storefront = await source("app/storefront/FigmementoStorefrontShell.tsx").catch(() => "");
  assert.doesNotMatch(server, /createSignedUrl|publicUrl|location\s*:|redirect\s*\(/i);
  assert.doesNotMatch(storefront, /digital-delivery\/download|rel=["'](?:preload|prefetch)/i);
});
