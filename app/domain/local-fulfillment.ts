import { isLocalOrderPublicReference } from "./local-order.ts";

export type LocalFulfillmentStatus =
  | "photo_review"
  | "preview_pending"
  | "preview_revision_requested"
  | "preview_approved"
  | "in_production"
  | "quality_check";

export type LocalFulfillmentActorKind = "customer" | "operator";

export type LocalFulfillmentCustomerActionKind = "approve_preview" | "request_revision";
export type LocalFulfillmentOperatorActionKind =
  | "enter_photo_review"
  | "publish_preview"
  | "start_production"
  | "mark_quality_check";
export type LocalFulfillmentActionKind =
  | LocalFulfillmentCustomerActionKind
  | LocalFulfillmentOperatorActionKind;

export type LocalFulfillmentPreviewVersion = 1 | 2 | 3;
export type LocalFulfillmentRevisionCount = 0 | 1 | 2;

export type LocalFulfillmentIssueCode =
  | "invalid_type"
  | "invalid_format"
  | "unknown_field"
  | "authority_field"
  | "invalid_action"
  | "invalid_actor"
  | "invalid_order_state"
  | "invalid_lifecycle"
  | "stale_preview_version"
  | "revision_limit"
  | "invalid_preview"
  | "unavailable"
  | "unsupported_action";

export interface LocalFulfillmentIssue {
  readonly path: string;
  readonly code: LocalFulfillmentIssueCode;
  readonly message: string;
}

export type LocalFulfillmentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly LocalFulfillmentIssue[] };

export interface LocalFulfillmentPreviewMetadata {
  readonly kind: "local_fulfillment_preview";
  readonly previewVersion: LocalFulfillmentPreviewVersion;
  readonly displayLabel: "Development/test preview placeholder";
  readonly publishedAt: string;
  readonly developmentOnly: true;
}

export interface LocalFulfillmentState {
  readonly kind: "local_fulfillment_state";
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly status: LocalFulfillmentStatus;
  readonly currentPreview: LocalFulfillmentPreviewMetadata | null;
  readonly revisionRequestsUsed: LocalFulfillmentRevisionCount;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LocalFulfillmentActionInput {
  readonly publicOrderReference: string;
  readonly fulfillmentActionId: string;
  readonly actionKind: LocalFulfillmentActionKind;
  readonly expectedPreviewVersion?: LocalFulfillmentPreviewVersion;
  readonly revisionNote?: string;
}

export interface LocalFulfillmentOrderPaymentState {
  readonly orderStatus: "pending_payment" | "payment_failed" | "paid";
  readonly paymentStatus: "pending" | "failed" | "succeeded";
}

export interface LocalFulfillmentTransitionInput {
  readonly current: LocalFulfillmentState | null;
  readonly actorKind: LocalFulfillmentActorKind;
  readonly action: LocalFulfillmentActionInput;
  readonly orderPayment?: LocalFulfillmentOrderPaymentState;
  /** Server-observed time for publication; it is not browser input. */
  readonly publishedAt?: string;
}

export interface LocalFulfillmentTransitionDecision {
  readonly nextStatus: LocalFulfillmentStatus;
  readonly nextPreview: LocalFulfillmentPreviewMetadata | null;
  readonly revisionRequestsUsed: LocalFulfillmentRevisionCount;
}

export interface LocalFulfillmentReplayRequest {
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly fulfillmentActionId: string;
  readonly actorKind: LocalFulfillmentActorKind;
  readonly actorContextId: string;
  readonly actionKind: LocalFulfillmentActionKind;
  readonly expectedPreviewVersion?: LocalFulfillmentPreviewVersion;
  readonly normalizedRevisionNote?: string;
}

export interface LocalFulfillmentCommittedBinding {
  readonly request: LocalFulfillmentReplayRequest;
  /** Original precondition for audit; never used as a replay gate. */
  readonly committedFrom: {
    readonly status: LocalFulfillmentStatus | null;
    readonly previewVersion: LocalFulfillmentPreviewVersion | null;
    readonly revisionRequestsUsed: LocalFulfillmentRevisionCount;
  };
  readonly result: LocalFulfillmentActionResult;
}

export interface LocalFulfillmentActionResult {
  readonly kind: "local_fulfillment_action_result";
  readonly publicOrderReference: string;
  readonly status: LocalFulfillmentStatus;
  readonly currentPreviewVersion: LocalFulfillmentPreviewVersion | null;
  readonly revisionRequestsUsed: LocalFulfillmentRevisionCount;
  readonly committedAt: string;
  readonly notice: "Development/test Fulfillment only.";
}

export interface LocalFulfillmentSafeProjection {
  readonly publicOrderReference: string;
  readonly status: LocalFulfillmentStatus;
  readonly currentPreviewVersion: LocalFulfillmentPreviewVersion | null;
  readonly preview: LocalFulfillmentPreviewMetadata | null;
  readonly revisionRequestsUsed: LocalFulfillmentRevisionCount;
  readonly revisionRequestsRemaining: 0 | 1 | 2;
  readonly allowedActions: readonly LocalFulfillmentActionKind[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly notice: "Development/test Fulfillment only.";
}

export type LocalFulfillmentReadResult =
  | { readonly status: "found"; readonly value: LocalFulfillmentSafeProjection }
  | { readonly status: "unavailable"; readonly issues: readonly LocalFulfillmentIssue[] };

export const LOCAL_FULFILLMENT_REVISION_NOTE_MAX_LENGTH = 500;
export const LOCAL_FULFILLMENT_NOTICE = "Development/test Fulfillment only." as const;

const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;
const ACTOR_CONTEXT_ID_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;
const ACTION_KINDS = new Set<LocalFulfillmentActionKind>([
  "enter_photo_review",
  "publish_preview",
  "start_production",
  "mark_quality_check",
  "approve_preview",
  "request_revision",
]);
const CUSTOMER_ACTIONS = new Set<LocalFulfillmentCustomerActionKind>([
  "approve_preview",
  "request_revision",
]);
const OPERATOR_ACTIONS = new Set<LocalFulfillmentOperatorActionKind>([
  "enter_photo_review",
  "publish_preview",
  "start_production",
  "mark_quality_check",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(path: string, code: LocalFulfillmentIssueCode, message: string): LocalFulfillmentIssue {
  return { path, code, message };
}

function success<T>(value: T): LocalFulfillmentResult<T> {
  return { ok: true, value };
}

function failure<T = never>(...issues: LocalFulfillmentIssue[]): LocalFulfillmentResult<T> {
  return { ok: false, issues };
}

function isPreviewVersion(value: unknown): value is LocalFulfillmentPreviewVersion {
  return value === 1 || value === 2 || value === 3;
}

function isRevisionCount(value: unknown): value is LocalFulfillmentRevisionCount {
  return value === 0 || value === 1 || value === 2;
}

function isActionKind(value: unknown): value is LocalFulfillmentActionKind {
  return typeof value === "string" && ACTION_KINDS.has(value as LocalFulfillmentActionKind);
}

export function isLocalFulfillmentActionId(value: unknown): value is string {
  return typeof value === "string"
    && ACTION_ID_PATTERN.test(value)
    && !value.includes("@")
    && !isLocalOrderPublicReference(value);
}

export function isLocalFulfillmentStatus(value: unknown): value is LocalFulfillmentStatus {
  return value === "photo_review"
    || value === "preview_pending"
    || value === "preview_revision_requested"
    || value === "preview_approved"
    || value === "in_production"
    || value === "quality_check";
}

/** Parses only bounded structural action fields. Actor and authority are server inputs. */
export function parseLocalFulfillmentActionInput(value: unknown): LocalFulfillmentResult<LocalFulfillmentActionInput> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Fulfillment action must be an object."));

  const issues: LocalFulfillmentIssue[] = [];
  const allowedFields = new Set([
    "publicOrderReference",
    "fulfillmentActionId",
    "actionKind",
    "expectedPreviewVersion",
    "revisionNote",
  ]);
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      const authorityFields = new Set([
        "actorKind",
        "authorityContext",
        "capability",
        "currentState",
        "targetState",
        "paid",
        "paymentStatus",
        "fulfillmentStatus",
        "previewStatus",
        "previewVersion",
        "revisionRequestsUsed",
        "internalOrderId",
        "ownerId",
        "receiptId",
        "storageKey",
        "providerPath",
        "shippingStatus",
        "trackingNumber",
      ]);
      issues.push(issue(
        `$.${field}`,
        authorityFields.has(field) ? "authority_field" : "unknown_field",
        authorityFields.has(field) ? "Server-owned authority field is not accepted." : "Field is not part of the Fulfillment action contract.",
      ));
    }
  }

  const publicOrderReference = value.publicOrderReference;
  if (!isLocalOrderPublicReference(publicOrderReference)) {
    issues.push(issue("$.publicOrderReference", "invalid_format", "Local Order public reference is invalid."));
  }

  const fulfillmentActionId = value.fulfillmentActionId;
  if (!isLocalFulfillmentActionId(fulfillmentActionId)) {
    issues.push(issue("$.fulfillmentActionId", "invalid_format", "Fulfillment action selector is invalid."));
  }

  const actionKind = value.actionKind;
  if (!isActionKind(actionKind)) {
    issues.push(issue("$.actionKind", "unsupported_action", "Fulfillment action is not supported."));
  }

  const expectedPreviewVersion = value.expectedPreviewVersion;
  const isCustomerAction = isActionKind(actionKind) && CUSTOMER_ACTIONS.has(actionKind as LocalFulfillmentCustomerActionKind);
  if (isCustomerAction) {
    if (!isPreviewVersion(expectedPreviewVersion)) {
      issues.push(issue("$.expectedPreviewVersion", "invalid_format", "Current preview version is required."));
    }
  } else if (expectedPreviewVersion !== undefined) {
    issues.push(issue("$.expectedPreviewVersion", "authority_field", "Preview version is not accepted for this action."));
  }

  const revisionNote = value.revisionNote;
  if (actionKind === "request_revision") {
    if (revisionNote !== undefined) {
      if (typeof revisionNote !== "string") {
        issues.push(issue("$.revisionNote", "invalid_type", "Revision note must be plain text."));
      } else {
        const normalized = revisionNote.trim();
        if (!normalized || normalized.length > LOCAL_FULFILLMENT_REVISION_NOTE_MAX_LENGTH) {
          issues.push(issue("$.revisionNote", "invalid_format", "Revision note is outside the permitted length."));
        }
      }
    }
  } else if (revisionNote !== undefined) {
    issues.push(issue("$.revisionNote", "authority_field", "Revision note is accepted only for request_revision."));
  }

  if (issues.length > 0) return failure(...issues);
  return success({
    publicOrderReference: publicOrderReference as string,
    fulfillmentActionId: fulfillmentActionId as string,
    actionKind: actionKind as LocalFulfillmentActionKind,
    ...(isCustomerAction ? { expectedPreviewVersion: expectedPreviewVersion as LocalFulfillmentPreviewVersion } : {}),
    ...(actionKind === "request_revision" && typeof revisionNote === "string"
      ? { revisionNote: revisionNote.trim() }
      : {}),
  });
}

export function createLocalFulfillmentState(input: Omit<LocalFulfillmentState, "kind">): LocalFulfillmentState {
  if (!input.internalOrderId || !isLocalOrderPublicReference(input.publicOrderReference)) {
    throw new Error("Invalid Local Fulfillment identity.");
  }
  if (!isLocalFulfillmentStatus(input.status) || !isRevisionCount(input.revisionRequestsUsed)) {
    throw new Error("Invalid Local Fulfillment state.");
  }
  if (input.currentPreview !== null) {
    if (!isPreviewVersion(input.currentPreview.previewVersion) || input.currentPreview.developmentOnly !== true) {
      throw new Error("Invalid Local Fulfillment preview.");
    }
  }
  return Object.freeze({
    kind: "local_fulfillment_state" as const,
    internalOrderId: input.internalOrderId,
    publicOrderReference: input.publicOrderReference,
    status: input.status,
    currentPreview: input.currentPreview ? Object.freeze({ ...input.currentPreview }) : null,
    revisionRequestsUsed: input.revisionRequestsUsed,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}

function isPaidOrder(orderPayment: LocalFulfillmentOrderPaymentState | undefined): boolean {
  return orderPayment?.orderStatus === "paid" && orderPayment.paymentStatus === "succeeded";
}

function isCustomerAction(action: LocalFulfillmentActionKind): action is LocalFulfillmentCustomerActionKind {
  return CUSTOMER_ACTIONS.has(action as LocalFulfillmentCustomerActionKind);
}

function isOperatorAction(action: LocalFulfillmentActionKind): action is LocalFulfillmentOperatorActionKind {
  return OPERATOR_ACTIONS.has(action as LocalFulfillmentOperatorActionKind);
}

function checkExpectedVersion(
  current: LocalFulfillmentState,
  action: LocalFulfillmentActionInput,
): LocalFulfillmentResult<true> {
  if (!current.currentPreview || action.expectedPreviewVersion !== current.currentPreview.previewVersion) {
    return failure(issue("$.expectedPreviewVersion", "stale_preview_version", "Fulfillment preview version is stale."));
  }
  return success(true);
}

/** Calculates the only server-generated preview versions allowed by the contract. */
export function deriveNextLocalFulfillmentPreviewVersion(
  current: LocalFulfillmentState,
): LocalFulfillmentResult<LocalFulfillmentPreviewVersion> {
  if (current.status === "photo_review" && current.currentPreview === null && current.revisionRequestsUsed === 0) {
    return success(1);
  }
  if (
    current.status === "preview_revision_requested"
    && current.currentPreview?.previewVersion === current.revisionRequestsUsed
    && isPreviewVersion(current.revisionRequestsUsed + 1)
  ) {
    return success((current.revisionRequestsUsed + 1) as LocalFulfillmentPreviewVersion);
  }
  return failure(issue("$.previewVersion", "invalid_preview", "The next preview version is not available for this state."));
}

function buildPreview(version: LocalFulfillmentPreviewVersion, publishedAt: string): LocalFulfillmentPreviewMetadata {
  return Object.freeze({
    kind: "local_fulfillment_preview" as const,
    previewVersion: version,
    displayLabel: "Development/test preview placeholder" as const,
    publishedAt,
    developmentOnly: true as const,
  });
}

/** Pure lifecycle decision; it does not create or mutate an aggregate. */
export function evaluateLocalFulfillmentTransition(
  input: LocalFulfillmentTransitionInput,
): LocalFulfillmentResult<LocalFulfillmentTransitionDecision> {
  const { current, actorKind, action, orderPayment } = input;

  if (action.actionKind === "enter_photo_review") {
    if (current !== null) return failure(issue("$.status", "invalid_lifecycle", "Fulfillment already exists."));
    if (actorKind !== "operator") return failure(issue("$.actorKind", "invalid_actor", "Only an operator may enter Photo Review."));
    if (!isPaidOrder(orderPayment)) return failure(issue("$.orderPayment", "invalid_order_state", "Canonical Local Order is not paid."));
    return success({ nextStatus: "photo_review", nextPreview: null, revisionRequestsUsed: 0 });
  }

  if (!current) return failure(issue("$.status", "unavailable", "Fulfillment state is unavailable."));
  if (isCustomerAction(action.actionKind) && actorKind !== "customer") {
    return failure(issue("$.actorKind", "invalid_actor", "This customer action requires customer authority."));
  }
  if (isOperatorAction(action.actionKind) && actorKind !== "operator") {
    return failure(issue("$.actorKind", "invalid_actor", "This operator action requires operator authority."));
  }

  switch (action.actionKind) {
    case "publish_preview": {
      if (!input.publishedAt?.trim()) return failure(issue("$.publishedAt", "invalid_format", "Publication time is server-required."));
      const nextVersion = deriveNextLocalFulfillmentPreviewVersion(current);
      if (!nextVersion.ok) return nextVersion;
      return success({
        nextStatus: "preview_pending",
        nextPreview: buildPreview(nextVersion.value, input.publishedAt),
        revisionRequestsUsed: current.revisionRequestsUsed,
      });
    }
    case "approve_preview": {
      if (current.status !== "preview_pending") return failure(issue("$.status", "invalid_lifecycle", "Only a pending preview can be approved."));
      const version = checkExpectedVersion(current, action);
      if (!version.ok) return version;
      return success({ nextStatus: "preview_approved", nextPreview: current.currentPreview, revisionRequestsUsed: current.revisionRequestsUsed });
    }
    case "request_revision": {
      if (current.status !== "preview_pending") return failure(issue("$.status", "invalid_lifecycle", "Revision requires a pending preview."));
      const version = checkExpectedVersion(current, action);
      if (!version.ok) return version;
      if (current.revisionRequestsUsed >= 2) return failure(issue("$.revisionRequestsUsed", "revision_limit", "The maximum number of revisions has been reached."));
      return success({
        nextStatus: "preview_revision_requested",
        nextPreview: current.currentPreview,
        revisionRequestsUsed: (current.revisionRequestsUsed + 1) as LocalFulfillmentRevisionCount,
      });
    }
    case "start_production":
      if (current.status !== "preview_approved") return failure(issue("$.status", "invalid_lifecycle", "Production requires customer approval."));
      return success({ nextStatus: "in_production", nextPreview: current.currentPreview, revisionRequestsUsed: current.revisionRequestsUsed });
    case "mark_quality_check":
      if (current.status !== "in_production") return failure(issue("$.status", "invalid_lifecycle", "Quality Check requires production."));
      return success({ nextStatus: "quality_check", nextPreview: current.currentPreview, revisionRequestsUsed: current.revisionRequestsUsed });
    default:
      return failure(issue("$.actionKind", "unsupported_action", "Fulfillment action is not supported."));
  }
}

export function buildLocalFulfillmentReplayRequest(input: {
  readonly internalOrderId: string;
  readonly actorKind: LocalFulfillmentActorKind;
  readonly actorContextId: string;
  readonly action: LocalFulfillmentActionInput;
}): LocalFulfillmentResult<LocalFulfillmentReplayRequest> {
  if (!input.internalOrderId.trim() || !ACTOR_CONTEXT_ID_PATTERN.test(input.actorContextId)) {
    return failure(issue("$.authorityContext", "invalid_format", "Server-derived actor context is invalid."));
  }
  return success({
    internalOrderId: input.internalOrderId,
    publicOrderReference: input.action.publicOrderReference,
    fulfillmentActionId: input.action.fulfillmentActionId,
    actorKind: input.actorKind,
    actorContextId: input.actorContextId,
    actionKind: input.action.actionKind,
    ...(input.action.expectedPreviewVersion !== undefined
      ? { expectedPreviewVersion: input.action.expectedPreviewVersion }
      : {}),
    ...(input.action.revisionNote !== undefined
      ? { normalizedRevisionNote: input.action.revisionNote.trim() }
      : {}),
  });
}

/** Compares only binding identity; committed pre-transition state is not compared. */
export function isExactLocalFulfillmentReplay(
  request: LocalFulfillmentReplayRequest,
  binding: LocalFulfillmentCommittedBinding,
): boolean {
  const original = binding.request;
  return request.internalOrderId === original.internalOrderId
    && request.publicOrderReference === original.publicOrderReference
    && request.fulfillmentActionId === original.fulfillmentActionId
    && request.actorKind === original.actorKind
    && request.actorContextId === original.actorContextId
    && request.actionKind === original.actionKind
    && request.expectedPreviewVersion === original.expectedPreviewVersion
    && request.normalizedRevisionNote === original.normalizedRevisionNote;
}

function allowedActionsFor(
  state: LocalFulfillmentState,
  actorKind: LocalFulfillmentActorKind,
): readonly LocalFulfillmentActionKind[] {
  if (actorKind === "customer" && state.status === "preview_pending") return ["approve_preview", "request_revision"];
  if (actorKind === "operator" && state.status === "photo_review") return ["publish_preview"];
  if (actorKind === "operator" && state.status === "preview_revision_requested") return ["publish_preview"];
  if (actorKind === "operator" && state.status === "preview_approved") return ["start_production"];
  if (actorKind === "operator" && state.status === "in_production") return ["mark_quality_check"];
  return [];
}

export function projectLocalFulfillmentState(
  state: LocalFulfillmentState | null,
  actorKind: LocalFulfillmentActorKind,
): LocalFulfillmentReadResult {
  if (!state) {
    return { status: "unavailable", issues: [issue("$", "unavailable", "Fulfillment state is unavailable.")] };
  }
  return {
    status: "found",
    value: {
      publicOrderReference: state.publicOrderReference,
      status: state.status,
      currentPreviewVersion: state.currentPreview?.previewVersion ?? null,
      preview: state.currentPreview ? { ...state.currentPreview } : null,
      revisionRequestsUsed: state.revisionRequestsUsed,
      revisionRequestsRemaining: (2 - state.revisionRequestsUsed) as 0 | 1 | 2,
      allowedActions: allowedActionsFor(state, actorKind),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      notice: LOCAL_FULFILLMENT_NOTICE,
    },
  };
}
