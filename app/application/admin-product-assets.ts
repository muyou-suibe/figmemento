import {
  isIdentifier,
  isRecord,
  parseProductAsset,
  unknownFieldIssues,
  validationIssue,
  type CatalogValidationIssue,
  type ProductAsset,
} from "../domain/catalog/index.ts";
import {
  validateCatalogDataSet,
  type CatalogDataSet,
} from "./catalog-data-set.ts";
import {
  deriveCatalogDraftUuid,
  isCatalogDraftId,
  type CatalogDraftIdDeriver,
} from "./catalog-draft-identity.ts";
import type {
  AdminCatalogBoundaryResult,
  AdminPrincipal,
  AdminSessionVerifier,
  SafeCatalogValidationIssue,
} from "./admin-catalog-boundary.ts";
import type { CatalogAdminReadRepository } from "./catalog-repository.ts";
import {
  adminAcceptanceConfigurationIssue,
  isAdminAcceptanceConfigurationError,
} from "../config/admin-acceptance-runtime.server.ts";

export type ProductAssetMutationIntent =
  | { operation: "create"; productId: string; asset: ProductAsset }
  | { operation: "update"; productId: string; asset: ProductAsset }
  | { operation: "remove"; productId: string; assetId: string };

export type ProductAssetWriteResult =
  | { status: "applied"; value: ProductAsset }
  | { status: "not_found" }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] }
  | { status: "source_failure"; operation: "catalog.admin.product_asset" };

export interface ProductAssetWriteRepository {
  createProductAsset(asset: ProductAsset): Promise<ProductAssetWriteResult>;
  updateProductAsset(asset: ProductAsset): Promise<ProductAssetWriteResult>;
  removeProductAsset(asset: ProductAsset): Promise<ProductAssetWriteResult>;
}

export interface PrivilegedAdminProductAssetRepositories {
  reader: CatalogAdminReadRepository;
  writer: ProductAssetWriteRepository;
}

function safeIssues(
  issues: readonly CatalogValidationIssue[],
): readonly SafeCatalogValidationIssue[] {
  return issues.map(({ path, code, message }) => ({ path, code, message }));
}

function prefixedIssues(
  issues: readonly CatalogValidationIssue[],
  prefix: string,
): CatalogValidationIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: issue.path === "$" ? prefix : `${prefix}${issue.path.slice(1)}`,
  }));
}

export function parseProductAssetMutationIntent(
  value: unknown,
): { ok: true; value: ProductAssetMutationIntent } | { ok: false; issues: readonly CatalogValidationIssue[] } {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [validationIssue("$", "invalid_type", "ProductAsset command must be an object.")],
    };
  }
  if (value.operation !== "create" && value.operation !== "update" && value.operation !== "remove") {
    return {
      ok: false,
      issues: [
        ...unknownFieldIssues(value, ["operation", "productId", "asset", "assetId"]),
        validationIssue("$.operation", "invalid_value", "ProductAsset operation is unsupported."),
      ],
    };
  }

  const fields = value.operation === "remove"
    ? ["operation", "productId", "assetId"]
    : ["operation", "productId", "asset"];
  const issues = unknownFieldIssues(value, fields);
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  const productId = typeof value.productId === "string" ? value.productId : "invalid-product";

  if (value.operation === "remove") {
    if (!isIdentifier(value.assetId) || (typeof value.assetId === "string" && isCatalogDraftId(value.assetId))) {
      issues.push(validationIssue("$.assetId", "invalid_format", "Removal requires an existing ProductAsset ID."));
    }
    return issues.length > 0
      ? { ok: false, issues }
      : { ok: true, value: { operation: "remove", productId, assetId: value.assetId as string } };
  }

  const parsed = parseProductAsset(value.asset);
  if (!parsed.ok) issues.push(...prefixedIssues(parsed.issues, "$.asset"));
  if (parsed.ok && parsed.value.productId !== productId) {
    issues.push(validationIssue("$.asset.productId", "ownership", "Asset Product ID must match the command Product ID."));
  }
  if (parsed.ok && value.operation === "create" && !isCatalogDraftId(parsed.value.id)) {
    issues.push(validationIssue("$.asset.id", "invalid_format", "New ProductAssets must use a temporary new: identity."));
  }
  if (parsed.ok && value.operation === "update" && isCatalogDraftId(parsed.value.id)) {
    issues.push(validationIssue("$.asset.id", "invalid_format", "ProductAsset updates require an existing persistent identity."));
  }
  if (issues.length > 0 || !parsed.ok) return { ok: false, issues };
  return {
    ok: true,
    value: { operation: value.operation, productId, asset: parsed.value },
  };
}

function dataSetWithAsset(dataSet: CatalogDataSet, asset: ProductAsset): CatalogDataSet {
  const exists = dataSet.assets.some((candidate) => candidate.id === asset.id);
  return {
    ...dataSet,
    assets: exists
      ? dataSet.assets.map((candidate) => candidate.id === asset.id ? asset : candidate)
      : [...dataSet.assets, asset],
  };
}

function dataSetWithoutAsset(dataSet: CatalogDataSet, assetId: string): CatalogDataSet {
  return {
    ...dataSet,
    assets: dataSet.assets.filter((candidate) => candidate.id !== assetId),
  };
}

function sameProductAsset(left: ProductAsset, right: ProductAsset): boolean {
  return left.id === right.id
    && left.productId === right.productId
    && left.variantId === right.variantId
    && left.mediaType === right.mediaType
    && left.role === right.role
    && left.position === right.position
    && left.altText === right.altText
    && left.title === right.title
    && left.width === right.width
    && left.height === right.height
    && left.visibility === right.visibility
    && left.source.kind === right.source.kind
    && left.source.value === right.source.value;
}

function referencedAssetIssues(dataSet: CatalogDataSet, assetId: string): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  dataSet.categories.forEach((category, index) => {
    if (category.seo.imageAssetId === assetId) {
      issues.push(validationIssue(
        `$.categories[${index}].seo.imageAssetId`,
        "ownership",
        "Remove this ProductAsset from Category SEO metadata before deleting it.",
      ));
    }
  });
  dataSet.products.forEach((product, index) => {
    if (product.seo.imageAssetId === assetId) {
      issues.push(validationIssue(
        `$.products[${index}].seo.imageAssetId`,
        "ownership",
        "Remove this ProductAsset from Product SEO metadata before deleting it.",
      ));
    }
  });
  return issues;
}

function writeFailure(
  result: Exclude<ProductAssetWriteResult, { status: "applied" }>,
): AdminCatalogBoundaryResult<never> {
  if (result.status === "not_found") return { status: "not_found" };
  if (result.status === "invalid_configuration") {
    return { status: "invalid_configuration", issues: safeIssues(result.issues) };
  }
  return { status: "source_failure", operation: "admin_catalog_command" };
}

export class AdminProductAssetBoundary {
  private readonly verifier: AdminSessionVerifier;
  private readonly createRepositories: () => PrivilegedAdminProductAssetRepositories;
  private readonly deriveId: CatalogDraftIdDeriver;

  constructor(
    verifier: AdminSessionVerifier,
    createRepositories: () => PrivilegedAdminProductAssetRepositories,
    deriveId: CatalogDraftIdDeriver = deriveCatalogDraftUuid,
  ) {
    this.verifier = verifier;
    this.createRepositories = createRepositories;
    this.deriveId = deriveId;
  }

  async execute(
    routeProductId: string,
    request: unknown,
  ): Promise<AdminCatalogBoundaryResult<ProductAsset>> {
    let principal: AdminPrincipal;
    try {
      const authorization = await this.verifier.verifyAdminSession();
      if (authorization.status !== "authorized") return authorization;
      principal = authorization.principal;
    } catch {
      return { status: "authentication_failure" };
    }

    const parsed = parseProductAssetMutationIntent(request);
    if (!parsed.ok) return { status: "invalid_request", issues: safeIssues(parsed.issues) };
    if (parsed.value.productId !== routeProductId) {
      return {
        status: "invalid_request",
        issues: safeIssues([
          validationIssue("$.productId", "ownership", "Route Product ID must match the ProductAsset Product ID."),
        ]),
      };
    }

    try {
      const repositories = this.createRepositories();
      const loaded = await repositories.reader.readAdminCatalogGraph();
      if (loaded.status !== "found") {
        if (loaded.status === "not_found") return { status: "not_found" };
        if (loaded.status === "unavailable") return { status: "unavailable", reason: loaded.reason };
        if (loaded.status === "invalid_configuration") {
          return { status: "invalid_configuration", issues: safeIssues(loaded.issues) };
        }
        return { status: "source_failure", operation: "admin_catalog_command" };
      }
      if (!loaded.value.products.some((product) => product.id === routeProductId)) {
        return { status: "not_found" };
      }

      if (parsed.value.operation === "remove") {
        const assetId = parsed.value.assetId;
        const existing = loaded.value.assets.find((asset) => asset.id === assetId);
        if (!existing) return { status: "not_found" };
        if (existing.productId !== routeProductId) {
          return {
            status: "invalid_request",
            issues: safeIssues([
              validationIssue("$.assetId", "ownership", "ProductAsset belongs to another Product."),
            ]),
          };
        }
        const references = referencedAssetIssues(loaded.value, existing.id);
        if (references.length > 0) return { status: "invalid_request", issues: safeIssues(references) };
        const proposed = dataSetWithoutAsset(loaded.value, existing.id);
        const validation = validateCatalogDataSet(proposed);
        if (!validation.ok) return { status: "invalid_request", issues: safeIssues(validation.issues) };
        const removed = await repositories.writer.removeProductAsset(existing);
        return removed.status === "applied"
          ? { status: "applied", value: removed.value, principal }
          : writeFailure(removed);
      }

      let asset = parsed.value.asset;
      if (parsed.value.operation === "create") {
        const id = await this.deriveId(routeProductId, "asset", asset.id);
        if (!isIdentifier(id) || isCatalogDraftId(id)) {
          return {
            status: "invalid_request",
            issues: safeIssues([
              validationIssue("$.asset.id", "invalid_value", "Server could not derive a persistent ProductAsset identity."),
            ]),
          };
        }
        asset = { ...asset, id };
        const persisted = loaded.value.assets.find((candidate) => candidate.id === id);
        if (persisted) {
          if (persisted.productId === routeProductId && sameProductAsset(persisted, asset)) {
            return { status: "applied", value: persisted, principal };
          }
          return {
            status: "invalid_request",
            issues: safeIssues([
              validationIssue("$.asset.id", "duplicate", "Draft identity is already associated with different ProductAsset metadata."),
            ]),
          };
        }
      } else {
        const existing = loaded.value.assets.find((candidate) => candidate.id === asset.id);
        if (!existing) return { status: "not_found" };
        if (existing.productId !== routeProductId) {
          return {
            status: "invalid_request",
            issues: safeIssues([
              validationIssue("$.asset.id", "ownership", "ProductAsset belongs to another Product."),
            ]),
          };
        }
      }

      const proposed = dataSetWithAsset(loaded.value, asset);
      const validation = validateCatalogDataSet(proposed);
      if (!validation.ok) return { status: "invalid_request", issues: safeIssues(validation.issues) };
      const saved = parsed.value.operation === "create"
        ? await repositories.writer.createProductAsset(asset)
        : await repositories.writer.updateProductAsset(asset);
      return saved.status === "applied"
        ? { status: "applied", value: saved.value, principal }
        : writeFailure(saved);
    } catch (error) {
      if (isAdminAcceptanceConfigurationError(error)) {
        return { status: "invalid_configuration", issues: [adminAcceptanceConfigurationIssue()] };
      }
      return { status: "source_failure", operation: "admin_catalog_command" };
    }
  }
}
