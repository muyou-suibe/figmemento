import {
  cloneLocalOrderSnapshot,
  createCanonicalLocalOrderSnapshot,
  createLocalOrderSnapshot,
  isCreationAttemptId,
  isLocalOrderPublicReference,
  replaceLocalOrderLifecycle,
  type LocalOrderSnapshot,
} from "../../domain/local-order.ts";
import type {
  LocalOrderBrowserCapability,
  LocalOrderCreationContext,
  LocalOrderCreationResult,
  LocalOrderFulfillmentReadPort,
  LocalOrderReadResult,
  LocalOrderRepository,
  LocalOrderSnapshotDraft,
  LocalOrderAccountReadPort,
} from "../../application/local-order-repository.ts";
import type { LocalOrderPaymentStatePort } from "../../application/local-payment-repository.ts";

export interface LocalOrderIdentityGenerator {
  nextInternalId(): string;
  nextPublicReference(): string;
  nextBrowserCapability(): string;
  nextOrderItemId(): string;
}

export interface LocalOrderCommitFailureInjector {
  beforeCommit?: () => void;
}

export interface LocalMemoryLocalOrderRepositoryOptions {
  readonly ids?: LocalOrderIdentityGenerator;
  readonly now?: () => string;
  readonly failureInjector?: LocalOrderCommitFailureInjector;
}

const PUBLIC_REFERENCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PUBLIC_REFERENCE_LENGTH = 16;
const MAX_REFERENCE_GENERATION_ATTEMPTS = 8;

function randomBase36Token(length: number): string {
  const token: string[] = [];
  const bytes = new Uint8Array(32);
  while (token.length < length) {
    globalThis.crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= 252) continue;
      token.push(PUBLIC_REFERENCE_ALPHABET[byte % PUBLIC_REFERENCE_ALPHABET.length]);
      if (token.length === length) break;
    }
  }
  return token.join("");
}

export function createCryptographicLocalOrderIdentityGenerator(): LocalOrderIdentityGenerator {
  return {
    nextInternalId: () => globalThis.crypto.randomUUID(),
    nextPublicReference: () => `FM-LOCAL-${randomBase36Token(PUBLIC_REFERENCE_LENGTH)}`,
    nextBrowserCapability: () => globalThis.crypto.randomUUID(),
    nextOrderItemId: () => globalThis.crypto.randomUUID(),
  };
}

interface IdempotencyBinding {
  readonly creationAttemptId: string;
  readonly contextKey: string;
  readonly inputFingerprint: string;
  readonly internalId: string;
  readonly publicReference: string;
  readonly browserCapability: LocalOrderBrowserCapability;
}

function cloneSnapshot(snapshot: LocalOrderSnapshot): LocalOrderSnapshot {
  return cloneLocalOrderSnapshot(snapshot);
}

function asCapability(value: string): LocalOrderBrowserCapability {
  return value as LocalOrderBrowserCapability;
}

function contextKey(context: LocalOrderCreationContext): string {
  return `${context.cartId}\u001f${context.authorityKey}`;
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/** Process-memory only. Restarting the runtime loses every local Order. */
export class LocalMemoryLocalOrderRepository implements LocalOrderRepository, LocalOrderPaymentStatePort, LocalOrderFulfillmentReadPort, LocalOrderAccountReadPort {
  private readonly ordersByInternalId = new Map<string, LocalOrderSnapshot>();
  private readonly publicReferenceToInternalId = new Map<string, string>();
  private readonly idempotencyByAttempt = new Map<string, IdempotencyBinding>();
  private readonly capabilityToReferences = new Map<LocalOrderBrowserCapability, Set<string>>();
  private readonly ids: LocalOrderIdentityGenerator;
  private readonly now: () => string;
  private readonly failureInjector?: LocalOrderCommitFailureInjector;
  private paymentLifecycleTransitionCount = 0;

  constructor(options: LocalMemoryLocalOrderRepositoryOptions = {}) {
    this.ids = options.ids ?? createCryptographicLocalOrderIdentityGenerator();
    this.now = options.now ?? (() => new Date().toISOString());
    this.failureInjector = options.failureInjector;
  }

  async findOrCreate(input: {
    readonly creationAttemptId: string;
    readonly context: LocalOrderCreationContext;
    readonly inputFingerprint: string;
    readonly snapshot: LocalOrderSnapshotDraft;
    readonly existingBrowserCapability?: LocalOrderBrowserCapability;
  }): Promise<LocalOrderCreationResult> {
    if (
      !isCreationAttemptId(input.creationAttemptId)
      || !isNonEmpty(input.context.cartId)
      || !isNonEmpty(input.context.authorityKey)
      || !isNonEmpty(input.inputFingerprint)
    ) {
      return { status: "failed" };
    }

    const existing = this.idempotencyByAttempt.get(input.creationAttemptId);
    const requestedContextKey = contextKey(input.context);
    if (existing) {
      if (existing.contextKey !== requestedContextKey || existing.inputFingerprint !== input.inputFingerprint) {
        return { status: "conflict" };
      }

      const stored = this.ordersByInternalId.get(existing.internalId);
      if (!stored) return { status: "failed" };
      const references = this.capabilityToReferences.get(existing.browserCapability);
      if (!references?.has(existing.publicReference)) return { status: "failed" };
      return {
        status: "existing",
        snapshot: cloneSnapshot(stored),
        browserCapability: existing.browserCapability,
        capabilityStatus: input.existingBrowserCapability === existing.browserCapability ? "unchanged" : "reissued",
      };
    }

    // This method has no await before commit. The synchronous Map decision and
    // commit therefore cannot be interleaved by Promise.all callers in this
    // process-memory adapter.
    const internalId = this.ids.nextInternalId();
    if (!isNonEmpty(internalId) || this.ordersByInternalId.has(internalId)) return { status: "failed" };

    let publicReference: string | undefined;
    for (let attempt = 0; attempt < MAX_REFERENCE_GENERATION_ATTEMPTS; attempt += 1) {
      const candidate = this.ids.nextPublicReference();
      if (isLocalOrderPublicReference(candidate) && !this.publicReferenceToInternalId.has(candidate)) {
        publicReference = candidate;
        break;
      }
    }
    if (!publicReference) return { status: "failed" };

    let browserCapability = input.existingBrowserCapability;
    let capabilityStatus: "issued" | "unchanged" = "unchanged";
    if (!browserCapability || !this.capabilityToReferences.has(browserCapability)) {
      const generated = this.ids.nextBrowserCapability();
      if (!isNonEmpty(generated) || this.capabilityToReferences.has(asCapability(generated))) {
        return { status: "failed" };
      }
      browserCapability = asCapability(generated);
      capabilityStatus = "issued";
    }

    let snapshot: LocalOrderSnapshot;
    try {
      const hasCompleteFulfillment = input.snapshot.lines.every(
        (line) => line.fulfillmentType === "physical" || line.fulfillmentType === "digital",
      );
      if (!hasCompleteFulfillment) {
        // Preserve old direct/in-memory fixtures for existing customer-safe
        // reads, but never manufacture the new historical facts for them.
        if (input.snapshot.lines.some((line) => line.fulfillmentType !== undefined || line.orderItemId !== undefined)) {
          return { status: "failed" };
        }
        snapshot = createLocalOrderSnapshot({
          ...input.snapshot,
          internalId,
          publicReference,
          createdAt: this.now(),
        });
      } else {
        const orderItemIds = new Set<string>();
        const lines = input.snapshot.lines.map((line) => {
          const orderItemId = this.ids.nextOrderItemId();
          if (!isNonEmpty(orderItemId) || orderItemIds.has(orderItemId)) throw new Error("Invalid or duplicate orderItemId.");
          orderItemIds.add(orderItemId);
          return { ...line, orderItemId };
        });
        snapshot = createCanonicalLocalOrderSnapshot({
          ...input.snapshot,
          lines,
          internalId,
          publicReference,
          createdAt: this.now(),
        });
      }
    } catch {
      return { status: "failed" };
    }

    try {
      this.failureInjector?.beforeCommit?.();
    } catch {
      return { status: "failed" };
    }

    const references = this.capabilityToReferences.get(browserCapability) ?? new Set<string>();
    references.add(publicReference);
    this.ordersByInternalId.set(internalId, snapshot);
    this.publicReferenceToInternalId.set(publicReference, internalId);
    this.capabilityToReferences.set(browserCapability, references);
    this.idempotencyByAttempt.set(input.creationAttemptId, {
      creationAttemptId: input.creationAttemptId,
      contextKey: requestedContextKey,
      inputFingerprint: input.inputFingerprint,
      internalId,
      publicReference,
      browserCapability,
    });

    return {
      status: "created",
      snapshot: cloneSnapshot(snapshot),
      browserCapability,
      capabilityStatus,
    };
  }

  async findAuthorizedSnapshot(
    publicReference: string,
    browserCapability: LocalOrderBrowserCapability,
  ): Promise<LocalOrderReadResult> {
    const references = this.capabilityToReferences.get(browserCapability);
    if (!references?.has(publicReference)) return { status: "unavailable" };
    const internalId = this.publicReferenceToInternalId.get(publicReference);
    if (!internalId) return { status: "unavailable" };
    const snapshot = this.ordersByInternalId.get(internalId);
    return snapshot ? { status: "found", snapshot: cloneSnapshot(snapshot) } : { status: "unavailable" };
  }

  /** Server-only account projection over the same canonical Local Order store. */
  findSnapshotsForCustomer(customerId: string): readonly LocalOrderSnapshot[] {
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(customerId)) return [];
    return [...this.ordersByInternalId.values()]
      .filter((snapshot) => snapshot.customerId === customerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(cloneSnapshot);
  }

  /**
   * Server-only Payment identity/state lookup. Authorization is intentionally
   * performed by the caller before this internal port is reached.
   */
  findSnapshotForPayment(internalOrderId: string) {
    const snapshot = this.ordersByInternalId.get(internalOrderId);
    return snapshot
      ? { status: "found" as const, snapshot: cloneSnapshot(snapshot) }
      : { status: "unavailable" as const };
  }

  /**
   * Server-only Fulfillment identity resolution. The caller must already have
   * the appropriate actor authority; this method never accepts browser input.
   */
  findSnapshotForFulfillment(publicReference: string): LocalOrderReadResult {
    if (!isLocalOrderPublicReference(publicReference)) return { status: "unavailable" };
    const internalId = this.publicReferenceToInternalId.get(publicReference);
    if (!internalId) return { status: "unavailable" };
    const snapshot = this.ordersByInternalId.get(internalId);
    return snapshot ? { status: "found", snapshot: cloneSnapshot(snapshot) } : { status: "unavailable" };
  }

  /** Server-only Fulfillment snapshot read by an already-resolved identity. */
  findSnapshotForFulfillmentById(internalOrderId: string): LocalOrderReadResult {
    const snapshot = this.ordersByInternalId.get(internalOrderId);
    return snapshot ? { status: "found", snapshot: cloneSnapshot(snapshot) } : { status: "unavailable" };
  }

  /**
   * Synchronous compare-and-replace of only the Local Order lifecycle. The
   * Payment aggregate stages its terminal attempt before entering this window;
   * no await or second Order store exists here.
   */
  commitLifecycleForPayment(input: {
    readonly internalOrderId: string;
    readonly expectedSnapshot: LocalOrderSnapshot;
    readonly lifecycle: import("../../domain/local-order.ts").LocalOrderLifecycle;
  }) {
    const current = this.ordersByInternalId.get(input.internalOrderId);
    if (!current) return { status: "unavailable" as const };
    if (JSON.stringify(current) !== JSON.stringify(input.expectedSnapshot)) {
      return { status: "conflict" as const };
    }

    const next = replaceLocalOrderLifecycle(current, input.lifecycle);
    this.ordersByInternalId.set(input.internalOrderId, next);
    this.paymentLifecycleTransitionCount += 1;
    return { status: "committed" as const, snapshot: cloneSnapshot(next) };
  }

  /** Test-only inspection; no browser or HTTP layer should use this. */
  getOrderCountForTests(): number {
    return this.ordersByInternalId.size;
  }

  /** Test-only inspection of Payment-driven lifecycle replacements. */
  getOrderLifecycleTransitionCountForTests(): number {
    return this.paymentLifecycleTransitionCount;
  }
}
