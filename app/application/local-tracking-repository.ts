import type { LocalFulfillmentAggregateReadResult } from "./local-fulfillment-repository.ts";
import type { LocalOrderFulfillmentReadPort } from "./local-order-repository.ts";
import type {
  LocalShipment,
  LocalTrackingActionInput,
  LocalTrackingActionKind,
  LocalTrackingCanonicalFulfillmentReference,
  LocalTrackingCanonicalOrderReference,
  LocalTrackingIssue,
} from "../domain/local-tracking.ts";

export interface LocalTrackingCanonicalFulfillmentReadPort {
  findByOrderIdentity(input: { readonly internalOrderId: string; readonly publicOrderReference: string }): LocalFulfillmentAggregateReadResult;
}

export interface LocalTrackingCanonicalReadPorts {
  readonly orders: LocalOrderFulfillmentReadPort;
  readonly fulfillments: LocalTrackingCanonicalFulfillmentReadPort;
}

export interface LocalTrackingIdentityGenerator {
  nextInternalShipmentId(): string;
  nextPublicShipmentReference(): string;
  nextTrackingNumber(): string;
}

export interface LocalTrackingActionBindingRequest {
  readonly trackingActionId: string;
  readonly actorKind: "operator";
  readonly actorContextId: string;
  readonly canonicalOrder: LocalTrackingCanonicalOrderReference;
  readonly canonicalFulfillment: LocalTrackingCanonicalFulfillmentReference;
  readonly actionKind: LocalTrackingActionKind;
  readonly publicShipmentReference?: string;
}

export interface LocalTrackingActionResult {
  readonly kind: "local_tracking_action_result";
  readonly actionKind: LocalTrackingActionKind;
  readonly publicOrderReference: string;
  readonly publicShipmentReference: string;
  readonly status: LocalShipment["status"];
  readonly committedAt: string;
  readonly notice: "DEVELOPMENT / TEST ONLY";
}

export interface LocalTrackingCommittedBinding {
  readonly request: LocalTrackingActionBindingRequest;
  readonly committedFrom: LocalShipment["status"] | null;
  readonly result: LocalTrackingActionResult;
}

export interface LocalTrackingAggregateRecord {
  readonly kind: "local_tracking_aggregate";
  readonly canonicalOrder: LocalTrackingCanonicalOrderReference;
  readonly canonicalFulfillment: LocalTrackingCanonicalFulfillmentReference;
  readonly shipment: LocalShipment;
  readonly actionBindings: readonly LocalTrackingCommittedBinding[];
}

export type LocalTrackingAggregateReadResult =
  | { readonly status: "found"; readonly aggregate: LocalTrackingAggregateRecord }
  | { readonly status: "unavailable" };

export interface LocalTrackingAggregateCommitInput {
  readonly publicOrderReference: string;
  readonly actorKind: "operator";
  readonly actorContextId: string;
  readonly action: LocalTrackingActionInput;
}

export type LocalTrackingAggregateResult =
  | {
      readonly status: "committed" | "replayed";
      readonly aggregate: LocalTrackingAggregateRecord;
      readonly shipment: LocalShipment;
      readonly binding: LocalTrackingCommittedBinding;
      readonly result: LocalTrackingActionResult;
    }
  | {
      readonly status: "conflict" | "rejected" | "unavailable" | "failed";
      readonly issues: readonly LocalTrackingIssue[];
    };

export interface LocalTrackingCommitFailureInjector { beforeCommit?: () => void; }
export interface LocalMemoryLocalTrackingRepositoryOptions {
  readonly ids?: LocalTrackingIdentityGenerator;
  readonly now?: () => string;
  readonly failureInjector?: LocalTrackingCommitFailureInjector;
}

export interface LocalTrackingAggregateTestCounts {
  readonly shipmentCount: number;
  readonly eventCount: number;
  readonly actionBindingCount: number;
}

export interface LocalTrackingAggregateRepository {
  commit(input: LocalTrackingAggregateCommitInput): LocalTrackingAggregateResult;
  findByOrderIdentity(input: { readonly internalOrderId: string; readonly publicOrderReference: string }): LocalTrackingAggregateReadResult;
}
