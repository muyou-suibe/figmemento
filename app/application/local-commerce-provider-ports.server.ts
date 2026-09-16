import type { AcceptedCartItem, ShoppingCartRecord } from "../domain/shopping-cart.ts";
import type {
  LocalOrderBrowserCapability,
  LocalOrderSnapshotDraft,
} from "./local-order-repository.ts";
import type { LocalOrderSnapshot } from "../domain/local-order.ts";
import type {
  LocalPaymentAggregateSuccess,
} from "./local-payment-repository.ts";
import type {
  LocalFulfillmentAggregateRecord,
} from "./local-fulfillment-repository.ts";
import type {
  LocalFulfillmentActionInput,
  LocalFulfillmentActionResult,
} from "../domain/local-fulfillment.ts";
import type {
  LocalTrackingAggregateRecord,
  LocalTrackingActionResult,
} from "./local-tracking-repository.ts";
import type { LocalTrackingActionInput } from "../domain/local-tracking.ts";

/**
 * Server-owned command context. The literal kind is an intentional boundary:
 * browser payloads are never accepted as an authority context by these ports.
 * The concrete verifier that creates this value remains owned by each runtime.
 */
export interface VerifiedAuthorityContext {
  readonly kind: "verified_server_authority";
  readonly projectId: string;
  readonly ownerId: string;
  readonly actorKind: "customer" | "operator" | "system" | "admin";
  readonly actorId: string;
}

/** A server-generated idempotency selector and its normalized input digest. */
export interface IdempotencyContext {
  readonly key: string;
  readonly fingerprint: string;
}

export interface LocalCommerceCommandContext {
  readonly authority: VerifiedAuthorityContext;
  readonly idempotency: IdempotencyContext;
  readonly expectedVersion: number;
}

export type LocalCommerceUnavailableReason =
  | "invalid_authority"
  | "invalid_request"
  | "not_found"
  | "source_failure"
  | "rejected"
  | "not_supported";

export type LocalCommerceConflictReason =
  | "version_mismatch"
  | "idempotency_mismatch"
  | "ownership_mismatch"
  | "duplicate";

export type LocalCommercePortResult<T> =
  | { readonly status: "found"; readonly value: T }
  | { readonly status: "unavailable"; readonly reason: LocalCommerceUnavailableReason }
  | { readonly status: "conflict"; readonly reason: LocalCommerceConflictReason };

export interface LocalCommerceCartState {
  readonly projectId: string;
  readonly ownerId: string;
  readonly cartId: string;
  /** Boundary version; the Cart record remains the sole business authority. */
  readonly version: number;
  readonly record: ShoppingCartRecord;
}

export interface LocalCommerceOrderState {
  readonly projectId: string;
  readonly ownerId: string;
  readonly internalOrderId: string;
  readonly publicReference: string;
  /** A command-boundary version, not a second Order lifecycle. */
  readonly version: number;
  readonly snapshot: LocalOrderSnapshot;
}

export interface LocalCommerceOrderCreatedState extends LocalCommerceOrderState {
  /** Kept server-side for the existing customer authorization handoff. */
  readonly browserCapability: LocalOrderBrowserCapability;
}

export interface LocalCommercePaymentState {
  readonly projectId: string;
  readonly ownerId: string;
  readonly version: number;
  readonly payment: LocalPaymentAggregateSuccess;
}

export interface LocalCommerceFulfillmentState {
  readonly projectId: string;
  readonly ownerId: string;
  readonly version: number;
  readonly aggregate: LocalFulfillmentAggregateRecord;
}

export interface LocalCommerceTrackingState {
  readonly projectId: string;
  readonly ownerId: string;
  readonly version: number;
  readonly aggregate: LocalTrackingAggregateRecord;
}

export interface LocalCommerceCartPort {
  read(input: { readonly authority: VerifiedAuthorityContext; readonly cartId: string }): Promise<LocalCommercePortResult<LocalCommerceCartState>>;
  create(input: { readonly authority: VerifiedAuthorityContext; readonly idempotency: IdempotencyContext }): Promise<LocalCommercePortResult<LocalCommerceCartState>>;
  addLine(input: LocalCommerceCommandContext & { readonly cartId: string; readonly item: AcceptedCartItem }): Promise<LocalCommercePortResult<LocalCommerceCartState>>;
  updateLine(input: LocalCommerceCommandContext & { readonly cartId: string; readonly lineId: string; readonly quantity: number }): Promise<LocalCommercePortResult<LocalCommerceCartState>>;
  removeLine(input: LocalCommerceCommandContext & { readonly cartId: string; readonly lineId: string }): Promise<LocalCommercePortResult<LocalCommerceCartState>>;
  clear(input: LocalCommerceCommandContext & { readonly cartId: string }): Promise<LocalCommercePortResult<LocalCommerceCartState>>;
}

export interface LocalCommerceOrderPort {
  create(input: {
    readonly authority: VerifiedAuthorityContext;
    readonly idempotency: IdempotencyContext;
    readonly cartId: string;
    readonly snapshot: LocalOrderSnapshotDraft;
    readonly existingBrowserCapability?: LocalOrderBrowserCapability;
  }): Promise<LocalCommercePortResult<LocalCommerceOrderCreatedState>>;
  readExact(input: {
    readonly authority: VerifiedAuthorityContext;
    readonly internalOrderId: string;
    readonly publicReference: string;
  }): Promise<LocalCommercePortResult<LocalCommerceOrderState>>;
  readSnapshot(input: {
    readonly authority: VerifiedAuthorityContext;
    readonly internalOrderId: string;
    readonly publicReference: string;
  }): Promise<LocalCommercePortResult<LocalCommerceOrderState>>;
}

export interface LocalCommercePaymentPort<State = LocalCommercePaymentState> {
  attempt(input: LocalCommerceCommandContext & {
    readonly internalOrderId: string;
    readonly publicReference: string;
    readonly outcome: "success" | "failed" | "cancelled";
  }): Promise<LocalCommercePortResult<State>>;
}

export interface LocalCommerceFulfillmentPort<State = LocalCommerceFulfillmentState, Result = LocalFulfillmentActionResult, Action = LocalFulfillmentActionInput> {
  readExact(input: {
    readonly authority: VerifiedAuthorityContext;
    readonly internalOrderId: string;
    readonly publicReference: string;
  }): Promise<LocalCommercePortResult<State>>;
  command(input: LocalCommerceCommandContext & {
    readonly internalOrderId: string;
    readonly publicReference: string;
    readonly action: Action;
    readonly publishedAt?: string;
  }): Promise<LocalCommercePortResult<{
    readonly state: State;
    readonly result: Result;
  }>>;
}

export interface LocalCommerceTrackingPort {
  readExact(input: {
    readonly authority: VerifiedAuthorityContext;
    readonly internalOrderId: string;
    readonly publicReference: string;
  }): Promise<LocalCommercePortResult<LocalCommerceTrackingState>>;
  command(input: LocalCommerceCommandContext & {
    readonly internalOrderId: string;
    readonly publicReference: string;
    readonly action: LocalTrackingActionInput;
  }): Promise<LocalCommercePortResult<{
    readonly state: LocalCommerceTrackingState;
    readonly result: LocalTrackingActionResult;
  }>>;
}

export interface LocalCommerceProviderPorts {
  readonly cart: LocalCommerceCartPort;
  readonly order: LocalCommerceOrderPort;
  readonly payment: LocalCommercePaymentPort;
  readonly fulfillment: LocalCommerceFulfillmentPort;
  readonly tracking: LocalCommerceTrackingPort;
}

export function isVerifiedAuthorityContext(value: unknown): value is VerifiedAuthorityContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "verified_server_authority"
    && typeof candidate.projectId === "string" && candidate.projectId.trim().length > 0
    && typeof candidate.ownerId === "string" && candidate.ownerId.trim().length > 0
    && typeof candidate.actorId === "string" && candidate.actorId.trim().length > 0
    && (candidate.actorKind === "customer" || candidate.actorKind === "operator" || candidate.actorKind === "system" || candidate.actorKind === "admin");
}

export function isIdempotencyContext(value: unknown): value is IdempotencyContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.key === "string" && candidate.key.trim().length > 0
    && typeof candidate.fingerprint === "string" && candidate.fingerprint.trim().length > 0;
}

export function isExpectedVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function authorityContextKey(authority: VerifiedAuthorityContext): string {
  return `${authority.projectId}\u001f${authority.ownerId}\u001f${authority.actorKind}\u001f${authority.actorId}`;
}
