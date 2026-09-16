import type {
  LocalFulfillmentActionResult,
  LocalFulfillmentCommittedBinding,
  LocalFulfillmentIssue,
  LocalFulfillmentRevisionCount,
  LocalFulfillmentState,
  LocalFulfillmentActionInput,
  LocalFulfillmentPreviewMetadata,
} from "../domain/local-fulfillment.ts";
import type {
  LocalFulfillmentPreviewVersion,
  LocalFulfillmentStatus,
} from "../domain/local-fulfillment.ts";
import type { LocalOrderFulfillmentReadPort } from "./local-order-repository.ts";

export interface LocalFulfillmentRevisionRecord {
  readonly kind: "local_fulfillment_revision_record";
  readonly previewVersion: LocalFulfillmentPreviewVersion;
  readonly revisionOrdinal: 1 | 2;
  readonly revisionNote?: string;
  readonly committedAt: string;
}

/** One immutable record is the only mutable Fulfillment visibility unit. */
export interface LocalFulfillmentAggregateRecord {
  readonly kind: "local_fulfillment_aggregate";
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly state: LocalFulfillmentState;
  readonly previewHistory: readonly LocalFulfillmentPreviewMetadata[];
  readonly revisionRecords: readonly LocalFulfillmentRevisionRecord[];
  readonly actionBindings: readonly LocalFulfillmentCommittedBinding[];
}

export type LocalFulfillmentAggregateReadResult =
  | { readonly status: "found"; readonly aggregate: LocalFulfillmentAggregateRecord }
  | { readonly status: "unavailable" };

export interface LocalFulfillmentAggregateCommitInput {
  readonly internalOrderId: string;
  readonly orderReference: string;
  /** Server-authorized actor context; raw browser authority is not accepted. */
  readonly actorKind: "customer" | "operator";
  readonly actorContextId: string;
  readonly action: LocalFulfillmentActionInput;
  /** Server-observed publication time; the operator never supplies a version. */
  readonly publishedAt?: string;
}

export type LocalFulfillmentAggregateSuccess = {
  readonly status: "committed" | "replayed";
  readonly aggregate: LocalFulfillmentAggregateRecord;
  readonly state: LocalFulfillmentState;
  readonly binding: LocalFulfillmentCommittedBinding;
  readonly result: LocalFulfillmentActionResult;
};

export type LocalFulfillmentAggregateResult =
  | LocalFulfillmentAggregateSuccess
  | {
      readonly status: "conflict" | "rejected" | "unavailable" | "failed";
      readonly issues: readonly LocalFulfillmentIssue[];
    };

export interface LocalFulfillmentAggregateRepository {
  commit(input: LocalFulfillmentAggregateCommitInput): LocalFulfillmentAggregateResult;
  findByOrderIdentity(input: {
    readonly internalOrderId: string;
    readonly publicOrderReference: string;
  }): LocalFulfillmentAggregateReadResult;
}

export interface LocalFulfillmentCommitFailureInjector {
  beforeCommit?: () => void;
}

export interface LocalMemoryLocalFulfillmentRepositoryOptions {
  readonly now?: () => string;
  readonly failureInjector?: LocalFulfillmentCommitFailureInjector;
}

/** Test-only aggregate facts; never a browser or HTTP contract. */
export interface LocalFulfillmentAggregateTestCounts {
  readonly aggregateCount: number;
  readonly actionBindingCount: number;
  readonly previewRecordCount: number;
  readonly revisionRecordCount: number;
}

export type { LocalOrderFulfillmentReadPort, LocalFulfillmentRevisionCount, LocalFulfillmentStatus };
