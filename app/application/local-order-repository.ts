import type {
  LocalOrderFulfillmentType,
  LocalOrderLineSnapshot,
  LocalOrderSnapshot,
  LocalOrderSnapshotInput,
} from "../domain/local-order.ts";

export type LocalOrderBrowserCapability = string & {
  readonly __localOrderBrowserCapability: unique symbol;
};

export type LocalOrderSnapshotDraft = Omit<LocalOrderSnapshotInput, "internalId" | "publicReference" | "createdAt" | "lines"> & {
      readonly lines: readonly (Omit<LocalOrderLineSnapshot, "orderItemId" | "fulfillmentType"> & {
        readonly orderItemId?: string;
        readonly fulfillmentType: LocalOrderFulfillmentType;
      })[];
};

export interface LocalOrderCreationContext {
  readonly cartId: string;
  readonly authorityKey: string;
}

export type LocalOrderCreationResult =
  | {
      readonly status: "created" | "existing";
      readonly snapshot: LocalOrderSnapshot;
      readonly browserCapability: LocalOrderBrowserCapability;
      readonly capabilityStatus: "issued" | "reissued" | "unchanged";
    }
  | { readonly status: "conflict" }
  | { readonly status: "failed" };

export type LocalOrderReadResult =
  | { readonly status: "found"; readonly snapshot: LocalOrderSnapshot }
  | { readonly status: "unavailable" };

export interface LocalOrderAccountReadPort {
  findSnapshotsForCustomer(customerId: string): readonly LocalOrderSnapshot[];
}

/** Server-only Fulfillment read port; it never accepts a browser capability. */
export interface LocalOrderFulfillmentReadPort {
  findSnapshotForFulfillment(publicReference: string): LocalOrderReadResult;
  findSnapshotForFulfillmentById(internalOrderId: string): LocalOrderReadResult;
}

/** Server-only Local Order repository port. It has no HTTP or provider types. */
export interface LocalOrderRepository {
  findOrCreate(input: {
    readonly creationAttemptId: string;
    readonly context: LocalOrderCreationContext;
    readonly inputFingerprint: string;
    readonly snapshot: LocalOrderSnapshotDraft;
    readonly existingBrowserCapability?: LocalOrderBrowserCapability;
  }): Promise<LocalOrderCreationResult>;
  findAuthorizedSnapshot(
    publicReference: string,
    browserCapability: LocalOrderBrowserCapability,
  ): Promise<LocalOrderReadResult>;
}

export type { LocalOrderSnapshot };
