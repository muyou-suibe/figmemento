import {
  isIdentifier,
  isNonEmptyString,
  isRecord,
  isSlug,
  unknownFieldIssues,
  validationFailure,
  validationIssue,
  validationSuccess,
  type CatalogValidationIssue,
  type CatalogValidationResult,
} from "./validation.ts";

export type CatalogLifecycle = "draft" | "published" | "retired";

export interface CatalogSeo {
  title?: string;
  description?: string;
  canonicalPath?: string;
  imageAssetId?: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  seo: CatalogSeo;
  lifecycle: CatalogLifecycle;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  categoryId: string;
  name: string;
  description: string;
  seo: CatalogSeo;
  lifecycle: CatalogLifecycle;
}

const LIFECYCLES: readonly CatalogLifecycle[] = [
  "draft",
  "published",
  "retired",
];

function parseSeo(value: unknown, path: string): CatalogValidationResult<CatalogSeo> {
  if (!isRecord(value)) {
    return validationFailure(
      validationIssue(path, "invalid_type", "SEO metadata must be an object."),
    );
  }

  const issues = unknownFieldIssues(
    value,
    ["title", "description", "canonicalPath", "imageAssetId"],
    path,
  );

  if (value.title !== undefined && !isNonEmptyString(value.title, 120)) {
    issues.push(validationIssue(`${path}.title`, "invalid_value", "SEO title must be a non-empty string of at most 120 characters."));
  }
  if (
    value.description !== undefined &&
    !isNonEmptyString(value.description, 320)
  ) {
    issues.push(validationIssue(`${path}.description`, "invalid_value", "SEO description must be a non-empty string of at most 320 characters."));
  }
  if (
    value.canonicalPath !== undefined &&
    (typeof value.canonicalPath !== "string" ||
      !value.canonicalPath.startsWith("/") ||
      value.canonicalPath.includes("://"))
  ) {
    issues.push(validationIssue(`${path}.canonicalPath`, "invalid_format", "Canonical path must be an application-relative path."));
  }
  if (value.imageAssetId !== undefined && !isIdentifier(value.imageAssetId)) {
    issues.push(validationIssue(`${path}.imageAssetId`, "invalid_format", "SEO image asset ID is invalid."));
  }

  if (issues.length > 0) {
    return validationFailure(...issues);
  }

  return validationSuccess({
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.description === "string"
      ? { description: value.description }
      : {}),
    ...(typeof value.canonicalPath === "string"
      ? { canonicalPath: value.canonicalPath }
      : {}),
    ...(typeof value.imageAssetId === "string"
      ? { imageAssetId: value.imageAssetId }
      : {}),
  });
}

function collectCommonContentIssues(
  value: Record<string, unknown>,
): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  if (!isIdentifier(value.id)) {
    issues.push(validationIssue("$.id", "invalid_format", "Catalog ID is invalid."));
  }
  if (!isSlug(value.slug)) {
    issues.push(validationIssue("$.slug", "invalid_format", "Slug must be lowercase kebab-case."));
  }
  if (!isNonEmptyString(value.name, 160)) {
    issues.push(validationIssue("$.name", "invalid_value", "Name must be a non-empty string of at most 160 characters."));
  }
  if (!isNonEmptyString(value.description, 10_000)) {
    issues.push(validationIssue("$.description", "invalid_value", "Description must be non-empty and at most 10,000 characters."));
  }
  if (!LIFECYCLES.includes(value.lifecycle as CatalogLifecycle)) {
    issues.push(validationIssue("$.lifecycle", "invalid_value", "Lifecycle must be draft, published, or retired."));
  }
  return issues;
}

export function parseCategory(value: unknown): CatalogValidationResult<Category> {
  if (!isRecord(value)) {
    return validationFailure(
      validationIssue("$", "invalid_type", "Category must be an object."),
    );
  }

  const issues = [
    ...unknownFieldIssues(value, ["id", "slug", "name", "description", "seo", "lifecycle"]),
    ...collectCommonContentIssues(value),
  ];
  const seo = parseSeo(value.seo, "$.seo");
  if (!seo.ok) {
    issues.push(...seo.issues);
  }
  if (issues.length > 0 || !seo.ok) {
    return validationFailure(...issues);
  }

  return validationSuccess({
    id: value.id as string,
    slug: value.slug as string,
    name: value.name as string,
    description: value.description as string,
    seo: seo.value,
    lifecycle: value.lifecycle as CatalogLifecycle,
  });
}

export function parseCatalogProduct(
  value: unknown,
): CatalogValidationResult<CatalogProduct> {
  if (!isRecord(value)) {
    return validationFailure(
      validationIssue("$", "invalid_type", "Product must be an object."),
    );
  }

  const issues = [
    ...unknownFieldIssues(value, ["id", "slug", "categoryId", "name", "description", "seo", "lifecycle"]),
    ...collectCommonContentIssues(value),
  ];
  if (!isIdentifier(value.categoryId)) {
    issues.push(validationIssue("$.categoryId", "invalid_format", "Category ID is invalid."));
  }
  const seo = parseSeo(value.seo, "$.seo");
  if (!seo.ok) {
    issues.push(...seo.issues);
  }
  if (issues.length > 0 || !seo.ok) {
    return validationFailure(...issues);
  }

  return validationSuccess({
    id: value.id as string,
    slug: value.slug as string,
    categoryId: value.categoryId as string,
    name: value.name as string,
    description: value.description as string,
    seo: seo.value,
    lifecycle: value.lifecycle as CatalogLifecycle,
  });
}

export function validateProductCategoryOwnership(
  product: CatalogProduct,
  category: Category,
): CatalogValidationResult<true> {
  if (product.categoryId !== category.id) {
    return validationFailure(
      validationIssue(
        "$.categoryId",
        "ownership",
        "Product must reference the supplied Category.",
      ),
    );
  }
  return validationSuccess(true);
}
