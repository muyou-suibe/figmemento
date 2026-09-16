import type { RuntimeEnvironment } from "../config/server.ts";
import type { LocalCommerceFulfillmentPort } from "../application/local-commerce-provider-ports.server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createLocalFulfillmentDevelopmentOperatorVerifier } from "./local-fulfillment-development-operator.server.ts";
import { projectPersistentFulfillment } from "./local-persistent-fulfillment.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";

export type PersistentPhotoReviewDecisionAction = {
  readonly fulfillmentActionId: string;
  readonly actionKind: "approve_photo_review" | "reject_photo_review";
  readonly orderItemId: string;
  readonly expectedAggregateVersion: number;
};
type Projection = NonNullable<ReturnType<typeof projectPersistentFulfillment>> & {
  readonly photoReview: {
    readonly orderItemId: string;
    readonly status: "approved" | "rejected";
    readonly version: number;
    readonly decidedAt: string;
    readonly actorId: string;
  };
};
const unavailable = { status: "unavailable" as const };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parsePersistentPhotoReviewDecision(raw: unknown): PersistentPhotoReviewDecisionAction | null {
  if (!isRecord(raw) || Object.keys(raw).some(key => ![
    "fulfillmentActionId", "actionKind", "orderItemId", "expectedAggregateVersion",
  ].includes(key))
    || typeof raw.fulfillmentActionId !== "string" || !/^[A-Za-z0-9_-]{16,200}$/.test(raw.fulfillmentActionId)
    || !["approve_photo_review", "reject_photo_review"].includes(String(raw.actionKind))
    || typeof raw.orderItemId !== "string" || !uuid.test(raw.orderItemId)
    || typeof raw.expectedAggregateVersion !== "number" || !Number.isSafeInteger(raw.expectedAggregateVersion)
    || raw.expectedAggregateVersion < 1) return null;
  return raw as PersistentPhotoReviewDecisionAction;
}

function project(value: unknown, reference: string): Projection | null {
  const fulfillment = projectPersistentFulfillment(value, reference);
  if (!fulfillment || !isRecord(value) || !isRecord(value.photoReview)) return null;
  const review = value.photoReview;
  if (typeof review.orderItemId !== "string" || !uuid.test(review.orderItemId)
    || !["approved", "rejected"].includes(String(review.status))
    || typeof review.version !== "number" || !Number.isSafeInteger(review.version) || review.version < 2
    || typeof review.decidedAt !== "string" || !Number.isFinite(Date.parse(review.decidedAt))
    || typeof review.actorId !== "string" || !/^[A-Za-z0-9_-]{8,200}$/.test(review.actorId)) return null;
  return {...fulfillment, photoReview: {
    orderItemId: review.orderItemId,
    status: review.status as "approved" | "rejected",
    version: review.version,
    decidedAt: review.decidedAt,
    actorId: review.actorId,
  }};
}

export async function persistentPhotoReviewDecision(reference: string, action: PersistentPhotoReviewDecisionAction,
  environment: RuntimeEnvironment = process.env) {
  try {
    const composition = resolveLocalPersistentComposition(environment, {requiredCapabilities:["fulfillment"]});
    const actor = createLocalFulfillmentDevelopmentOperatorVerifier().verify();
    if (composition.status !== "ready" || !actor || actor.actorKind !== "operator"
      || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(reference)) return unavailable;
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return unavailable;
    const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest(
      "SHA-256", new TextEncoder().encode(value),
    )), byte => byte.toString(16).padStart(2, "0")).join("");
    const key = await digest(action.fulfillmentActionId);
    const base = {p_project_id:composition.value.projectId,p_marker_digest:composition.value.markerDigest,
      p_actor_kind:actor.actorKind,p_actor_id:actor.actorContextId,p_public_reference:reference,
      p_action:action.actionKind,p_expected_version:action.expectedAggregateVersion,p_key_digest:key,
      p_order_item_id:action.orderItemId};
    const rpc = async (operation: "prepare" | "commit") => {
      const current = createLocalFulfillmentDevelopmentOperatorVerifier().verify();
      if (current?.actorKind !== actor.actorKind || current.actorContextId !== actor.actorContextId) return unavailable;
      const response = await connection.adapter.callRestrictedRpc<unknown>("fulfillment_photo_review_command", {
        ...base, p_operation:operation,
      });
      return response.status === "found" && isRecord(response.value) ? response.value : unavailable;
    };
    const prepared = await rpc("prepare");
    if (prepared.status !== "found" || !("value" in prepared) || !isRecord(prepared.value)) return unavailable;
    const p = prepared.value;
    if (typeof p.orderId !== "string" || !uuid.test(p.orderId)
      || typeof p.ownerId !== "string" || !uuid.test(p.ownerId)
      || typeof p.fulfillmentId !== "string" || !uuid.test(p.fulfillmentId)) return unavailable;
    const authority = {kind:"verified_server_authority" as const,projectId:base.p_project_id,ownerId:p.ownerId,
      actorKind:"operator" as const,actorId:actor.actorContextId};
    const fingerprint = await digest(JSON.stringify([
      reference,p.fulfillmentId,action.actionKind,action.orderItemId,action.expectedAggregateVersion,
    ]));
    const port: LocalCommerceFulfillmentPort<Projection,{replayed:boolean},PersistentPhotoReviewDecisionAction> = {
      async readExact() {return {status:"unavailable",reason:"not_supported"};},
      async command(command) {
        if (command.authority !== authority || command.internalOrderId !== p.orderId
          || command.publicReference !== reference || command.action !== action
          || command.expectedVersion !== action.expectedAggregateVersion
          || command.idempotency.key !== key || command.idempotency.fingerprint !== fingerprint)
          return {status:"unavailable",reason:"invalid_authority"};
        const response = await rpc("commit");
        if (response.status === "conflict") return {status:"conflict",reason:"version_mismatch"};
        const value = response.status === "found" && "value" in response ? project(response.value, reference) : null;
        return value && "replayed" in response && typeof response.replayed === "boolean"
          ? {status:"found",value:{state:value,result:{replayed:response.replayed}}}
          : {status:"unavailable",reason:"rejected"};
      },
    };
    const result = await port.command({authority,internalOrderId:p.orderId,publicReference:reference,action,
      expectedVersion:action.expectedAggregateVersion,idempotency:{key,fingerprint}});
    return result.status === "found"
      ? {status:result.value.result.replayed ? "replayed" as const : "committed" as const,value:result.value.state}
      : result;
  } catch {return unavailable;}
}
