import {
  isIdentifier,
  isRecord,
  parseProductOption,
  parseProductOptionValue,
  parseProductVariant,
  unknownFieldIssues,
  validationIssue,
  type CatalogValidationIssue,
  type ProductOption,
  type ProductOptionValue,
  type ProductVariant,
} from "../domain/catalog/index.ts";
import {
  validateCatalogDataSet,
  type CatalogDataSet,
} from "./catalog-data-set.ts";
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
import {
  deriveCatalogDraftUuid,
  isCatalogDraftId,
  type CatalogDraftEntityKind,
  type CatalogDraftIdDeriver,
} from "./catalog-draft-identity.ts";

export { deriveCatalogDraftUuid } from "./catalog-draft-identity.ts";

export interface ProductSkuGraph {
  productId: string;
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly ProductVariant[];
}

export type ProductSkuGraphWriteResult =
  | { status: "applied"; value: ProductSkuGraph }
  | { status: "not_found" }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] }
  | { status: "source_failure"; operation: "catalog.admin.sku_graph" };

export interface ProductSkuGraphWriteRepository {
  saveProductSkuGraph(graph: ProductSkuGraph): Promise<ProductSkuGraphWriteResult>;
}

export interface PrivilegedAdminSkuGraphRepositories {
  reader: CatalogAdminReadRepository;
  writer: ProductSkuGraphWriteRepository;
}

export type ServerIdDeriver = CatalogDraftIdDeriver;

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

function parseArray<T>(
  value: unknown,
  path: string,
  parser: (candidate: unknown, index: number) =>
    | { ok: true; value: T }
    | { ok: false; issues: readonly CatalogValidationIssue[] },
): { values: T[]; issues: CatalogValidationIssue[] } {
  if (!Array.isArray(value)) {
    return {
      values: [],
      issues: [validationIssue(path, "invalid_type", `${path.slice(2)} must be an array.`)],
    };
  }
  const values: T[] = [];
  const issues: CatalogValidationIssue[] = [];
  value.forEach((candidate, index) => {
    const parsed = parser(candidate, index);
    if (parsed.ok) values.push(parsed.value);
    else issues.push(...parsed.issues);
  });
  return { values, issues };
}

export function parseProductSkuGraphIntent(
  value: unknown,
): { ok: true; value: ProductSkuGraph } | { ok: false; issues: readonly CatalogValidationIssue[] } {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [validationIssue("$", "invalid_type", "Product SKU graph must be an object.")],
    };
  }
  const issues = unknownFieldIssues(value, ["productId", "options", "optionValues", "variants"]);
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  const productId = typeof value.productId === "string" ? value.productId : "invalid-product";

  const options = parseArray(value.options, "$.options", (candidate, index) => {
    const path = `$.options[${index}]`;
    if (!isRecord(candidate)) {
      return { ok: false as const, issues: [validationIssue(path, "invalid_type", "Product Option must be an object.")] };
    }
    const nestedIssues = unknownFieldIssues(
      candidate,
      ["id", "code", "name", "kind", "required", "position"],
      path,
    );
    const parsed = parseProductOption({ ...candidate, productId });
    if (!parsed.ok) nestedIssues.push(...prefixedIssues(parsed.issues, path));
    return nestedIssues.length > 0 || !parsed.ok
      ? { ok: false as const, issues: nestedIssues }
      : { ok: true as const, value: parsed.value };
  });

  const optionValues = parseArray(value.optionValues, "$.optionValues", (candidate, index) => {
    const path = `$.optionValues[${index}]`;
    if (!isRecord(candidate)) {
      return { ok: false as const, issues: [validationIssue(path, "invalid_type", "Product Option Value must be an object.")] };
    }
    const nestedIssues = unknownFieldIssues(
      candidate,
      ["id", "optionId", "code", "label", "position"],
      path,
    );
    const parsed = parseProductOptionValue({ ...candidate, productId });
    if (!parsed.ok) nestedIssues.push(...prefixedIssues(parsed.issues, path));
    return nestedIssues.length > 0 || !parsed.ok
      ? { ok: false as const, issues: nestedIssues }
      : { ok: true as const, value: parsed.value };
  });

  const variants = parseArray(value.variants, "$.variants", (candidate, index) => {
    const path = `$.variants[${index}]`;
    if (!isRecord(candidate)) {
      return { ok: false as const, issues: [validationIssue(path, "invalid_type", "Product Variant must be an object.")] };
    }
    const nestedIssues = unknownFieldIssues(candidate, [
      "id",
      "skuCode",
      "priceCents",
      "currency",
      "weightGrams",
      "isActive",
      "isAvailable",
      "isDefault",
      "supplyMethod",
      "selectedOptions",
    ], path);
    const parsed = parseProductVariant({ ...candidate, productId });
    if (!parsed.ok) nestedIssues.push(...prefixedIssues(parsed.issues, path));
    return nestedIssues.length > 0 || !parsed.ok
      ? { ok: false as const, issues: nestedIssues }
      : { ok: true as const, value: parsed.value };
  });

  issues.push(...options.issues, ...optionValues.issues, ...variants.issues);
  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        value: {
          productId,
          options: options.values,
          optionValues: optionValues.values,
          variants: variants.values,
        },
      };
}

async function assignEntityIds<T extends { id: string; productId: string }>(
  desired: readonly T[],
  current: readonly T[],
  allCurrent: readonly T[],
  productId: string,
  entityKind: CatalogDraftEntityKind,
  path: string,
  deriveId: ServerIdDeriver,
): Promise<{ ids: Map<string, string>; issues: CatalogValidationIssue[] }> {
  const ids = new Map<string, string>();
  const issues: CatalogValidationIssue[] = [];
  const currentIds = new Set(current.map((item) => item.id));
  const allById = new Map(allCurrent.map((item) => [item.id, item]));
  const generated = new Set<string>();
  for (const [index, item] of desired.entries()) {
    if (ids.has(item.id)) {
      issues.push(validationIssue(`${path}[${index}].id`, "duplicate", "Draft entity IDs must be unique."));
      continue;
    }
    if (isCatalogDraftId(item.id)) {
      const serverId = await deriveId(productId, entityKind, item.id);
      const persisted = allById.get(serverId);
      if (
        !isIdentifier(serverId)
        || generated.has(serverId)
        || (persisted !== undefined && !currentIds.has(serverId))
      ) {
        issues.push(validationIssue(`${path}[${index}].id`, "invalid_value", "Server could not allocate a unique catalog identity."));
        continue;
      }
      generated.add(serverId);
      ids.set(item.id, serverId);
      continue;
    }
    const existing = allById.get(item.id);
    if (!currentIds.has(item.id)) {
      issues.push(validationIssue(
        `${path}[${index}].id`,
        "ownership",
        existing && existing.productId !== productId
          ? "Catalog identity belongs to another Product."
          : "New catalog entities must use a temporary new: identity.",
      ));
      continue;
    }
    ids.set(item.id, item.id);
  }
  return { ids, issues };
}

export async function normalizeProductSkuGraph(
  intent: ProductSkuGraph,
  current: CatalogDataSet,
  deriveId: ServerIdDeriver,
): Promise<{ ok: true; value: ProductSkuGraph } | { ok: false; issues: readonly CatalogValidationIssue[] }> {
  const currentOptions = current.options.filter((item) => item.productId === intent.productId);
  const currentValues = current.optionValues.filter((item) => item.productId === intent.productId);
  const currentVariants = current.variants.filter((item) => item.productId === intent.productId);
  const options = await assignEntityIds(intent.options, currentOptions, current.options, intent.productId, "option", "$.options", deriveId);
  const values = await assignEntityIds(intent.optionValues, currentValues, current.optionValues, intent.productId, "option_value", "$.optionValues", deriveId);
  const variants = await assignEntityIds(intent.variants, currentVariants, current.variants, intent.productId, "variant", "$.variants", deriveId);
  const issues = [...options.issues, ...values.issues, ...variants.issues];

  const normalizedOptions = intent.options.flatMap((option) => {
    const id = options.ids.get(option.id);
    return id ? [{ ...option, id }] : [];
  });
  const normalizedValues = intent.optionValues.flatMap((value, index) => {
    const id = values.ids.get(value.id);
    const optionId = options.ids.get(value.optionId);
    if (!optionId) {
      issues.push(validationIssue(`$.optionValues[${index}].optionId`, "ownership", "Option Value must reference an Option in the desired graph."));
    }
    return id && optionId ? [{ ...value, id, optionId }] : [];
  });
  const normalizedVariants = intent.variants.flatMap((variant, variantIndex) => {
    const id = variants.ids.get(variant.id);
    const selectedOptions = variant.selectedOptions.flatMap((selection, selectionIndex) => {
      const optionId = options.ids.get(selection.optionId);
      const valueId = values.ids.get(selection.valueId);
      if (!optionId || !valueId) {
        issues.push(validationIssue(
          `$.variants[${variantIndex}].selectedOptions[${selectionIndex}]`,
          "ownership",
          "Variant selection must reference an Option and Value in the desired graph.",
        ));
      }
      return optionId && valueId ? [{ optionId, valueId }] : [];
    });
    return id ? [{ ...variant, id, selectedOptions }] : [];
  });

  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        value: {
          productId: intent.productId,
          options: normalizedOptions,
          optionValues: normalizedValues,
          variants: normalizedVariants,
        },
      };
}

export function dataSetWithProductSkuGraph(
  current: CatalogDataSet,
  graph: ProductSkuGraph,
): CatalogDataSet {
  return {
    ...current,
    options: [...current.options.filter((item) => item.productId !== graph.productId), ...graph.options],
    optionValues: [...current.optionValues.filter((item) => item.productId !== graph.productId), ...graph.optionValues],
    variants: [...current.variants.filter((item) => item.productId !== graph.productId), ...graph.variants],
  };
}

export class AdminProductSkuGraphBoundary {
  private readonly verifier: AdminSessionVerifier;
  private readonly createRepositories: () => PrivilegedAdminSkuGraphRepositories;
  private readonly deriveId: ServerIdDeriver;

  constructor(
    verifier: AdminSessionVerifier,
    createRepositories: () => PrivilegedAdminSkuGraphRepositories,
    deriveId: ServerIdDeriver = deriveCatalogDraftUuid,
  ) {
    this.verifier = verifier;
    this.createRepositories = createRepositories;
    this.deriveId = deriveId;
  }

  async execute(
    routeProductId: string,
    request: unknown,
  ): Promise<AdminCatalogBoundaryResult<ProductSkuGraph>> {
    let principal: AdminPrincipal;
    try {
      const authorization = await this.verifier.verifyAdminSession();
      if (authorization.status !== "authorized") return authorization;
      principal = authorization.principal;
    } catch {
      return { status: "authentication_failure" };
    }

    const parsed = parseProductSkuGraphIntent(request);
    if (!parsed.ok) return { status: "invalid_request", issues: safeIssues(parsed.issues) };
    if (parsed.value.productId !== routeProductId) {
      return {
        status: "invalid_request",
        issues: safeIssues([
          validationIssue("$.productId", "ownership", "Route Product ID must match the SKU graph Product ID."),
        ]),
      };
    }

    try {
      const repositories = this.createRepositories();
      const loaded = await repositories.reader.readAdminCatalogGraph();
      if (loaded.status !== "found") {
        if (loaded.status === "not_found") return { status: "not_found" };
        if (loaded.status === "invalid_configuration") {
          return { status: "invalid_configuration", issues: safeIssues(loaded.issues) };
        }
        if (loaded.status === "unavailable") return { status: "unavailable", reason: loaded.reason };
        return { status: "source_failure", operation: "admin_catalog_command" };
      }
      if (!loaded.value.products.some((product) => product.id === routeProductId)) {
        return { status: "not_found" };
      }

      const normalized = await normalizeProductSkuGraph(parsed.value, loaded.value, this.deriveId);
      if (!normalized.ok) {
        return { status: "invalid_request", issues: safeIssues(normalized.issues) };
      }
      const proposed = dataSetWithProductSkuGraph(loaded.value, normalized.value);
      const validation = validateCatalogDataSet(proposed);
      if (!validation.ok) {
        return { status: "invalid_request", issues: safeIssues(validation.issues) };
      }

      const saved = await repositories.writer.saveProductSkuGraph(normalized.value);
      if (saved.status === "applied") {
        return { status: "applied", value: saved.value, principal };
      }
      if (saved.status === "not_found") return { status: "not_found" };
      if (saved.status === "invalid_configuration") {
        return { status: "invalid_configuration", issues: safeIssues(saved.issues) };
      }
      return { status: "source_failure", operation: "admin_catalog_command" };
    } catch (error) {
      if (isAdminAcceptanceConfigurationError(error)) {
        return { status: "invalid_configuration", issues: [adminAcceptanceConfigurationIssue()] };
      }
      return { status: "source_failure", operation: "admin_catalog_command" };
    }
  }
}
