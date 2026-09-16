import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  addCustomizationEditorField,
  defaultCustomizationConstraints,
  editorFieldsFromConfiguration,
  moveCustomizationEditorField,
  reconcileCustomizationEditorPublication,
  removeOrToggleCustomizationEditorField,
} from "../app/application/admin-customization-field-editor-state.ts";
import { AdminCustomizationFieldCommandBoundary, AdminCustomizationFieldQueryBoundary } from "../app/application/admin-customization-field-boundary.ts";
import {
  handleAdminCustomizationFieldMutation,
  handleAdminCustomizationFieldQuery,
} from "../app/server/admin-customization-field-http.server.ts";

const productId = "product-frame";
const revision = "revision-current";
const principal = { role: "admin", identity: "configured-admin" };
const authorized = { async verifyAdminSession() { return { status: "authorized", principal }; } };
const unauthorized = { async verifyAdminSession() { return { status: "unauthorized" }; } };

function field(overrides = {}) {
  return {
    id: "field-name",
    productId,
    code: "name",
    label: "Name",
    kind: "short_text",
    required: true,
    isActive: true,
    position: 0,
    configurationRevision: revision,
    constraints: { maxLength: 80, helpText: "Use a short name." },
    ...overrides,
  };
}

function configuration(overrides = {}) {
  return { productId, configurationRevision: revision, fields: [field()], ...overrides };
}

function repositories(options = {}) {
  const calls = { readers: 0, writes: 0, intent: null };
  return {
    calls,
    createReader() {
      calls.readers += 1;
      return {
        async getCurrentConfigurationForAdmin() { return options.read ?? { status: "found", value: configuration() }; },
        async getStableFieldIdentitiesForAdmin(_id, ids) { return { status: "found", value: ids.map((id) => ({ id, productId, code: "name" })) }; },
      };
    },
    createRepositories() {
      calls.readers += 1;
      return {
        reader: this.createReader(),
        writer: {
          async publishCustomizationConfiguration(intent) {
            calls.writes += 1;
            calls.intent = intent;
            return options.write ?? {
              status: "applied",
              value: configuration({ configurationRevision: "revision-next" }),
              newFieldIdMappings: [],
            };
          },
        },
      };
    },
  };
}

function request(body, origin = "https://photogift.test") {
  return new Request("https://photogift.test/api/admin/catalog/products/product-frame/customization", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === "https://photogift.test" ? "same-origin" : "cross-site" },
    body: JSON.stringify(body),
  });
}

test("Task 4.5 editor state loads canonical configured and not_configured forms, retaining inactive fields", () => {
  const configured = editorFieldsFromConfiguration([field({ isActive: false })]);
  assert.equal(configured[0].identity.kind, "existing");
  assert.equal(configured[0].identity.id, "field-name");
  assert.equal(configured[0].identity.code, "name");
  assert.equal(configured[0].isActive, false);
  assert.deepEqual(editorFieldsFromConfiguration([]), []);
});

test("Task 4.5 permits exactly three approved field kinds and creates request-local new draft IDs only", () => {
  let state = { fields: [], draftCounter: 0 };
  for (const kind of ["image", "short_text", "long_text"]) {
    state = addCustomizationEditorField(state.fields, state.draftCounter, kind);
  }
  assert.deepEqual(state.fields.map((item) => item.kind), ["image", "short_text", "long_text"]);
  assert.deepEqual(state.fields.map((item) => item.identity.kind), ["new", "new", "new"]);
  assert.deepEqual(state.fields.map((item) => item.identity.draftId), ["new:field-1", "new:field-2", "new:field-3"]);
  assert.equal(JSON.stringify(state).includes("randomUUID"), false);
  assert.deepEqual(defaultCustomizationConstraints("short_text"), { maxLength: 100 });
  assert.equal(defaultCustomizationConstraints("image").allowedMimeTypes.includes("image/webp"), true);
});

test("Task 4.5 deactivates/re-activates existing fields but removes unsaved drafts and normalizes complete order", () => {
  const existing = editorFieldsFromConfiguration([field()]);
  const deactivated = removeOrToggleCustomizationEditorField(existing, 0);
  assert.equal(deactivated.length, 1);
  assert.equal(deactivated[0].identity.kind, "existing");
  assert.equal(deactivated[0].isActive, false);
  assert.equal(removeOrToggleCustomizationEditorField(deactivated, 0)[0].isActive, true);

  const withDraft = addCustomizationEditorField(existing, 0, "image").fields;
  assert.equal(removeOrToggleCustomizationEditorField(withDraft, 1).length, 1);
  const moved = moveCustomizationEditorField(withDraft, 1, -1);
  assert.deepEqual(moved.map((item) => item.position), [0, 1]);
  assert.deepEqual(moved.map((item) => item.identity.code), ["field-1", "name"]);
});

test("Task 4.5 applied result replaces drafts with canonical stable identities and the new revision", () => {
  const draft = addCustomizationEditorField([], 0, "image").fields;
  const canonical = [field({ id: "field-photo", code: "photo", label: "Photo", kind: "image", configurationRevision: "revision-next", constraints: defaultCustomizationConstraints("image") })];
  const reconciled = reconcileCustomizationEditorPublication(canonical, [{ draftId: draft[0].identity.draftId, stableFieldId: "field-photo" }]);
  assert.equal(reconciled?.[0].identity.kind, "existing");
  assert.equal(reconciled?.[0].identity.id, "field-photo");
  assert.equal("draftId" in reconciled?.[0].identity, false);
  assert.equal(reconcileCustomizationEditorPublication(canonical, [{ draftId: "new:bad", stableFieldId: "missing" }]), null);
});

test("Task 4.5 protected query and mutation preserve authorization-before-privilege and one boundary writer call", async () => {
  let factories = 0;
  const unauthenticatedQuery = await handleAdminCustomizationFieldQuery(productId, {
    verifier: unauthorized,
    createReader() { factories += 1; throw new Error("must not construct"); },
    createRepositories() { factories += 1; throw new Error("must not construct"); },
  });
  assert.equal(unauthenticatedQuery.status, 401);
  const unauthenticatedWrite = await handleAdminCustomizationFieldMutation(request({ expectedCurrentRevision: revision, fields: [] }), productId, {
    verifier: unauthorized,
    createReader() { factories += 1; throw new Error("must not construct"); },
    createRepositories() { factories += 1; throw new Error("must not construct"); },
  });
  assert.equal(unauthenticatedWrite.status, 401);
  assert.equal(factories, 0);

  const failingVerifier = { async verifyAdminSession() { throw new Error("raw auth failure"); } };
  const failedAuthentication = await handleAdminCustomizationFieldMutation(request({ expectedCurrentRevision: revision, fields: [] }), productId, {
    verifier: failingVerifier,
    createReader() { factories += 1; throw new Error("must not construct"); },
    createRepositories() { factories += 1; throw new Error("must not construct"); },
  });
  assert.equal(failedAuthentication.status, 401);
  assert.equal(factories, 0);

  const source = repositories();
  const query = await handleAdminCustomizationFieldQuery(productId, { verifier: authorized, createReader: () => source.createReader(), createRepositories: () => source.createRepositories() });
  assert.equal(query.status, 200);
  assert.deepEqual(await query.json(), { status: "found", value: { status: "configured", ...configuration() } });

  const mutation = await handleAdminCustomizationFieldMutation(request({ expectedCurrentRevision: revision, fields: editorFieldsFromConfiguration([field()]) }), productId, { verifier: authorized, createReader: () => source.createReader(), createRepositories: () => source.createRepositories() });
  assert.equal(mutation.status, 200);
  assert.equal(source.calls.writes, 1);
  assert.equal(source.calls.intent.productId, productId);
  assert.equal(source.calls.intent.expectedCurrentRevision, revision);
  assert.equal(source.calls.intent.fields.length, 1);
});

test("Task 4.5 query transport distinguishes unconfigured, missing, and failed admin configuration safely", async () => {
  for (const [read, status, http] of [
    [{ status: "not_configured" }, "found", 200],
    [{ status: "not_found" }, "not_found", 404],
    [{ status: "source_failure", operation: "raw sql detail" }, "source_failure", 503],
  ]) {
    const source = repositories({ read });
    const response = await handleAdminCustomizationFieldQuery(productId, {
      verifier: authorized,
      createReader: () => source.createReader(),
      createRepositories: () => source.createRepositories(),
    });
    assert.equal(response.status, http);
    const result = await response.json();
    assert.equal(result.status, status);
    assert.equal(JSON.stringify(result).includes("raw sql detail"), false);
  }
});

test("Task 4.5 stale, validation, and source failure states are bounded with no retry or provider leaks", async () => {
  for (const [write, expectedStatus, expectedHttp] of [
    [{ status: "stale_revision" }, "stale_revision", 409],
    [{ status: "invalid_configuration", issues: [{ path: "$.fields", code: "incomplete", message: "Complete replacement required." }] }, "invalid_configuration", 409],
    [{ status: "source_failure", operation: "provider password=secret" }, "source_failure", 503],
  ]) {
    const source = repositories({ write });
    const response = await handleAdminCustomizationFieldMutation(request({ expectedCurrentRevision: revision, fields: editorFieldsFromConfiguration([field()]) }), productId, { verifier: authorized, createReader: () => source.createReader(), createRepositories: () => source.createRepositories() });
    assert.equal(response.status, expectedHttp);
    const result = await response.json();
    assert.equal(result.status, expectedStatus);
    assert.equal(JSON.stringify(result).includes("password=secret"), false);
    assert.equal(source.calls.writes, 1);
  }
});

test("Task 4.5 UI and client graph do not gain forbidden authority or privileged infrastructure", async () => {
  const ui = await readFile(new URL("../app/admin/products/AdminCustomizationFieldEditor.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/admin/catalog/products/[id]/customization/route.ts", import.meta.url), "utf8");
  const server = await readFile(new URL("../app/server/admin-customization-field-http.server.ts", import.meta.url), "utf8");
  assert.match(ui, /Add image field[\s\S]*Add short text field[\s\S]*Add long text field/);
  assert.match(ui, /readOnly=\{field\.identity\.kind === "existing"\}/);
  assert.doesNotMatch(ui, /supabase-server|server-customization-configuration-writer|SupabaseCustomizationConfigurationWriter|product_options|product_variants|skuCode|priceCents|surcharge|visibleWhen|dependsOn|supplier|manufacturing instruction|bucket|storage provider|production preview|upload receipt/i);
  assert.match(route, /handleAdminCustomizationFieldQuery[\s\S]*handleAdminCustomizationFieldMutation/);
  assert.match(server, /AdminCustomizationFieldQueryBoundary[\s\S]*AdminCustomizationFieldCommandBoundary/);
  assert.doesNotMatch(server, /\.from\(|\.insert\(|\.update\(|\.delete\(/i);
});

test("Task 4.5 remains compatible with existing protected command boundary behavior", async () => {
  const source = repositories();
  const query = await new AdminCustomizationFieldQueryBoundary(authorized, () => source.createReader()).execute({ productId });
  assert.equal(query.status, "found");
  const command = await new AdminCustomizationFieldCommandBoundary(authorized, () => source.createRepositories()).execute({ productId, expectedCurrentRevision: revision, fields: editorFieldsFromConfiguration([field()]) });
  assert.equal(command.status, "applied");
  assert.equal(source.calls.writes, 1);
});
