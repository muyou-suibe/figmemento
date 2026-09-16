import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { preserveConfiguredItemCopies } from "../app/application/configured-item-copy-sequence.ts";

const selectedOptions = [
  { optionId: "option-size", valueId: "value-standard" },
  { optionId: "option-material", valueId: "value-resin" },
];

function textValue(value, fieldId = "field-name") {
  return { fieldId, fieldCode: fieldId.replace("field-", ""), kind: "short_text", value };
}

function imageValue(images, fieldId = "field-photo") {
  return { fieldId, fieldCode: fieldId.replace("field-", ""), kind: "image", images };
}

function handoff(overrides = {}) {
  return {
    productId: "product-couple",
    variantId: "variant-standard",
    skuCode: "COUPLE-STANDARD",
    selectedOptions: selectedOptions.map((selection) => ({ ...selection })),
    configurationRevision: "customization-v1",
    customizationValues: [textValue("Ada"), imageValue([{ receiptId: "receipt-a" }])],
    ...overrides,
  };
}

test("8.2-1: same SKU with different text remains two ordered copies", () => {
  const output = preserveConfiguredItemCopies([
    handoff({ customizationValues: [textValue("Ada")] }),
    handoff({ customizationValues: [textValue("Grace")] }),
  ]);
  assert.equal(output.length, 2);
  assert.deepEqual(output.map((item) => item.customizationValues[0].value), ["Ada", "Grace"]);
});

test("8.2-2: same SKU with different receipts remains two independent copies", () => {
  const output = preserveConfiguredItemCopies([
    handoff({ customizationValues: [imageValue([{ receiptId: "receipt-a" }])] }),
    handoff({ customizationValues: [imageValue([{ receiptId: "receipt-b" }])] }),
  ]);
  assert.deepEqual(output.map((item) => item.customizationValues[0].images[0].receiptId), ["receipt-a", "receipt-b"]);
});

test("8.2-3: image order is preserved independently within each copy", () => {
  const output = preserveConfiguredItemCopies([
    handoff({ customizationValues: [imageValue([{ receiptId: "a" }, { receiptId: "b" }])] }),
    handoff({ customizationValues: [imageValue([{ receiptId: "b" }, { receiptId: "a" }])] }),
  ]);
  assert.deepEqual(output.map((item) => item.customizationValues[0].images.map((image) => image.receiptId)), [["a", "b"], ["b", "a"]]);
});

test("8.2-4: crop metadata remains attached to its own copy", () => {
  const cropA = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const cropB = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
  const output = preserveConfiguredItemCopies([
    handoff({ customizationValues: [imageValue([{ receiptId: "receipt-a", crop: cropA }])] }),
    handoff({ customizationValues: [imageValue([{ receiptId: "receipt-b", crop: cropB }])] }),
  ]);
  assert.deepEqual(output[0].customizationValues[0].images[0].crop, cropA);
  assert.deepEqual(output[1].customizationValues[0].images[0].crop, cropB);
});

test("8.2-5: identical customization is still preserved as two entries", () => {
  const input = handoff();
  const output = preserveConfiguredItemCopies([input, input]);
  assert.equal(output.length, 2);
  assert.deepEqual(output[0], output[1]);
  assert.notEqual(output[0], output[1]);
});

test("8.2-6: different SKUs retain caller order without grouping", () => {
  const first = handoff({ variantId: "variant-mini", skuCode: "COUPLE-MINI" });
  const second = handoff({ variantId: "variant-deluxe", skuCode: "COUPLE-DELUXE" });
  const output = preserveConfiguredItemCopies([first, second]);
  assert.deepEqual(output.map((item) => item.skuCode), ["COUPLE-MINI", "COUPLE-DELUXE"]);
});

test("8.2-7: configured-empty copies remain two copies", () => {
  const output = preserveConfiguredItemCopies([
    handoff({ customizationValues: [] }),
    handoff({ customizationValues: [] }),
  ]);
  assert.equal(output.length, 2);
  assert.deepEqual(output.map((item) => item.customizationValues), [[], []]);
});

test("8.2-8: selected Option structure and order are preserved", () => {
  const options = [
    { optionId: "option-material", valueId: "value-resin" },
    { optionId: "option-size", valueId: "value-standard" },
  ];
  const output = preserveConfiguredItemCopies([handoff({ selectedOptions: options })]);
  assert.deepEqual(output[0].selectedOptions, options);
});

test("8.2-9: customization field order is preserved exactly", () => {
  const values = [textValue("First", "field-first"), textValue("Second", "field-second")];
  const output = preserveConfiguredItemCopies([handoff({ customizationValues: values })]);
  assert.deepEqual(output[0].customizationValues.map((value) => value.fieldId), ["field-first", "field-second"]);
});

test("8.2-10: image order is not moved across copies", () => {
  const output = preserveConfiguredItemCopies([
    handoff({ customizationValues: [imageValue([{ receiptId: "copy-a-1" }, { receiptId: "copy-a-2" }])] }),
    handoff({ customizationValues: [imageValue([{ receiptId: "copy-b-1" }, { receiptId: "copy-b-2" }])] }),
  ]);
  assert.deepEqual(output[0].customizationValues[0].images.map((image) => image.receiptId), ["copy-a-1", "copy-a-2"]);
  assert.deepEqual(output[1].customizationValues[0].images.map((image) => image.receiptId), ["copy-b-1", "copy-b-2"]);
});

test("8.2-11: input handoffs are not mutated", () => {
  const input = [handoff(), handoff({ customizationValues: [textValue("Grace")] })];
  const before = structuredClone(input);
  preserveConfiguredItemCopies(input);
  assert.deepEqual(input, before);
});

test("8.2-12: nested output values are independent", () => {
  const input = handoff({ customizationValues: [imageValue([{ receiptId: "receipt-a", crop: { x: 0, y: 0, width: 1, height: 1 } }])] });
  const output = preserveConfiguredItemCopies([input, input]);
  output[0].customizationValues[0].images[0].receiptId = "changed";
  output[0].customizationValues[0].images[0].crop.x = 0.5;
  assert.equal(output[1].customizationValues[0].images[0].receiptId, "receipt-a");
  assert.equal(output[1].customizationValues[0].images[0].crop.x, 0);
  assert.equal(input.customizationValues[0].images[0].receiptId, "receipt-a");
});

test("8.2-13/14: output invents neither a quantity nor a new copy identity", () => {
  const output = preserveConfiguredItemCopies([handoff(), handoff()]);
  assert.deepEqual(Object.keys(output[0]).sort(), [
    "configurationRevision",
    "customizationValues",
    "productId",
    "selectedOptions",
    "skuCode",
    "variantId",
  ]);
  assert.equal("quantity" in output[0], false);
  assert.equal("copyId" in output[0], false);
});

test("8.2-15/16/17: helper source is pure and contains no external access or identity algorithm", async () => {
  const source = await readFile(new URL("../app/application/configured-item-copy-sequence.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch|Supabase|R2|S3|Stripe|PayPal|repository|localStorage|sessionStorage|IndexedDB|cookie|writeFile/);
  assert.doesNotMatch(source, /fingerprint|mergeKey|hash|cartKey|contentHash|lineId|cartLineId|crypto\.subtle|createHash|SHA|MD5|JSON\.stringify/);
});
