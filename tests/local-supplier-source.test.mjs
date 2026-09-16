import assert from "node:assert/strict";
import test from "node:test";

import {
  DIGITAL_CATALOG_PRODUCT_SLUGS,
  LOCAL_SUPPLIER_FIXTURES,
  LOCAL_SUPPLIER_OFFER_FIXTURES,
  LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES,
  LOCAL_SUPPLIER_SOURCE_FIXTURES,
  SUPPLIER_WORKBOOK_SOURCE,
  UNMAPPED_CATALOG_PRODUCT_SLUGS,
} from "../app/infrastructure/suppliers/local-supplier-source-fixtures.ts";

function byOfferId(offerId) {
  const offer = LOCAL_SUPPLIER_OFFER_FIXTURES.find((candidate) => candidate.offerId === offerId);
  assert.ok(offer, `expected offer ${offerId}`);
  return offer;
}

function variantsFor(offerId) {
  return LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES.filter((variant) => variant.offerId === offerId);
}

test("pins the reviewed workbook identity and supplier-sheet provenance", () => {
  assert.equal(SUPPLIER_WORKBOOK_SOURCE.requestedFilename, "8-29FigMemento_供应商对接(1)(2).xlsx");
  assert.equal(SUPPLIER_WORKBOOK_SOURCE.reviewedFilename, "8-29FigMemento_供应商对接(1).xlsx");
  assert.equal(SUPPLIER_WORKBOOK_SOURCE.filenameStatus, "requested_copy_unavailable_reviewed_copy_used");
  assert.equal(SUPPLIER_WORKBOOK_SOURCE.supplierSheetName, "供应商对接");
  assert.equal(SUPPLIER_WORKBOOK_SOURCE.instructionsSheetName, "填写说明");
  assert.match(SUPPLIER_WORKBOOK_SOURCE.reviewedSha256, /^[a-f0-9]{64}$/);

  const rows = LOCAL_SUPPLIER_OFFER_FIXTURES.map((offer) => offer.provenance[0].sourceRow);
  assert.deepEqual(rows, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.equal(byOfferId("offer-jinhua-3d-pet").provenance[0].rawValues.quotedPrice, "￥160（6cm） / ￥190（8cm） / ￥200（10cm）");
  assert.equal(byOfferId("offer-jinhua-3d-pet").provenance[0].rawValues.platformOrUrl, null);
  assert.equal(byOfferId("offer-jinhua-3d-pet").provenance[0].sourceUrl, null);
  assert.match(byOfferId("offer-taobao-phone-case").provenance[0].sourceUrl, /^https:\/\//);
});

test("keeps eight stable supplier identities independent of array position", () => {
  assert.equal(LOCAL_SUPPLIER_FIXTURES.length, 8);
  const first = LOCAL_SUPPLIER_FIXTURES.map((supplier) => supplier.supplierId);
  const second = LOCAL_SUPPLIER_SOURCE_FIXTURES.suppliers.map((supplier) => supplier.supplierId);
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, first.length);
  assert.ok(first.every((id) => id.startsWith("supplier-") && !/^supplier-\d+$/.test(id)));
  assert.deepEqual(LOCAL_SUPPLIER_FIXTURES.map((supplier) => supplier.displayName), [
    "金华市新烨供应链管理有限公司",
    "泉州市品冠艺术文化有限公司",
    "福州祝安鼠电子商务有限公司",
    "福建盈浩文化创意股份有限公司",
    "淘宝店 菠萝荔枝",
    "淘宝店 百纹美旗舰店",
    "玩布客旗舰店",
    "麦子创意礼品玩具店",
  ]);
});

test("keeps offer and variant IDs stable, unique, and source-derived", () => {
  const offerIds = LOCAL_SUPPLIER_OFFER_FIXTURES.map((offer) => offer.offerId);
  const variantIds = LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES.map((variant) => variant.variantId);
  assert.equal(new Set(offerIds).size, offerIds.length);
  assert.equal(new Set(variantIds).size, variantIds.length);
  assert.ok(offerIds.every((id) => id.startsWith("offer-")));
  assert.ok(variantIds.every((id) => id.startsWith("variant-")));
  assert.ok(LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES.every((variant) =>
    offerIds.includes(variant.offerId)));
  assert.deepEqual(
    LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES.map((variant) => variant.variantId),
    [...LOCAL_SUPPLIER_SOURCE_FIXTURES.variants].map((variant) => variant.variantId),
  );
});

test("preserves source-backed offers as physical and never invents active status", () => {
  assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.length > 0);
  assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.every((offer) => offer.fulfillmentType === "physical"));
  assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.every((offer) => offer.isActive === null));
  assert.ok(LOCAL_SUPPLIER_FIXTURES.every((supplier) => supplier.status === "unknown"));
  assert.equal(LOCAL_SUPPLIER_FIXTURES.find((supplier) => supplier.supplierId === "supplier-jinhua-xinye").canShipToShanghaiWarehouse, true);
  assert.equal(LOCAL_SUPPLIER_FIXTURES.find((supplier) => supplier.supplierId === "supplier-quanzhou-pinguang").videoCapability, "paid");
});

test("keeps approximate and row-level weight facts provisional or unknown", () => {
  const jinhuaFigure = variantsFor("offer-jinhua-3d-figure")[0];
  assert.equal(jinhuaFigure.packagedWeightGrams, 50);
  assert.equal(jinhuaFigure.packagedWeightRawText, "约50g");
  assert.equal(jinhuaFigure.packagedWeightReviewStatus, "provisional");

  const jinhuaPet = variantsFor("offer-jinhua-3d-pet");
  assert.deepEqual(jinhuaPet.map((variant) => variant.packagedWeightGrams), [null, null, null]);
  assert.equal(byOfferId("offer-jinhua-3d-pet").sourcePackagedWeightText, "约40g");
  assert.ok(jinhuaPet.every((variant) => variant.packagedWeightReviewStatus === "unknown"));

  const approximateVariants = LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES.filter((variant) =>
    variant.packagedWeightRawText?.includes("约"));
  assert.ok(approximateVariants.length > 0);
  assert.ok(approximateVariants.every((variant) => variant.packagedWeightReviewStatus === "provisional"));
  assert.ok(LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES.every((variant) => variant.packagedWeightGrams !== 0));
});

test("keeps distinct size weights instead of copying one value across variants", () => {
  assert.deepEqual(variantsFor("offer-quanzhou-3d-pet").map((variant) => variant.packagedWeightGrams), [60, 100, 150]);
  assert.deepEqual(variantsFor("offer-quanzhou-bobblehead").map((variant) => variant.packagedWeightGrams), [70, 110, 150]);
  assert.deepEqual(variantsFor("offer-tmall-puzzle").map((variant) => variant.packagedWeightGrams), [400, 550, 1_000]);
  assert.deepEqual(variantsFor("offer-taobao-wood-engraving").map((variant) => variant.packagedWeightGrams), [400, 500, 600]);
});

test("preserves variant pricing bases, explicit CNY currency, and option surcharges", () => {
  assert.ok(LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES.every((variant) =>
    variant.supplierQuotedAmount.currency === "CNY"));
  assert.ok(LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES.every((variant) =>
    variant.supplierQuotedAmount.amountCents === null || variant.supplierQuotedAmount.amountCents > 0));

  const areaPriced = variantsFor("offer-yinghao-pet-portrait");
  assert.deepEqual(areaPriced.map((variant) => variant.supplierQuotedAmount.pricingBasis), ["area_based", "area_based", "area_based"]);
  assert.ok(areaPriced.every((variant) => variant.supplierQuotedAmount.priceUnit === "per_area"));
  assert.ok(areaPriced.every((variant) => variant.supplierQuotedAmount.amountCents !== null));
  assert.ok(areaPriced.every((variant) => variant.supplierQuotedAmount.priceUnit !== "per_unit"));

  const easel = variantsFor("offer-jinhua-brick-person").find((variant) => variant.variantKey === "6cm-with-easel");
  assert.equal(easel.supplierQuotedAmount.amountCents, null);
  assert.equal(easel.optionSurchargeCents, 600);
  assert.equal(easel.supplierQuotedAmount.rawText, "(+画架¥6)");
});

test("keeps duplicate 3D-pet and bobblehead supplier offers separate", () => {
  const petOffers = LOCAL_SUPPLIER_OFFER_FIXTURES.filter((offer) => offer.sourceProductLabel === "3D宠物");
  const bobbleheadOffers = LOCAL_SUPPLIER_OFFER_FIXTURES.filter((offer) => offer.sourceProductLabel === "摇头娃娃");
  assert.equal(petOffers.length, 2);
  assert.equal(bobbleheadOffers.length, 2);
  assert.equal(new Set(petOffers.map((offer) => offer.supplierId)).size, 2);
  assert.equal(new Set(bobbleheadOffers.map((offer) => offer.supplierId)).size, 2);
  assert.ok(petOffers.every((offer) => offer.catalogMapping.status === "ambiguous"));
  assert.ok(bobbleheadOffers.every((offer) => offer.catalogMapping.status === "ambiguous"));
  assert.ok(petOffers.every((offer) => offer.catalogMapping.productSlug === null));
});

test("keeps unmapped catalog records explicit and does not promote name similarity", () => {
  assert.equal(UNMAPPED_CATALOG_PRODUCT_SLUGS.length, 22);
  assert.equal(new Set(UNMAPPED_CATALOG_PRODUCT_SLUGS).size, 22);
  assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.every((offer) =>
    offer.catalogMapping.status !== "approved"));
  assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.every((offer) =>
    offer.catalogMapping.productSlug === null && offer.catalogMapping.skuCode === null));
  assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.some((offer) => offer.catalogMapping.status === "unmapped"));
  assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.some((offer) => offer.catalogMapping.status === "ambiguous"));
});

test("keeps digital catalog Products outside physical supplier offers", () => {
  assert.deepEqual(DIGITAL_CATALOG_PRODUCT_SLUGS, ["digital-portrait", "ai-oil-portrait", "digital-wallpaper"]);
  assert.ok(DIGITAL_CATALOG_PRODUCT_SLUGS.every((slug) => UNMAPPED_CATALOG_PRODUCT_SLUGS.includes(slug)));
  assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.every((offer) =>
    offer.fulfillmentType === "physical" && offer.catalogMapping.productSlug === null));
  assert.equal(LOCAL_SUPPLIER_OFFER_FIXTURES.some((offer) =>
    DIGITAL_CATALOG_PRODUCT_SLUGS.includes(offer.catalogMapping.productSlug)), false);
});

test("retains production-only lead times and leaves method-specific gaps explicit", () => {
  assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.every((offer) =>
    (offer.minProductionBusinessDays === null && offer.maxProductionBusinessDays === null)
    || (offer.minProductionBusinessDays >= 1 && offer.maxProductionBusinessDays >= offer.minProductionBusinessDays)));
  assert.deepEqual(variantsFor("offer-yinghao-pet-portrait").map((variant) => [variant.minProductionBusinessDays, variant.maxProductionBusinessDays]), [[2, 3], [3, 5], [2, 3]]);
  assert.equal(byOfferId("offer-yinghao-pet-portrait").minProductionBusinessDays, null);
  assert.equal(byOfferId("offer-yinghao-pet-portrait").maxProductionBusinessDays, null);
  assert.ok(LOCAL_SUPPLIER_OFFER_VARIANT_FIXTURES.every((variant) => !("deliveryEta" in variant)));
});

test("preserves explicit source sizes, base options, piece counts, and method labels", () => {
  assert.deepEqual(variantsFor("offer-tmall-temporary-tattoo").map((variant) => variant.label), ["18 × 28 cm"]);
  assert.deepEqual(variantsFor("offer-tmall-puzzle").map((variant) => variant.label), ["300片", "500片", "1000片"]);
  assert.deepEqual(variantsFor("offer-taobao-wood-engraving").map((variant) => variant.label), ["6寸", "8寸", "10寸"]);
  assert.deepEqual(variantsFor("offer-fuzhou-pet-crystal").map((variant) => variant.label), ["6cm", "+ 木正方形灯座", "+ 木原方形灯座", "+ 塑料黑色灯座"]);
  assert.deepEqual(variantsFor("offer-yinghao-pet-portrait").map((variant) => variant.label), ["喷绘", "半手绘", "肌理打印"]);
  assert.ok(byOfferId("offer-tmall-puzzle").notes.includes("not separate FigMemento variants"));
});

test("uses checked-in data without workbook parsing or external network access", async () => {
  const serialized = JSON.stringify(LOCAL_SUPPLIER_SOURCE_FIXTURES);
  assert.doesNotMatch(serialized, /openpyxl|node:xlsx|readFileSync|fetch\(/i);
  assert.doesNotMatch(serialized, /\.xlsx[\\/]/i);
  assert.equal("runtimeWorkbookPath" in LOCAL_SUPPLIER_SOURCE_FIXTURES, false);

  const previousFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("supplier source tests must not perform network access");
  };
  try {
    assert.equal(LOCAL_SUPPLIER_SOURCE_FIXTURES.offers.length, LOCAL_SUPPLIER_OFFER_FIXTURES.length);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
