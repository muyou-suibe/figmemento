import { isLocalOrderPublicReference } from "../domain/local-order.ts";
import {
  projectLocalFulfillmentState,
  parseLocalFulfillmentActionInput,
  type LocalFulfillmentActionInput,
  type LocalFulfillmentActionResult,
  type LocalFulfillmentIssue,
  type LocalFulfillmentReadResult,
  type LocalFulfillmentResult,
} from "../domain/local-fulfillment.ts";
import type { LocalFulfillmentAggregateResult } from "./local-fulfillment-repository.ts";
import {
  commitAuthorizedLocalFulfillmentOperatorAction,
  type LocalFulfillmentRuntime,
} from "../server/local-fulfillment-runtime.server.ts";
import {
  resolveLocalFulfillmentOperatorAuthority,
  type LocalFulfillmentOperatorVerifier,
} from "../server/local-fulfillment-operator.server.ts";

export interface LocalFulfillmentOperatorServiceDependencies {
  readonly runtime: LocalFulfillmentRuntime;
  readonly verifier: LocalFulfillmentOperatorVerifier | undefined;
}

export interface LocalFulfillmentOperatorReadInput {
  readonly publicOrderReference: string;
}

export interface LocalFulfillmentOperatorMutationInput {
  readonly publicOrderReference: string;
  readonly action: LocalFulfillmentActionInput;
}

export type LocalFulfillmentOperatorFailure = {
  readonly status: "invalid" | "unavailable" | "conflict" | "rejected";
  readonly issues: readonly Pick<LocalFulfillmentIssue, "path" | "code" | "message">[];
};

export type LocalFulfillmentOperatorServiceResult =
  | LocalFulfillmentOperatorFailure
  | LocalFulfillmentReadResult
  | {
      readonly status: "committed" | "replayed";
      readonly result: LocalFulfillmentActionResult;
      readonly projection: Extract<LocalFulfillmentReadResult, { status: "found" }>["value"];
    };

function issue(
  code: LocalFulfillmentIssue["code"],
  message: string,
  path = "$",
): LocalFulfillmentIssue {
  return { path, code, message };
}

function failure(
  status: LocalFulfillmentOperatorFailure["status"],
  code: LocalFulfillmentIssue["code"],
  message: string,
): LocalFulfillmentOperatorFailure {
  return { status, issues: [issue(code, message)] };
}

function unavailable(): LocalFulfillmentOperatorFailure {
  return failure("unavailable", "unavailable", "Fulfillment is unavailable.");
}

function isOperatorAction(action: LocalFulfillmentActionInput): boolean {
  return action.actionKind === "enter_photo_review"
    || action.actionKind === "publish_preview"
    || action.actionKind === "start_production"
    || action.actionKind === "mark_quality_check";
}

/** Parses only the operator action body; the route owns the public reference. */
export function parseLocalFulfillmentOperatorActionInput(
  value: unknown,
  publicOrderReference: string,
): LocalFulfillmentResult<LocalFulfillmentActionInput> {
  if (typeof value === "object" && value !== null && !Array.isArray(value) && "publicOrderReference" in value) {
    return {
      ok: false,
      issues: [issue("authority_field", "Order reference is selected by the route.", "$.publicOrderReference")],
    };
  }
  if (!isLocalOrderPublicReference(publicOrderReference)) {
    return { ok: false, issues: [issue("invalid_format", "Local Order public reference is invalid.", "$.publicOrderReference")] };
  }
  const candidate = typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value, publicOrderReference }
    : value;
  const parsed = parseLocalFulfillmentActionInput(candidate);
  if (!parsed.ok) return parsed;
  if (!isOperatorAction(parsed.value)) {
    return { ok: false, issues: [issue("unsupported_action", "This operator action is not available.", "$.actionKind")] };
  }
  return parsed;
}

function isAggregateSuccess(
  result: LocalFulfillmentAggregateResult,
): result is Extract<LocalFulfillmentAggregateResult, { status: "committed" | "replayed" }> {
  return result.status === "committed" || result.status === "replayed";
}

function mapAggregateFailure(
  result: Exclude<LocalFulfillmentAggregateResult, { status: "committed" | "replayed" }>,
): LocalFulfillmentOperatorFailure {
  if (result.status === "conflict") return failure("conflict", "invalid_action", "This Fulfillment action conflicts with an earlier request.");
  if (result.status === "unavailable" || result.status === "failed") return unavailable();

  const code = result.issues[0]?.code ?? "invalid_lifecycle";
  const messages: Partial<Record<LocalFulfillmentIssue["code"], string>> = {
    invalid_lifecycle: "This operator action is not available for the current Fulfillment state.",
    invalid_order_state: "Fulfillment is unavailable for this Order.",
    invalid_preview: "The requested preview is unavailable.",
    unsupported_action: "This operator action is not available.",
    invalid_actor: "Operator authority is unavailable.",
  };
  return failure("rejected", code, messages[code] ?? "This operator action was rejected.");
}

export class LocalFulfillmentOperatorService {
  private readonly dependencies: LocalFulfillmentOperatorServiceDependencies;

  constructor(dependencies: LocalFulfillmentOperatorServiceDependencies) {
    this.dependencies = dependencies;
  }

  async read(input: LocalFulfillmentOperatorReadInput): Promise<LocalFulfillmentOperatorServiceResult> {
    const authorization = resolveLocalFulfillmentOperatorAuthority(
      this.dependencies.runtime.configuration,
      this.dependencies.verifier,
    );
    if (authorization.status !== "authorized") return unavailable();
    if (!isLocalOrderPublicReference(input.publicOrderReference)) return unavailable();

    let order;
    try {
      order = this.dependencies.runtime.orders.findSnapshotForFulfillment(input.publicOrderReference);
    } catch {
      return unavailable();
    }
    if (order.status !== "found" || order.snapshot.status !== "paid" || order.snapshot.paymentStatus !== "succeeded") {
      return unavailable();
    }

    try {
      const aggregate = this.dependencies.runtime.repository.findByOrderIdentity({
        internalOrderId: order.snapshot.internalId,
        publicOrderReference: order.snapshot.publicReference,
      });
      if (aggregate.status !== "found") return unavailable();
      return projectLocalFulfillmentState(aggregate.aggregate.state, "operator");
    } catch {
      return unavailable();
    }
  }

  async mutate(input: LocalFulfillmentOperatorMutationInput): Promise<LocalFulfillmentOperatorServiceResult> {
    if (!isLocalOrderPublicReference(input.publicOrderReference) || !isOperatorAction(input.action)) {
      return failure("invalid", "unsupported_action", "This operator action is not available.");
    }
    if (input.action.publicOrderReference !== input.publicOrderReference) return unavailable();

    let committed: LocalFulfillmentAggregateResult;
    try {
      committed = commitAuthorizedLocalFulfillmentOperatorAction(this.dependencies.runtime, {
        publicOrderReference: input.publicOrderReference,
        action: input.action,
        verifier: this.dependencies.verifier,
      });
    } catch {
      return unavailable();
    }
    if (!isAggregateSuccess(committed)) return mapAggregateFailure(committed);

    const projection = projectLocalFulfillmentState(committed.state, "operator");
    if (projection.status !== "found") return unavailable();
    return {
      status: committed.status,
      result: { ...committed.result },
      projection: projection.value,
    };
  }
}
