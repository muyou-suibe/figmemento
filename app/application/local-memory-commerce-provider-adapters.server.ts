import type {
  LocalFulfillmentAggregateRepository,
} from "./local-fulfillment-repository.ts";
import type { LocalOrderFulfillmentReadPort, LocalOrderRepository } from "./local-order-repository.ts";
import type { LocalOrderPaymentStatePort, LocalPaymentAggregateRepository } from "./local-payment-repository.ts";
import type {
  LocalTrackingAggregateRepository,
} from "./local-tracking-repository.ts";
import type { ShoppingCartProvider } from "../domain/shopping-cart.ts";
import type { LocalMemoryShoppingCartProvider } from "../infrastructure/cart/local-memory-shopping-cart-provider.ts";
import type { LocalMemoryLocalOrderRepository } from "../infrastructure/local-order/local-memory-local-order-repository.server.ts";
import type { LocalMemoryLocalPaymentRepository } from "../infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import type { LocalMemoryLocalFulfillmentRepository } from "../infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts";
import type { LocalMemoryLocalTrackingRepository } from "../infrastructure/local-tracking/local-memory-local-tracking-repository.server.ts";
import type {
  LocalCommerceCartPort,
  LocalCommerceCartState,
  LocalCommerceCommandContext,
  LocalCommerceConflictReason,
  LocalCommerceFulfillmentPort,
  LocalCommerceFulfillmentState,
  LocalCommerceOrderCreatedState,
  LocalCommerceOrderPort,
  LocalCommerceOrderState,
  LocalCommercePaymentPort,
  LocalCommercePaymentState,
  LocalCommercePortResult,
  LocalCommerceProviderPorts,
  LocalCommerceTrackingPort,
  LocalCommerceTrackingState,
  LocalCommerceUnavailableReason,
  VerifiedAuthorityContext,
  IdempotencyContext,
} from "./local-commerce-provider-ports.server.ts";
import {
  authorityContextKey,
  isExpectedVersion,
  isIdempotencyContext,
  isVerifiedAuthorityContext,
} from "./local-commerce-provider-ports.server.ts";
import type { AcceptedCartItem } from "../domain/shopping-cart.ts";
import type { LocalOrderBrowserCapability, LocalOrderSnapshotDraft } from "./local-order-repository.ts";
import type { LocalFulfillmentActionInput, LocalFulfillmentActionResult } from "../domain/local-fulfillment.ts";
import type { LocalTrackingActionInput } from "../domain/local-tracking.ts";
import type { LocalTrackingActionResult } from "./local-tracking-repository.ts";

type AnyMemoryCartProvider = ShoppingCartProvider | LocalMemoryShoppingCartProvider;
type MemoryOrderSource = LocalOrderRepository & LocalOrderFulfillmentReadPort;
type MemoryFulfillmentSource = LocalFulfillmentAggregateRepository;
type MemoryTrackingSource = LocalTrackingAggregateRepository;

function found<T>(value: T): LocalCommercePortResult<T> {
  return { status: "found", value };
}

function unavailable(reason: LocalCommerceUnavailableReason = "source_failure"): LocalCommercePortResult<never> {
  return { status: "unavailable", reason };
}

function conflict(reason: LocalCommerceConflictReason): LocalCommercePortResult<never> {
  return { status: "conflict", reason };
}

function validAuthority(authority: unknown): authority is VerifiedAuthorityContext {
  return isVerifiedAuthorityContext(authority);
}

function validIdempotency(idempotency: unknown): idempotency is IdempotencyContext {
  return isIdempotencyContext(idempotency);
}

function validCommand(input: LocalCommerceCommandContext): boolean {
  return validAuthority(input.authority)
    && validIdempotency(input.idempotency)
    && isExpectedVersion(input.expectedVersion);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function orderAuthorityMatches(snapshot: { readonly customerId?: string }, authority: VerifiedAuthorityContext): boolean {
  return snapshot.customerId === undefined || snapshot.customerId === authority.ownerId;
}

function validOrderIdentity(input: { readonly internalOrderId: unknown; readonly publicReference: unknown }): input is { readonly internalOrderId: string; readonly publicReference: string } {
  return typeof input.internalOrderId === "string"
    && input.internalOrderId.trim().length > 0
    && typeof input.publicReference === "string"
    && input.publicReference.trim().length > 0;
}

type CartBinding = {
  readonly projectId: string;
  readonly ownerId: string;
  version: number;
};

type CartIdempotencyBinding = {
  readonly authorityKey: string;
  readonly scope: string;
  readonly fingerprint: string;
  readonly result: LocalCommerceCartState;
};

export class LocalMemoryShoppingCartAsyncPort implements LocalCommerceCartPort {
  private readonly provider: AnyMemoryCartProvider;
  private readonly bindings = new Map<string, CartBinding>();
  private readonly idempotency = new Map<string, CartIdempotencyBinding>();

  constructor(provider: AnyMemoryCartProvider) {
    this.provider = provider;
  }

  async read(input: { readonly authority: VerifiedAuthorityContext; readonly cartId: string }): Promise<LocalCommercePortResult<LocalCommerceCartState>> {
    if (!validAuthority(input.authority) || typeof input.cartId !== "string" || input.cartId.trim().length === 0) return unavailable("invalid_authority");
    const binding = this.bindings.get(input.cartId);
    if (!binding || binding.projectId !== input.authority.projectId || binding.ownerId !== input.authority.ownerId) return unavailable("not_found");
    try {
      const result = await this.provider.getCart(input.cartId);
      if (result.status !== "found") return unavailable(result.status === "not_found" ? "not_found" : "source_failure");
      return found({ projectId: binding.projectId, ownerId: binding.ownerId, cartId: input.cartId, version: binding.version, record: clone(result.value) });
    } catch {
      return unavailable("source_failure");
    }
  }

  async create(input: { readonly authority: VerifiedAuthorityContext; readonly idempotency: IdempotencyContext }): Promise<LocalCommercePortResult<LocalCommerceCartState>> {
    if (!validAuthority(input.authority)) return unavailable("invalid_authority");
    if (!validIdempotency(input.idempotency)) return unavailable("invalid_request");
    const authorityKey = authorityContextKey(input.authority);
    const existing = this.idempotency.get(input.idempotency.key);
    if (existing) {
      if (existing.authorityKey !== authorityKey || existing.scope !== "create-cart" || existing.fingerprint !== input.idempotency.fingerprint) return conflict("idempotency_mismatch");
      return found(clone(existing.result));
    }
    try {
      const result = await this.provider.createCart();
      if (result.status !== "found") return unavailable("source_failure");
      const state: LocalCommerceCartState = { projectId: input.authority.projectId, ownerId: input.authority.ownerId, cartId: result.value.cartId, version: 0, record: clone(result.value) };
      this.bindings.set(state.cartId, { projectId: state.projectId, ownerId: state.ownerId, version: state.version });
      this.idempotency.set(input.idempotency.key, { authorityKey, scope: "create-cart", fingerprint: input.idempotency.fingerprint, result: clone(state) });
      return found(state);
    } catch {
      return unavailable("source_failure");
    }
  }

  addLine(input: LocalCommerceCommandContext & { readonly cartId: string; readonly item: AcceptedCartItem }): Promise<LocalCommercePortResult<LocalCommerceCartState>> {
    return this.mutate(input, "add-line", () => this.provider.addLine(input.cartId, input.item));
  }

  updateLine(input: LocalCommerceCommandContext & { readonly cartId: string; readonly lineId: string; readonly quantity: number }): Promise<LocalCommercePortResult<LocalCommerceCartState>> {
    return this.mutate(input, "update-line", () => this.provider.updateLine(input.cartId, input.lineId, input.quantity));
  }

  removeLine(input: LocalCommerceCommandContext & { readonly cartId: string; readonly lineId: string }): Promise<LocalCommercePortResult<LocalCommerceCartState>> {
    return this.mutate(input, "remove-line", () => this.provider.removeLine(input.cartId, input.lineId));
  }

  clear(input: LocalCommerceCommandContext & { readonly cartId: string }): Promise<LocalCommercePortResult<LocalCommerceCartState>> {
    return this.mutate(input, "clear-cart", () => this.provider.clearCart(input.cartId));
  }

  private async mutate(
    input: LocalCommerceCommandContext & { readonly cartId: string },
    operation: string,
    call: () => ReturnType<AnyMemoryCartProvider["getCart"]>,
  ): Promise<LocalCommercePortResult<LocalCommerceCartState>> {
    if (!validCommand(input)) return unavailable("invalid_request");
    const binding = this.bindings.get(input.cartId);
    if (!binding || binding.projectId !== input.authority.projectId || binding.ownerId !== input.authority.ownerId) return unavailable("not_found");
    const authorityKey = authorityContextKey(input.authority);
    const scope = `${input.cartId}:${operation}`;
    const existing = this.idempotency.get(input.idempotency.key);
    if (existing) {
      if (existing.authorityKey !== authorityKey || existing.scope !== scope || existing.fingerprint !== input.idempotency.fingerprint) return conflict("idempotency_mismatch");
      return found(clone(existing.result));
    }
    if (binding.version !== input.expectedVersion) return conflict("version_mismatch");
    try {
      const result = await call();
      if (result.status !== "found") return unavailable(result.status === "not_found" ? "not_found" : "source_failure");
      const next: LocalCommerceCartState = { projectId: binding.projectId, ownerId: binding.ownerId, cartId: input.cartId, version: binding.version + 1, record: clone(result.value) };
      binding.version = next.version;
      this.idempotency.set(input.idempotency.key, { authorityKey, scope, fingerprint: input.idempotency.fingerprint, result: clone(next) });
      return found(next);
    } catch {
      return unavailable("source_failure");
    }
  }
}

type OrderIdempotencyBinding = {
  readonly authorityKey: string;
  readonly fingerprint: string;
  readonly cartId: string;
  readonly result: LocalCommerceOrderCreatedState;
};

export class LocalMemoryOrderAsyncPort implements LocalCommerceOrderPort {
  private readonly source: MemoryOrderSource;
  private readonly versions = new Map<string, number>();
  private readonly idempotency = new Map<string, OrderIdempotencyBinding>();

  constructor(source: MemoryOrderSource) {
    this.source = source;
  }

  async create(input: { readonly authority: VerifiedAuthorityContext; readonly idempotency: IdempotencyContext; readonly cartId: string; readonly snapshot: LocalOrderSnapshotDraft; readonly existingBrowserCapability?: LocalOrderBrowserCapability }): Promise<LocalCommercePortResult<LocalCommerceOrderCreatedState>> {
    if (!validAuthority(input.authority)) return unavailable("invalid_authority");
    if (!validIdempotency(input.idempotency) || typeof input.cartId !== "string" || input.cartId.trim().length === 0) return unavailable("invalid_request");
    if (input.snapshot.customerId !== undefined && input.snapshot.customerId !== input.authority.ownerId) return conflict("ownership_mismatch");
    const authorityKey = authorityContextKey(input.authority);
    const existing = this.idempotency.get(input.idempotency.key);
    if (existing) {
      if (existing.authorityKey !== authorityKey || existing.cartId !== input.cartId || existing.fingerprint !== input.idempotency.fingerprint) return conflict("idempotency_mismatch");
      return found(clone(existing.result));
    }
    try {
      const result = await this.source.findOrCreate({
        creationAttemptId: input.idempotency.key,
        context: { cartId: input.cartId, authorityKey },
        inputFingerprint: input.idempotency.fingerprint,
        snapshot: input.snapshot,
        ...(input.existingBrowserCapability ? { existingBrowserCapability: input.existingBrowserCapability } : {}),
      });
      if (result.status === "conflict") return conflict("idempotency_mismatch");
      if (result.status === "failed") return unavailable("source_failure");
      const version = this.versions.get(result.snapshot.internalId) ?? 1;
      const state: LocalCommerceOrderCreatedState = { projectId: input.authority.projectId, ownerId: input.authority.ownerId, internalOrderId: result.snapshot.internalId, publicReference: result.snapshot.publicReference, version, snapshot: clone(result.snapshot), browserCapability: result.browserCapability };
      this.versions.set(state.internalOrderId, version);
      this.idempotency.set(input.idempotency.key, { authorityKey, fingerprint: input.idempotency.fingerprint, cartId: input.cartId, result: clone(state) });
      return found(state);
    } catch {
      return unavailable("source_failure");
    }
  }

  readExact(input: { readonly authority: VerifiedAuthorityContext; readonly internalOrderId: string; readonly publicReference: string }): Promise<LocalCommercePortResult<LocalCommerceOrderState>> {
    return this.read(input);
  }

  readSnapshot(input: { readonly authority: VerifiedAuthorityContext; readonly internalOrderId: string; readonly publicReference: string }): Promise<LocalCommercePortResult<LocalCommerceOrderState>> {
    return this.read(input);
  }

  private async read(input: { readonly authority: VerifiedAuthorityContext; readonly internalOrderId: string; readonly publicReference: string }): Promise<LocalCommercePortResult<LocalCommerceOrderState>> {
    if (!validAuthority(input.authority)) return unavailable("invalid_authority");
    if (!validOrderIdentity(input)) return unavailable("invalid_request");
    try {
      const result = this.source.findSnapshotForFulfillmentById(input.internalOrderId);
      if (result.status !== "found" || result.snapshot.publicReference !== input.publicReference || !orderAuthorityMatches(result.snapshot, input.authority)) return unavailable("not_found");
      const version = this.versions.get(result.snapshot.internalId) ?? 1;
      this.versions.set(result.snapshot.internalId, version);
      return found({ projectId: input.authority.projectId, ownerId: input.authority.ownerId, internalOrderId: result.snapshot.internalId, publicReference: result.snapshot.publicReference, version, snapshot: clone(result.snapshot) });
    } catch {
      return unavailable("source_failure");
    }
  }
}

type PaymentIdempotencyBinding = {
  readonly authorityKey: string;
  readonly fingerprint: string;
  readonly orderId: string;
  readonly publicReference: string;
  readonly outcome: "success" | "failed" | "cancelled";
};

export class LocalMemoryPaymentAsyncPort implements LocalCommercePaymentPort {
  private readonly source: LocalPaymentAggregateRepository;
  private readonly orders: LocalOrderPaymentStatePort;
  private readonly versions = new Map<string, number>();
  private readonly idempotency = new Map<string, PaymentIdempotencyBinding>();

  constructor(source: LocalPaymentAggregateRepository, orders: LocalOrderPaymentStatePort) {
    this.source = source;
    this.orders = orders;
  }

  async attempt(input: LocalCommerceCommandContext & { readonly internalOrderId: string; readonly publicReference: string; readonly outcome: "success" | "failed" | "cancelled" }): Promise<LocalCommercePortResult<LocalCommercePaymentState>> {
    if (!validCommand(input) || !validOrderIdentity(input)) return unavailable("invalid_request");
    const authorityKey = authorityContextKey(input.authority);
    const existing = this.idempotency.get(input.idempotency.key);
    if (existing) {
      if (existing.authorityKey !== authorityKey || existing.fingerprint !== input.idempotency.fingerprint || existing.orderId !== input.internalOrderId || existing.publicReference !== input.publicReference || existing.outcome !== input.outcome) return conflict("idempotency_mismatch");
      return this.commitUnderlying(input);
    }
    let current: ReturnType<LocalOrderPaymentStatePort["findSnapshotForPayment"]>;
    try {
      current = this.orders.findSnapshotForPayment(input.internalOrderId);
    } catch {
      return unavailable("source_failure");
    }
    if (current.status !== "found" || current.snapshot.publicReference !== input.publicReference || !orderAuthorityMatches(current.snapshot, input.authority)) return unavailable("not_found");
    const version = this.versions.get(input.internalOrderId) ?? 1;
    if (version !== input.expectedVersion) return conflict("version_mismatch");
    return this.commitUnderlying(input);
  }

  private async commitUnderlying(input: LocalCommerceCommandContext & { readonly internalOrderId: string; readonly publicReference: string; readonly outcome: "success" | "failed" | "cancelled" }): Promise<LocalCommercePortResult<LocalCommercePaymentState>> {
    try {
      const result = this.source.commit({ internalOrderId: input.internalOrderId, orderReference: input.publicReference, paymentAttemptId: input.idempotency.key, outcome: input.outcome, authorityContext: authorityContextKey(input.authority) });
      if (result.status === "conflict") return conflict("idempotency_mismatch");
      if (result.status !== "committed" && result.status !== "replayed") return unavailable(result.status === "rejected" ? "rejected" : "source_failure");
      const version = this.versions.get(input.internalOrderId) ?? 1;
      const state: LocalCommercePaymentState = { projectId: input.authority.projectId, ownerId: input.authority.ownerId, version: result.status === "committed" ? version + 1 : version, payment: result };
      if (result.status === "committed") this.versions.set(input.internalOrderId, version + 1);
      this.idempotency.set(input.idempotency.key, { authorityKey: authorityContextKey(input.authority), fingerprint: input.idempotency.fingerprint, orderId: input.internalOrderId, publicReference: input.publicReference, outcome: input.outcome });
      return found(state);
    } catch {
      return unavailable("source_failure");
    }
  }
}

type FulfillmentIdempotencyBinding = { readonly authorityKey: string; readonly fingerprint: string; readonly orderId: string; readonly publicReference: string; };

export class LocalMemoryFulfillmentAsyncPort implements LocalCommerceFulfillmentPort {
  private readonly source: MemoryFulfillmentSource;
  private readonly orders: LocalOrderFulfillmentReadPort;
  private readonly versions = new Map<string, number>();
  private readonly idempotency = new Map<string, FulfillmentIdempotencyBinding>();

  constructor(source: MemoryFulfillmentSource, orders: LocalOrderFulfillmentReadPort) {
    this.source = source;
    this.orders = orders;
  }

  async readExact(input: { readonly authority: VerifiedAuthorityContext; readonly internalOrderId: string; readonly publicReference: string }): Promise<LocalCommercePortResult<LocalCommerceFulfillmentState>> {
    if (!validAuthority(input.authority)) return unavailable("invalid_authority");
    if (!validOrderIdentity(input)) return unavailable("invalid_request");
    try {
      if (!this.customerOwnsOrder(input.internalOrderId, input.publicReference, input.authority)) return unavailable("not_found");
      const result = this.source.findByOrderIdentity({ internalOrderId: input.internalOrderId, publicOrderReference: input.publicReference });
      if (result.status !== "found") return unavailable("not_found");
      const version = result.aggregate.actionBindings.length;
      this.versions.set(input.internalOrderId, version);
      return found({ projectId: input.authority.projectId, ownerId: input.authority.ownerId, version, aggregate: clone(result.aggregate) });
    } catch {
      return unavailable("source_failure");
    }
  }

  async command(input: LocalCommerceCommandContext & { readonly internalOrderId: string; readonly publicReference: string; readonly action: LocalFulfillmentActionInput; readonly publishedAt?: string }): Promise<LocalCommercePortResult<{ readonly state: LocalCommerceFulfillmentState; readonly result: LocalFulfillmentActionResult }>> {
    if (!validCommand(input)
      || (input.authority.actorKind !== "customer" && input.authority.actorKind !== "operator")
      || !validOrderIdentity(input)) return unavailable("invalid_request");
    try {
      if (!this.customerOwnsOrder(input.internalOrderId, input.publicReference, input.authority)) return unavailable("not_found");
    } catch {
      return unavailable("source_failure");
    }
    const authorityKey = authorityContextKey(input.authority);
    const existing = this.idempotency.get(input.idempotency.key);
    if (existing) {
      if (existing.authorityKey !== authorityKey || existing.fingerprint !== input.idempotency.fingerprint || existing.orderId !== input.internalOrderId || existing.publicReference !== input.publicReference) return conflict("idempotency_mismatch");
    } else {
      let current: ReturnType<MemoryFulfillmentSource["findByOrderIdentity"]>;
      try {
        current = this.source.findByOrderIdentity({ internalOrderId: input.internalOrderId, publicOrderReference: input.publicReference });
      } catch {
        return unavailable("source_failure");
      }
      const currentVersion = current.status === "found" ? current.aggregate.actionBindings.length : 0;
      this.versions.set(input.internalOrderId, currentVersion);
      if (currentVersion !== input.expectedVersion) return conflict("version_mismatch");
    }
    try {
      const result = this.source.commit({ internalOrderId: input.internalOrderId, orderReference: input.publicReference, actorKind: input.authority.actorKind === "customer" ? "customer" : "operator", actorContextId: input.authority.actorId, action: input.action, ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}) });
      if (result.status === "conflict") return conflict("idempotency_mismatch");
      if (result.status !== "committed" && result.status !== "replayed") return unavailable(result.status === "rejected" ? "rejected" : "source_failure");
      const version = result.aggregate.actionBindings.length;
      this.versions.set(input.internalOrderId, version);
      this.idempotency.set(input.idempotency.key, { authorityKey, fingerprint: input.idempotency.fingerprint, orderId: input.internalOrderId, publicReference: input.publicReference });
      return found({ state: { projectId: input.authority.projectId, ownerId: input.authority.ownerId, version, aggregate: clone(result.aggregate) }, result: { ...result.result } });
    } catch {
      return unavailable("source_failure");
    }
  }

  private customerOwnsOrder(internalOrderId: string, publicReference: string, authority: VerifiedAuthorityContext): boolean {
    if (authority.actorKind !== "customer") return true;
    const order = this.orders.findSnapshotForFulfillmentById(internalOrderId);
    return order.status === "found"
      && order.snapshot.publicReference === publicReference
      && orderAuthorityMatches(order.snapshot, authority);
  }
}

type TrackingIdempotencyBinding = { readonly authorityKey: string; readonly fingerprint: string; readonly orderId: string; readonly publicReference: string; };

export class LocalMemoryTrackingAsyncPort implements LocalCommerceTrackingPort {
  private readonly source: MemoryTrackingSource;
  private readonly orders: LocalOrderFulfillmentReadPort;
  private readonly versions = new Map<string, number>();
  private readonly idempotency = new Map<string, TrackingIdempotencyBinding>();

  constructor(source: MemoryTrackingSource, orders: LocalOrderFulfillmentReadPort) {
    this.source = source;
    this.orders = orders;
  }

  async readExact(input: { readonly authority: VerifiedAuthorityContext; readonly internalOrderId: string; readonly publicReference: string }): Promise<LocalCommercePortResult<LocalCommerceTrackingState>> {
    if (!validAuthority(input.authority)) return unavailable("invalid_authority");
    if (!validOrderIdentity(input)) return unavailable("invalid_request");
    try {
      if (!this.customerOwnsOrder(input.internalOrderId, input.publicReference, input.authority)) return unavailable("not_found");
      const result = this.source.findByOrderIdentity({ internalOrderId: input.internalOrderId, publicOrderReference: input.publicReference });
      if (result.status !== "found") return unavailable("not_found");
      const version = result.aggregate.actionBindings.length;
      this.versions.set(input.internalOrderId, version);
      return found({ projectId: input.authority.projectId, ownerId: input.authority.ownerId, version, aggregate: clone(result.aggregate) });
    } catch {
      return unavailable("source_failure");
    }
  }

  async command(input: LocalCommerceCommandContext & { readonly internalOrderId: string; readonly publicReference: string; readonly action: LocalTrackingActionInput }): Promise<LocalCommercePortResult<{ readonly state: LocalCommerceTrackingState; readonly result: LocalTrackingActionResult }>> {
    if (!validCommand(input) || input.authority.actorKind !== "operator" || !validOrderIdentity(input)) return unavailable("invalid_request");
    try {
      if (!this.customerOwnsOrder(input.internalOrderId, input.publicReference, input.authority)) return unavailable("not_found");
    } catch {
      return unavailable("source_failure");
    }
    const authorityKey = authorityContextKey(input.authority);
    const existing = this.idempotency.get(input.idempotency.key);
    if (existing) {
      if (existing.authorityKey !== authorityKey || existing.fingerprint !== input.idempotency.fingerprint || existing.orderId !== input.internalOrderId || existing.publicReference !== input.publicReference) return conflict("idempotency_mismatch");
    } else {
      let current: ReturnType<MemoryTrackingSource["findByOrderIdentity"]>;
      try {
        current = this.source.findByOrderIdentity({ internalOrderId: input.internalOrderId, publicOrderReference: input.publicReference });
      } catch {
        return unavailable("source_failure");
      }
      const currentVersion = current.status === "found" ? current.aggregate.actionBindings.length : 0;
      this.versions.set(input.internalOrderId, currentVersion);
      if (currentVersion !== input.expectedVersion) return conflict("version_mismatch");
    }
    try {
      const result = this.source.commit({ publicOrderReference: input.publicReference, actorKind: "operator", actorContextId: input.authority.actorId, action: input.action });
      if (result.status === "conflict") return conflict("idempotency_mismatch");
      if (result.status !== "committed" && result.status !== "replayed") return unavailable(result.status === "rejected" ? "rejected" : "source_failure");
      const version = result.aggregate.actionBindings.length;
      this.versions.set(input.internalOrderId, version);
      this.idempotency.set(input.idempotency.key, { authorityKey, fingerprint: input.idempotency.fingerprint, orderId: input.internalOrderId, publicReference: input.publicReference });
      return found({ state: { projectId: input.authority.projectId, ownerId: input.authority.ownerId, version, aggregate: clone(result.aggregate) }, result: { ...result.result } });
    } catch {
      return unavailable("source_failure");
    }
  }

  private customerOwnsOrder(internalOrderId: string, publicReference: string, authority: VerifiedAuthorityContext): boolean {
    if (authority.actorKind !== "customer") return true;
    const order = this.orders.findSnapshotForFulfillmentById(internalOrderId);
    return order.status === "found"
      && order.snapshot.publicReference === publicReference
      && orderAuthorityMatches(order.snapshot, authority);
  }
}

export function createLocalMemoryCommerceProviderPorts(input: {
  readonly cart: ShoppingCartProvider;
  readonly orders: LocalMemoryLocalOrderRepository;
  readonly payments: LocalMemoryLocalPaymentRepository;
  readonly fulfillments: LocalMemoryLocalFulfillmentRepository;
  readonly tracking: LocalMemoryLocalTrackingRepository;
}): LocalCommerceProviderPorts {
  return {
    cart: new LocalMemoryShoppingCartAsyncPort(input.cart),
    order: new LocalMemoryOrderAsyncPort(input.orders),
    payment: new LocalMemoryPaymentAsyncPort(input.payments, input.orders),
    fulfillment: new LocalMemoryFulfillmentAsyncPort(input.fulfillments, input.orders),
    tracking: new LocalMemoryTrackingAsyncPort(input.tracking, input.orders),
  };
}
