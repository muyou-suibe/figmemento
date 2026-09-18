import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCustomizationField } from "../app/domain/customization-field.ts";
import { parseCustomizationValue, parseCustomizationValues } from "../app/domain/customization-value.ts";
import { validateCustomizationValuesAgainstFields } from "../app/domain/customization-validation.ts";
import { createProductCustomizationDraft, evaluateProductCustomizationDraft, reduceProductCustomizationDraft } from "../app/domain/product-customization-draft.ts";
import { calculateCustomizationPricing } from "../app/application/customization-surcharge-pricing.ts";
import { normalizeCustomizationFieldConfiguration } from "../app/application/customization-field-repository.ts";
import { addCustomizationEditorField, defaultCustomizationConstraints } from "../app/application/admin-customization-field-editor-state.ts";

const productId = "product-c08";
const revision = "configuration-c08-v1";
const choices = [
  { id: "choice-a", code: "a", label: "A", position: 2, isActive: true },
  { id: "choice-b", code: "b", label: "B", position: 0, isActive: true },
  { id: "choice-c", code: "c", label: "C", position: 1, isActive: true },
  { id: "choice-retired", code: "retired", label: "Retired", position: 3, isActive: false },
];

function multiField(overrides = {}) {
  const result = parseCustomizationField({
    id: "field-addons", productId, code: "addons", label: "Add-ons", kind: "multi_select",
    required: true, isActive: true, position: 0, configurationRevision: revision,
    constraints: { choices, minSelections: 1, maxSelections: 3, helpText: "Choose your details." },
    ...overrides,
  });
  assert.equal(result.ok, true);
  return result.value;
}

function value(choiceIds) {
  return { fieldId: "field-addons", fieldCode: "addons", kind: "multi_select", choiceIds };
}

function validate(field, rawValue) {
  const parsed = parseCustomizationValues([rawValue]);
  assert.equal(parsed.ok, true);
  return validateCustomizationValuesAgainstFields({
    productId, configurationRevision: revision, authoritativeConfigurationRevision: revision,
    fields: [field], values: parsed.value, resolvedImageMetadata: [],
  });
}

test("C08 parser enforces shared choice identity, bounds, requiredness, and active readiness", () => {
  const field = multiField();
  assert.deepEqual(field.constraints.choices.map((choice) => choice.id), ["choice-b", "choice-c", "choice-a", "choice-retired"]);
  for (const constraints of [
    { required: true, constraints: { choices, minSelections: 0, maxSelections: 3 } },
    { required: false, constraints: { choices, minSelections: 4, maxSelections: 3 } },
    { required: false, constraints: { choices: choices.slice(0, 2), minSelections: 1, maxSelections: 3 } },
    { required: false, constraints: { choices: [{ ...choices[0], position: 0 }, { ...choices[1], position: 0 }], minSelections: 1, maxSelections: 2 } },
    { required: false, constraints: { choices, minSelections: 1, maxSelections: 1 } },
  ]) {
    assert.equal(parseCustomizationField({ id: "field-addons", productId, code: "addons", label: "Add-ons", kind: "multi_select", required: constraints.required, isActive: true, position: 0, configurationRevision: revision, constraints: constraints.constraints }).ok, false);
  }
  assert.equal(parseCustomizationField({ id: "field-addons", productId, code: "addons", label: "Add-ons", kind: "multi_select", required: false, isActive: false, position: 0, configurationRevision: revision, constraints: { choices: [{ ...choices[0], isActive: false }], minSelections: 0, maxSelections: 1 } }).ok, true);
});

test("C08 value is exact, rejects duplicate/injected facts, and validates cardinality and activity", () => {
  const field = multiField();
  assert.equal(parseCustomizationValue(value(["choice-a", "choice-b"])).ok, true);
  for (const invalid of [
    { ...value(["choice-a", "choice-a"]), choiceCodes: ["a", "a"] },
    { ...value(["choice-a", "choice-a"]) },
    { ...value(["choice-a"]), choiceLabels: ["A"] },
    value(["choice-retired"]),
    value(["choice-unknown"]),
    value([]),
  ]) assert.equal(parseCustomizationValue(invalid).ok && validate(field, invalid).ok, false);
  assert.equal(validate(field, value(["choice-a", "choice-b"])).ok, true);
  assert.equal(validate(field, value(["choice-b", "choice-c", "choice-a"])).value[0].choiceIds.join(","), "choice-b,choice-c,choice-a");
  const optional = multiField({ required: false, constraints: { choices, minSelections: 0, maxSelections: 3 } });
  const empty = validate(optional, value([]));
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.value, []);
  assert.equal(validate(multiField({ constraints: { choices, minSelections: 2, maxSelections: 3 } }), value(["choice-a"])).ok, false);
});

test("C08 canonical order is immediate, optional empty is removed, and Variant/SKU remain independent", () => {
  const field = multiField();
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  draft = reduceProductCustomizationDraft(draft, { type: "set_variant_selection", selection: { variantId: "variant-fixed", skuCode: "SKU-FIXED" } });
  draft = reduceProductCustomizationDraft(draft, { type: "set_multi_select_value", value: value(["choice-a", "choice-b"]) });
  const evaluated = evaluateProductCustomizationDraft(draft, { productId, configurationRevision: revision, fields: [field] }, "2026-09-18T00:00:00.000Z");
  assert.equal(evaluated.state, "ready");
  assert.deepEqual(evaluated.normalizedValues[0].choiceIds, ["choice-b", "choice-a"]);
  assert.equal(draft.selectedVariant.skuCode, "SKU-FIXED");
  draft = reduceProductCustomizationDraft(draft, { type: "set_multi_select_value", value: value([]) });
  assert.equal(draft.values.length, 0);
});

test("C08 C03 field_present allocates once regardless of selected-choice count", () => {
  const field = multiField({ required: false, constraints: { choices, minSelections: 0, maxSelections: 3 } });
  const variant = { id: "variant-c08", productId, skuCode: "SKU-C08", priceCents: 1000, currency: "USD", selectedOptions: [], isActive: true, isAvailable: true };
  const rules = [{ ruleKey: "c08-field-present", ruleRevision: 1, productId, configurationRevision: revision, selector: { kind: "field_present", fieldId: field.id }, amountCents: 125, currency: "USD" }];
  const make = (choiceIds) => calculateCustomizationPricing({ productId, variant, configuration: { productId, configurationRevision: revision, fields: [field] }, handoff: { productId, variantId: variant.id, skuCode: variant.skuCode, selectedOptions: [], configurationRevision: revision, customizationValues: choiceIds.length ? [value(choiceIds)] : [] }, rules });
  assert.equal(make([]).value.totalSurchargeCents, 0);
  assert.equal(make(["choice-b"]).value.totalSurchargeCents, 125);
  assert.equal(make(["choice-b", "choice-c", "choice-a"]).value.totalSurchargeCents, 125);
  assert.equal(make(["choice-b", "choice-c", "choice-a"]).value.surchargeAllocations.length, 1);
});

test("C08 public projection hides inactive choices and Admin editor uses the shared choice shape", () => {
  const definition = { productId, configurationRevision: revision, fields: [multiField()] };
  const publicResult = normalizeCustomizationFieldConfiguration(productId, definition);
  assert.equal(publicResult.status, "found");
  assert.deepEqual(publicResult.value.fields[0].constraints.choices.map((choice) => choice.id), ["choice-b", "choice-c", "choice-a"]);
  assert.deepEqual(defaultCustomizationConstraints("multi_select"), {
    choices: [{ id: "new:choice-1", code: "choice-1", label: "Choice 1", position: 0, isActive: true }],
    minSelections: 0,
    maxSelections: 1,
  });
  const editor = addCustomizationEditorField([], 0, "multi_select");
  assert.equal(editor.fields[0].kind, "multi_select");
  assert.equal(editor.fields[0].label, "Choose many");
  assert.deepEqual(editor.fields[0].constraints.choices.map((choice) => choice.id), ["new:choice-1"]);
});

test("C08 migration is ordered, additive, and only extends existing pricing/snapshot seams", async () => {
  const manifest = JSON.parse(await readFile(new URL("../local/commerce/migrations/manifest.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../local/commerce/migrations/0043_local-commerce-customization-multi-select.sql", import.meta.url), "utf8");
  assert.equal(manifest.schemaVersion, 44);
  assert.equal(manifest.migrations.length, 44);
  assert.equal(manifest.migrations.find((entry) => entry.version === 43).version, 43);
  assert.equal(manifest.migrations.find((entry) => entry.version === 43).checksum, createHash("sha256").update(migration).digest("hex"));
  assert.match(migration, /multi_select/);
  assert.match(migration, /snapshot_single_select_facts/);
  assert.match(migration, /choiceIds/);
  assert.doesNotMatch(migration, /create table|alter table|selectedSpecificationKey|stripe|paypal/i);
});
