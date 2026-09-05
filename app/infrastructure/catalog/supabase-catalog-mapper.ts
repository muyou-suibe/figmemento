import {
  canonicalVariantSignature,
  isIdentifier,
  isRecord,
  parseCatalogProduct,
  parseCategory,
  parseProductAsset,
  parseProductFulfillmentConfig,
  parseProductOption,
  parseProductOptionValue,
  parseProductVariant,
  validationIssue,
  type CatalogValidationIssue,
  type CatalogValidationResult,
  type ProductAsset,
  type ProductFulfillmentConfig,
  type ProductOption,
  type ProductOptionValue,
  type ProductVariant,
  type CatalogProduct,
  type Category,
} from "../../domain/catalog/index.ts";
import {
  sortCatalogDataSet,
  validateCatalogDataSet,
  type CatalogDataSet,
} from "../../application/catalog-data-set.ts";
import type { CatalogRepositoryResult } from "../../application/catalog-repository.ts";

export interface SupabaseCatalogRows {
  categories: readonly unknown[];
  products: readonly unknown[];
  productOptions: readonly unknown[];
  productOptionValues: readonly unknown[];
  productVariants: readonly unknown[];
  productVariantValues: readonly unknown[];
  productAssets: readonly unknown[];
  productFulfillmentConfigs: readonly unknown[];
}

interface VariantValueLink {
  variantId: string;
  productId: string;
  optionId: string;
  optionValueId: string;
}

interface ParsedRows<T> {
  values: T[];
  issues: CatalogValidationIssue[];
}

function prefixedIssues(
  issues: readonly CatalogValidationIssue[],
  rowPath: string,
): CatalogValidationIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: `${rowPath}${issue.path === "$" ? "" : issue.path.slice(1)}`,
  }));
}

function mapRows<T>(
  rows: readonly unknown[],
  path: string,
  toDomainInput: (row: Record<string, unknown>, index: number) => unknown,
  parser: (value: unknown) => CatalogValidationResult<T>,
): ParsedRows<T> {
  const values: T[] = [];
  const issues: CatalogValidationIssue[] = [];
  rows.forEach((row, index) => {
    const rowPath = `$.${path}[${index}]`;
    if (!isRecord(row)) {
      issues.push(validationIssue(rowPath, "invalid_type", "Supabase catalog row must be an object."));
      return;
    }
    const parsed = parser(toDomainInput(row, index));
    if (parsed.ok) values.push(parsed.value);
    else issues.push(...prefixedIssues(parsed.issues, rowPath));
  });
  return { values, issues };
}

function parseVariantValueLinks(rows: readonly unknown[]): ParsedRows<VariantValueLink> {
  const values: VariantValueLink[] = [];
  const issues: CatalogValidationIssue[] = [];
  rows.forEach((row, index) => {
    const path = `$.productVariantValues[${index}]`;
    if (!isRecord(row)) {
      issues.push(validationIssue(path, "invalid_type", "Variant Value row must be an object."));
      return;
    }
    const fields = ["variant_id", "product_id", "option_id", "option_value_id"] as const;
    const invalid = fields.filter((field) => !isIdentifier(row[field]));
    invalid.forEach((field) => {
      issues.push(validationIssue(`${path}.${field}`, "invalid_format", `${field} must be a valid catalog identifier.`));
    });
    if (invalid.length === 0) {
      values.push({
        variantId: row.variant_id as string,
        productId: row.product_id as string,
        optionId: row.option_id as string,
        optionValueId: row.option_value_id as string,
      });
    }
  });
  return { values, issues };
}

export function mapSupabaseCatalogRows(
  rows: SupabaseCatalogRows,
): CatalogRepositoryResult<CatalogDataSet> {
  const links = parseVariantValueLinks(rows.productVariantValues);
  const categories = mapRows<Category>(
    rows.categories,
    "categories",
    (row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      seo: row.seo,
      lifecycle: row.lifecycle,
    }),
    parseCategory,
  );
  const products = mapRows<CatalogProduct>(
    rows.products,
    "products",
    (row) => ({
      id: row.id,
      slug: row.slug,
      categoryId: row.category_id,
      name: row.name,
      description: row.description,
      seo: row.seo ?? {},
      lifecycle: row.lifecycle,
    }),
    parseCatalogProduct,
  );
  const options = mapRows<ProductOption>(
    rows.productOptions,
    "productOptions",
    (row) => ({
      id: row.id,
      productId: row.product_id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      required: row.is_required,
      position: row.position,
    }),
    parseProductOption,
  );
  const optionValues = mapRows<ProductOptionValue>(
    rows.productOptionValues,
    "productOptionValues",
    (row) => ({
      id: row.id,
      productId: row.product_id,
      optionId: row.option_id,
      code: row.code,
      label: row.label,
      position: row.position,
    }),
    parseProductOptionValue,
  );
  const variants = mapRows<ProductVariant>(
    rows.productVariants,
    "productVariants",
    (row) => ({
      id: row.id,
      productId: row.product_id,
      skuCode: row.sku_code,
      priceCents: row.price_cents,
      currency: row.currency,
      weightGrams: row.weight_grams,
      isActive: row.is_active,
      isAvailable: row.is_available,
      isDefault: row.is_default,
      supplyMethod: row.supply_method,
      selectedOptions: links.values
        .filter((link) => link.variantId === row.id)
        .map((link) => ({ optionId: link.optionId, valueId: link.optionValueId }))
        .sort((left, right) => left.optionId.localeCompare(right.optionId) || left.valueId.localeCompare(right.valueId)),
    }),
    parseProductVariant,
  );
  const assets = mapRows<ProductAsset>(
    rows.productAssets,
    "productAssets",
    (row) => ({
      id: row.id,
      productId: row.product_id,
      ...(typeof row.variant_id === "string" ? { variantId: row.variant_id } : {}),
      mediaType: row.media_type,
      role: row.role,
      position: row.position,
      ...(typeof row.alt_text === "string" ? { altText: row.alt_text } : {}),
      ...(typeof row.title === "string" ? { title: row.title } : {}),
      ...(typeof row.width === "number" ? { width: row.width } : {}),
      ...(typeof row.height === "number" ? { height: row.height } : {}),
      visibility: row.visibility,
      source: { kind: row.source_kind, value: row.source_value },
    }),
    parseProductAsset,
  );
  const fulfillmentConfigs = mapRows<ProductFulfillmentConfig>(
    rows.productFulfillmentConfigs,
    "productFulfillmentConfigs",
    (row) => ({
      id: row.id,
      productId: row.product_id,
      fulfillmentType: row.fulfillment_type,
      requiresShipping: row.requires_shipping,
      productionMode: row.production_mode,
      leadTime: {
        minBusinessDays: row.min_lead_time_business_days,
        maxBusinessDays: row.max_lead_time_business_days,
      },
    }),
    parseProductFulfillmentConfig,
  );

  const issues = [
    ...links.issues,
    ...categories.issues,
    ...products.issues,
    ...options.issues,
    ...optionValues.issues,
    ...variants.issues,
    ...assets.issues,
    ...fulfillmentConfigs.issues,
  ];
  const variantById = new Map(variants.values.map((variant) => [variant.id, variant]));
  const optionById = new Map(options.values.map((option) => [option.id, option]));
  const valueById = new Map(optionValues.values.map((value) => [value.id, value]));
  links.values.forEach((link, index) => {
    const variant = variantById.get(link.variantId);
    const option = optionById.get(link.optionId);
    const value = valueById.get(link.optionValueId);
    if (
      !variant ||
      !option ||
      !value ||
      variant.productId !== link.productId ||
      option.productId !== link.productId ||
      value.productId !== link.productId ||
      value.optionId !== link.optionId
    ) {
      issues.push(validationIssue(`$.productVariantValues[${index}]`, "ownership", "Variant Value relationship must remain within one Product and Option."));
    }
  });

  rows.productVariants.forEach((row, index) => {
    if (!isRecord(row) || typeof row.id !== "string") return;
    const variant = variantById.get(row.id);
    if (!variant || typeof row.combination_signature !== "string") {
      if (typeof row.combination_signature !== "string") {
        issues.push(validationIssue(`$.productVariants[${index}].combination_signature`, "invalid_type", "Variant combination signature must be a string."));
      }
      return;
    }
    if (canonicalVariantSignature(variant.selectedOptions) !== row.combination_signature) {
      issues.push(validationIssue(`$.productVariants[${index}].combination_signature`, "invalid_value", "Stored Variant combination signature does not match selected Option Values."));
    }
  });

  if (issues.length > 0) return { status: "invalid_configuration", issues };
  const value = sortCatalogDataSet({
    categories: categories.values,
    products: products.values,
    options: options.values,
    optionValues: optionValues.values,
    variants: variants.values,
    assets: assets.values,
    fulfillmentConfigs: fulfillmentConfigs.values,
  });
  const graphValidation = validateCatalogDataSet(value);
  return graphValidation.ok
    ? { status: "found", value }
    : { status: "invalid_configuration", issues: graphValidation.issues };
}
