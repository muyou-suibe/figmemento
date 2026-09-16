import {
  buildLocalFulfillmentReplayRequest,
  createLocalFulfillmentState,
  evaluateLocalFulfillmentTransition,
  isExactLocalFulfillmentReplay,
  parseLocalFulfillmentActionInput,
  type LocalFulfillmentActionResult,
  type LocalFulfillmentCommittedBinding,
  type LocalFulfillmentIssue,
  type LocalFulfillmentPreviewMetadata,
  type LocalFulfillmentRevisionCount,
  type LocalFulfillmentState,
} from "../../domain/local-fulfillment.ts";
import type {
  LocalFulfillmentAggregateCommitInput,
  LocalFulfillmentAggregateReadResult,
  LocalFulfillmentAggregateRecord,
  LocalFulfillmentAggregateRepository,
  LocalFulfillmentAggregateResult,
  LocalFulfillmentAggregateTestCounts,
  LocalFulfillmentRevisionRecord,
  LocalMemoryLocalFulfillmentRepositoryOptions,
} from "../../application/local-fulfillment-repository.ts";
import type { LocalOrderFulfillmentReadPort } from "../../application/local-order-repository.ts";

function issue(code: LocalFulfillmentIssue["code"], message: string): LocalFulfillmentIssue {
  return { path: "$", code, message };
}

function failure(status: "conflict" | "rejected" | "unavailable" | "failed", code: LocalFulfillmentIssue["code"], message: string): LocalFulfillmentAggregateResult {
  return { status, issues: [issue(code, message)] };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

function clonePreview(preview: LocalFulfillmentPreviewMetadata): LocalFulfillmentPreviewMetadata {
  return { ...preview };
}

function cloneRevision(record: LocalFulfillmentRevisionRecord): LocalFulfillmentRevisionRecord {
  return { ...record };
}

function cloneBinding(binding: LocalFulfillmentCommittedBinding): LocalFulfillmentCommittedBinding {
  return {
    ...binding,
    request: { ...binding.request },
    committedFrom: { ...binding.committedFrom },
    result: { ...binding.result },
  };
}

function cloneState(state: LocalFulfillmentState): LocalFulfillmentState {
  return createLocalFulfillmentState({
    internalOrderId: state.internalOrderId,
    publicOrderReference: state.publicOrderReference,
    status: state.status,
    currentPreview: state.currentPreview ? clonePreview(state.currentPreview) : null,
    revisionRequestsUsed: state.revisionRequestsUsed,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  });
}

function cloneAggregate(record: LocalFulfillmentAggregateRecord): LocalFulfillmentAggregateRecord {
  return deepFreeze({
    kind: record.kind,
    internalOrderId: record.internalOrderId,
    publicOrderReference: record.publicOrderReference,
    state: cloneState(record.state),
    previewHistory: record.previewHistory.map(clonePreview),
    revisionRecords: record.revisionRecords.map(cloneRevision),
    actionBindings: record.actionBindings.map(cloneBinding),
  });
}

function previewVersion(state: LocalFulfillmentState | null) {
  return state?.currentPreview?.previewVersion ?? null;
}

function revisionCount(state: LocalFulfillmentState | null): LocalFulfillmentRevisionCount {
  return state?.revisionRequestsUsed ?? 0;
}

function isPaidAndSucceeded(snapshot: { status: string; paymentStatus: string }): boolean {
  return snapshot.status === "paid" && snapshot.paymentStatus === "succeeded";
}

/**
 * One synchronous process-memory Fulfillment aggregate. A staged immutable
 * record becomes visible only through its single Map.set commit point.
 */
export class LocalMemoryLocalFulfillmentRepository implements LocalFulfillmentAggregateRepository {
  private readonly aggregatesByOrderId = new Map<string, LocalFulfillmentAggregateRecord>();
  private readonly canonicalOrders: LocalOrderFulfillmentReadPort;
  private readonly now: () => string;
  private readonly failureInjector?: LocalMemoryLocalFulfillmentRepositoryOptions["failureInjector"];

  constructor(
    canonicalOrders: LocalOrderFulfillmentReadPort,
    options: LocalMemoryLocalFulfillmentRepositoryOptions = {},
  ) {
    this.canonicalOrders = canonicalOrders;
    this.now = options.now ?? (() => new Date().toISOString());
    this.failureInjector = options.failureInjector;
  }

  commit(input: LocalFulfillmentAggregateCommitInput): LocalFulfillmentAggregateResult {
    if (
      typeof input.internalOrderId !== "string" || input.internalOrderId.trim().length === 0
      || typeof input.orderReference !== "string" || input.orderReference.trim().length === 0
      || (input.actorKind !== "customer" && input.actorKind !== "operator")
      || typeof input.actorContextId !== "string" || input.actorContextId.trim().length === 0
    ) {
      return failure("rejected", "invalid_format", "Fulfillment aggregate input is invalid.");
    }

    const parsed = parseLocalFulfillmentActionInput(input.action);
    if (!parsed.ok) return failure("rejected", parsed.issues[0]?.code ?? "invalid_action", "Fulfillment action is invalid.");
    if (parsed.value.publicOrderReference !== input.orderReference) {
      return failure("unavailable", "unavailable", "The canonical Local Order is unavailable.");
    }

    const replayRequest = buildLocalFulfillmentReplayRequest({
      internalOrderId: input.internalOrderId,
      actorKind: input.actorKind,
      actorContextId: input.actorContextId,
      action: parsed.value,
    });
    if (!replayRequest.ok) return failure("rejected", replayRequest.issues[0]?.code ?? "invalid_format", "Fulfillment authority is invalid.");

    // Identity resolution happens before binding lookup, including replays.
    // Payment/lifecycle validation occurs only after the replay decision.
    const canonicalOrder = this.canonicalOrders.findSnapshotForFulfillmentById(input.internalOrderId);
    if (canonicalOrder.status !== "found" || canonicalOrder.snapshot.publicReference !== input.orderReference) {
      return failure("unavailable", "unavailable", "The canonical Local Order is unavailable.");
    }

    const existingBinding = this.findBindingByActionId(parsed.value.fulfillmentActionId);
    if (existingBinding) {
      if (!isExactLocalFulfillmentReplay(replayRequest.value, existingBinding.binding)) {
        return failure("conflict", "invalid_action", "Fulfillment action selector is already bound to different context.");
      }
      return {
        status: "replayed",
        aggregate: cloneAggregate(existingBinding.aggregate),
        state: cloneState(existingBinding.aggregate.state),
        binding: cloneBinding(existingBinding.binding),
        result: { ...existingBinding.binding.result },
      };
    }

    const currentRecord = this.aggregatesByOrderId.get(input.internalOrderId);
    if (currentRecord && currentRecord.publicOrderReference !== input.orderReference) {
      return failure("unavailable", "unavailable", "The canonical Fulfillment identity is unavailable.");
    }
    const currentState = currentRecord?.state ?? null;
    if (!isPaidAndSucceeded(canonicalOrder.snapshot)) {
      return failure("rejected", "invalid_order_state", "Fulfillment requires a paid and succeeded Local Order.");
    }

    const committedAt = this.now();
    const transition = evaluateLocalFulfillmentTransition({
      current: currentState,
      actorKind: input.actorKind,
      action: parsed.value,
      orderPayment: {
        orderStatus: canonicalOrder.snapshot.status,
        paymentStatus: canonicalOrder.snapshot.paymentStatus,
      },
      publishedAt: input.publishedAt ?? committedAt,
    });
    if (!transition.ok) return failure("rejected", transition.issues[0]?.code ?? "invalid_lifecycle", "Fulfillment transition is not allowed.");

    const nextState = createLocalFulfillmentState({
      internalOrderId: input.internalOrderId,
      publicOrderReference: input.orderReference,
      status: transition.value.nextStatus,
      currentPreview: transition.value.nextPreview,
      revisionRequestsUsed: transition.value.revisionRequestsUsed,
      createdAt: currentState?.createdAt ?? committedAt,
      updatedAt: committedAt,
    });
    const nextPreviewHistory = [...(currentRecord?.previewHistory ?? [])];
    if (transition.value.nextPreview && transition.value.nextPreview.previewVersion !== previewVersion(currentState)) {
      nextPreviewHistory.push(clonePreview(transition.value.nextPreview));
    }

    const nextRevisionRecords = [...(currentRecord?.revisionRecords ?? [])];
    if (parsed.value.actionKind === "request_revision") {
      const currentPreview = currentState?.currentPreview;
      if (!currentPreview) return failure("rejected", "invalid_preview", "Revision requires a current preview.");
      const revisionRecord: LocalFulfillmentRevisionRecord = {
        kind: "local_fulfillment_revision_record",
        previewVersion: currentPreview.previewVersion,
        revisionOrdinal: transition.value.revisionRequestsUsed as 1 | 2,
        ...(parsed.value.revisionNote !== undefined ? { revisionNote: parsed.value.revisionNote } : {}),
        committedAt,
      };
      nextRevisionRecords.push(revisionRecord);
    }

    const result: LocalFulfillmentActionResult = {
      kind: "local_fulfillment_action_result",
      publicOrderReference: input.orderReference,
      status: nextState.status,
      currentPreviewVersion: nextState.currentPreview?.previewVersion ?? null,
      revisionRequestsUsed: nextState.revisionRequestsUsed,
      committedAt,
      notice: "Development/test Fulfillment only.",
    };
    const binding: LocalFulfillmentCommittedBinding = {
      request: replayRequest.value,
      committedFrom: {
        status: currentState?.status ?? null,
        previewVersion: previewVersion(currentState),
        revisionRequestsUsed: revisionCount(currentState),
      },
      result,
    };
    const nextAggregate = deepFreeze({
      kind: "local_fulfillment_aggregate" as const,
      internalOrderId: input.internalOrderId,
      publicOrderReference: input.orderReference,
      state: nextState,
      previewHistory: nextPreviewHistory,
      revisionRecords: nextRevisionRecords,
      actionBindings: [...(currentRecord?.actionBindings ?? []), binding],
    });

    try {
      this.failureInjector?.beforeCommit?.();
    } catch {
      return failure("failed", "unavailable", "Fulfillment could not be committed.");
    }

    // The only visible mutation for a NEW action.
    this.aggregatesByOrderId.set(input.internalOrderId, nextAggregate);
    return {
      status: "committed",
      aggregate: cloneAggregate(nextAggregate),
      state: cloneState(nextState),
      binding: cloneBinding(binding),
      result: { ...result },
    };
  }

  findByOrderIdentity(input: { internalOrderId: string; publicOrderReference: string }): LocalFulfillmentAggregateReadResult {
    const record = this.aggregatesByOrderId.get(input.internalOrderId);
    if (!record || record.publicOrderReference !== input.publicOrderReference) return { status: "unavailable" };
    return { status: "found", aggregate: cloneAggregate(record) };
  }

  getCountsForTests(): LocalFulfillmentAggregateTestCounts {
    let actionBindingCount = 0;
    let previewRecordCount = 0;
    let revisionRecordCount = 0;
    for (const aggregate of this.aggregatesByOrderId.values()) {
      actionBindingCount += aggregate.actionBindings.length;
      previewRecordCount += aggregate.previewHistory.length;
      revisionRecordCount += aggregate.revisionRecords.length;
    }
    return {
      aggregateCount: this.aggregatesByOrderId.size,
      actionBindingCount,
      previewRecordCount,
      revisionRecordCount,
    };
  }

  private findBindingByActionId(actionId: string): { aggregate: LocalFulfillmentAggregateRecord; binding: LocalFulfillmentCommittedBinding } | undefined {
    for (const aggregate of this.aggregatesByOrderId.values()) {
      const binding = aggregate.actionBindings.find((entry) => entry.request.fulfillmentActionId === actionId);
      if (binding) return { aggregate, binding };
    }
    return undefined;
  }
}
