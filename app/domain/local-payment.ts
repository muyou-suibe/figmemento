import type { LocalOrderSnapshot } from "./local-order.ts";
import { isLocalOrderPublicReference } from "./local-order.ts";

export type LocalOrderPublicReference = string;

export type LocalPaymentScenario = "success" | "failed" | "cancelled";
export type LocalPaymentAttemptState = "pending" | "succeeded" | "failed" | "cancelled";
export type LocalPaymentTerminalState = Exclude<LocalPaymentAttemptState, "pending">;
export type LocalPaymentCurrency = "USD";

export type LocalPaymentOrderStatus = "pending_payment" | "payment_failed" | "paid";
export type LocalPaymentOrderPaymentStatus = "pending" | "failed" | "succeeded";

export type LocalPaymentIssueCode =
  | "invalid_type"
  | "invalid_format"
  | "invalid_value"
  | "unknown_field"
  | "authority_field"
  | "unsupported_outcome"
  | "unsupported_currency"
  | "non_development"
  | "invalid_amount"
  | "invalid_tax"
  | "invalid_lifecycle"
  | "non_retryable"
  | "pending_not_public"
  | "replay_conflict"
  | "unavailable"
  | "refund_unsupported";

export interface LocalPaymentIssue {
  readonly path: string;
  readonly code: LocalPaymentIssueCode;
  readonly message: string;
}

export type LocalPaymentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly LocalPaymentIssue[] };

export interface LocalPaymentMutationInput {
  readonly publicReference: LocalOrderPublicReference;
  readonly paymentAttemptId: string;
  readonly outcome: LocalPaymentScenario;
}

export interface LocalPaymentSimulationAmount {
  readonly simulatedAmountCents: number;
  readonly simulatedCurrency: LocalPaymentCurrency;
}

export interface LocalPaymentProtectedCommercialSnapshot {
  readonly developmentOnly: boolean;
  readonly currency: string;
  readonly localArithmeticTotalCents: number;
  readonly tax: {
    readonly status: string;
    readonly amountCents: number | null;
  };
}

export interface LocalPaymentProtectedOrderInput {
  readonly status: LocalPaymentOrderStatus;
  readonly paymentStatus: LocalPaymentOrderPaymentStatus;
  readonly commercial: LocalPaymentProtectedCommercialSnapshot;
}

export interface LocalPaymentOrderLifecycle {
  readonly orderStatus: LocalPaymentOrderStatus;
  readonly paymentStatus: LocalPaymentOrderPaymentStatus;
}

/** The facts Payment is never allowed to rewrite during a lifecycle change. */
export type LocalPaymentImmutableOrderFacts = Omit<
  LocalOrderSnapshot,
  "kind" | "status" | "paymentStatus"
>;

export interface LocalPaymentOrderState extends LocalPaymentImmutableOrderFacts {
  readonly lifecycle: LocalPaymentOrderLifecycle;
}

export interface LocalPaymentServerIdentity {
  readonly internalPaymentId: string;
  readonly internalOrderId: string;
  readonly authorityContext: string;
}

export type LocalPaymentPublicReference = string;

export interface LocalPaymentAttempt {
  readonly kind: "local_payment_attempt";
  readonly paymentReference: LocalPaymentPublicReference;
  readonly orderReference: LocalOrderPublicReference;
  readonly serverIdentity: LocalPaymentServerIdentity;
  readonly paymentAttemptId: string;
  readonly outcome: LocalPaymentScenario;
  readonly state: LocalPaymentAttemptState;
  readonly simulatedAmountCents: number;
  readonly simulatedCurrency: LocalPaymentCurrency;
  readonly createdAt: string;
  readonly committedAt: string;
  readonly developmentOnly: true;
}

export interface LocalPaymentPublicProjection {
  readonly kind: "local_payment_projection";
  readonly paymentReference: LocalPaymentPublicReference;
  readonly orderReference: LocalOrderPublicReference;
  readonly status: LocalPaymentTerminalState;
  readonly outcome: LocalPaymentScenario;
  readonly simulatedAmountCents: number;
  readonly simulatedCurrency: LocalPaymentCurrency;
  readonly timestamp: string;
  readonly notice: "Development/test simulation only. No real money was charged.";
}

export interface LocalPaymentReplayRequest {
  /** Canonical server-resolved identity; never supplied by the browser. */
  readonly internalOrderId: string;
  readonly paymentAttemptId: string;
  readonly outcome: LocalPaymentScenario;
  /** Stable server-derived context identity/fingerprint, never raw cookie material. */
  readonly authorityContext: string;
}

export interface LocalPaymentCommittedBinding extends LocalPaymentReplayRequest {
  /** Optional safe diagnostic/result correlation; not replay authority. */
  readonly publicReference?: LocalOrderPublicReference;
  readonly result: LocalPaymentPublicProjection;
}

const LOCAL_PAYMENT_PUBLIC_REFERENCE_PATTERN = /^LP-LOCAL-[A-Z0-9]{16}$/;
const PAYMENT_ATTEMPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MUTATION_FIELDS = new Set(["publicReference", "paymentAttemptId", "outcome"]);
const AUTHORITY_FIELDS = new Set([
  "amount",
  "currency",
  "subtotal",
  "shipping",
  "discount",
  "tax",
  "total",
  "localArithmeticTotal",
  "localArithmeticTotalCents",
  "orderStatus",
  "paymentStatus",
  "paid",
  "succeeded",
  "provider",
  "providerToken",
  "cardNumber",
  "cvv",
  "expiry",
  "bankAccount",
  "paypalCredential",
  "webhookSecret",
  "targetStatus",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(path: string, code: LocalPaymentIssueCode, message: string): LocalPaymentIssue {
  return { path, code, message };
}

function success<T>(value: T): LocalPaymentResult<T> {
  return { ok: true, value };
}

function failure<T = never>(...issues: LocalPaymentIssue[]): LocalPaymentResult<T> {
  return { ok: false, issues };
}

export function isLocalPaymentScenario(value: unknown): value is LocalPaymentScenario {
  return value === "success" || value === "failed" || value === "cancelled";
}

export function isLocalPaymentPublicReference(value: unknown): value is LocalPaymentPublicReference {
  return typeof value === "string" && LOCAL_PAYMENT_PUBLIC_REFERENCE_PATTERN.test(value);
}

export function isPaymentAttemptId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    PAYMENT_ATTEMPT_ID_PATTERN.test(value)
  );
}

function mutationFieldIssue(path: string, field: string): LocalPaymentIssue {
  if (AUTHORITY_FIELDS.has(field)) {
    return issue(path, "authority_field", "Browser authority fields are not accepted.");
  }
  return issue(path, "unknown_field", "Field is not part of the local Payment mutation contract.");
}

/** Parses only the three structural fields allowed by the future mutation boundary. */
export function parseLocalPaymentMutationInput(value: unknown): LocalPaymentResult<LocalPaymentMutationInput> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Payment input must be an object."));

  const issues: LocalPaymentIssue[] = [];
  for (const field of Object.keys(value)) {
    if (!MUTATION_FIELDS.has(field)) issues.push(mutationFieldIssue(`$.${field}`, field));
  }

  const publicReference = value.publicReference;
  if (!isLocalOrderPublicReference(publicReference)) {
    issues.push(issue(
      "$.publicReference",
      typeof publicReference === "string" ? "invalid_format" : "invalid_type",
      "Local Order public reference is invalid.",
    ));
  }

  const paymentAttemptId = value.paymentAttemptId;
  if (!isPaymentAttemptId(paymentAttemptId)) {
    issues.push(issue(
      "$.paymentAttemptId",
      typeof paymentAttemptId === "string" ? "invalid_format" : "invalid_type",
      "Payment attempt selector is invalid.",
    ));
  }

  const outcome = value.outcome;
  if (!isLocalPaymentScenario(outcome)) {
    issues.push(issue(
      "$.outcome",
      typeof outcome === "string" ? "unsupported_outcome" : "invalid_type",
      "Outcome must be success, failed, or cancelled.",
    ));
  }

  if (issues.length > 0) return failure(...issues);
  return success({
    publicReference: publicReference as LocalOrderPublicReference,
    paymentAttemptId: paymentAttemptId as string,
    outcome: outcome as LocalPaymentScenario,
  });
}

export function isRetryableLocalPaymentOrderLifecycle(
  lifecycle: Pick<LocalPaymentProtectedOrderInput, "status" | "paymentStatus">,
): boolean {
  return (
    (lifecycle.status === "pending_payment" && lifecycle.paymentStatus === "pending") ||
    (lifecycle.status === "payment_failed" && lifecycle.paymentStatus === "failed")
  );
}

/**
 * Validates only a NEW attempt. Callers must resolve an exact committed replay
 * before invoking this function.
 */
export function validateNewLocalPaymentAttempt(
  value: unknown,
): LocalPaymentResult<LocalPaymentSimulationAmount> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Protected Order input is invalid."));

  const status = value.status;
  const paymentStatus = value.paymentStatus;
  const lifecycle = { status, paymentStatus };

  if (
    (status !== "pending_payment" && status !== "payment_failed" && status !== "paid") ||
    (paymentStatus !== "pending" && paymentStatus !== "failed" && paymentStatus !== "succeeded")
  ) {
    return failure(issue("$.status", "invalid_lifecycle", "Local Order lifecycle is invalid."));
  }

  if (status === "paid" && paymentStatus === "succeeded") {
    return failure(issue("$.status", "non_retryable", "Paid Local Orders reject new Payment attempts."));
  }
  if (!isRetryableLocalPaymentOrderLifecycle(lifecycle as LocalPaymentProtectedOrderInput)) {
    return failure(issue("$.status", "invalid_lifecycle", "Local Order is not in an approved retryable state."));
  }

  const commercial = value.commercial;
  if (!isRecord(commercial)) {
    return failure(issue("$.commercial", "invalid_value", "Protected commercial snapshot is unavailable."));
  }
  if (commercial.developmentOnly !== true) {
    return failure(issue("$.commercial.developmentOnly", "non_development", "Payment simulation requires a development-only snapshot."));
  }
  if (commercial.currency !== "USD") {
    return failure(issue("$.commercial.currency", "unsupported_currency", "Payment simulation supports USD only."));
  }
  if (
    typeof commercial.localArithmeticTotalCents !== "number" ||
    !Number.isFinite(commercial.localArithmeticTotalCents) ||
    !Number.isSafeInteger(commercial.localArithmeticTotalCents) ||
    commercial.localArithmeticTotalCents < 0
  ) {
    return failure(issue("$.commercial.localArithmeticTotalCents", "invalid_amount", "Simulation amount is invalid."));
  }

  const tax = commercial.tax;
  if (!isRecord(tax) || tax.status !== "not_activated" || tax.amountCents !== null) {
    return failure(issue("$.commercial.tax", "invalid_tax", "Tax must remain not activated with a null amount."));
  }

  return success({
    simulatedAmountCents: commercial.localArithmeticTotalCents,
    simulatedCurrency: "USD",
  });
}

export interface LocalPaymentTransition {
  readonly attemptState: Exclude<LocalPaymentAttemptState, "pending">;
  readonly orderStatus: LocalPaymentOrderStatus;
  readonly paymentStatus: LocalPaymentOrderPaymentStatus;
}

/** Pure local transition table. It does not write a repository or Order state. */
export function transitionLocalPaymentLifecycle(
  lifecycle: LocalPaymentOrderLifecycle,
  outcome: unknown,
): LocalPaymentResult<LocalPaymentTransition> {
  if (!isLocalPaymentScenario(outcome)) {
    return failure(issue(
      "$.outcome",
      outcome === "refund" || outcome === "refunded" || outcome === "partial_refund"
        ? "refund_unsupported"
        : "unsupported_outcome",
      "Outcome is not supported by the local Payment simulation.",
    ));
  }

  if (lifecycle.orderStatus === "paid" && lifecycle.paymentStatus === "succeeded") {
    return failure(issue("$.orderStatus", "non_retryable", "Paid Local Orders reject new Payment transitions."));
  }
  if (!isRetryableLocalPaymentOrderLifecycle({
    status: lifecycle.orderStatus,
    paymentStatus: lifecycle.paymentStatus,
  })) {
    return failure(issue("$.orderStatus", "invalid_lifecycle", "Local Order lifecycle is invalid."));
  }

  if (outcome === "success") {
    return success({ attemptState: "succeeded", orderStatus: "paid", paymentStatus: "succeeded" });
  }
  if (outcome === "failed") {
    return success({ attemptState: "failed", orderStatus: "payment_failed", paymentStatus: "failed" });
  }
  return success({ attemptState: "cancelled", orderStatus: "pending_payment", paymentStatus: "pending" });
}

/** Returns a new value with the same immutable facts and new lifecycle only. */
export function transitionLocalPaymentOrderState(
  state: LocalPaymentOrderState,
  outcome: unknown,
): LocalPaymentResult<LocalPaymentOrderState> {
  const transition = transitionLocalPaymentLifecycle(state.lifecycle, outcome);
  if (!transition.ok) return transition;
  return success({
    ...state,
    lifecycle: {
      orderStatus: transition.value.orderStatus,
      paymentStatus: transition.value.paymentStatus,
    },
  });
}

/**
 * Exact replay matching is independent of current lifecycle and commercial
 * validation. Future aggregate/application code calls this after authorization
 * and before NEW-attempt validation.
 */
export function isExactCommittedLocalPaymentReplay(
  request: LocalPaymentReplayRequest,
  committed: LocalPaymentCommittedBinding,
): boolean {
  return (
    request.internalOrderId === committed.internalOrderId &&
    request.paymentAttemptId === committed.paymentAttemptId &&
    request.outcome === committed.outcome &&
    request.authorityContext === committed.authorityContext
  );
}

export function projectLocalPaymentAttempt(
  attempt: LocalPaymentAttempt,
): LocalPaymentResult<LocalPaymentPublicProjection> {
  if (attempt.state === "pending") {
    return failure(issue("$.state", "pending_not_public", "Only committed Payment outcomes may be exposed."));
  }
  return success({
    kind: "local_payment_projection",
    paymentReference: attempt.paymentReference,
    orderReference: attempt.orderReference,
    status: attempt.state,
    outcome: attempt.outcome,
    simulatedAmountCents: attempt.simulatedAmountCents,
    simulatedCurrency: attempt.simulatedCurrency,
    timestamp: attempt.committedAt,
    notice: "Development/test simulation only. No real money was charged.",
  });
}
