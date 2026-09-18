import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  parseCustomizationField,
  parseCustomizationFieldDefinition,
} from "../app/domain/customization-field.ts";
import {
  isCustomizationFieldVisible,
  validateCustomizationRuleGraph,
  validateCustomizationValuesAgainstFields,
} from "../app/domain/customization-validation.ts";
import { parseCustomizationValue } from "../app/domain/customization-value.ts";

const productId = "product-numeric-file";
const revision = "customization-v2";

function field(overrides = {}) {
  return {
    id: "field-number",
    productId,
    code: "quantity",
    label: "Quantity",
    kind: "numeric",
    required: true,
    isActive: true,
    position: 0,
    configurationRevision: revision,
    constraints: { min: 0, max: 10, step: 0.5 },
    ...overrides,
  };
}

function validate(fields, values) {
  return validateCustomizationValuesAgainstFields({
    productId,
    configurationRevision: revision,
    authoritativeConfigurationRevision: revision,
    fields,
    values,
    resolvedImageMetadata: [],
    resolvedFileMetadata: [{ receiptId: "receipt-pdf", mimeType: "application/pdf", fileSizeBytes: 1200 }],
  });
}

test("C09 parses bounded numeric constraints and normalizes valid values", () => {
  const parsed = parseCustomizationField(field());
  assert.equal(parsed.ok, true);
  const value = parseCustomizationValue({ fieldId: "field-number", fieldCode: "quantity", kind: "numeric", value: 2.5 });
  assert.equal(value.ok, true);
  assert.equal(validate([parsed.value], [value.value]).ok, true);
  assert.equal(validate([parsed.value], [{ ...value.value, value: 2.25 }]).ok, false);
  assert.equal(validate([parsed.value], [{ ...value.value, value: 20 }]).ok, false);
});

test("C09 rejects non-finite or inverted configuration", () => {
  assert.equal(parseCustomizationFieldDefinition({ ...field(), constraints: { min: 10, max: 1, step: 0 } }).ok, false);
  assert.equal(parseCustomizationValue({ fieldId: "field-number", fieldCode: "quantity", kind: "numeric", value: Number.NaN }).ok, false);
});

test("C10 accepts only opaque private-file receipt references and trusted metadata", () => {
  const parsed = parseCustomizationField({
    id: "field-file",
    productId,
    code: "document",
    label: "Document",
    kind: "generic_file",
    required: true,
    isActive: true,
    position: 1,
    configurationRevision: revision,
    constraints: { allowedMimeTypes: ["application/pdf"], maxBytes: 5000, minFileCount: 1, maxFileCount: 1 },
  });
  assert.equal(parsed.ok, true);
  const value = parseCustomizationValue({ fieldId: "field-file", fieldCode: "document", kind: "generic_file", files: [{ receiptId: "receipt-pdf" }] });
  assert.equal(value.ok, true);
  assert.equal(validate([parsed.value], [value.value]).ok, true);
  assert.equal(validate([parsed.value], [value.value]).ok, true);
  assert.equal(parseCustomizationValue({ ...value.value, files: [{ receiptId: "receipt-pdf", objectUrl: "https://example.test/private" }] }).ok, false);
});

test("C28/C29 use a bounded predicate graph and reject hidden values", () => {
  const source = { ...field(), id: "field-toggle", code: "toggle", kind: "single_select", required: false, constraints: { choices: [{ id: "choice-yes", code: "yes", label: "Yes", position: 0, isActive: true }] } };
  const dependent = { ...field({ id: "field-dependent", code: "note", kind: "short_text", required: false, constraints: { maxLength: 80 }, rules: { requiredWhen: { kind: "choice_selected", fieldId: "field-toggle", choiceId: "choice-yes" }, visibleWhen: { kind: "field_present", fieldId: "field-toggle" } } }) };
  const graph = validateCustomizationRuleGraph([source, dependent]);
  assert.equal(graph.ok, true);
  assert.equal(isCustomizationFieldVisible(dependent, [{ fieldId: "field-toggle", fieldCode: "toggle", kind: "single_select", choiceId: "choice-yes" }]), true);
  const missing = validate([source, dependent], [{ fieldId: "field-toggle", fieldCode: "toggle", kind: "single_select", choiceId: "choice-yes" }]);
  assert.equal(missing.ok, false);
  assert.equal(missing.issues.some((issue) => issue.code === "conditional_required"), true);
  const hiddenGraph = { ...field({ id: "field-hidden", code: "hidden", kind: "short_text", required: false, constraints: { maxLength: 80 }, rules: { visibleWhen: { kind: "field_present", fieldId: "field-toggle" } } }) };
  assert.equal(validateCustomizationRuleGraph([hiddenGraph]).ok, false);
  const cyclic = [{ ...source, rules: { visibleWhen: { kind: "field_present", fieldId: "field-dependent" } } }, dependent];
  assert.equal(validateCustomizationRuleGraph(cyclic).ok, false);
});

test("C28/C29 do not accept arbitrary expression authority", () => {
  const parsed = parseCustomizationFieldDefinition({ ...field(), rules: { visibleWhen: { kind: "script", value: "return true" } } });
  assert.equal(parsed.ok, false);
});

test("Phase 1 customization migration 0044 is ordered and checksum-bound", async () => {
  const manifest = JSON.parse(await readFile(new URL("../local/commerce/migrations/manifest.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../local/commerce/migrations/0044_local-commerce-customization-numeric-file-rules.sql", import.meta.url), "utf8");
  const entry = manifest.migrations.find((candidate) => candidate.version === 44);
  assert.equal(manifest.schemaVersion, 44);
  assert.equal(manifest.migrations.length, 44);
  assert.equal(entry.filename, "0044_local-commerce-customization-numeric-file-rules.sql");
  assert.equal(entry.checksum, createHash("sha256").update(migration).digest("hex"));
  assert.doesNotMatch(migration, /^\s*(begin|commit)\s*;\s*$/im);
  assert.match(migration, /generic_file/);
  assert.match(migration, /numeric/);
  assert.match(migration, /create table local_commerce\.generic_file_receipts/);
  assert.match(migration, /create table local_commerce\.order_item_generic_file_receipt_bindings/);
  assert.match(migration, /alter table local_commerce\.generic_file_receipts enable row level security/);
  assert.match(migration, /revoke all on local_commerce\.generic_file_receipts from public, anon, authenticated/);
  assert.match(migration, /create or replace function local_commerce\.generic_file_command/);
  assert.match(migration, /grant execute on function local_commerce\.generic_file_command/);
});
