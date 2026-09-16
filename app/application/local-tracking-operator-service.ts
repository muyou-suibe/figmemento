import { isLocalOrderPublicReference } from "../domain/local-order.ts";
import {
  parseLocalTrackingActionInput,
  projectLocalShipment,
  type LocalTrackingActionInput,
  type LocalTrackingActionKind,
  type LocalTrackingIssue,
  type LocalTrackingReadResult,
} from "../domain/local-tracking.ts";
import type { LocalTrackingAggregateResult } from "./local-tracking-repository.ts";
import {
  commitAuthorizedLocalTrackingOperatorAction,
  type LocalTrackingRuntime,
} from "../server/local-tracking-runtime.server.ts";
import type { LocalTrackingOperatorVerifier } from "../server/local-tracking-operator.server.ts";

const OPERATOR_ACTIONS: readonly LocalTrackingActionKind[] = [
  "create_shipment", "mark_shipped", "mark_in_transit", "mark_delivered",
];

export interface LocalTrackingOperatorProjection {
  readonly publicOrderReference: string;
  readonly fulfillmentStatus: string;
  readonly shipment: Extract<LocalTrackingReadResult, { status: "found" }> ["value"] | null;
  readonly allowedActions: readonly LocalTrackingActionKind[];
  readonly notice: "DEVELOPMENT / TEST ONLY";
}

export type LocalTrackingOperatorFailure = {
  readonly status: "invalid" | "unavailable" | "conflict" | "rejected";
  readonly issues: readonly Pick<LocalTrackingIssue, "path" | "code" | "message">[];
};

export type LocalTrackingOperatorResult =
  | LocalTrackingOperatorFailure
  | { readonly status: "found"; readonly value: LocalTrackingOperatorProjection }
  | { readonly status: "committed" | "replayed"; readonly result: NonNullable<Extract<LocalTrackingAggregateResult, { status: "committed" | "replayed" }> ["result"]>; readonly projection: LocalTrackingOperatorProjection };

export interface LocalTrackingOperatorServiceDependencies {
  readonly runtime: LocalTrackingRuntime;
  readonly verifier: LocalTrackingOperatorVerifier | undefined;
}

function failure(status: LocalTrackingOperatorFailure["status"], code: LocalTrackingIssue["code"], message: string): LocalTrackingOperatorFailure {
  return { status, issues: [{ path: "$", code, message }] };
}

function unavailable(): LocalTrackingOperatorFailure {
  return failure("unavailable", "unavailable", "Tracking is unavailable.");
}

function allowedActions(fulfillmentStatus: string, shipmentStatus: string | null): readonly LocalTrackingActionKind[] {
  if (shipmentStatus === null) return fulfillmentStatus === "quality_check" ? ["create_shipment"] : [];
  if (shipmentStatus === "shipment_created") return ["mark_shipped"];
  if (shipmentStatus === "shipped") return ["mark_in_transit"];
  if (shipmentStatus === "in_transit") return ["mark_delivered"];
  return [];
}

function isOperatorAction(action: LocalTrackingActionInput): boolean {
  return OPERATOR_ACTIONS.includes(action.actionKind);
}

function projectionFor(runtime: LocalTrackingRuntime, publicOrderReference: string): LocalTrackingOperatorProjection | null {
  const order = runtime.ports.orders.findSnapshotForFulfillment(publicOrderReference);
  if (order.status !== "found" || order.snapshot.status !== "paid" || order.snapshot.paymentStatus !== "succeeded") return null;
  const fulfillment = runtime.ports.fulfillments.findByOrderIdentity({
    internalOrderId: order.snapshot.internalId,
    publicOrderReference: order.snapshot.publicReference,
  });
  if (fulfillment.status !== "found") return null;
  const tracking = runtime.repository.findByOrderIdentity({
    internalOrderId: order.snapshot.internalId,
    publicOrderReference: order.snapshot.publicReference,
  });
  const shipment = tracking.status === "found" ? projectLocalShipment(tracking.aggregate.shipment) : null;
  return {
    publicOrderReference: order.snapshot.publicReference,
    fulfillmentStatus: fulfillment.aggregate.state.status,
    shipment: shipment?.status === "found" ? shipment.value : null,
    allowedActions: allowedActions(fulfillment.aggregate.state.status, tracking.status === "found" ? tracking.aggregate.shipment.status : null),
    notice: "DEVELOPMENT / TEST ONLY",
  };
}

function mapFailure(result: Exclude<LocalTrackingAggregateResult, { status: "committed" | "replayed" }>): LocalTrackingOperatorFailure {
  if (result.status === "unavailable" || result.status === "failed") return unavailable();
  if (result.status === "conflict") return failure("conflict", "conflict", "This Tracking action conflicts with an earlier request.");
  return failure("rejected", result.issues[0]?.code ?? "invalid_transition", "This Tracking action is not available for the current state.");
}

function isAggregateSuccess(result: LocalTrackingAggregateResult): result is Extract<LocalTrackingAggregateResult, { status: "committed" | "replayed" }> {
  return result.status === "committed" || result.status === "replayed";
}

export function parseLocalTrackingOperatorActionInput(value: unknown, publicOrderReference: string) {
  if (!isLocalOrderPublicReference(publicOrderReference)) return { ok: false as const, issues: [{ path: "$.publicOrderReference", code: "invalid_format" as const, message: "Order reference is invalid." }] };
  if (typeof value === "object" && value !== null && !Array.isArray(value) && "publicOrderReference" in value) {
    return { ok: false as const, issues: [{ path: "$.publicOrderReference", code: "authority_field" as const, message: "Order reference is selected by the route." }] };
  }
  const parsed = parseLocalTrackingActionInput(value);
  if (!parsed.ok) return parsed;
  return isOperatorAction(parsed.value)
    ? parsed
    : { ok: false as const, issues: [{ path: "$.actionKind", code: "invalid_transition" as const, message: "Tracking action is not supported." }] };
}

export class LocalTrackingOperatorService {
  private readonly dependencies: LocalTrackingOperatorServiceDependencies;

  constructor(dependencies: LocalTrackingOperatorServiceDependencies) {
    this.dependencies = dependencies;
  }

  read(publicOrderReference: string): LocalTrackingOperatorResult {
    const authorization = this.authorize();
    if (!authorization) return unavailable();
    if (!isLocalOrderPublicReference(publicOrderReference)) return unavailable();
    try {
      const value = projectionFor(this.dependencies.runtime, publicOrderReference);
      return value ? { status: "found", value } : unavailable();
    } catch {
      return unavailable();
    }
  }

  mutate(publicOrderReference: string, action: LocalTrackingActionInput): LocalTrackingOperatorResult {
    if (!isLocalOrderPublicReference(publicOrderReference) || !isOperatorAction(action)) return failure("invalid", "invalid_format", "Tracking action is invalid.");
    if (!this.authorize()) return unavailable();
    try {
      const committed = commitAuthorizedLocalTrackingOperatorAction(this.dependencies.runtime, { publicOrderReference, action, verifier: this.dependencies.verifier });
      if (!isAggregateSuccess(committed)) return mapFailure(committed);
      const projection = projectionFor(this.dependencies.runtime, publicOrderReference);
      if (!projection) return unavailable();
      return { status: committed.status, result: committed.result, projection };
    } catch {
      return unavailable();
    }
  }

  private authorize(): true | null {
    const runtime = this.dependencies.runtime;
    const verifier = this.dependencies.verifier;
    if (runtime.configuration.source !== "local_fake" || !["development", "test"].includes(runtime.configuration.runtimeMode)) return null;
    if (!verifier) return null;
    try { return verifier.verify() ? true : null; } catch { return null; }
  }
}
