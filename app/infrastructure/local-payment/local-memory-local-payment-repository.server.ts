import {
  isExactCommittedLocalPaymentReplay,
  isLocalPaymentPublicReference,
  isLocalPaymentScenario,
  isPaymentAttemptId,
  projectLocalPaymentAttempt,
  transitionLocalPaymentLifecycle,
  validateNewLocalPaymentAttempt,
  type LocalPaymentAttempt,
  type LocalPaymentCommittedBinding,
} from "../../domain/local-payment.ts";
import {
  isLocalOrderPublicReference,
} from "../../domain/local-order.ts";
import type {
  LocalOrderPaymentStatePort,
  LocalPaymentAggregateCommitInput,
  LocalPaymentAggregateRepository,
  LocalPaymentAggregateResult,
  LocalPaymentCommittedAttempt,
  LocalPaymentIdentityGenerator,
  LocalMemoryLocalPaymentRepositoryOptions,
} from "../../application/local-payment-repository.ts";

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

export function createCryptographicLocalPaymentIdentityGenerator(): LocalPaymentIdentityGenerator {
  return {
    nextInternalPaymentId: () => globalThis.crypto.randomUUID(),
    nextPaymentReference: () => `LP-LOCAL-${randomBase36Token(PUBLIC_REFERENCE_LENGTH)}`,
  };
}

function issue(code: "invalid_value" | "replay_conflict" | "non_retryable" | "invalid_lifecycle" | "invalid_amount" | "invalid_tax" | "unavailable", message: string) {
  return [{ path: "$", code, message }];
}

function rejected(message: string): LocalPaymentAggregateResult {
  return { status: "rejected", issues: issue("invalid_value", message) };
}

function unavailable(message: string): LocalPaymentAggregateResult {
  return { status: "unavailable", issues: issue("unavailable", message) };
}

function conflict(message: string): LocalPaymentAggregateResult {
  return { status: "conflict", issues: issue("replay_conflict", message) };
}

function cloneAttempt(attempt: LocalPaymentAttempt): LocalPaymentAttempt {
  return { ...attempt, serverIdentity: { ...attempt.serverIdentity } };
}

function cloneBinding(binding: LocalPaymentCommittedBinding): LocalPaymentCommittedBinding {
  return {
    ...binding,
    ...(binding.publicReference ? { publicReference: binding.publicReference } : {}),
    result: { ...binding.result },
  };
}

/**
 * Process-memory Payment attempts over the canonical Local Order state port.
 * This class never stores an Order snapshot or a second Order lifecycle map.
 */
export class LocalMemoryLocalPaymentRepository implements LocalPaymentAggregateRepository {
  private readonly committedByAttemptId = new Map<string, LocalPaymentCommittedAttempt>();
  private readonly canonicalOrders: LocalOrderPaymentStatePort;
  private readonly ids: LocalPaymentIdentityGenerator;
  private readonly now: () => string;
  private readonly failureInjector?: LocalMemoryLocalPaymentRepositoryOptions["failureInjector"];

  constructor(
    canonicalOrders: LocalOrderPaymentStatePort,
    options: LocalMemoryLocalPaymentRepositoryOptions = {},
  ) {
    this.canonicalOrders = canonicalOrders;
    this.ids = options.ids ?? createCryptographicLocalPaymentIdentityGenerator();
    this.now = options.now ?? (() => new Date().toISOString());
    this.failureInjector = options.failureInjector;
  }

  commit(input: LocalPaymentAggregateCommitInput): LocalPaymentAggregateResult {
    if (
      typeof input.internalOrderId !== "string" || input.internalOrderId.trim().length === 0
      || !isLocalOrderPublicReference(input.orderReference)
      || !isPaymentAttemptId(input.paymentAttemptId)
      || !isLocalPaymentScenario(input.outcome)
      || typeof input.authorityContext !== "string" || input.authorityContext.trim().length === 0
    ) {
      return rejected("Payment aggregate input is invalid.");
    }

    const existing = this.committedByAttemptId.get(input.paymentAttemptId);
    if (existing) {
      if (!isExactCommittedLocalPaymentReplay(input, existing.binding)) {
        return conflict("Payment attempt selector is already bound to different context.");
      }

      const current = this.canonicalOrders.findSnapshotForPayment(input.internalOrderId);
      if (current.status !== "found" || current.snapshot.publicReference !== input.orderReference) {
        return unavailable("The canonical Local Order is unavailable.");
      }

      return {
        status: "replayed",
        attempt: cloneAttempt(existing.attempt),
        binding: cloneBinding(existing.binding),
        result: { ...existing.binding.result },
        orderSnapshot: current.snapshot,
      };
    }

    const current = this.canonicalOrders.findSnapshotForPayment(input.internalOrderId);
    if (current.status !== "found") return unavailable("The canonical Local Order is unavailable.");
    if (current.snapshot.publicReference !== input.orderReference) {
      return unavailable("The canonical Local Order is unavailable.");
    }

    const amount = validateNewLocalPaymentAttempt({
      status: current.snapshot.status,
      paymentStatus: current.snapshot.paymentStatus,
      commercial: current.snapshot.commercial,
    });
    if (!amount.ok) {
      const status = current.snapshot.status === "paid" ? "non_retryable" : "invalid_lifecycle";
      return {
        status: "rejected",
        issues: amount.issues.map((entry) => ({
          ...entry,
          code: entry.code === "non_retryable" ? "non_retryable" : status,
        })),
      };
    }

    const transition = transitionLocalPaymentLifecycle(
      {
        orderStatus: current.snapshot.status,
        paymentStatus: current.snapshot.paymentStatus,
      },
      input.outcome,
    );
    if (!transition.ok) return { status: "rejected", issues: transition.issues };

    const internalPaymentId = this.ids.nextInternalPaymentId();
    if (typeof internalPaymentId !== "string" || internalPaymentId.trim().length === 0) {
      return unavailable("Local Payment is temporarily unavailable.");
    }

    let paymentReference: string | undefined;
    for (let attempt = 0; attempt < MAX_REFERENCE_GENERATION_ATTEMPTS; attempt += 1) {
      const candidate = this.ids.nextPaymentReference();
      if (isLocalPaymentPublicReference(candidate) && !this.hasPaymentReference(candidate)) {
        paymentReference = candidate;
        break;
      }
    }
    if (!paymentReference) return unavailable("Local Payment is temporarily unavailable.");

    const committedAt = this.now();
    const attempt: LocalPaymentAttempt = {
      kind: "local_payment_attempt",
      paymentReference,
      orderReference: input.orderReference,
      serverIdentity: {
        internalPaymentId,
        internalOrderId: input.internalOrderId,
        authorityContext: input.authorityContext,
      },
      paymentAttemptId: input.paymentAttemptId,
      outcome: input.outcome,
      state: transition.value.attemptState,
      simulatedAmountCents: amount.value.simulatedAmountCents,
      simulatedCurrency: amount.value.simulatedCurrency,
      createdAt: committedAt,
      committedAt,
      developmentOnly: true,
    };
    const projection = projectLocalPaymentAttempt(attempt);
    if (!projection.ok) return { status: "failed", issues: projection.issues };

    const binding: LocalPaymentCommittedBinding = {
      internalOrderId: input.internalOrderId,
      paymentAttemptId: input.paymentAttemptId,
      outcome: input.outcome,
      authorityContext: input.authorityContext,
      publicReference: input.orderReference,
      result: projection.value,
    };

    // All validation and staging is complete. The following commit window is
    // synchronous: no await or externally observable intermediate state exists.
    try {
      this.failureInjector?.beforeCommit?.();
    } catch {
      return { status: "failed", issues: issue("unavailable", "Local Payment could not be committed.") };
    }

    const committedOrder = this.canonicalOrders.commitLifecycleForPayment({
      internalOrderId: input.internalOrderId,
      expectedSnapshot: current.snapshot,
      lifecycle: {
        status: transition.value.orderStatus,
        paymentStatus: transition.value.paymentStatus,
      },
    });
    if (committedOrder.status !== "committed") {
      return {
        status: committedOrder.status === "conflict" ? "conflict" : "failed",
        issues: issue(
          committedOrder.status === "conflict" ? "replay_conflict" : "unavailable",
          "Local Payment could not be committed.",
        ),
      };
    }

    // Map.set is synchronous and cannot expose a partial commit between turns.
    const stored = { attempt: cloneAttempt(attempt), binding: cloneBinding(binding) };
    this.committedByAttemptId.set(input.paymentAttemptId, stored);
    return {
      status: "committed",
      attempt: cloneAttempt(stored.attempt),
      binding: cloneBinding(stored.binding),
      result: { ...stored.binding.result },
      orderSnapshot: committedOrder.snapshot,
    };
  }

  private hasPaymentReference(reference: string): boolean {
    for (const entry of this.committedByAttemptId.values()) {
      if (entry.attempt.paymentReference === reference) return true;
    }
    return false;
  }

  /** Test-only inspection; no browser or HTTP layer should use this. */
  getPaymentAttemptCountForTests(): number {
    return this.committedByAttemptId.size;
  }

  /** Test-only lookup proving a selector is not rewritten on conflict/retry. */
  getCommittedAttemptForTests(paymentAttemptId: string): LocalPaymentCommittedAttempt | undefined {
    const value = this.committedByAttemptId.get(paymentAttemptId);
    return value
      ? { attempt: cloneAttempt(value.attempt), binding: cloneBinding(value.binding) }
      : undefined;
  }
}
