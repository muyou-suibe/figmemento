import {
  isRecord,
  parseCatalogProduct,
  parseCategory,
  parseProductAsset,
  parseProductFulfillmentConfig,
  parseProductOption,
  parseProductOptionValue,
  parseProductVariant,
  unknownFieldIssues,
  validationIssue,
  type CatalogProduct,
  type CatalogValidationIssue,
  type Category,
  type ProductAsset,
  type ProductFulfillmentConfig,
  type ProductOption,
  type ProductOptionValue,
  type ProductVariant,
} from "../domain/catalog/index.ts";
import { validateCatalogDataSet, type CatalogDataSet } from "./catalog-data-set.ts";
import {
  adminAcceptanceConfigurationIssue,
  isAdminAcceptanceConfigurationError,
} from "../config/admin-acceptance-runtime.server.ts";
import type {
  CatalogAdminCommandRepository,
  CatalogAdminCommandResult,
  CatalogAdminReadRepository,
  CatalogRepositoryResult,
} from "./catalog-repository.ts";

export interface AdminPrincipal {
  role: "admin";
  identity: "configured-admin";
}

export type AdminAuthorizationResult =
  | { status: "authorized"; principal: AdminPrincipal }
  | { status: "unauthorized" };

export interface AdminSessionVerifier {
  verifyAdminSession(): Promise<AdminAuthorizationResult>;
}

export interface SafeCatalogValidationIssue {
  path: string;
  code: CatalogValidationIssue["code"];
  message: string;
}

export type AdminCatalogBoundaryResult<T> =
  | { status: "found"; value: T; principal: AdminPrincipal }
  | { status: "applied"; value: T; principal: AdminPrincipal }
  | { status: "unauthorized" }
  | { status: "authentication_failure" }
  | { status: "invalid_request"; issues: readonly SafeCatalogValidationIssue[] }
  | { status: "not_found" }
  | { status: "unavailable"; reason: "not_public" | "no_eligible_variant" }
  | { status: "invalid_configuration"; issues: readonly SafeCatalogValidationIssue[] }
  | { status: "source_failure"; operation: "admin_catalog_query" | "admin_catalog_command" };

export type AdminCatalogCommand =
  | { kind: "save_category"; value: Category }
  | { kind: "save_product"; value: CatalogProduct }
  | { kind: "save_option"; value: ProductOption }
  | { kind: "save_option_value"; value: ProductOptionValue }
  | { kind: "save_variant"; value: ProductVariant }
  | { kind: "save_asset"; value: ProductAsset }
  | { kind: "save_fulfillment_config"; value: ProductFulfillmentConfig };

export type AdminCatalogCommandKind = AdminCatalogCommand["kind"];
export type AdminCatalogCommandValue = AdminCatalogCommand["value"];

export interface AdminCatalogCommandConstraints {
  allowedKinds?: readonly AdminCatalogCommandKind[];
  existingResourceId?: string;
  preserveLifecycle?: boolean;
}

export interface PrivilegedAdminCatalogRepositories {
  reader: CatalogAdminReadRepository;
  writer: CatalogAdminCommandRepository;
}

type ReadRepositoryFactory = () => CatalogAdminReadRepository;
type CommandRepositoryFactory = () => PrivilegedAdminCatalogRepositories;

function safeIssues(issues: readonly CatalogValidationIssue[]): readonly SafeCatalogValidationIssue[] {
  return issues.map(({ path, code, message }) => ({ path, code, message }));
}

function prefixIssues(
  issues: readonly CatalogValidationIssue[],
  prefix: string,
): readonly CatalogValidationIssue[] {
  return issues.map((issue) => ({
    ...issue,
    path: issue.path === "$" ? prefix : `${prefix}${issue.path.slice(1)}`,
  }));
}

function parseAdminCatalogQuery(value: unknown): readonly CatalogValidationIssue[] {
  if (!isRecord(value)) {
    return [validationIssue("$", "invalid_type", "Admin catalog query must be an object.")];
  }
  return unknownFieldIssues(value, []);
}

function parseAdminCatalogCommand(value: unknown):
  | { ok: true; value: AdminCatalogCommand }
  | { ok: false; issues: readonly CatalogValidationIssue[] } {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [validationIssue("$", "invalid_type", "Admin catalog command must be an object.")],
    };
  }

  const envelopeIssues = unknownFieldIssues(value, ["kind", "payload"]);
  const parsers = {
    save_category: parseCategory,
    save_product: parseCatalogProduct,
    save_option: parseProductOption,
    save_option_value: parseProductOptionValue,
    save_variant: parseProductVariant,
    save_asset: parseProductAsset,
    save_fulfillment_config: parseProductFulfillmentConfig,
  } as const;
  if (typeof value.kind !== "string" || !(value.kind in parsers)) {
    return {
      ok: false,
      issues: [
        ...envelopeIssues,
        validationIssue("$.kind", "invalid_value", "Admin catalog command kind is unsupported."),
      ],
    };
  }

  const kind = value.kind as keyof typeof parsers;
  const parsed = parsers[kind](value.payload);
  const issues = parsed.ok
    ? envelopeIssues
    : [...envelopeIssues, ...prefixIssues(parsed.issues, "$.payload")];
  if (issues.length > 0 || !parsed.ok) return { ok: false, issues };

  return { ok: true, value: { kind, value: parsed.value } as AdminCatalogCommand };
}

function replaceById<T extends { id: string }>(values: readonly T[], candidate: T): readonly T[] {
  const exists = values.some((value) => value.id === candidate.id);
  return exists
    ? values.map((value) => (value.id === candidate.id ? candidate : value))
    : [...values, candidate];
}

function dataSetWithCommand(dataSet: CatalogDataSet, command: AdminCatalogCommand): CatalogDataSet {
  switch (command.kind) {
    case "save_category":
      return { ...dataSet, categories: replaceById(dataSet.categories, command.value) };
    case "save_product":
      return { ...dataSet, products: replaceById(dataSet.products, command.value) };
    case "save_option":
      return { ...dataSet, options: replaceById(dataSet.options, command.value) };
    case "save_option_value":
      return { ...dataSet, optionValues: replaceById(dataSet.optionValues, command.value) };
    case "save_variant":
      return { ...dataSet, variants: replaceById(dataSet.variants, command.value) };
    case "save_asset":
      return { ...dataSet, assets: replaceById(dataSet.assets, command.value) };
    case "save_fulfillment_config":
      return {
        ...dataSet,
        fulfillmentConfigs: replaceById(dataSet.fulfillmentConfigs, command.value),
      };
  }
}

function validateCommandConstraints(
  command: AdminCatalogCommand,
  dataSet: CatalogDataSet,
  constraints: AdminCatalogCommandConstraints,
):
  | { status: "valid" }
  | { status: "not_found" }
  | { status: "invalid_request"; issues: readonly SafeCatalogValidationIssue[] } {
  if (constraints.allowedKinds && !constraints.allowedKinds.includes(command.kind)) {
    return {
      status: "invalid_request",
      issues: safeIssues([
        validationIssue("$.kind", "invalid_value", "This catalog command is not available on this route."),
      ]),
    };
  }
  if (constraints.existingResourceId === undefined && !constraints.preserveLifecycle) {
    return { status: "valid" };
  }
  if (command.kind !== "save_category" && command.kind !== "save_product") {
    return {
      status: "invalid_request",
      issues: safeIssues([
        validationIssue("$.kind", "invalid_value", "Stable content-edit constraints require a Category or Product command."),
      ]),
    };
  }

  if (
    constraints.existingResourceId !== undefined &&
    command.value.id !== constraints.existingResourceId
  ) {
    return {
      status: "invalid_request",
      issues: safeIssues([
        validationIssue("$.payload.id", "invalid_value", "Catalog identities cannot be changed by an edit."),
      ]),
    };
  }

  const existing = command.kind === "save_category"
    ? dataSet.categories.find((category) => category.id === command.value.id)
    : dataSet.products.find((product) => product.id === command.value.id);
  if (!existing) return { status: "not_found" };
  if (constraints.preserveLifecycle && command.value.lifecycle !== existing.lifecycle) {
    return {
      status: "invalid_request",
      issues: safeIssues([
        validationIssue(
          "$.payload.lifecycle",
          "invalid_value",
          "Lifecycle transitions require the dedicated publication workflow.",
        ),
      ]),
    };
  }
  return { status: "valid" };
}

function readFailure(
  result: Exclude<CatalogRepositoryResult<CatalogDataSet>, { status: "found" }>,
  operation: "admin_catalog_query" | "admin_catalog_command",
): AdminCatalogBoundaryResult<never> {
  switch (result.status) {
    case "not_found":
      return { status: "not_found" };
    case "unavailable":
      return { status: "unavailable", reason: result.reason };
    case "invalid_configuration":
      return { status: "invalid_configuration", issues: safeIssues(result.issues) };
    case "source_failure":
      return { status: "source_failure", operation };
  }
}

function commandFailure(
  result: Exclude<CatalogAdminCommandResult<AdminCatalogCommandValue>, { status: "applied" }>,
): AdminCatalogBoundaryResult<never> {
  switch (result.status) {
    case "not_found":
      return { status: "not_found" };
    case "unavailable":
      return { status: "unavailable", reason: result.reason };
    case "invalid_configuration":
      return { status: "invalid_configuration", issues: safeIssues(result.issues) };
    case "source_failure":
      return { status: "source_failure", operation: "admin_catalog_command" };
  }
}

async function authorize(
  verifier: AdminSessionVerifier,
): Promise<AdminAuthorizationResult | { status: "authentication_failure" }> {
  try {
    return await verifier.verifyAdminSession();
  } catch {
    return { status: "authentication_failure" };
  }
}

export class AdminCatalogQueryBoundary {
  private readonly verifier: AdminSessionVerifier;
  private readonly createReader: ReadRepositoryFactory;

  constructor(
    verifier: AdminSessionVerifier,
    createReader: ReadRepositoryFactory,
  ) {
    this.verifier = verifier;
    this.createReader = createReader;
  }

  async execute(request: unknown): Promise<AdminCatalogBoundaryResult<CatalogDataSet>> {
    const authorization = await authorize(this.verifier);
    if (authorization.status !== "authorized") return authorization;

    const issues = parseAdminCatalogQuery(request);
    if (issues.length > 0) return { status: "invalid_request", issues: safeIssues(issues) };

    try {
      const result = await this.createReader().readAdminCatalogGraph();
      return result.status === "found"
        ? { status: "found", value: result.value, principal: authorization.principal }
        : readFailure(result, "admin_catalog_query");
    } catch (error) {
      if (isAdminAcceptanceConfigurationError(error)) {
        return { status: "invalid_configuration", issues: [adminAcceptanceConfigurationIssue()] };
      }
      return { status: "source_failure", operation: "admin_catalog_query" };
    }
  }
}

export class AdminCatalogCommandBoundary {
  private readonly verifier: AdminSessionVerifier;
  private readonly createRepositories: CommandRepositoryFactory;

  constructor(
    verifier: AdminSessionVerifier,
    createRepositories: CommandRepositoryFactory,
  ) {
    this.verifier = verifier;
    this.createRepositories = createRepositories;
  }

  async execute(
    request: unknown,
    constraints: AdminCatalogCommandConstraints = {},
  ): Promise<AdminCatalogBoundaryResult<AdminCatalogCommandValue>> {
    const authorization = await authorize(this.verifier);
    if (authorization.status !== "authorized") return authorization;

    const parsed = parseAdminCatalogCommand(request);
    if (!parsed.ok) return { status: "invalid_request", issues: safeIssues(parsed.issues) };
    if (constraints.allowedKinds && !constraints.allowedKinds.includes(parsed.value.kind)) {
      return {
        status: "invalid_request",
        issues: safeIssues([
          validationIssue("$.kind", "invalid_value", "This catalog command is not available on this route."),
        ]),
      };
    }

    try {
      const repositories = this.createRepositories();
      const graph = await repositories.reader.readAdminCatalogGraph();
      if (graph.status !== "found") return readFailure(graph, "admin_catalog_command");

      const constrained = validateCommandConstraints(parsed.value, graph.value, constraints);
      if (constrained.status !== "valid") return constrained;

      const validation = validateCatalogDataSet(dataSetWithCommand(graph.value, parsed.value));
      if (!validation.ok) {
        return { status: "invalid_request", issues: safeIssues(validation.issues) };
      }

      let result: CatalogAdminCommandResult<AdminCatalogCommandValue>;
      switch (parsed.value.kind) {
        case "save_category":
          result = await repositories.writer.saveCategory(parsed.value.value);
          break;
        case "save_product":
          result = await repositories.writer.saveProduct(parsed.value.value);
          break;
        case "save_option":
          result = await repositories.writer.saveOption(parsed.value.value);
          break;
        case "save_option_value":
          result = await repositories.writer.saveOptionValue(parsed.value.value);
          break;
        case "save_variant":
          result = await repositories.writer.saveVariant(parsed.value.value);
          break;
        case "save_asset":
          result = await repositories.writer.saveAsset(parsed.value.value);
          break;
        case "save_fulfillment_config":
          result = await repositories.writer.saveFulfillmentConfig(parsed.value.value);
          break;
      }
      return result.status === "applied"
        ? { status: "applied", value: result.value, principal: authorization.principal }
        : commandFailure(result);
    } catch (error) {
      if (isAdminAcceptanceConfigurationError(error)) {
        return { status: "invalid_configuration", issues: [adminAcceptanceConfigurationIssue()] };
      }
      return { status: "source_failure", operation: "admin_catalog_command" };
    }
  }
}
