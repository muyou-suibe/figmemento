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
    constraints: { min: "0", max: "10", step: "0.5" },
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
  const value = parseCustomizationValue({ fieldId: "field-number", fieldCode: "quantity", kind: "numeric", value: "2.5" });
  assert.equal(value.ok, true);
  assert.equal(validate([parsed.value], [value.value]).ok, true);
  assert.equal(validate([parsed.value], [{ ...value.value, value: "2.25" }]).ok, false);
  assert.equal(validate([parsed.value], [{ ...value.value, value: "20" }]).ok, false);
});

test("C09 rejects non-finite or inverted configuration", () => {
  assert.equal(parseCustomizationFieldDefinition({ ...field(), constraints: { min: "10", max: "1", step: "0" } }).ok, false);
  assert.equal(parseCustomizationValue({ fieldId: "field-number", fieldCode: "quantity", kind: "numeric", value: Number.NaN }).ok, false);
});

test("C09 canonical decimal strings use exact step arithmetic", () => {
  const decimal = parseCustomizationField(field({ constraints: { min: "0.1", max: "0.3", step: "0.1" } }));
  assert.equal(decimal.ok, true);
  const numeric = (value) => ({ fieldId: "field-number", fieldCode: "quantity", kind: "numeric", value });
  assert.equal(validate([decimal.value], [numeric("0.3000")]).value?.[0]?.value, "0.3");
  assert.equal(validate([decimal.value], [numeric("0.2")]).ok, true);
  assert.equal(validate([decimal.value], [numeric("0.1000")]).value?.[0]?.value, "0.1");
  assert.equal(validate([decimal.value], [numeric("0.25")]).ok, false);
  assert.equal(validate([decimal.value], [numeric("0.3001")]).ok, false);
  assert.equal(parseCustomizationValue(numeric("0.00001")).ok, false);
  assert.equal(parseCustomizationValue(numeric("1e-1")).ok, false);
  assert.equal(parseCustomizationValue(numeric(0.2)).ok, false);
  const wide = parseCustomizationField(field({ constraints: { min: "-1", max: "2", step: "0.0001" } }));
  assert.equal(validate([wide.value], [numeric("01.5000")]).value?.[0]?.value, "1.5");
  assert.equal(validate([wide.value], [numeric("-0")]).value?.[0]?.value, "0");
});

test("C10 hard policy permits only PDF/TXT and bounds count and byte size", () => {
  const file = (constraints) => ({ ...field(), kind: "generic_file", constraints });
  const valid = { allowedMimeTypes: ["application/pdf", "text/plain"], maxBytes: 20971520, minFileCount: 0, maxFileCount: 3 };
  assert.equal(parseCustomizationField(file(valid)).ok, true);
  for (const mime of ["application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
    assert.equal(parseCustomizationField(file({ ...valid, allowedMimeTypes: [mime] })).ok, false);
  }
  assert.equal(parseCustomizationField(file({ ...valid, maxBytes: 20971521 })).ok, false);
  assert.equal(parseCustomizationField(file({ ...valid, maxFileCount: 4 })).ok, false);
  assert.equal(parseCustomizationField(file({ ...valid, minFileCount: 3 })).ok, true);
});

test("C28/C29 recursive rule bounds and hidden required semantics", () => {
  const source = { ...field(), id: "field-toggle", code: "toggle", kind: "single_select", required: false, constraints: { choices: [{ id: "choice-yes", code: "yes", label: "Yes", position: 0, isActive: true }] } };
  const present = { kind: "field_present", fieldId: source.id };
  const hidden = { ...field(), id: "field-hidden", code: "hidden", kind: "short_text", required: true, constraints: { maxLength: 80 }, rules: { visibleWhen: { kind: "all", predicates: [present, { kind: "not", predicate: { kind: "not", predicate: present } }] } } };
  const parsed = parseCustomizationField(hidden);
  assert.equal(parsed.ok, true);
  assert.equal(validate([source, parsed.value], []).ok, true);
  const submitted = { fieldId: hidden.id, fieldCode: hidden.code, kind: "short_text", value: "unexpected" };
  assert.equal(validate([source, parsed.value], [submitted]).issues.some((item) => item.code === "hidden_value"), true);
  const selected = { fieldId: source.id, fieldCode: source.code, kind: "single_select", choiceId: "choice-yes" };
  assert.equal(validate([source, parsed.value], [selected]).ok, false);
  const conditional = { ...hidden, required: false, rules: { visibleWhen: present, requiredWhen: { kind: "any", predicates: [{ kind: "single_select_is", fieldId: source.id, choiceId: "choice-yes" }, { kind: "not", predicate: present }] } } };
  assert.equal(validate([source, conditional], [selected]).issues.some((item) => item.code === "conditional_required"), true);
  assert.equal(validate([source, { ...conditional, rules: { ...conditional.rules, requiredWhen: { kind: "single_select_is", fieldId: source.id, choiceId: "missing" } } }], []).ok, false);
  const nest = (depth) => depth === 1 ? present : { kind: "not", predicate: nest(depth - 1) };
  assert.equal(parseCustomizationField({ ...hidden, rules: { visibleWhen: nest(4) } }).ok, true);
  assert.equal(parseCustomizationField({ ...hidden, rules: { visibleWhen: nest(5) } }).ok, false);
  assert.equal(parseCustomizationField({ ...hidden, rules: { visibleWhen: { kind: "all", predicates: Array(31).fill(present) } } }).ok, true);
  assert.equal(parseCustomizationField({ ...hidden, rules: { visibleWhen: { kind: "all", predicates: Array(32).fill(present) } } }).ok, false);
  assert.equal(validateCustomizationRuleGraph([source, { ...hidden, rules: { visibleWhen: { kind: "field_present", fieldId: "unknown" } } }]).ok, false);
  assert.equal(validateCustomizationRuleGraph([source, { ...hidden, rules: { visibleWhen: { kind: "single_select_is", fieldId: hidden.id, choiceId: "choice-yes" } } }]).ok, false);
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

test("C10 validates a configured collection, not an owner-wide upload quota", () => {
  const constraints = { allowedMimeTypes: ["text/plain"], maxBytes: 20971520, minFileCount: 0, maxFileCount: 3 };
  const target = parseCustomizationField({ ...field(), id: "field-file", code: "file", kind: "generic_file", constraints, required: false });
  assert.equal(target.ok, true);
  const file = (receiptId) => ({ receiptId });
  const value = (files) => ({ fieldId: target.value.id, fieldCode: target.value.code, kind: "generic_file", files });
  const checked = (files, metadata) => validateCustomizationValuesAgainstFields({
    productId, configurationRevision: revision, authoritativeConfigurationRevision: revision,
    fields: [target.value], values: [value(files)], resolvedImageMetadata: [], resolvedFileMetadata: metadata,
  });
  const metadata = [1, 2, 3, 4].map((n) => ({ receiptId: `receipt-${n}`, mimeType: "text/plain", fileSizeBytes: 20971520 }));
  assert.equal(checked([file("receipt-1"), file("receipt-2"), file("receipt-3")], metadata).ok, true);
  assert.equal(checked(metadata.map((entry) => file(entry.receiptId)), metadata).issues.some((item) => item.code === "file_count_too_high"), true);
  assert.equal(checked([file("receipt-1")], [{ ...metadata[0], fileSizeBytes: 20971521 }]).issues.some((item) => item.code === "file_too_large"), true);
  assert.equal(checked([file("foreign")], metadata).issues.some((item) => item.code === "file_metadata_missing"), true);
});

test("C28/C29 use a bounded predicate graph and reject hidden values", () => {
  const source = { ...field(), id: "field-toggle", code: "toggle", kind: "single_select", required: false, constraints: { choices: [{ id: "choice-yes", code: "yes", label: "Yes", position: 0, isActive: true }] } };
  const dependent = { ...field({ id: "field-dependent", code: "note", kind: "short_text", required: false, constraints: { maxLength: 80 }, rules: { requiredWhen: { kind: "single_select_is", fieldId: "field-toggle", choiceId: "choice-yes" }, visibleWhen: { kind: "field_present", fieldId: "field-toggle" } } }) };
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
  assert.ok(manifest.schemaVersion >= 44);
  assert.equal(manifest.migrations.length, manifest.schemaVersion);
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
