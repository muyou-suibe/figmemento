import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  AdminCustomizationFieldRestoreBoundary,
  parseRestoreCustomizationConfigurationIntent,
  parseReplaceCustomizationConfigurationIntent,
} from "../app/application/admin-customization-field-boundary.ts";
import { resolveAuthorizedAdminCustomizationSource, resolveAuthorizedAdminCatalogSource } from "../app/server/admin-source-resolution.server.ts";
import { defaultCustomizationConstraints } from "../app/application/admin-customization-field-editor-state.ts";
import { localPersistentApiKeyFetch } from "../app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";

const productId = "h03-product";
const principal = { role: "admin", identity: "configured-admin" };
const authorized = { async verifyAdminSession() { return { status: "authorized", principal }; } };

test("H03 selects persistent customization without redirecting general Catalog authority", () => {
  const previous = process.env.ADMIN_ACCEPTANCE_SOURCE;
  const previousMode = process.env.NODE_ENV;
  try {
    process.env.ADMIN_ACCEPTANCE_SOURCE = "local_persistent";
    process.env.NODE_ENV = "test";
    assert.equal(resolveAuthorizedAdminCustomizationSource(() => "production", () => "fake", () => "persistent"), "persistent");
    assert.equal(resolveAuthorizedAdminCatalogSource(() => "production", () => "fake"), "fake");
  } finally {
    if (previous === undefined) delete process.env.ADMIN_ACCEPTANCE_SOURCE; else process.env.ADMIN_ACCEPTANCE_SOURCE = previous;
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
  }
});

test("H03 restore selector is bounded and does not accept caller-owned facts", () => {
  assert.deepEqual(parseRestoreCustomizationConfigurationIntent({ productId, expectedCurrentRevision: "2", restoreFromRevision: 1 }),
    { ok: true, value: { productId, expectedCurrentRevision: "2", restoreFromRevision: 1 } });
  for (const candidate of [
    { productId, expectedCurrentRevision: "2", restoreFromRevision: 0 },
    { productId, expectedCurrentRevision: "2", restoreFromRevision: 1, fields: [] },
    { productId, expectedCurrentRevision: null, restoreFromRevision: 1 },
  ]) assert.equal(parseRestoreCustomizationConfigurationIntent(candidate).ok, false);
});

test("H03 restore authorizes before constructing a privileged repository", async () => {
  let constructed = 0;
  const boundary = new AdminCustomizationFieldRestoreBoundary(
    { async verifyAdminSession() { return { status: "unauthorized" }; } },
    () => { constructed++; throw Error("must not construct"); },
  );
  assert.deepEqual(await boundary.execute({ productId, expectedCurrentRevision: "2", restoreFromRevision: 1 }), { status: "unauthorized" });
  assert.equal(constructed, 0);
});

test("H03 restore passes only the typed selector and verified principal to the repository", async () => {
  const calls = [];
  const boundary = new AdminCustomizationFieldRestoreBoundary(authorized, () => ({
    reader: {},
    writer: { async restoreCustomizationConfiguration(intent, actor) {
      calls.push({ intent, actor });
      return { status: "stale_revision" };
    } },
  }));
  assert.deepEqual(await boundary.execute({ productId, expectedCurrentRevision: "2", restoreFromRevision: 1 }), { status: "stale_revision" });
  assert.deepEqual(calls, [{ intent: { productId, expectedCurrentRevision: "2", restoreFromRevision: 1 }, actor: principal }]);
});

test("H03 fixed field-present surcharge remains typed and rejects browser pricing expansion", () => {
  const base = { productId, expectedCurrentRevision: null, fields: [{
    identity: { kind: "new", draftId: "new:image", code: "photo" }, label: "Photo", kind: "image",
    required: true, isActive: true, position: 0,
    constraints: { allowedMimeTypes: ["image/png"], maxBytes: 1000000,
      minDimensions: { width: 100, height: 100 }, minImageCount: 1, maxImageCount: 1, cropEnabled: true },
  }] };
  const fixed = { ruleKey: "new:rule", expectedRevision: null, fieldId: "new:image", amountCents: 250, currency: "USD" };
  assert.equal(parseReplaceCustomizationConfigurationIntent({ ...base, surchargeRules: [fixed] }).ok, true);
  assert.equal(parseReplaceCustomizationConfigurationIntent({ ...base, surchargeRules: [{ ...fixed, selector: { kind: "selection_value" } }] }).ok, false);
  assert.equal(parseReplaceCustomizationConfigurationIntent({ ...base, surchargeRules: [{ ...fixed, amountCents: 2.5 }] }).ok, false);
});

test("H03 field-present surcharge accepts all Phase 1 field kinds without accepting inactive or unknown targets", () => {
  for (const kind of ["single_select", "multi_select", "numeric", "generic_file"]) {
    const fieldId = `new:${kind}`;
    const field = {
      identity: { kind: "new", draftId: fieldId, code: `h03_${kind}` },
      label: kind, kind, required: false, isActive: true, position: 0,
      constraints: defaultCustomizationConstraints(kind),
    };
    const base = { productId, expectedCurrentRevision: null, fields: [field] };
    const fixed = { ruleKey: `new:rule-${kind}`, expectedRevision: null, fieldId, amountCents: 250, currency: "USD" };
    assert.equal(parseReplaceCustomizationConfigurationIntent({ ...base, surchargeRules: [fixed] }).ok, true, kind);
    assert.equal(parseReplaceCustomizationConfigurationIntent({ ...base, fields: [{ ...field, isActive: false }], surchargeRules: [fixed] }).ok, false, `${kind} inactive`);
    assert.equal(parseReplaceCustomizationConfigurationIntent({ ...base, surchargeRules: [{ ...fixed, fieldId: "missing" }] }).ok, false, `${kind} unknown`);
    assert.equal(parseReplaceCustomizationConfigurationIntent({ ...base, surchargeRules: [{ ...fixed, selector: { kind: "selection_value" } }] }).ok, false, `${kind} selector`);
    assert.equal(parseReplaceCustomizationConfigurationIntent({ ...base, surchargeRules: [{ ...fixed, amountCents: 2.5 }] }).ok, false, `${kind} browser amount`);
  }
});

test("H03 SQL only grants restricted RPCs to service_role and guards immutable history", async () => {
  const sql = await readFile(new URL("../local/commerce/migrations/0045_local-commerce-admin-customization-authority.sql", import.meta.url), "utf8");
  assert.match(sql, /guard_customization_snapshot_history/);
  assert.match(sql, /customization snapshot facts are immutable/);
  assert.match(sql, /for update/);
  assert.match(sql, /revoke all on function local_commerce\.admin_customization_publish\([^\n]+ from public,anon,authenticated/);
  assert.match(sql, /grant execute on function local_commerce\.admin_customization_publish\([^\n]+ to service_role/);
  assert.match(sql, /restored_from_revision/);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/i);
});

test("H03 0046 forward-replaces only the seven-kind field-present eligibility check", async () => {
  const prior = await readFile(new URL("../local/commerce/migrations/0045_local-commerce-admin-customization-authority.sql", import.meta.url), "utf8");
  const next = await readFile(new URL("../local/commerce/migrations/0046_local-commerce-admin-customization-surcharge-field-kinds.sql", import.meta.url), "utf8");
  const priorFunction = prior.slice(prior.indexOf("create function local_commerce.admin_customization_publish("));
  const expected = priorFunction
    .replace("create function local_commerce.admin_customization_publish(", "create or replace function local_commerce.admin_customization_publish(")
    .replace("f->>'kind' in ('image','short_text','long_text')",
      "f->>'kind' in ('image','short_text','long_text','single_select','multi_select','numeric','generic_file')");
  assert.equal(next, expected);
  assert.match(next, /'selector',jsonb_build_object\('kind','field_present'/);
  assert.doesNotMatch(next, /selection_value/);
});

test("H03 local API key transport preserves legacy JWT and never sends opaque keys as Bearer", async () => {
  for (const [key, expectedBearer] of [
    ["legacy.jwt.fixture", true],
    ["sb_secret_fixture_only", false],
    ["sb_publishable_fixture_only", false],
  ]) {
    const requests = [];
    const transport = async (_input, init) => {
      requests.push(new Headers(init.headers));
      return new Response("false", { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = createClient("http://127.0.0.1:54321", key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: localPersistentApiKeyFetch(key, transport) },
    });
    const result = await client.schema("local_commerce").rpc("verify_project_identity", {
      p_project_id: "fixture", p_marker_digest: "0".repeat(64),
    });
    assert.equal(result.error, null);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].get("apikey"), key);
    assert.equal(requests[0].get("authorization"), expectedBearer ? `Bearer ${key}` : null);
    assert.equal(JSON.stringify(result).includes(key), false);
  }
});
