import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AdminCustomizationFieldCommandBoundary,
  AdminCustomizationFieldQueryBoundary,
  parseReplaceCustomizationConfigurationIntent,
} from "../app/application/admin-customization-field-boundary.ts";

const productId = "product-frame";
const revision = "revision-current";
const principal = { role: "admin", identity: "configured-admin" };
const authorized = { async verifyAdminSession() { return { status: "authorized", principal }; } };
const unauthorized = { async verifyAdminSession() { return { status: "unauthorized" }; } };

function field(overrides = {}) {
  return {
    identity: { kind: "existing", id: "field-name", code: "name" },
    label: "Name",
    kind: "short_text",
    required: true,
    isActive: true,
    position: 0,
    constraints: { maxLength: 100 },
    ...overrides,
  };
}

function intent(overrides = {}) {
  return { productId, expectedCurrentRevision: revision, fields: [field()], ...overrides };
}

function currentConfiguration(overrides = {}) {
  return {
    productId,
    configurationRevision: revision,
    fields: [{ id: "field-name", productId, code: "name", label: "Name", kind: "short_text", required: true, isActive: false, position: 0, configurationRevision: revision, constraints: { maxLength: 100 } }],
    ...overrides,
  };
}

function repositories(options = {}) {
  const calls = { reads: 0, identityReads: 0, writes: 0, lastIntent: null };
  const reader = {
    async getCurrentConfigurationForAdmin() {
      calls.reads += 1;
      return options.current ?? { status: "found", value: currentConfiguration() };
    },
    async getStableFieldIdentitiesForAdmin(_productId, ids) {
      calls.identityReads += 1;
      return options.identities ?? { status: "found", value: ids.map((id) => ({ id, productId, code: id === "field-name" ? "name" : "other" })) };
    },
  };
  const writer = {
    async publishCustomizationConfiguration(value) {
      calls.writes += 1;
      calls.lastIntent = value;
      return options.write ?? {
        status: "applied",
        value: currentConfiguration({ configurationRevision: "revision-next" }),
        newFieldIdMappings: [],
      };
    },
  };
  return { calls, reader, writer };
}

test("authorization and malformed requests stop before privileged repository construction", async () => {
  let factories = 0;
  const query = new AdminCustomizationFieldQueryBoundary(unauthorized, () => { factories += 1; throw new Error("must not construct"); });
  const command = new AdminCustomizationFieldCommandBoundary(unauthorized, () => { factories += 1; throw new Error("must not construct"); });
  assert.deepEqual(await query.execute({ productId }), { status: "unauthorized" });
  assert.deepEqual(await command.execute(intent()), { status: "unauthorized" });

  const malformedQuery = new AdminCustomizationFieldQueryBoundary(authorized, () => { factories += 1; throw new Error("must not construct"); });
  const malformedCommand = new AdminCustomizationFieldCommandBoundary(authorized, () => { factories += 1; throw new Error("must not construct"); });
  assert.equal((await malformedQuery.execute({ productId, extra: true })).status, "invalid_request");
  assert.equal((await malformedCommand.execute({ productId, expectedCurrentRevision: revision, fields: [field({ price: 10 })] })).status, "invalid_request");
  assert.equal(factories, 0);
});

test("verifier exceptions become authentication failures before any repository construction", async () => {
  let factories = 0;
  const failing = { async verifyAdminSession() { throw new Error("unavailable"); } };
  const query = new AdminCustomizationFieldQueryBoundary(failing, () => { factories += 1; throw new Error("must not construct"); });
  const command = new AdminCustomizationFieldCommandBoundary(failing, () => { factories += 1; throw new Error("must not construct"); });
  assert.deepEqual(await query.execute({ productId }), { status: "authentication_failure" });
  assert.deepEqual(await command.execute(intent()), { status: "authentication_failure" });
  assert.equal(factories, 0);
});

test("authorized admin read preserves current inactive definitions and stable logical identities", async () => {
  const source = repositories();
  const result = await new AdminCustomizationFieldQueryBoundary(authorized, () => source.reader).execute({ productId });
  assert.equal(result.status, "found");
  assert.equal(result.value.status, "configured");
  assert.equal(result.value.configurationRevision, revision);
  assert.equal(result.value.fields[0].id, "field-name");
  assert.equal(result.value.fields[0].isActive, false);
  assert.deepEqual(result.principal, principal);
});

test("no current configuration is explicit and distinct from Product not found", async () => {
  const absent = repositories({ current: { status: "not_configured" } });
  const absentResult = await new AdminCustomizationFieldQueryBoundary(authorized, () => absent.reader).execute({ productId });
  assert.deepEqual(absentResult, { status: "found", principal, value: { status: "not_configured", productId } });

  const missing = repositories({ current: { status: "not_found" } });
  assert.deepEqual(await new AdminCustomizationFieldQueryBoundary(authorized, () => missing.reader).execute({ productId }), { status: "not_found" });

  const empty = repositories({ current: { status: "found", value: currentConfiguration({ fields: [] }) } });
  const emptyResult = await new AdminCustomizationFieldQueryBoundary(authorized, () => empty.reader).execute({ productId });
  assert.equal(emptyResult.status, "found");
  assert.equal(emptyResult.value.status, "configured");
  assert.deepEqual(emptyResult.value.fields, []);
});

test("admin read maps source failures without exposing provider details", async () => {
  const source = repositories({ current: { status: "source_failure", operation: "raw-provider-detail" } });
  assert.deepEqual(
    await new AdminCustomizationFieldQueryBoundary(authorized, () => source.reader).execute({ productId }),
    { status: "source_failure", operation: "admin_customization_field_query" },
  );
});

test("strict replacement parser accepts approved definitions and rejects duplicates or deferred authority", () => {
  assert.equal(parseReplaceCustomizationConfigurationIntent(intent()).ok, true);
  for (const invalid of [
    intent({ fields: [field(), field({ identity: { kind: "new", draftId: "new:second", code: "name" }, position: 1 })] }),
    intent({ fields: [field(), field({ identity: { kind: "new", draftId: "new:second", code: "second" } })] }),
    intent({ fields: [field(), field()] }),
    intent({ fields: [field({ identity: { kind: "new", draftId: "new:server-owned", id: "browser-uuid", code: "server-owned" } })] }),
    intent({ fields: [field({ identity: { kind: "existing", id: "field-name", code: "name" }, options: [] })] }),
    intent({ fields: [field({ identity: { kind: "existing", id: "field-name", code: "name" }, constraints: { maxLength: 10, surcharge: 99 } })] }),
    intent({ fields: [field({ identity: { kind: "existing", id: "field-name", code: "name" }, kind: "image", constraints: { allowedMimeTypes: ["image/jpeg"], maxBytes: 10, minDimensions: { width: 1, height: 1 }, minImageCount: 0, maxImageCount: 1, cropEnabled: false, provider: "x" } })] }),
  ]) {
    assert.equal(parseReplaceCustomizationConfigurationIntent(invalid).ok, false);
  }
});

test("reused stable identity requires its immutable Product-scoped code", async () => {
  const source = repositories();
  const result = await new AdminCustomizationFieldCommandBoundary(authorized, () => source).execute(
    intent({ fields: [field({ identity: { kind: "existing", id: "field-name", code: "renamed" } })] }),
  );
  assert.equal(result.status, "invalid_request");
  assert.equal(source.calls.writes, 0);
});

test("cross-Product or missing stable identities are rejected after the authoritative read", async () => {
  const source = repositories({ identities: { status: "found", value: [{ id: "field-name", productId: "product-other", code: "name" }] } });
  const result = await new AdminCustomizationFieldCommandBoundary(authorized, () => source).execute(intent());
  assert.equal(result.status, "invalid_request");
  assert.equal(result.issues.some((issue) => issue.code === "ownership"), true);
  assert.equal(source.calls.writes, 0);
});

test("new field draft intent cannot dictate a persistent UUID and reaches one atomic writer call", async () => {
  const source = repositories();
  const request = intent({
    fields: [field({ identity: { kind: "new", draftId: "new:photo", code: "photo" }, kind: "image", label: "Photo", constraints: { allowedMimeTypes: ["image/jpeg"], maxBytes: 2_000_000, minDimensions: { width: 800, height: 600 }, minImageCount: 1, maxImageCount: 1, cropEnabled: false } })],
  });
  const result = await new AdminCustomizationFieldCommandBoundary(authorized, () => source).execute(request);
  assert.equal(result.status, "applied");
  assert.equal(source.calls.writes, 1);
  assert.deepEqual(source.calls.lastIntent.fields[0].identity, { kind: "new", draftId: "new:photo", code: "photo" });
  assert.equal("id" in source.calls.lastIntent.fields[0].identity, false);
});

test("atomic publication preserves only the returned new-field draft-to-stable mapping", async () => {
  const source = repositories({
    write: {
      status: "applied",
      value: currentConfiguration({
        configurationRevision: "revision-next",
        fields: [{
          id: "field-photo-stable",
          productId,
          code: "photo",
          label: "Photo",
          kind: "image",
          required: true,
          isActive: true,
          position: 0,
          configurationRevision: "revision-next",
          constraints: {
            allowedMimeTypes: ["image/jpeg"],
            maxBytes: 2_000_000,
            minDimensions: { width: 800, height: 600 },
            minImageCount: 1,
            maxImageCount: 1,
            cropEnabled: false,
          },
        }],
      }),
      newFieldIdMappings: [{ draftId: "new:photo", stableFieldId: "field-photo-stable" }],
    },
  });
  const result = await new AdminCustomizationFieldCommandBoundary(authorized, () => source).execute(
    intent({
      fields: [field({
        identity: { kind: "new", draftId: "new:photo", code: "photo" },
        label: "Photo",
        kind: "image",
        constraints: {
          allowedMimeTypes: ["image/jpeg"],
          maxBytes: 2_000_000,
          minDimensions: { width: 800, height: 600 },
          minImageCount: 1,
          maxImageCount: 1,
          cropEnabled: false,
        },
      })],
    }),
  );
  assert.equal(result.status, "applied");
  assert.deepEqual(result.newFieldIdMappings, [{ draftId: "new:photo", stableFieldId: "field-photo-stable" }]);
  assert.equal(result.value.fields[0].id, "field-photo-stable");
});

test("stale or absent-current expectation conflicts do not write", async () => {
  const stale = repositories();
  assert.deepEqual(
    await new AdminCustomizationFieldCommandBoundary(authorized, () => stale).execute(intent({ expectedCurrentRevision: "revision-old" })),
    { status: "stale_revision" },
  );
  assert.equal(stale.calls.writes, 0);

  const appeared = repositories();
  assert.deepEqual(
    await new AdminCustomizationFieldCommandBoundary(authorized, () => appeared).execute(intent({ expectedCurrentRevision: null })),
    { status: "stale_revision" },
  );
  assert.equal(appeared.calls.writes, 0);

  const disappeared = repositories({ current: { status: "not_configured" } });
  assert.deepEqual(
    await new AdminCustomizationFieldCommandBoundary(authorized, () => disappeared).execute(intent()),
    { status: "stale_revision" },
  );
  assert.equal(disappeared.calls.writes, 0);
});

test("a null revision is valid only when there is no current configuration", async () => {
  const source = repositories({ current: { status: "not_configured" } });
  const result = await new AdminCustomizationFieldCommandBoundary(authorized, () => source).execute(
    intent({ expectedCurrentRevision: null }),
  );
  assert.equal(result.status, "applied");
  assert.equal(source.calls.writes, 1);
  assert.equal(source.calls.lastIntent.expectedCurrentRevision, null);
});

test("an atomic writer stale result is safe when the revision changes after revalidation", async () => {
  const source = repositories({ write: { status: "stale_revision" } });
  assert.deepEqual(
    await new AdminCustomizationFieldCommandBoundary(authorized, () => source).execute(intent()),
    { status: "stale_revision" },
  );
  assert.equal(source.calls.writes, 1);
});

test("writer source failures are safe and no partial success result is created", async () => {
  const source = repositories({ write: { status: "source_failure", operation: "raw-provider-detail" } });
  assert.deepEqual(
    await new AdminCustomizationFieldCommandBoundary(authorized, () => source).execute(intent()),
    { status: "source_failure", operation: "admin_customization_field_command" },
  );
  assert.equal(source.calls.writes, 1);
});

test("admin boundary has no infrastructure, legacy, private-upload, or catalog-price dependency", async () => {
  const source = await readFile(
    new URL("../app/application/admin-customization-field-boundary.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /@supabase\/supabase-js|customization_schema|customer_upload|customization_draft|order_upload|storage|product_assets|product_variants|product_options|price|currency|surcharge|migration|\.sql/i);
});
