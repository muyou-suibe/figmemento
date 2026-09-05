import type {
  CatalogGraph,
  CatalogProduct,
  Category,
  ProductAsset,
  ProductFulfillmentConfig,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
} from "../domain/catalog/index.ts";
import {
  validateGlobalSkuCodes,
  validateProductAssetAssociation,
  validateVariantCombinations,
  validationFailure,
  validationIssue,
  validationSuccess,
  type CatalogValidationIssue,
  type CatalogValidationResult,
} from "../domain/catalog/index.ts";

export interface CatalogDataSet {
  categories: readonly Category[];
  products: readonly CatalogProduct[];
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly ProductVariant[];
  assets: readonly ProductAsset[];
  fulfillmentConfigs: readonly ProductFulfillmentConfig[];
}

export interface CatalogProductGraph extends CatalogGraph {
  assets: readonly ProductAsset[];
}

function duplicateIssues<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
  path: string,
  label: string,
): CatalogValidationIssue[] {
  const seen = new Set<string>();
  const issues: CatalogValidationIssue[] = [];
  values.forEach((value, index) => {
    const key = keyFor(value);
    if (seen.has(key)) {
      issues.push(validationIssue(`${path}[${index}]`, "duplicate", `${label} '${key}' must be unique.`));
    }
    seen.add(key);
  });
  return issues;
}

export function sortCatalogDataSet(dataSet: CatalogDataSet): CatalogDataSet {
  return {
    categories: [...dataSet.categories].sort((left, right) => left.slug.localeCompare(right.slug) || left.id.localeCompare(right.id)),
    products: [...dataSet.products].sort((left, right) => left.slug.localeCompare(right.slug) || left.id.localeCompare(right.id)),
    options: [...dataSet.options].sort((left, right) => left.productId.localeCompare(right.productId) || left.position - right.position || left.id.localeCompare(right.id)),
    optionValues: [...dataSet.optionValues].sort((left, right) => left.optionId.localeCompare(right.optionId) || left.position - right.position || left.id.localeCompare(right.id)),
    variants: [...dataSet.variants].sort((left, right) => left.productId.localeCompare(right.productId) || left.skuCode.localeCompare(right.skuCode) || left.id.localeCompare(right.id)),
    assets: [...dataSet.assets].sort((left, right) => left.productId.localeCompare(right.productId) || left.position - right.position || left.id.localeCompare(right.id)),
    fulfillmentConfigs: [...dataSet.fulfillmentConfigs].sort((left, right) => left.productId.localeCompare(right.productId) || left.id.localeCompare(right.id)),
  };
}

export function validateCatalogDataSet(
  dataSet: CatalogDataSet,
): CatalogValidationResult<true> {
  const issues: CatalogValidationIssue[] = [
    ...duplicateIssues(dataSet.categories, (category) => category.id, "$.categories", "Category ID"),
    ...duplicateIssues(dataSet.categories, (category) => category.slug, "$.categories", "Category slug"),
    ...duplicateIssues(dataSet.products, (product) => product.id, "$.products", "Product ID"),
    ...duplicateIssues(dataSet.products, (product) => product.slug, "$.products", "Product slug"),
    ...duplicateIssues(dataSet.options, (option) => option.id, "$.options", "Option ID"),
    ...duplicateIssues(dataSet.optionValues, (value) => value.id, "$.optionValues", "Option Value ID"),
    ...duplicateIssues(dataSet.variants, (variant) => variant.id, "$.variants", "Variant ID"),
    ...duplicateIssues(dataSet.assets, (asset) => asset.id, "$.assets", "ProductAsset ID"),
    ...duplicateIssues(dataSet.fulfillmentConfigs, (config) => config.id, "$.fulfillmentConfigs", "FulfillmentConfig ID"),
    ...duplicateIssues(dataSet.fulfillmentConfigs, (config) => config.productId, "$.fulfillmentConfigs", "FulfillmentConfig Product"),
  ];
  const categoryIds = new Set(dataSet.categories.map((category) => category.id));
  const productIds = new Set(dataSet.products.map((product) => product.id));
  const optionIds = new Set(dataSet.options.map((option) => option.id));

  dataSet.products.forEach((product, index) => {
    if (!categoryIds.has(product.categoryId)) {
      issues.push(validationIssue(`$.products[${index}].categoryId`, "ownership", "Product Category does not exist in the catalog data set."));
    }
  });
  dataSet.options.forEach((option, index) => {
    if (!productIds.has(option.productId)) {
      issues.push(validationIssue(`$.options[${index}].productId`, "ownership", "Product Option references an unknown Product."));
    }
  });
  dataSet.optionValues.forEach((value, index) => {
    if (!productIds.has(value.productId) || !optionIds.has(value.optionId)) {
      issues.push(validationIssue(`$.optionValues[${index}]`, "ownership", "Product Option Value references an unknown Product or Option."));
    }
  });
  dataSet.variants.forEach((variant, index) => {
    if (!productIds.has(variant.productId)) {
      issues.push(validationIssue(`$.variants[${index}].productId`, "ownership", "Variant references an unknown Product."));
    }
  });
  dataSet.assets.forEach((asset, index) => {
    if (!productIds.has(asset.productId)) {
      issues.push(validationIssue(`$.assets[${index}].productId`, "ownership", "ProductAsset references an unknown Product."));
    }
    const association = validateProductAssetAssociation(asset, dataSet.variants);
    if (!association.ok) {
      issues.push(...association.issues.map((issue) => ({ ...issue, path: `$.assets[${index}]${issue.path.slice(1)}` })));
    }
  });
  dataSet.fulfillmentConfigs.forEach((config, index) => {
    if (!productIds.has(config.productId)) {
      issues.push(validationIssue(`$.fulfillmentConfigs[${index}].productId`, "ownership", "FulfillmentConfig references an unknown Product."));
    }
  });

  const globalSkuCodes = validateGlobalSkuCodes(dataSet.variants);
  if (!globalSkuCodes.ok) issues.push(...globalSkuCodes.issues);

  dataSet.products.forEach((product) => {
    const combinations = validateVariantCombinations({
      productId: product.id,
      options: dataSet.options.filter((option) => option.productId === product.id),
      optionValues: dataSet.optionValues.filter((value) => value.productId === product.id),
      variants: dataSet.variants.filter((variant) => variant.productId === product.id),
      catalogVariants: dataSet.variants,
    });
    if (!combinations.ok) issues.push(...combinations.issues);
  });

  return issues.length > 0 ? validationFailure(...issues) : validationSuccess(true);
}

export function catalogGraphForProduct(
  dataSet: CatalogDataSet,
  product: CatalogProduct,
): CatalogValidationResult<CatalogProductGraph> {
  const issues: CatalogValidationIssue[] = [];
  const category = dataSet.categories.find((candidate) => candidate.id === product.categoryId);
  const fulfillment = dataSet.fulfillmentConfigs.filter((candidate) => candidate.productId === product.id);
  if (!category) {
    issues.push(validationIssue("$.product.categoryId", "ownership", "Product Category is missing."));
  }
  if (fulfillment.length !== 1) {
    issues.push(validationIssue("$.fulfillment", "required", "Product must have exactly one FulfillmentConfig for public use."));
  }
  if (!category || fulfillment.length !== 1) return validationFailure(...issues);

  return validationSuccess({
    category,
    product,
    fulfillment: fulfillment[0],
    options: dataSet.options.filter((option) => option.productId === product.id),
    optionValues: dataSet.optionValues.filter((value) => value.productId === product.id),
    variants: dataSet.variants.filter((variant) => variant.productId === product.id),
    catalogVariants: dataSet.variants,
    assets: dataSet.assets.filter((asset) => asset.productId === product.id),
  });
}
