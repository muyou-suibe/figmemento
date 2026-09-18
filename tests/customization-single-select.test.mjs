import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseCustomizationField,
} from "../app/domain/customization-field.ts";
import {
  parseCustomizationValue,
  parseCustomizationValues,
} from "../app/domain/customization-value.ts";
import { validateCustomizationValuesAgainstFields } from "../app/domain/customization-validation.ts";
import {
  createProductCustomizationDraft,
  evaluateProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../app/domain/product-customization-draft.ts";
import { createProductCustomizationSummary } from "../app/application/product-customization-summary.ts";
import {
  normalizeAdminCustomizationFieldConfiguration,
  normalizeCustomizationFieldConfiguration,
} from "../app/application/customization-field-repository.ts";
import { acceptConfiguredItemHandoff } from "../app/application/configured-item-handoff-acceptance.ts";
import { createLocalOrderSnapshot, projectLocalOrderSnapshot } from "../app/domain/local-order.ts";
import { acceptCartItem } from "../app/application/shopping-cart-service.ts";
import {
  AdminCustomizationFieldCommandBoundary,
  AdminCustomizationFieldQueryBoundary,
} from "../app/application/admin-customization-field-boundary.ts";
import { createLocalAdminCatalogRuntime } from "../app/infrastructure/catalog/local-admin-catalog-repository.server.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";

const productId = "product-c07";
const revision = "configuration-c07-v1";
const choices = [
  { id: "choice-blue", code: "blue", label: " Blue ", position: 1, isActive: true },
  { id: "choice-red", code: "red", label: "Red", position: 0, isActive: false },
];

function singleSelectField(overrides = {}) {
  const result = parseCustomizationField({
    id: "field-finish",
    productId,
    code: "finish",
    label: "Finish",
    kind: "single_select",
    required: true,
    isActive: true,
    position: 0,
    configurationRevision: revision,
    constraints: { choices, helpText: "Choose one finish." },
    ...overrides,
  });
  assert.equal(result.ok, true);
  return result.value;
}

function selectValue(choiceId = "choice-blue") {
  return { fieldId: "field-finish", fieldCode: "finish", kind: "single_select", choiceId };
}

test("C07 field parser enforces bounded ordered choices and active-field readiness", () => {
  const field = singleSelectField();
  assert.deepEqual(field.constraints.choices, [
    { id: "choice-red", code: "red", label: "Red", position: 0, isActive: false },
    { id: "choice-blue", code: "blue", label: "Blue", position: 1, isActive: true },
  ]);
  assert.equal(field.constraints.helpText, "Choose one finish.");

  for (const invalid of [
    { choices: [{ ...choices[0], extra: true }] },
    { choices: [{ ...choices[0], label: "\u0000" }] },
    { choices: [{ ...choices[0], position: 0 }, { ...choices[1], position: 0 }] },
    { choices: [{ ...choices[0], id: "choice-blue" }, { ...choices[1], id: "choice-blue" }] },
    { choices: [{ ...choices[0], code: "blue" }, { ...choices[1], code: "blue" }] },
    { choices: [{ ...choices[0], isActive: false }, { ...choices[1], isActive: false }] },
    { choices: [], helpText: "Choose one finish." },
    { choices, helpText: "\u0000" },
  ]) {
    assert.equal(parseCustomizationField({
      id: "field-finish", productId, code: "finish", label: "Finish", kind: "single_select",
      required: true, isActive: true, position: 0, configurationRevision: revision,
      constraints: invalid,
    }).ok, false);
  }
  assert.equal(parseCustomizationField({
    id: "field-finish", productId, code: "finish", label: "Finish", kind: "single_select",
    required: false, isActive: false, position: 0, configurationRevision: revision,
    constraints: { choices: [{ ...choices[0], isActive: false }] },
  }).ok, true);
});

test("C07 value shape is exact and authoritative validation rejects unknown or inactive choices", () => {
  assert.deepEqual(parseCustomizationValue(selectValue()).value, selectValue());
  assert.equal(parseCustomizationValue({ ...selectValue(), choiceCode: "blue" }).ok, false);
  assert.equal(parseCustomizationValue({ ...selectValue(), label: "Blue" }).ok, false);

  const field = singleSelectField();
  const valid = validateCustomizationValuesAgainstFields({
    productId,
    configurationRevision: revision,
    authoritativeConfigurationRevision: revision,
    fields: [field],
    values: parseCustomizationValues([selectValue()]).value,
    resolvedImageMetadata: [],
  });
  assert.equal(valid.ok, true);
  assert.equal(validateCustomizationValuesAgainstFields({
    productId,
    configurationRevision: revision,
    authoritativeConfigurationRevision: revision,
    fields: [field],
    values: parseCustomizationValues([selectValue("choice-red")]).value,
    resolvedImageMetadata: [],
  }).ok, false);
  assert.equal(validateCustomizationValuesAgainstFields({
    productId,
    configurationRevision: revision,
    authoritativeConfigurationRevision: revision,
    fields: [field],
    values: parseCustomizationValues([selectValue("choice-missing")]).value,
    resolvedImageMetadata: [],
  }).ok, false);
  assert.equal(validateCustomizationValuesAgainstFields({
    productId,
    configurationRevision: revision,
    authoritativeConfigurationRevision: revision,
    fields: [field],
    values: [],
    resolvedImageMetadata: [],
  }).ok, false);
});

test("C07 public configuration projects active choices only while Admin read-back retains inactive choices", () => {
  const definition = {
    productId,
    configurationRevision: revision,
    fields: [{
      id: "field-finish",
      productId,
      code: "finish",
      label: "Finish",
      kind: "single_select",
      required: true,
      isActive: true,
      position: 0,
      configurationRevision: revision,
      constraints: { choices, helpText: "Choose one finish." },
    }],
  };
  const publicResult = normalizeCustomizationFieldConfiguration(productId, definition);
  assert.equal(publicResult.status, "found");
  assert.deepEqual(publicResult.value.fields[0].constraints.choices, [{ ...choices[0], label: "Blue" }]);
  const adminResult = normalizeAdminCustomizationFieldConfiguration(productId, definition);
  assert.equal(adminResult.status, "found");
  assert.deepEqual(adminResult.value.fields[0].constraints.choices, [choices[1], choices[0]].map((choice) => ({ ...choice, label: choice.label.trim() })));
});

test("C07 draft/PDP summary uses the authoritative choice label without changing Variant/SKU authority", () => {
  const field = singleSelectField();
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_variant_selection",
    selection: { variantId: "variant-real", skuCode: "SKU-REAL" },
  });
  draft = reduceProductCustomizationDraft(draft, { type: "set_single_select_value", value: selectValue() });
  const evaluated = evaluateProductCustomizationDraft(draft, {
    productId,
    configurationRevision: revision,
    fields: [field],
  }, "2026-09-18T00:00:00.000Z");
  assert.equal(evaluated.state, "ready");
  assert.deepEqual(evaluated.normalizedValues, [selectValue()]);

  const summary = createProductCustomizationSummary({
    draft,
    configurationRevision: revision,
    fields: [field],
    options: [],
    optionValues: [],
  });
  assert.equal(summary.configuration.sku, "SKU-REAL");
  assert.deepEqual(summary.personalization.rows, [{
    renderKey: "field-finish", kind: "single_select", label: "Finish", state: "provided", value: "Blue",
  }]);
});

test("C07 configured-item and Cart acceptance re-resolve the field and carry only choiceId", async () => {
  const catalog = createDevelopmentCatalogRepository({ NODE_ENV: "development", PHOTOGIFT_PRODUCT_SOURCE: "fixture" });
  const detailResult = await catalog.findPublicProductById("fixture-product-couple-figure");
  assert.equal(detailResult.status, "found");
  const variant = detailResult.value.variants.find((candidate) => candidate.skuCode === "DEV-COUPLE-FIGURE-MINI");
  assert.ok(variant);
  const field = singleSelectField({ productId: "fixture-product-couple-figure", configurationRevision: "fixture-c07-v1" });
  const handoff = {
    productId: detailResult.value.product.id,
    variantId: variant.id,
    skuCode: variant.skuCode,
    selectedOptions: variant.selectedOptions.map((selection) => ({ ...selection })),
    configurationRevision: "fixture-c07-v1",
    customizationValues: [{ ...selectValue(), fieldId: field.id, fieldCode: field.code }],
  };
  const dependencies = {
    catalogRepository: catalog,
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "found", value: { productId: detailResult.value.product.id, configurationRevision: "fixture-c07-v1", fields: [field] } };
      },
    },
    receiptRepository: { async findOwnedReceipt() { return { status: "not_found" }; } },
  };
  const accepted = await acceptConfiguredItemHandoff({ rawInput: handoff, verifiedOwnerId: "owner-a", observedAt: "2026-09-18T00:00:00.000Z" }, dependencies);
  assert.equal(accepted.status, "accepted");
  assert.deepEqual(accepted.handoff.customizationValues, [handoff.customizationValues[0]]);
  const cart = await acceptCartItem(handoff, { ...dependencies, observedAt: "2026-09-18T00:00:00.000Z", verifiedOwnerId: "owner-a" });
  assert.equal(cart.status, "accepted");
  assert.deepEqual(cart.value.handoff.customizationValues, [handoff.customizationValues[0]]);
  assert.deepEqual(cart.value.customization.personalization.rows[0], { kind: "single_select", label: "Finish", state: "provided", value: "Blue" });
  const rejected = await acceptConfiguredItemHandoff({ rawInput: { ...handoff, customizationValues: [{ ...handoff.customizationValues[0], choiceId: "choice-red" }] }, verifiedOwnerId: "owner-a", observedAt: "2026-09-18T00:00:00.000Z" }, dependencies);
  assert.deepEqual(rejected, { status: "rejected", reason: "invalid_customization" });
});

test("C07 Admin preserves choice identity across retirement and rejects every rebind", async () => {
  const runtime = createLocalAdminCatalogRuntime();
  const productId = "fixture-product-glass-light-picture";
  const authorized = { async verifyAdminSession() { return { status: "authorized", principal: { role: "admin", identity: "c07-admin" } }; } };
  const query = new AdminCustomizationFieldQueryBoundary(authorized, () => runtime.customizationRepository);
  const command = new AdminCustomizationFieldCommandBoundary(authorized, () => ({ reader: runtime.customizationRepository, writer: runtime.customizationRepository }));
  const current = await query.execute({ productId });
  assert.equal(current.status, "found");
  const nextFields = [...current.value.fields.map((field) => ({
    identity: { kind: "existing", id: field.id, code: field.code },
    label: field.label,
    kind: field.kind,
    required: field.required,
    isActive: field.isActive,
    position: field.position,
    constraints: field.constraints,
  })), {
    identity: { kind: "new", draftId: "new:finish", code: "finish" },
    label: "Finish",
    kind: "single_select",
    required: true,
    isActive: true,
    position: current.value.fields.length,
    constraints: { choices: [{ id: "new:blue", code: "blue", label: "Blue", position: 0, isActive: true }] },
  }];
  nextFields[nextFields.length - 1].constraints.choices.push({ id: "new:red", code: "red", label: "Red", position: 1, isActive: true });
  nextFields[nextFields.length - 1].constraints.choices.push({ id: "new:green", code: "green", label: "Green", position: 2, isActive: true });
  const first = await command.execute({ productId, expectedCurrentRevision: current.value.configurationRevision, fields: nextFields });
  assert.equal(first.status, "applied");
  const select = first.value.fields.find((field) => field.kind === "single_select");
  assert.ok(select);
  const blue = select.constraints.choices.find((choice) => choice.code === "blue");
  const red = select.constraints.choices.find((choice) => choice.code === "red");
  assert.ok(blue);
  assert.ok(red);
  assert.match(blue.id, /^local-customization-choice-/);
  assert.doesNotMatch(blue.id, /^new:/);

  const secondFields = first.value.fields.map((field) => field.kind === "single_select"
    ? { identity: { kind: "existing", id: field.id, code: field.code }, label: field.label, kind: field.kind, required: field.required, isActive: field.isActive, position: field.position, constraints: { ...field.constraints, choices: field.constraints.choices.filter((choice) => choice.code !== "blue").map((choice) => choice.code === "red" ? ({ ...choice, label: "Ruby", position: 0, isActive: false }) : ({ ...choice, position: 1, isActive: true })) } }
    : { identity: { kind: "existing", id: field.id, code: field.code }, label: field.label, kind: field.kind, required: field.required, isActive: field.isActive, position: field.position, constraints: field.constraints });
  const second = await command.execute({ productId, expectedCurrentRevision: first.value.configurationRevision, fields: secondFields });
  assert.equal(second.status, "applied");
  const updated = second.value.fields.find((field) => field.kind === "single_select");
  const updatedRed = updated.constraints.choices.find((choice) => choice.code === "red");
  assert.equal(updatedRed.id, red.id);
  assert.equal(updatedRed.label, "Ruby");
  assert.equal(updatedRed.position, 0);
  assert.equal(updatedRed.isActive, false);

  const newCodeRebind = await command.execute({
    productId,
    expectedCurrentRevision: second.value.configurationRevision,
    fields: second.value.fields.map((field) => field.kind === "single_select"
      ? { identity: { kind: "existing", id: field.id, code: field.code }, label: field.label, kind: field.kind, required: field.required, isActive: field.isActive, position: field.position, constraints: { ...field.constraints, choices: [{ id: "new:blue", code: "blue", label: "Blue again", position: 2, isActive: true }, ...field.constraints.choices] } }
      : { identity: { kind: "existing", id: field.id, code: field.code }, label: field.label, kind: field.kind, required: field.required, isActive: field.isActive, position: field.position, constraints: field.constraints }),
  });
  assert.equal(newCodeRebind.status, "invalid_configuration");

  const oldIdNewCode = await command.execute({
    productId,
    expectedCurrentRevision: second.value.configurationRevision,
    fields: second.value.fields.map((field) => field.kind === "single_select"
      ? { identity: { kind: "existing", id: field.id, code: field.code }, label: field.label, kind: field.kind, required: field.required, isActive: field.isActive, position: field.position, constraints: { ...field.constraints, choices: [{ id: blue.id, code: "rebound", label: "Rebound", position: 2, isActive: true }, ...field.constraints.choices] } }
      : { identity: { kind: "existing", id: field.id, code: field.code }, label: field.label, kind: field.kind, required: field.required, isActive: field.isActive, position: field.position, constraints: field.constraints }),
  });
  assert.equal(oldIdNewCode.status, "invalid_configuration");

  const oldCodeNewId = await command.execute({
    productId,
    expectedCurrentRevision: second.value.configurationRevision,
    fields: second.value.fields.map((field) => field.kind === "single_select"
      ? { identity: { kind: "existing", id: field.id, code: field.code }, label: field.label, kind: field.kind, required: field.required, isActive: field.isActive, position: field.position, constraints: { ...field.constraints, choices: [{ id: "local-customization-choice-new-blue", code: "blue", label: "Blue rebound", position: 2, isActive: true }, ...field.constraints.choices] } }
      : { identity: { kind: "existing", id: field.id, code: field.code }, label: field.label, kind: field.kind, required: field.required, isActive: field.isActive, position: field.position, constraints: field.constraints }),
  });
  assert.equal(oldCodeNewId.status, "invalid_configuration");
});

test("C07 Order projection exposes server-resolved choice facts without changing SKU facts", () => {
  const snapshot = createLocalOrderSnapshot({
    internalId: "local-c07-order",
    publicReference: "FM-LOCAL-C07ORDER00000001",
    createdAt: "2026-09-18T00:00:00.000Z",
    contact: { email: "c07@example.test", firstName: "C07", lastName: "Buyer", country: "US", city: "Austin", addressLine1: "1 Main Street", postalCode: "78701" },
    commercial: {
      currency: "USD",
      subtotalCents: 1000,
      shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 0, currency: "USD", estimatedRange: "local", developmentOnly: true },
      coupon: { status: "not_selected", discountCents: 0, developmentOnly: true },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 1000,
      developmentOnly: true,
    },
    lines: [{
      productId: "product-c07",
      productName: "C07 Product",
      productSlug: "c07-product",
      variantId: "variant-c07",
      skuCode: "SKU-C07",
      selectedOptions: [],
      quantity: 1,
      unitBasePriceCents: 1000,
      currency: "USD",
      lineSubtotalCents: 1000,
      customization: {
        configurationRevision: revision,
        values: [selectValue()],
        singleSelectChoiceFacts: [{
          fieldId: "field-finish",
          fieldCode: "finish",
          fieldLabel: "Finish",
          choiceId: "choice-blue",
          choiceCode: "blue",
          choiceLabel: "Blue",
          position: 1,
        }],
      },
    }],
  });
  const projected = projectLocalOrderSnapshot(snapshot);
  assert.equal(projected.lines[0].skuCode, "SKU-C07");
  assert.deepEqual(projected.lines[0].customization, [{
    fieldId: "field-finish",
    fieldCode: "finish",
    kind: "single_select",
    choiceId: "choice-blue",
    choiceCode: "blue",
    choiceLabel: "Blue",
  }]);
  assert.equal(snapshot.lines[0].customization.singleSelectChoiceFacts[0].choiceLabel, "Blue");
});

test("C07 persistence contract is additive, ordered, and keeps immutable configuration facts in the existing Order snapshot", async () => {
  const manifest = JSON.parse(await readFile(new URL("../local/commerce/migrations/manifest.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../local/commerce/migrations/0042_local-commerce-customization-single-select.sql", import.meta.url), "utf8");
  assert.equal(manifest.schemaVersion, 43);
  assert.equal(manifest.migrations.length, 43);
  assert.equal(manifest.migrations.at(-2).version, 42);
  assert.equal(manifest.migrations.find((entry) => entry.version === 42).checksum, createHash("sha256").update(migration).digest("hex"));
  assert.match(migration, /single_select/);
  assert.match(migration, /choiceId/);
  assert.match(migration, /snapshot_single_select_facts/);
  assert.match(migration, /expected_customization/);
  assert.doesNotMatch(migration, /price|amountCents.*choice|choice.*amountCents/i);
  assert.doesNotMatch(migration, /selectedSpecificationKey/);

  const orderCommit = await readFile(new URL("../local/commerce/migrations/0039_local-commerce-customization-surcharge.sql", import.meta.url), "utf8");
  assert.match(orderCommit, /configuration.*customizationValues/s);
  assert.match(orderCommit, /order_item_purchase_snapshots/);
  const localOrder = await readFile(new URL("../app/application/local-order-creation.ts", import.meta.url), "utf8");
  assert.match(localOrder, /kind === "single_select"/);
  assert.match(localOrder, /choiceId/);
});
