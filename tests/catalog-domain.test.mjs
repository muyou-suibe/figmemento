import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveVariantListingPrice,
  evaluatePublicEligibility,
  parseCatalogProduct,
  parseCategory,
  parseProductAsset,
  parseProductFulfillmentConfig,
  parseProductOption,
  parseProductOptionValue,
  parseProductVariant,
  resolveAuthoritativeVariantPrice,
  validateGlobalSkuCodes,
  validateProductAssetAssociation,
  validateProductCategoryOwnership,
  validateVariantCombinations,
} from "../app/domain/catalog/index.ts";

const categoryInput = {
  id: "category-keepsakes",
  slug: "keepsakes",
  name: "Keepsakes",
  description: "Warm, personalized keepsakes.",
  seo: {
    title: "Personalized Keepsakes",
    description: "Meaningful gifts made for someone special.",
    canonicalPath: "/category/keepsakes",
  },
  lifecycle: "published",
};

const productInput = {
  id: "product-frame",
  slug: "memory-frame",
  categoryId: "category-keepsakes",
  name: "Memory Frame",
  description: "A personalized memory frame.",
  seo: {
    title: "Memory Frame",
    canonicalPath: "/product/memory-frame",
  },
  lifecycle: "published",
};

const sizeOption = {
  id: "option-size",
  productId: "product-frame",
  code: "size",
  name: "Size",
  kind: "size",
  required: true,
  position: 0,
};

const sizeSmall = {
  id: "value-small",
  productId: "product-frame",
  optionId: "option-size",
  code: "small",
  label: "Small",
  position: 0,
};

const sizeLarge = {
  id: "value-large",
  productId: "product-frame",
  optionId: "option-size",
  code: "large",
  label: "Large",
  position: 1,
};

function variant(overrides = {}) {
  return {
    id: "variant-small",
    productId: "product-frame",
    skuCode: "FRAME-SMALL",
    priceCents: 2_999,
    currency: "USD",
    weightGrams: 350,
    isActive: true,
    isAvailable: true,
    isDefault: true,
    supplyMethod: "made_to_order",
    selectedOptions: [{ optionId: "option-size", valueId: "value-small" }],
    ...overrides,
  };
}

function validGraph(overrides = {}) {
  const category = parseCategory(categoryInput);
  const product = parseCatalogProduct(productInput);
  const option = parseProductOption(sizeOption);
  const optionValue = parseProductOptionValue(sizeSmall);
  const parsedVariant = parseProductVariant(variant());
  const fulfillment = parseProductFulfillmentConfig({
    id: "fulfillment-frame",
    productId: "product-frame",
    fulfillmentType: "physical",
    requiresShipping: true,
    productionMode: "custom_manufacturing",
    leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
  });
  assert.ok(category.ok && product.ok && option.ok && optionValue.ok && parsedVariant.ok && fulfillment.ok);
  return {
    category: category.value,
    product: product.value,
    fulfillment: fulfillment.value,
    options: [option.value],
    optionValues: [optionValue.value],
    variants: [parsedVariant.value],
    ...overrides,
  };
}

function hasIssue(result, code) {
  return !result.ok && result.issues.some((issue) => issue.code === code);
}

test("single-level Category and Product contracts validate identity, content, SEO, lifecycle, and ownership", () => {
  const category = parseCategory(categoryInput);
  const product = parseCatalogProduct(productInput);
  assert.equal(category.ok, true);
  assert.equal(product.ok, true);
  assert.ok(category.ok && product.ok);
  assert.equal(validateProductCategoryOwnership(product.value, category.value).ok, true);

  assert.equal(parseCategory({ ...categoryInput, parentId: "category-parent" }).ok, false);
  assert.equal(parseCategory({ ...categoryInput, slug: "Nested/Category" }).ok, false);
  assert.equal(
    validateProductCategoryOwnership(
      { ...product.value, categoryId: "category-other" },
      category.value,
    ).ok,
    false,
  );
});

test("SKU-defining option and Variant parsers reject customization, inventory, and ownership-field drift", () => {
  assert.equal(parseProductOption(sizeOption).ok, true);
  assert.equal(parseProductOptionValue(sizeSmall).ok, true);
  assert.equal(parseProductVariant(variant()).ok, true);

  assert.equal(
    parseProductOption({ ...sizeOption, code: "photo", name: "Photo", kind: "other_sku" }).ok,
    false,
  );
  assert.equal(parseProductVariant({ ...variant(), productionMode: "custom_manufacturing" }).ok, false);
  assert.equal(parseProductVariant({ ...variant(), inventoryQuantity: 9 }).ok, false);
  assert.equal(parseProductVariant({ ...variant(), supplyMethod: "warehouse" }).ok, false);
});

test("canonical combination validation accepts complete same-Product combinations", () => {
  const result = validateVariantCombinations({
    productId: "product-frame",
    options: [sizeOption],
    optionValues: [sizeSmall, sizeLarge],
    variants: [
      variant(),
      variant({
        id: "variant-large",
        skuCode: "FRAME-LARGE",
        priceCents: 3_999,
        isDefault: false,
        selectedOptions: [{ optionId: "option-size", valueId: "value-large" }],
      }),
    ],
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.value.map(({ signature }) => signature), [
    "option-size=value-small",
    "option-size=value-large",
  ]);
});

test("combination validation rejects incomplete, repeated, duplicate, and cross-Product selections", () => {
  assert.equal(
    hasIssue(
      validateVariantCombinations({
        productId: "product-frame",
        options: [sizeOption],
        optionValues: [sizeSmall],
        variants: [variant({ selectedOptions: [] })],
      }),
      "incomplete",
    ),
    true,
  );

  const duplicateSelection = variant({
    selectedOptions: [
      { optionId: "option-size", valueId: "value-small" },
      { optionId: "option-size", valueId: "value-large" },
    ],
  });
  assert.equal(
    hasIssue(
      validateVariantCombinations({
        productId: "product-frame",
        options: [sizeOption],
        optionValues: [sizeSmall, sizeLarge],
        variants: [duplicateSelection],
      }),
      "duplicate",
    ),
    true,
  );

  assert.equal(
    hasIssue(
      validateVariantCombinations({
        productId: "product-frame",
        options: [sizeOption],
        optionValues: [sizeSmall],
        variants: [
          variant(),
          variant({ id: "variant-copy", skuCode: "FRAME-COPY", isDefault: false }),
        ],
      }),
      "duplicate",
    ),
    true,
  );

  assert.equal(
    hasIssue(
      validateVariantCombinations({
        productId: "product-frame",
        options: [sizeOption],
        optionValues: [{ ...sizeSmall, productId: "product-other" }],
        variants: [variant()],
      }),
      "ownership",
    ),
    true,
  );
});

test("empty combination is reserved for the default Variant of a Product without Options", () => {
  const emptyDefault = variant({ selectedOptions: [] });
  assert.equal(
    validateVariantCombinations({
      productId: "product-frame",
      options: [],
      optionValues: [],
      variants: [emptyDefault],
    }).ok,
    true,
  );
  assert.equal(
    validateVariantCombinations({
      productId: "product-frame",
      options: [],
      optionValues: [],
      variants: [variant({ selectedOptions: [], isDefault: false })],
    }).ok,
    false,
  );
});

test("SKU codes are globally unique even across Products", () => {
  const result = validateGlobalSkuCodes([
    variant(),
    variant({ id: "variant-other", productId: "product-other" }),
  ]);
  assert.equal(hasIssue(result, "duplicate"), true);
});

test("Variant-authoritative prices derive same and starting prices", () => {
  assert.deepEqual(deriveVariantListingPrice("product-frame", [variant()]), {
    ok: true,
    value: { kind: "single", priceCents: 2_999, currency: "USD" },
  });
  assert.deepEqual(
    deriveVariantListingPrice("product-frame", [
      variant(),
      variant({ id: "variant-large", skuCode: "FRAME-LARGE", priceCents: 3_999 }),
    ]),
    {
      ok: true,
      value: {
        kind: "starting_at",
        minPriceCents: 2_999,
        maxPriceCents: 3_999,
        currency: "USD",
      },
    },
  );
});

test("pricing rejects invalid or unavailable SKUs and ignores stale browser price", () => {
  assert.equal(parseProductVariant({ ...variant(), currency: "EUR" }).ok, false);
  assert.equal(parseProductVariant({ ...variant(), priceCents: -1 }).ok, false);
  assert.equal(
    deriveVariantListingPrice("product-frame", [variant({ isActive: false })]).ok,
    false,
  );
  assert.equal(
    resolveAuthoritativeVariantPrice(
      {
        productId: "product-frame",
        variantId: "variant-small",
        submittedPriceCents: 1,
        submittedCurrency: "EUR",
      },
      [variant()],
    ).value.priceCents,
    2_999,
  );
  assert.equal(
    resolveAuthoritativeVariantPrice(
      { productId: "product-frame", variantId: "variant-small" },
      [variant({ isAvailable: false })],
    ).ok,
    false,
  );
});

test("ProductAsset accepts public metadata and rejects private, binary, preview, and cross-Product inputs", () => {
  const asset = parseProductAsset({
    id: "asset-frame-hero",
    productId: "product-frame",
    variantId: "variant-small",
    mediaType: "image",
    role: "thumbnail",
    position: 0,
    altText: "Personalized memory frame",
    width: 1_200,
    height: 1_200,
    visibility: "public",
    source: { kind: "url", value: "https://cdn.example.com/frame.webp" },
  });
  assert.equal(asset.ok, true);
  assert.ok(asset.ok);
  assert.equal(validateProductAssetAssociation(asset.value, [variant()]).ok, true);
  assert.equal(
    validateProductAssetAssociation(asset.value, [variant({ productId: "product-other" })]).ok,
    false,
  );
  assert.equal(parseProductAsset({ ...asset.value, visibility: "private" }).ok, false);
  assert.equal(parseProductAsset({ ...asset.value, role: "production_preview" }).ok, false);
  assert.equal(parseProductAsset({ ...asset.value, mediaType: "document" }).ok, false);
  assert.equal(parseProductAsset({ ...asset.value, bytes: new Uint8Array() }).ok, false);
  assert.equal(
    parseProductAsset({
      ...asset.value,
      source: { kind: "url", value: "https://cdn.example.com/frame image.webp" },
    }).ok,
    false,
  );
  assert.equal(
    parseProductAsset({
      ...asset.value,
      source: { kind: "url", value: "HTTPS://cdn.example.com/frame.webp" },
    }).ok,
    true,
  );
  assert.equal(
    parseProductAsset({
      ...asset.value,
      variantId: undefined,
      source: { kind: "public_reference", value: "marketing/frame/gallery-01" },
    }).ok,
    true,
  );
  for (const prefix of ["private", "customer", "order", "preview", "delivery"]) {
    assert.equal(
      parseProductAsset({
        ...asset.value,
        source: { kind: "public_reference", value: `${prefix}:private-file` },
      }).ok,
      false,
    );
  }
});

test("ProductFulfillmentConfig owns production semantics but not SKU supply method", () => {
  assert.equal(
    parseProductFulfillmentConfig({
      id: "fulfillment-frame",
      productId: "product-frame",
      fulfillmentType: "physical",
      requiresShipping: true,
      productionMode: "custom_manufacturing",
      leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
    }).ok,
    true,
  );
  assert.equal(
    parseProductFulfillmentConfig({
      id: "fulfillment-download",
      productId: "product-download",
      fulfillmentType: "digital",
      requiresShipping: true,
      productionMode: "digital_creation",
      leadTime: { minBusinessDays: 1, maxBusinessDays: 2 },
    }).ok,
    false,
  );
  assert.equal(
    parseProductFulfillmentConfig({
      id: "fulfillment-frame",
      productId: "product-frame",
      fulfillmentType: "physical",
      requiresShipping: true,
      productionMode: "custom_manufacturing",
      supplyMethod: "made_to_order",
      leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
    }).ok,
    false,
  );
  assert.equal(
    parseProductFulfillmentConfig({
      id: "fulfillment-frame",
      productId: "product-frame",
      fulfillmentType: "physical",
      requiresShipping: true,
      productionMode: "custom_manufacturing",
      leadTime: { minBusinessDays: 10, maxBusinessDays: 5 },
    }).ok,
    false,
  );
});

test("public eligibility requires a valid published graph and an active available Variant", () => {
  const eligible = evaluatePublicEligibility(validGraph());
  assert.equal(eligible.eligible, true);

  assert.equal(
    evaluatePublicEligibility(
      validGraph({ category: { ...validGraph().category, lifecycle: "draft" } }),
    ).eligible,
    false,
  );
  assert.equal(
    evaluatePublicEligibility(
      validGraph({ product: { ...validGraph().product, lifecycle: "draft" } }),
    ).eligible,
    false,
  );
  assert.equal(
    evaluatePublicEligibility(
      validGraph({ product: { ...validGraph().product, categoryId: "category-other" } }),
    ).eligible,
    false,
  );
  assert.equal(
    evaluatePublicEligibility(
      validGraph({
        fulfillment: { ...validGraph().fulfillment, productId: "product-other" },
      }),
    ).eligible,
    false,
  );
  assert.equal(
    evaluatePublicEligibility(
      validGraph({ variants: [variant({ isAvailable: false })] }),
    ).eligible,
    false,
  );
  assert.equal(
    evaluatePublicEligibility(
      validGraph({ variants: [variant({ selectedOptions: [] })] }),
    ).eligible,
    false,
  );
});
