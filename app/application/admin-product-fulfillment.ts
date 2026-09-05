import {
  isIdentifier,
  isRecord,
  parseProductFulfillmentConfig,
  unknownFieldIssues,
  validationIssue,
  type CatalogValidationIssue,
  type ProductFulfillmentConfig,
} from "../domain/catalog/index.ts";
import { validateCatalogDataSet, type CatalogDataSet } from "./catalog-data-set.ts";
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

export type ProductFulfillmentMutationIntent =
  | { operation: "create"; productId: string; config: ProductFulfillmentConfig }
  | { operation: "update"; productId: string; config: ProductFulfillmentConfig };

export type ProductFulfillmentWriteResult =
  | { status: "applied"; value: ProductFulfillmentConfig }
  | { status: "not_found" }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] }
  | { status: "source_failure"; operation: "catalog.admin.product_fulfillment" };

export interface ProductFulfillmentWriteRepository {
  createProductFulfillmentConfig(config: ProductFulfillmentConfig): Promise<ProductFulfillmentWriteResult>;
  updateProductFulfillmentConfig(config: ProductFulfillmentConfig): Promise<ProductFulfillmentWriteResult>;
}

export interface PrivilegedAdminProductFulfillmentRepositories {
  reader: CatalogAdminReadRepository;
  writer: ProductFulfillmentWriteRepository;
}

function safeIssues(issues: readonly CatalogValidationIssue[]): readonly SafeCatalogValidationIssue[] {
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

export function parseProductFulfillmentMutationIntent(
  value: unknown,
): { ok: true; value: ProductFulfillmentMutationIntent } | { ok: false; issues: readonly CatalogValidationIssue[] } {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [validationIssue("$", "invalid_type", "ProductFulfillmentConfig command must be an object.")],
    };
  }
  const issues = unknownFieldIssues(value, ["operation", "productId", "config"]);
  if (value.operation !== "create" && value.operation !== "update") {
    issues.push(validationIssue("$.operation", "invalid_value", "FulfillmentConfig operation must be create or update."));
  }
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  const productId = typeof value.productId === "string" ? value.productId : "invalid-product";
  const parsed = parseProductFulfillmentConfig(value.config);
  if (!parsed.ok) issues.push(...prefixedIssues(parsed.issues, "$.config"));
  if (parsed.ok && parsed.value.productId !== productId) {
    issues.push(validationIssue("$.config.productId", "ownership", "Config Product ID must match the command Product ID."));
  }
  if (parsed.ok && value.operation === "create" && !isCatalogDraftId(parsed.value.id)) {
    issues.push(validationIssue("$.config.id", "invalid_format", "New FulfillmentConfigs must use a temporary new: identity."));
  }
  if (parsed.ok && value.operation === "update" && isCatalogDraftId(parsed.value.id)) {
    issues.push(validationIssue("$.config.id", "invalid_format", "FulfillmentConfig updates require an existing persistent identity."));
  }
  if (
    issues.length > 0
    || !parsed.ok
    || (value.operation !== "create" && value.operation !== "update")
  ) return { ok: false, issues };
  return {
    ok: true,
    value: { operation: value.operation, productId, config: parsed.value },
  };
}

function dataSetWithConfig(
  dataSet: CatalogDataSet,
  config: ProductFulfillmentConfig,
): CatalogDataSet {
  const exists = dataSet.fulfillmentConfigs.some((candidate) => candidate.id === config.id);
  return {
    ...dataSet,
    fulfillmentConfigs: exists
      ? dataSet.fulfillmentConfigs.map((candidate) => candidate.id === config.id ? config : candidate)
      : [...dataSet.fulfillmentConfigs, config],
  };
}

function sameConfig(left: ProductFulfillmentConfig, right: ProductFulfillmentConfig): boolean {
  return left.id === right.id
    && left.productId === right.productId
    && left.fulfillmentType === right.fulfillmentType
    && left.requiresShipping === right.requiresShipping
    && left.productionMode === right.productionMode
    && left.leadTime.minBusinessDays === right.leadTime.minBusinessDays
    && left.leadTime.maxBusinessDays === right.leadTime.maxBusinessDays;
}

function writeFailure(
  result: Exclude<ProductFulfillmentWriteResult, { status: "applied" }>,
): AdminCatalogBoundaryResult<never> {
  if (result.status === "not_found") return { status: "not_found" };
  if (result.status === "invalid_configuration") {
    return { status: "invalid_configuration", issues: safeIssues(result.issues) };
  }
  return { status: "source_failure", operation: "admin_catalog_command" };
}

export class AdminProductFulfillmentBoundary {
  private readonly verifier: AdminSessionVerifier;
  private readonly createRepositories: () => PrivilegedAdminProductFulfillmentRepositories;
  private readonly deriveId: CatalogDraftIdDeriver;

  constructor(
    verifier: AdminSessionVerifier,
    createRepositories: () => PrivilegedAdminProductFulfillmentRepositories,
    deriveId: CatalogDraftIdDeriver = deriveCatalogDraftUuid,
  ) {
    this.verifier = verifier;
    this.createRepositories = createRepositories;
    this.deriveId = deriveId;
  }

  async execute(
    routeProductId: string,
    request: unknown,
  ): Promise<AdminCatalogBoundaryResult<ProductFulfillmentConfig>> {
    let principal: AdminPrincipal;
    try {
      const authorization = await this.verifier.verifyAdminSession();
      if (authorization.status !== "authorized") return authorization;
      principal = authorization.principal;
    } catch {
      return { status: "authentication_failure" };
    }

    const parsed = parseProductFulfillmentMutationIntent(request);
    if (!parsed.ok) return { status: "invalid_request", issues: safeIssues(parsed.issues) };
    if (parsed.value.productId !== routeProductId) {
      return {
        status: "invalid_request",
        issues: safeIssues([
          validationIssue("$.productId", "ownership", "Route Product ID must match the FulfillmentConfig Product ID."),
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

      let config = parsed.value.config;
      if (parsed.value.operation === "create") {
        const id = await this.deriveId(routeProductId, "fulfillment", config.id);
        if (!isIdentifier(id) || isCatalogDraftId(id)) {
          return {
            status: "invalid_request",
            issues: safeIssues([
              validationIssue("$.config.id", "invalid_value", "Server could not derive a persistent FulfillmentConfig identity."),
            ]),
          };
        }
        config = { ...config, id };
        const currentForProduct = loaded.value.fulfillmentConfigs.find(
          (candidate) => candidate.productId === routeProductId,
        );
        if (currentForProduct) {
          if (sameConfig(currentForProduct, config)) {
            return { status: "applied", value: currentForProduct, principal };
          }
          return {
            status: "invalid_request",
            issues: safeIssues([
              validationIssue("$.config", "duplicate", "Product already has a FulfillmentConfig. Reload and update the existing configuration."),
            ]),
          };
        }
        const identityCollision = loaded.value.fulfillmentConfigs.find((candidate) => candidate.id === id);
        if (identityCollision) {
          return {
            status: "invalid_request",
            issues: safeIssues([
              validationIssue("$.config.id", "ownership", "FulfillmentConfig identity belongs to another Product."),
            ]),
          };
        }
      } else {
        const existing = loaded.value.fulfillmentConfigs.find((candidate) => candidate.id === config.id);
        if (!existing) return { status: "not_found" };
        if (existing.productId !== routeProductId) {
          return {
            status: "invalid_request",
            issues: safeIssues([
              validationIssue("$.config.id", "ownership", "FulfillmentConfig belongs to another Product."),
            ]),
          };
        }
      }

      const proposed = dataSetWithConfig(loaded.value, config);
      const validation = validateCatalogDataSet(proposed);
      if (!validation.ok) return { status: "invalid_request", issues: safeIssues(validation.issues) };
      const saved = parsed.value.operation === "create"
        ? await repositories.writer.createProductFulfillmentConfig(config)
        : await repositories.writer.updateProductFulfillmentConfig(config);
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
