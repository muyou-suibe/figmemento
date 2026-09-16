import { isLocalOrderPublicReference } from "../domain/local-order.ts";
import {
  parseLocalFulfillmentActionInput,
  projectLocalFulfillmentState,
  type LocalFulfillmentActionInput,
  type LocalFulfillmentActionResult,
  type LocalFulfillmentIssue,
  type LocalFulfillmentReadResult,
  type LocalFulfillmentResult,
} from "../domain/local-fulfillment.ts";
import type {
  LocalFulfillmentAggregateRepository,
  LocalFulfillmentAggregateResult,
} from "./local-fulfillment-repository.ts";
import type { LocalOrderRepository } from "./local-order-repository.ts";
import type { LocalOrderBrowserCapability } from "./local-order-repository.ts";
import {
  readTrustedLocalFulfillmentConfig,
  type LocalFulfillmentConfiguration,
} from "../config/local-fulfillment-runtime.ts";
import { deriveLocalPaymentAuthorityContext } from "../server/local-payment-authority.server.ts";

export interface LocalFulfillmentCustomerReadInput {
  readonly publicOrderReference: string;
  readonly browserCapability?: LocalOrderBrowserCapability;
}

export interface LocalFulfillmentCustomerMutationInput extends LocalFulfillmentCustomerReadInput {
  readonly action: LocalFulfillmentActionInput;
}

export interface LocalFulfillmentCustomerServiceDependencies {
  readonly readConfig?: () => LocalFulfillmentConfiguration;
  readonly getOrderRepository: () => LocalOrderRepository;
  readonly getFulfillmentRepository: () => LocalFulfillmentAggregateRepository;
  readonly deriveActorContext?: (capability: LocalOrderBrowserCapability) => Promise<string>;
}

export type LocalFulfillmentCustomerFailureStatus =
  | "invalid"
  | "unavailable"
  | "conflict"
  | "rejected";

export type LocalFulfillmentCustomerFailure = {
  readonly status: LocalFulfillmentCustomerFailureStatus;
  readonly issues: readonly Pick<LocalFulfillmentIssue, "path" | "code" | "message">[];
};

export type LocalFulfillmentCustomerServiceResult =
  | LocalFulfillmentCustomerFailure
  | LocalFulfillmentReadResult
  | {
      readonly status: "committed" | "replayed";
      readonly result: LocalFulfillmentActionResult;
    };

function issue(
  code: LocalFulfillmentIssue["code"],
  message: string,
  path = "$",
): LocalFulfillmentIssue {
  return { path, code, message };
}

function failure(
  status: LocalFulfillmentCustomerFailureStatus,
  code: LocalFulfillmentIssue["code"],
  message: string,
): LocalFulfillmentCustomerFailure {
  return { status, issues: [issue(code, message)] };
}

function unavailable(): LocalFulfillmentCustomerFailure {
  return failure("unavailable", "unavailable", "Fulfillment is unavailable.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses the customer-only action surface. The route supplies the canonical
 * public reference, so a second browser-supplied reference is rejected.
 */
export function parseLocalFulfillmentCustomerActionInput(
  value: unknown,
  publicOrderReference: string,
): LocalFulfillmentResult<LocalFulfillmentActionInput> {
  if (isRecord(value) && "publicOrderReference" in value) {
    return {
      ok: false,
      issues: [issue("authority_field", "Order reference is selected by the route.", "$.publicOrderReference")],
    };
  }

  const candidate = isRecord(value)
    ? { ...value, publicOrderReference }
    : value;
  const parsed = parseLocalFulfillmentActionInput(candidate);
  if (!parsed.ok) return parsed;
  if (parsed.value.actionKind !== "approve_preview" && parsed.value.actionKind !== "request_revision") {
    return {
      ok: false,
      issues: [issue("unsupported_action", "This customer action is not available.", "$.actionKind")],
    };
  }
  return parsed;
}

function isCustomerAction(action: LocalFulfillmentActionInput): boolean {
  return action.actionKind === "approve_preview" || action.actionKind === "request_revision";
}

function isAggregateSuccess(
  result: LocalFulfillmentAggregateResult,
): result is Extract<LocalFulfillmentAggregateResult, { status: "committed" | "replayed" }> {
  return result.status === "committed" || result.status === "replayed";
}

function mapAggregateFailure(result: Exclude<LocalFulfillmentAggregateResult, { status: "committed" | "replayed" }>): LocalFulfillmentCustomerFailure {
  if (result.status === "conflict") {
    return failure("conflict", "invalid_action", "This Fulfillment action conflicts with an earlier request.");
  }
  if (result.status === "unavailable" || result.status === "failed") return unavailable();

  const code = result.issues[0]?.code ?? "invalid_lifecycle";
  const messages: Partial<Record<LocalFulfillmentIssue["code"], string>> = {
    invalid_lifecycle: "This customer action is not available for the current Fulfillment state.",
    stale_preview_version: "The preview has changed. Refresh before trying again.",
    revision_limit: "The maximum number of revisions has been reached.",
    invalid_preview: "The requested preview is unavailable.",
    invalid_order_state: "Fulfillment is unavailable for this Order.",
    invalid_actor: "This customer action is not available.",
    unsupported_action: "This customer action is not available.",
  };
  return failure("rejected", code, messages[code] ?? "This customer action was rejected.");
}

interface AuthorizedCustomerOrder {
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly actorContextId: string;
  readonly orderStatus: string;
  readonly paymentStatus: string;
}

export class LocalFulfillmentCustomerService {
  private readonly dependencies: LocalFulfillmentCustomerServiceDependencies;

  constructor(dependencies: LocalFulfillmentCustomerServiceDependencies) {
    this.dependencies = dependencies;
  }

  async read(input: LocalFulfillmentCustomerReadInput): Promise<LocalFulfillmentCustomerServiceResult> {
    const authorized = await this.authorize(input);
    if (!authorized) return unavailable();

    if (authorized.orderStatus !== "paid" || authorized.paymentStatus !== "succeeded") {
      return unavailable();
    }

    let aggregate;
    try {
      aggregate = this.dependencies.getFulfillmentRepository().findByOrderIdentity({
        internalOrderId: authorized.internalOrderId,
        publicOrderReference: authorized.publicOrderReference,
      });
    } catch {
      return unavailable();
    }
    if (aggregate.status !== "found") return unavailable();

    return projectLocalFulfillmentState(aggregate.aggregate.state, "customer");
  }

  async mutate(input: LocalFulfillmentCustomerMutationInput): Promise<LocalFulfillmentCustomerServiceResult> {
    if (!isLocalOrderPublicReference(input.publicOrderReference) || !isCustomerAction(input.action)) {
      return failure("invalid", "unsupported_action", "This customer action is not available.");
    }
    if (input.action.publicOrderReference !== input.publicOrderReference) {
      return unavailable();
    }

    const authorized = await this.authorize(input);
    if (!authorized) return unavailable();

    let existing;
    try {
      existing = this.dependencies.getFulfillmentRepository().findByOrderIdentity({
        internalOrderId: authorized.internalOrderId,
        publicOrderReference: authorized.publicOrderReference,
      });
    } catch {
      return unavailable();
    }
    // Customer actions may never admit the initial aggregate. This is an
    // existence check only; lifecycle/version/revision validation stays in the
    // aggregate so exact replay remains replay-first.
    if (existing.status !== "found") return unavailable();

    let committed: LocalFulfillmentAggregateResult;
    try {
      committed = this.dependencies.getFulfillmentRepository().commit({
        internalOrderId: authorized.internalOrderId,
        orderReference: authorized.publicOrderReference,
        actorKind: "customer",
        actorContextId: authorized.actorContextId,
        action: input.action,
      });
    } catch {
      return unavailable();
    }
    if (isAggregateSuccess(committed)) {
      return { status: committed.status, result: { ...committed.result } };
    }
    return mapAggregateFailure(committed);
  }

  private async authorize(input: LocalFulfillmentCustomerReadInput): Promise<AuthorizedCustomerOrder | null> {
    if (!isLocalOrderPublicReference(input.publicOrderReference) || !input.browserCapability) return null;

    let configuration: LocalFulfillmentConfiguration;
    try {
      configuration = (this.dependencies.readConfig ?? readTrustedLocalFulfillmentConfig)();
    } catch {
      return null;
    }
    if (configuration.source !== "local_fake" || !["development", "test"].includes(configuration.runtimeMode)) return null;

    let order;
    try {
      order = await this.dependencies.getOrderRepository().findAuthorizedSnapshot(
        input.publicOrderReference,
        input.browserCapability,
      );
    } catch {
      return null;
    }
    if (order.status !== "found") return null;

    let actorContextId: string;
    try {
      actorContextId = await (this.dependencies.deriveActorContext ?? deriveLocalPaymentAuthorityContext)(input.browserCapability);
    } catch {
      return null;
    }

    return {
      internalOrderId: order.snapshot.internalId,
      publicOrderReference: order.snapshot.publicReference,
      actorContextId,
      orderStatus: order.snapshot.status,
      paymentStatus: order.snapshot.paymentStatus,
    };
  }
}
