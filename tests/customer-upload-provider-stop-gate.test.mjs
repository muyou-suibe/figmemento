import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const handoffPath = "../docs/customer-upload-production-provider-handoff.md";

test("Task 6.5 records an unresolved provider decision and every required deployment handoff value without inventing a provider configuration", async () => {
  const handoff = await readFile(new URL(handoffPath, import.meta.url), "utf8");
  assert.match(handoff, /PRODUCTION CUSTOMER-UPLOAD PROVIDER: UNRESOLVED/);
  assert.match(handoff, /Supabase Storage — \*\*CANDIDATE, NOT APPROVED\*\*/);
  assert.match(handoff, /Cloudflare R2 — \*\*CANDIDATE, NOT APPROVED\*\*/);
  assert.match(handoff, /Architecture approval \| \*\*NOT GRANTED\*\*/);
  assert.match(handoff, /Production adapter implementation \| \*\*STOPPED\*\*/);
  assert.match(handoff, /Production upload activation \| \*\*STOPPED\*\*/);
  for (const value of [
    "Private storage binding/bucket/container identifier",
    "Receipt/media retention for unattached temporary drafts",
    "Temporary preview-access TTL",
    "Cleanup scheduler/runtime",
    "Environment-specific binding values",
    "Activation approval",
  ]) assert.match(handoff, new RegExp(value));
  assert.match(handoff, /Automatic provider-side orphan reconciliation is \*\*NOT\n+IMPLEMENTED\*\*/);
  assert.match(handoff, /No credentials, account IDs, service-role keys, API keys, tokens, or secret\n+access keys belong in Git/);
  assert.match(handoff, /C1 remains \*\*41\/61\*\*/);
  assert.match(handoff, /BACKFILL AUTHORIZED: NO/);
  assert.doesNotMatch(handoff, /figmemento-uploads|customer-media-prod|private-uploads/i);
});

test("customer-input routes keep the disabled source fail-closed and only compose local runtime behind explicit source selection", async () => {
  const [uploadRoute, previewRoute] = await Promise.all([
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/customer-uploads/preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(uploadRoute, /readCustomerUploadConfig/);
  assert.match(uploadRoute, /configuration\.source !== "local_fake"/);
  assert.match(uploadRoute, /getSharedLocalCustomerUploadRuntime/);
  assert.match(previewRoute, /readCustomerUploadConfig/);
  assert.match(previewRoute, /configuration\.source !== "local_fake"/);
  assert.match(previewRoute, /status: 503/);
  assert.doesNotMatch(`${uploadRoute}\n${previewRoute}`, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|\.storage\.|R2Bucket|S3Client|customer-upload-fakes|customer-upload-failure-controls|customer-upload-local-smoke-harness/i);
});

test("Task 6.5 preserves provider-neutral ports and isolates local smoke/fakes from production-provider dependencies", async () => {
  const [objectStore, receiptRepository, fakes, harness] = await Promise.all([
    readFile(new URL("../app/application/customer-upload-object-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/customer-upload-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/testing/customer-upload-fakes.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/testing/customer-upload-local-smoke-harness.ts", import.meta.url), "utf8"),
  ]);
  assert.match(objectStore, /putPrivateObject/);
  assert.match(objectStore, /readPrivateObject/);
  assert.match(objectStore, /inspectPrivateObject/);
  assert.match(objectStore, /deletePrivateObject/);
  assert.match(objectStore, /opaque receipt ID to their own internal locator/);
  assert.match(receiptRepository, /authorizeCustomerInputPreview/);
  assert.doesNotMatch(`${objectStore}\n${receiptRepository}\n${fakes}\n${harness}`, /@supabase\/supabase-js|getSupabaseServerClient|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|Stripe|PayPal|createSignedUrl/i);
  assert.match(fakes, /TEST \/ LOCAL ONLY/);
  assert.match(harness, /LOCAL \/ TEST ONLY\. NON-PRODUCTION/);
});

test("Task 6.5 documents legacy Supabase Storage as compatibility evidence, never new provider approval", async () => {
  const handoff = await readFile(new URL(handoffPath, import.meta.url), "utf8");
  assert.match(handoff, /Legacy \/ historical compatibility/);
  assert.match(handoff, /Existing Supabase Storage, storage-key, signed-link, order\/admin, digital-delivery, and prototype cleanup behavior/);
  assert.match(handoff, /This is not approval evidence for the new customer-upload provider/);
  assert.match(handoff, /The local Final Batch composition is \*\*local\/offline evidence only\*\*/);
});
