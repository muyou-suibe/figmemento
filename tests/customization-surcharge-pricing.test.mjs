import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCustomizationPricing,
  parseCustomizationSurchargeRuleRow,
} from "../app/application/customization-surcharge-pricing.ts";

const project = "figmemento-local-commerce-test-run-ab12cd34";
const productId = "product-c03";
const variant = {
  id: "variant-c03",
  productId,
  skuCode: "C03-TEST",
  priceCents: 1000,
  currency: "USD",
  weightGrams: 1,
  isActive: true,
  isAvailable: true,
  isDefault: true,
  supplyMethod: "made_to_order",
  selectedOptions: [],
};
const configuration = {
  productId,
  configurationRevision: "1",
  fields: [
    { id: "field-text", productId, code: "caption", label: "Caption", kind: "short_text", required: false, isActive: true, position: 0, configurationRevision: "1", constraints: { maxLength: 80 } },
    { id: "field-image", productId, code: "photo", label: "Photo", kind: "image", required: false, isActive: true, position: 1, configurationRevision: "1", constraints: { allowedMimeTypes: ["image/png"], maxBytes: 1000, minDimensions: { width: 1, height: 1 }, minImageCount: 1, maxImageCount: 3, cropEnabled: true } },
  ],
};
const handoff = (customizationValues = []) => ({
  productId,
  variantId: variant.id,
  skuCode: variant.skuCode,
  selectedOptions: [],
  configurationRevision: "1",
  customizationValues,
});
const row = (ruleKey, fieldId, amountCents, overrides = {}) => ({
  project_id: project,
  id: `rule-${ruleKey}`,
  rule_key: ruleKey,
  revision: 1,
  rule_status: "active",
  lifecycle: "active",
  version: 1,
  definition: {
    kind: "customization_surcharge",
    ruleRevision: 1,
    productId,
    configurationRevision: "1",
    selector: { kind: "field_present", fieldId },
    amountCents,
    currency: "USD",
    ...overrides,
  },
});
const parseRows = (...rows) => rows.map((value) => parseCustomizationSurchargeRuleRow(value, project));
const calculate = (values, rules) => calculateCustomizationPricing({ productId, variant, configuration, handoff: handoff(values), rules });

test("C03: zero rule and optional empty values keep the base price", () => {
  for (const values of [[], [{ fieldId: "field-text", fieldCode: "caption", kind: "short_text", value: "   " }]]) {
    const result = calculate(values, []);
    assert.equal(result.status, "found");
    assert.deepEqual(result.value.surchargeAllocations, []);
    assert.equal(result.value.totalSurchargeCents, 0);
    assert.equal(result.value.finalUnitPriceCents, 1000);
  }
});

test("C03: one field charges once, two fields add, and zero cents preserves provenance", () => {
  const text = parseRows(row("text", "field-text", 125))[0];
  const image = parseRows(row("image", "field-image", 250))[0];
  const zero = parseRows(row("zero", "field-text", 0))[0];
  const values = [
    { fieldId: "field-text", fieldCode: "caption", kind: "short_text", value: "Hello" },
    { fieldId: "field-image", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-1" }, { receiptId: "receipt-2" }] },
  ];
  const result = calculate(values, [text, image]);
  assert.equal(result.status, "found");
  assert.equal(result.value.totalSurchargeCents, 375);
  assert.equal(result.value.finalUnitPriceCents, 1375);
  assert.deepEqual(result.value.surchargeAllocations.map((item) => item.ruleKey), ["image", "text"]);
  const oneImage = calculate([{ ...values[1], images: [{ receiptId: "receipt-1" }] }], [image]);
  assert.equal(oneImage.status, "found");
  assert.equal(oneImage.value.finalUnitPriceCents, 1250);
  assert.equal(result.value.surchargeAllocations.filter((item) => item.fieldId === "field-image").length, 1);
  const zeroResult = calculate(values.slice(0, 1), [zero]);
  assert.equal(zeroResult.status, "found");
  assert.equal(zeroResult.value.surchargeAllocations[0].amountCents, 0);
});

test("C03: malformed, duplicate, stale, foreign, and unsafe rules fail closed", () => {
  const duplicate = calculate([{ fieldId: "field-text", fieldCode: "caption", kind: "short_text", value: "x" }], parseRows(row("a", "field-text", 10), row("b", "field-text", 20)));
  assert.deepEqual(duplicate, { status: "unavailable", reason: "duplicate_pricing_selector" });
  const stale = calculate([], [parseRows(row("stale", "field-text", 10, { configurationRevision: "2" }))[0]]);
  assert.deepEqual(stale, { status: "unavailable", reason: "stale_pricing_rule" });
  const foreignField = calculate([], [parseRows(row("foreign", "field-not-configured", 10))[0]]);
  assert.deepEqual(foreignField, { status: "unavailable", reason: "invalid_pricing_field" });
  assert.equal(parseCustomizationSurchargeRuleRow(row("percent", "field-text", 10, { selector: { kind: "percentage", fieldId: "field-text" } }), project), null);
  assert.equal(parseCustomizationSurchargeRuleRow(row("extra", "field-text", 10, { formula: "quantity" }), project), null);
  assert.equal(parseCustomizationSurchargeRuleRow(row("negative", "field-text", -1), project), null);
  assert.equal(parseCustomizationSurchargeRuleRow(row("float", "field-text", 1.5), project), null);
  assert.equal(parseCustomizationSurchargeRuleRow({ ...row("foreign-project", "field-text", 10), project_id: "other-project" }, project), null);
});

test("C03: rule currency and arithmetic overflow are not silently accepted", () => {
  const wrongCurrency = parseRows(row("currency", "field-text", 10, { currency: "EUR" }))[0];
  assert.equal(wrongCurrency, null);
  const huge = parseRows(row("huge", "field-text", 2_147_483_647))[0];
  const base = calculate([], [huge]);
  assert.deepEqual(base, { status: "found", value: { basePriceCents: 1000, currency: "USD", configurationRevision: "1", surchargeAllocations: [], totalSurchargeCents: 0, finalUnitPriceCents: 1000 } });
  const overflowVariant = { ...variant, priceCents: 2_147_483_000 };
  const overflow = calculateCustomizationPricing({ productId, variant: overflowVariant, configuration, handoff: handoff([{ fieldId: "field-text", fieldCode: "caption", kind: "short_text", value: "x" }]), rules: [huge] });
  assert.deepEqual(overflow, { status: "unavailable", reason: "pricing_overflow" });
});
