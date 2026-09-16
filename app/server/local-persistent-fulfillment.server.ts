import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { validatePersistentHistoryModel } from "../application/local-order-consumer-projections.server.ts";
import { persistentPhotoReviewApplicability } from "../application/local-persistent-photo-review.server.ts";
import type { LocalCommerceFulfillmentPort } from "../application/local-commerce-provider-ports.server.ts";
import { createLocalFulfillmentDevelopmentOperatorVerifier } from "./local-fulfillment-development-operator.server.ts";
import type { LocalFulfillmentActionInput } from "../domain/local-fulfillment.ts";
import { isRecord } from "../domain/catalog/validation.ts";

const unavailable = { status: "unavailable" as const };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
type Projection = { publicReference: string; version: number; status: string; revisionRequestsUsed: number };
export function projectPersistentFulfillment(value: unknown, reference: string): Projection | null {
  if (!isRecord(value) || value.publicReference !== reference || !Number.isSafeInteger(value.version)
    || Number(value.version)<1 || typeof value.status!=="string"
    || !["photo_review","preview_pending","preview_revision_requested","preview_approved","in_production","quality_check"].includes(value.status)
    || !Number.isInteger(value.revisionRequestsUsed) || Number(value.revisionRequestsUsed)<0 || Number(value.revisionRequestsUsed)>2) return null;
  return { publicReference: reference, version: Number(value.version), status: value.status, revisionRequestsUsed:Number(value.revisionRequestsUsed) };
}

/** Existing independent development operator switch. Neither a browser cookie
 * nor the local_persistent selector grants operator authority. No memory read. */
export async function persistentFulfillmentOperator(reference: string, action: LocalFulfillmentActionInput | null,
  environment: RuntimeEnvironment = process.env) {
  try {
    const composition = resolveLocalPersistentComposition(environment, {requiredCapabilities:["fulfillment"]});
    if (composition.status!=="ready" || !["development","test"].includes(process.env.NODE_ENV ?? "")) return unavailable;
    const authority = createLocalFulfillmentDevelopmentOperatorVerifier().verify();
    if (!authority || authority.actorKind!=="operator" || !/^[A-Za-z0-9_-]{8,200}$/.test(authority.actorContextId)
      || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(reference)) return unavailable;
    if (action && (action.actionKind!=="enter_photo_review" || action.publicOrderReference!==reference)) return unavailable;
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status!=="ready" || connection.composition.projectId!==composition.value.projectId
      || connection.composition.markerDigest!==composition.value.markerDigest) return unavailable;
    const key = action ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(action.fulfillmentActionId))),b=>b.toString(16).padStart(2,"0")).join("") : null;
    const base = {p_project_id:composition.value.projectId,p_marker_digest:composition.value.markerDigest,
      p_actor_kind:authority.actorKind,p_actor_id:authority.actorContextId,p_public_reference:reference,p_key_digest:key};
    const prepared=await connection.adapter.callRestrictedRpc<unknown>("fulfillment_admission",{
      ...base,p_operation:action?"prepare":"read",p_order_id:null,p_expected_version:null,p_context_digest:null});
    if (prepared.status!=="found" || !isRecord(prepared.value)) return unavailable;
    if (prepared.value.status==="conflict") return {status:"conflict" as const};
    if (prepared.value.status!=="found" || !isRecord(prepared.value.value)) return unavailable;
    const p=prepared.value.value;
    if (!action) {
      const projection=projectPersistentFulfillment(p,reference);
      return projection ? {status:"found" as const,value:projection} : unavailable;
    }
    if(p.replayed===true) {
      const projection=projectPersistentFulfillment(p.fulfillment,reference);
      return projection ? {status:"replayed" as const,value:projection} : unavailable;
    }
    if(p.replayed!==false || typeof p.orderId!=="string" || !uuid.test(p.orderId)
      || typeof p.ownerId!=="string" || !uuid.test(p.ownerId) || !Number.isSafeInteger(p.version) || Number(p.version)<0
      || typeof p.contextDigest!=="string" || !hash.test(p.contextDigest) || !Array.isArray(p.items) || !key) return unavailable;
    const histories=[];
    for(const raw of p.items) {
      const h=validatePersistentHistoryModel(raw);
      if(h.status!=="found" || h.value.orderId!==p.orderId || h.value.publicReference!==reference) return unavailable;
      histories.push(h.value);
    }
    if(persistentPhotoReviewApplicability(histories).status!=="found") return unavailable;
    const {orderId,ownerId,contextDigest}=p, version=Number(p.version);
    const port: LocalCommerceFulfillmentPort<Projection,{replayed:boolean}> = {
      async readExact(){return {status:"unavailable",reason:"not_supported"};},
      async command(input) {
        if(input.authority.kind!=="verified_server_authority" || input.authority.projectId!==base.p_project_id
          || input.authority.ownerId!==ownerId || input.authority.actorKind!=="operator" || input.authority.actorId!==authority.actorContextId
          || input.internalOrderId!==orderId || input.publicReference!==reference || input.expectedVersion!==version
          || input.idempotency.key!==key || input.idempotency.fingerprint!==contextDigest || input.action!==action) {
          return {status:"unavailable",reason:"invalid_authority"};
        }
        const result=await connection.adapter.callRestrictedRpc<unknown>("fulfillment_admission",{
          ...base,p_operation:"commit",p_order_id:input.internalOrderId,p_expected_version:input.expectedVersion,p_context_digest:input.idempotency.fingerprint});
        if(result.status!=="found" || !isRecord(result.value)) return {status:"unavailable",reason:"source_failure"};
        if(result.value.status==="conflict") return {status:"conflict",reason:"version_mismatch"};
        if(result.value.status!=="found" || !isRecord(result.value.value) || typeof result.value.value.replayed!=="boolean") return {status:"unavailable",reason:"rejected"};
        const projection=projectPersistentFulfillment(result.value.value.fulfillment,reference);
        return projection ? {status:"found",value:{state:projection,result:{replayed:result.value.value.replayed}}} : {status:"unavailable",reason:"source_failure"};
      },
    };
    const result=await port.command({authority:{kind:"verified_server_authority",projectId:base.p_project_id,ownerId,actorKind:"operator",actorId:authority.actorContextId},
      internalOrderId:orderId,publicReference:reference,action,expectedVersion:version,idempotency:{key,fingerprint:contextDigest}});
    return result.status==="found" ? {status:result.value.result.replayed?"replayed" as const:"committed" as const,value:result.value.state} : result;
  } catch {return unavailable;}
}
