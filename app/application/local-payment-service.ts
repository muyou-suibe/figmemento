import {
  isLocalPaymentScenario,
  isPaymentAttemptId,
  type LocalPaymentIssue,
  type LocalPaymentMutationInput,
  type LocalPaymentPublicProjection,
} from "../domain/local-payment.ts";
import {
  isLocalOrderPublicReference,
  type LocalOrderPublicProjection,
} from "../domain/local-order.ts";
import type {
  LocalOrderBrowserCapability,
  LocalOrderRepository,
} from "./local-order-repository.ts";
import type {
  LocalPaymentAggregateRepository,
  LocalPaymentAggregateFailure,
  LocalPaymentAggregateResult,
  LocalPaymentAggregateSuccess,
} from "./local-payment-repository.ts";
import {
  readTrustedLocalPaymentConfig,
  type LocalPaymentConfiguration,
} from "../config/local-payment-runtime.ts";
import { deriveLocalPaymentAuthorityContext } from "../server/local-payment-authority.server.ts";

export interface LocalPaymentApplicationInput extends LocalPaymentMutationInput {
  /** Extracted from the server request cookie; never from the JSON body. */
  readonly browserCapability?: LocalOrderBrowserCapability;
}

export interface LocalPaymentApplicationOrderProjection {
  readonly publicReference: string;
  readonly status: LocalOrderPublicProjection["status"];
  readonly paymentStatus: LocalOrderPublicProjection["paymentStatus"];
}

export interface LocalPaymentApplicationSuccess {
  readonly status: "committed" | "replayed";
  readonly payment: LocalPaymentPublicProjection;
  readonly order: LocalPaymentApplicationOrderProjection;
}

export type LocalPaymentApplicationFailure = {
  readonly status: "invalid" | "unavailable" | "conflict" | "non_retryable" | "unsupported_runtime" | "failed";
  readonly issues: readonly Pick<LocalPaymentIssue, "code" | "message">[];
};

export type LocalPaymentApplicationResult =
  | LocalPaymentApplicationSuccess
  | LocalPaymentApplicationFailure;

export interface LocalPaymentServiceDependencies {
  readonly readConfig?: () => LocalPaymentConfiguration;
  readonly getOrderRepository: () => LocalOrderRepository;
  readonly getPaymentRepository: () => LocalPaymentAggregateRepository;
  readonly deriveAuthorityContext?: typeof deriveLocalPaymentAuthorityContext;
  readonly onPaymentCommitted?: (input: {
    readonly outcome: LocalPaymentMutationInput["outcome"];
    readonly orderSnapshot: LocalPaymentAggregateSuccess["orderSnapshot"];
  }) => void;
}

function applicationIssue(code: LocalPaymentIssue["code"], message: string) {
  return [{ code, message }];
}

function unavailable(): LocalPaymentApplicationFailure {
  return {
    status: "unavailable",
    issues: applicationIssue("unavailable", "Local Payment is unavailable."),
  };
}

function invalid(message = "Local Payment input is invalid."): LocalPaymentApplicationFailure {
  return {
    status: "invalid",
    issues: applicationIssue("invalid_value", message),
  };
}

function mapAggregateFailure(result: LocalPaymentAggregateFailure): LocalPaymentApplicationFailure {
  if (result.status === "conflict") {
    return { status: "conflict", issues: applicationIssue("replay_conflict", "Payment attempt context conflicts with an existing attempt.") };
  }
  if (result.status === "rejected") {
    const nonRetryable = result.issues.some((entry) => entry.code === "non_retryable");
    return {
      status: nonRetryable ? "non_retryable" : "invalid",
      issues: applicationIssue(
        nonRetryable ? "non_retryable" : (result.issues[0]?.code ?? "invalid_value"),
        nonRetryable ? "This Local Order cannot accept a new Payment attempt." : "Local Payment could not be evaluated.",
      ),
    };
  }
  return result.status === "failed"
    ? { status: "failed", issues: applicationIssue("unavailable", "Local Payment could not be committed.") }
    : unavailable();
}

function isValidApplicationInput(input: LocalPaymentApplicationInput): boolean {
  return (
    isLocalOrderPublicReference(input.publicReference)
    && isPaymentAttemptId(input.paymentAttemptId)
    && isLocalPaymentScenario(input.outcome)
  );
}

function isAggregateSuccess(value: LocalPaymentAggregateResult): value is LocalPaymentAggregateSuccess {
  return value.status === "committed" || value.status === "replayed";
}

function safeOrderProjection(snapshot: {
  readonly publicReference: string;
  readonly status: LocalOrderPublicProjection["status"];
  readonly paymentStatus: LocalOrderPublicProjection["paymentStatus"];
}): LocalPaymentApplicationOrderProjection {
  return {
    publicReference: snapshot.publicReference,
    status: snapshot.status,
    paymentStatus: snapshot.paymentStatus,
  };
}

/**
 * Server-only application boundary. It authorizes and resolves identity, then
 * delegates all replay, commercial validation, and lifecycle decisions to the
 * canonical Payment aggregate.
 */
export class LocalPaymentService {
  private readonly dependencies: LocalPaymentServiceDependencies;

  constructor(dependencies: LocalPaymentServiceDependencies) {
    this.dependencies = dependencies;
  }

  async execute(input: LocalPaymentApplicationInput): Promise<LocalPaymentApplicationResult> {
    if (!isValidApplicationInput(input)) return invalid();

    let configuration: LocalPaymentConfiguration;
    try {
      configuration = (this.dependencies.readConfig ?? readTrustedLocalPaymentConfig)();
    } catch {
      return { status: "unsupported_runtime", issues: applicationIssue("invalid_value", "Local Payment runtime is not supported.") };
    }
    if (configuration.source !== "local_fake") return unavailable();
    if (configuration.runtimeMode !== "development" && configuration.runtimeMode !== "test") {
      return { status: "unsupported_runtime", issues: applicationIssue("invalid_value", "Local Payment runtime is not supported.") };
    }

    const capability = input.browserCapability;
    if (!capability) return unavailable();

    let authorized;
    try {
      authorized = await this.dependencies.getOrderRepository().findAuthorizedSnapshot(
        input.publicReference,
        capability,
      );
    } catch {
      return unavailable();
    }
    if (authorized.status !== "found") return unavailable();

    const deriveAuthorityContext = this.dependencies.deriveAuthorityContext ?? deriveLocalPaymentAuthorityContext;
    let authorityContext: string;
    try {
      authorityContext = await deriveAuthorityContext(capability);
    } catch {
      return unavailable();
    }

    let aggregate: LocalPaymentAggregateResult;
    try {
      aggregate = this.dependencies.getPaymentRepository().commit({
        internalOrderId: authorized.snapshot.internalId,
        orderReference: authorized.snapshot.publicReference,
        paymentAttemptId: input.paymentAttemptId,
        outcome: input.outcome,
        authorityContext,
      });
    } catch {
      return unavailable();
    }
    if (!isAggregateSuccess(aggregate)) return mapAggregateFailure(aggregate);

    try {
      this.dependencies.onPaymentCommitted?.({ outcome: input.outcome, orderSnapshot: aggregate.orderSnapshot });
    } catch {
      // Local side effects are best-effort and never rewrite the committed
      // Payment/Order result.
    }

    return {
      status: aggregate.status,
      payment: aggregate.result,
      order: safeOrderProjection(aggregate.orderSnapshot),
    };
  }
}
