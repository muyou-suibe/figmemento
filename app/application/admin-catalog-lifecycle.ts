import {
  isIdentifier,
  isRecord,
  unknownFieldIssues,
  validationIssue,
  type CatalogLifecycle,
  type CatalogValidationIssue,
} from "../domain/catalog/index.ts";
import type {
  AdminCatalogBoundaryResult,
  AdminPrincipal,
  AdminSessionVerifier,
  SafeCatalogValidationIssue,
} from "./admin-catalog-boundary.ts";
import {
  adminAcceptanceConfigurationIssue,
  isAdminAcceptanceConfigurationError,
} from "../config/admin-acceptance-runtime.server.ts";

export type CatalogLifecycleTargetType = "category" | "product";
export type CatalogLifecycleAction =
  | "publish"
  | "unpublish"
  | "retire"
  | "destructive_state_mutation_attempt";

export interface CatalogLifecycleIntent {
  targetType: CatalogLifecycleTargetType;
  targetId: string;
  action: CatalogLifecycleAction;
  actorBoundary: "configured_admin_session";
  actorIdentifier: string;
}

export interface CatalogLifecycleMutationValue {
  targetType: CatalogLifecycleTargetType;
  targetId: string;
  action: CatalogLifecycleAction;
  previousLifecycle: CatalogLifecycle;
  currentLifecycle: CatalogLifecycle;
  changed: boolean;
}

export type CatalogLifecycleRejectionReason =
  | "invalid_current_lifecycle"
  | "category_not_published"
  | "fulfillment_missing"
  | "fulfillment_invalid"
  | "invalid_variant_graph"
  | "no_eligible_variant"
  | "destructive_mutation_forbidden";

export type CatalogLifecycleWriteResult =
  | { status: "applied"; value: CatalogLifecycleMutationValue }
  | { status: "rejected"; reason: CatalogLifecycleRejectionReason }
  | { status: "not_found" }
  | { status: "source_failure"; operation: "catalog.admin.lifecycle" };

export interface CatalogLifecycleWriteRepository {
  applyLifecycleIntent(intent: CatalogLifecycleIntent): Promise<CatalogLifecycleWriteResult>;
}

export interface PrivilegedAdminCatalogLifecycleRepositories {
  writer: CatalogLifecycleWriteRepository;
}

type LifecycleRequestAction = "publish" | "unpublish" | "retire" | "delete";

function safeIssues(
  issues: readonly CatalogValidationIssue[],
): readonly SafeCatalogValidationIssue[] {
  return issues.map(({ path, code, message }) => ({ path, code, message }));
}

function parseLifecycleRequest(
  value: unknown,
):
  | { ok: true; action: CatalogLifecycleAction }
  | { ok: false; issues: readonly CatalogValidationIssue[] } {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [validationIssue("$", "invalid_type", "Lifecycle command must be an object.")],
    };
  }
  const issues = unknownFieldIssues(value, ["action"]);
  const allowed: readonly LifecycleRequestAction[] = ["publish", "unpublish", "retire", "delete"];
  if (typeof value.action !== "string" || !allowed.includes(value.action as LifecycleRequestAction)) {
    issues.push(
      validationIssue(
        "$.action",
        "invalid_value",
        "Lifecycle action must be publish, unpublish, retire, or delete.",
      ),
    );
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    action: value.action === "delete"
      ? "destructive_state_mutation_attempt"
      : value.action as CatalogLifecycleAction,
  };
}

function rejectionIssue(reason: CatalogLifecycleRejectionReason): CatalogValidationIssue {
  switch (reason) {
    case "invalid_current_lifecycle":
      return validationIssue("$.target", "invalid_value", "Catalog record lifecycle is not transitionable.");
    case "category_not_published":
      return validationIssue("$.category", "unavailable", "Product Category must be published before the Product can be published.");
    case "fulfillment_missing":
      return validationIssue("$.fulfillment", "required", "Product requires one FulfillmentConfig before publication.");
    case "fulfillment_invalid":
      return validationIssue("$.fulfillment", "invalid_value", "Product FulfillmentConfig is invalid for publication.");
    case "invalid_variant_graph":
      return validationIssue("$.variants", "invalid_value", "Product SKU combinations are invalid for publication.");
    case "no_eligible_variant":
      return validationIssue("$.variants", "unavailable", "Product requires at least one active and available valid SKU before publication.");
    case "destructive_mutation_forbidden":
      return validationIssue("$.action", "invalid_value", "Catalog lifecycle records cannot be hard-deleted.");
  }
}

function isTargetType(value: string): value is CatalogLifecycleTargetType {
  return value === "category" || value === "product";
}

export class AdminCatalogLifecycleBoundary {
  private readonly verifier: AdminSessionVerifier;
  private readonly createRepositories: () => PrivilegedAdminCatalogLifecycleRepositories;

  constructor(
    verifier: AdminSessionVerifier,
    createRepositories: () => PrivilegedAdminCatalogLifecycleRepositories,
  ) {
    this.verifier = verifier;
    this.createRepositories = createRepositories;
  }

  async execute(
    routeTargetType: string,
    routeTargetId: string,
    request: unknown,
  ): Promise<AdminCatalogBoundaryResult<CatalogLifecycleMutationValue>> {
    let principal: AdminPrincipal;
    try {
      const authorization = await this.verifier.verifyAdminSession();
      if (authorization.status !== "authorized") return authorization;
      principal = authorization.principal;
    } catch {
      return { status: "authentication_failure" };
    }

    const parsed = parseLifecycleRequest(request);
    const routeIssues: CatalogValidationIssue[] = [];
    if (!isTargetType(routeTargetType)) {
      routeIssues.push(validationIssue("$.targetType", "invalid_value", "Lifecycle target must be a Category or Product."));
    }
    if (!isIdentifier(routeTargetId)) {
      routeIssues.push(validationIssue("$.targetId", "invalid_format", "Catalog target ID is invalid."));
    }
    if (!parsed.ok || routeIssues.length > 0) {
      return {
        status: "invalid_request",
        issues: safeIssues([
          ...routeIssues,
          ...(parsed.ok ? [] : parsed.issues),
        ]),
      };
    }

    try {
      const result = await this.createRepositories().writer.applyLifecycleIntent({
        targetType: routeTargetType as CatalogLifecycleTargetType,
        targetId: routeTargetId,
        action: parsed.action,
        actorBoundary: "configured_admin_session",
        actorIdentifier: principal.identity,
      });
      if (result.status === "applied") {
        return { status: "applied", value: result.value, principal };
      }
      if (result.status === "rejected") {
        return {
          status: "invalid_request",
          issues: safeIssues([rejectionIssue(result.reason)]),
        };
      }
      if (result.status === "not_found") return { status: "not_found" };
      return { status: "source_failure", operation: "admin_catalog_command" };
    } catch (error) {
      if (isAdminAcceptanceConfigurationError(error)) {
        return { status: "invalid_configuration", issues: [adminAcceptanceConfigurationIssue()] };
      }
      return { status: "source_failure", operation: "admin_catalog_command" };
    }
  }
}
