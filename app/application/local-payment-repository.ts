import type {
  LocalOrderLifecycle,
  LocalOrderSnapshot,
} from "../domain/local-order.ts";
import type {
  LocalOrderPublicReference,
  LocalPaymentAttempt,
  LocalPaymentCommittedBinding,
  LocalPaymentIssue,
  LocalPaymentPublicProjection,
  LocalPaymentReplayRequest,
} from "../domain/local-payment.ts";

export type LocalOrderPaymentReadResult =
  | { readonly status: "found"; readonly snapshot: LocalOrderSnapshot }
  | { readonly status: "unavailable" };

export type LocalOrderPaymentCommitResult =
  | { readonly status: "committed"; readonly snapshot: LocalOrderSnapshot }
  | { readonly status: "conflict" | "unavailable" | "failed" };

/**
 * Server-only synchronous transition port over the canonical Local Order
 * store. Callers must already have resolved and authorized internalOrderId.
 */
export interface LocalOrderPaymentStatePort {
  findSnapshotForPayment(internalOrderId: string): LocalOrderPaymentReadResult;
  commitLifecycleForPayment(input: {
    readonly internalOrderId: string;
    readonly expectedSnapshot: LocalOrderSnapshot;
    readonly lifecycle: LocalOrderLifecycle;
  }): LocalOrderPaymentCommitResult;
}

export interface LocalPaymentAggregateCommitInput extends LocalPaymentReplayRequest {
  readonly orderReference: LocalOrderPublicReference;
}

export type LocalPaymentAggregateSuccess = {
  readonly status: "committed" | "replayed";
  readonly attempt: LocalPaymentAttempt;
  readonly binding: LocalPaymentCommittedBinding;
  readonly result: LocalPaymentPublicProjection;
  readonly orderSnapshot: LocalOrderSnapshot;
};

export type LocalPaymentAggregateResult =
  | LocalPaymentAggregateSuccess
  | {
      readonly status: "conflict" | "rejected" | "unavailable" | "failed";
      readonly issues: readonly LocalPaymentIssue[];
    };

export type LocalPaymentAggregateFailure = {
  readonly status: "conflict" | "rejected" | "unavailable" | "failed";
  readonly issues: readonly LocalPaymentIssue[];
};

/** Server-only Payment aggregate port; it has no HTTP or browser authority. */
export interface LocalPaymentAggregateRepository {
  commit(input: LocalPaymentAggregateCommitInput): LocalPaymentAggregateResult;
}

export interface LocalPaymentIdentityGenerator {
  nextInternalPaymentId(): string;
  nextPaymentReference(): string;
}

export interface LocalPaymentCommitFailureInjector {
  beforeCommit?: () => void;
}

export interface LocalMemoryLocalPaymentRepositoryOptions {
  readonly ids?: LocalPaymentIdentityGenerator;
  readonly now?: () => string;
  readonly failureInjector?: LocalPaymentCommitFailureInjector;
}

export type LocalPaymentCommittedAttempt = {
  readonly attempt: LocalPaymentAttempt;
  readonly binding: LocalPaymentCommittedBinding;
};
