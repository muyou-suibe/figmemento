import type { RuntimeEnvironment } from "../config/server.ts";
import type { LocalCommerceFulfillmentPort } from "../application/local-commerce-provider-ports.server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { readPersistentOrderHistory } from "./local-persistent-order-history.server.ts";
import { createPersistentOrderCapabilityCodec, readPersistentOrderCapabilityCookie } from "./local-order-capability.server.ts";
import { persistentOwnerVerifier } from "./local-persistent-purchase-authority.server.ts";
import { hashGuestResourceCapability } from "../application/guest-resource-ownership.server.ts";
import { hashOpaqueCustomerSessionToken } from "../application/customer-auth-session-persistence.server.ts";
import { readCustomerAuthSessionId } from "./customer-auth-http.server.ts";
import { createLocalPersistentCustomerAuthProvider } from "../application/customer-auth-persistent-provider.server.ts";
import { parsePersistentPreviewCustomerAction } from "../application/local-persistent-preview-customer-contract.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";

const unavailable={status:"unavailable" as const};
const conflict={status:"conflict" as const};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Action=Extract<ReturnType<typeof parsePersistentPreviewCustomerAction>,{ok:true}>["value"];
async function digest(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,"0")).join("");}

/** Safe allowlist: no raw RPC identity, credential, locator or note is spread. */
export function projectPersistentCustomerPreview(value:unknown,reference:string){
 if(!isRecord(value) || value.publicReference!==reference || typeof value.manifestId!=="string" || !uuid.test(value.manifestId)
  || ![1,2,3].includes(Number(value.manifestVersion)) || typeof value.manifestVersion!=="number"
  || typeof value.version!=="number" || !Number.isSafeInteger(value.version) || value.version<1
  || typeof value.revisionRequestsUsed!=="number" || ![0,1,2].includes(value.revisionRequestsUsed)
  || typeof value.status!=="string" || !["preview_pending","preview_revision_requested","preview_approved","in_production","quality_check"].includes(value.status)
  || !Array.isArray(value.entries) || value.entries.length===0) return null;
 const entries=[];
 for(const entry of value.entries){
  if(!isRecord(entry) || typeof entry.previewMediaId!=="string" || !uuid.test(entry.previewMediaId)
   || entry.contentType!=="image/png" || typeof entry.width!=="number" || !Number.isSafeInteger(entry.width) || entry.width<1
   || typeof entry.height!=="number" || !Number.isSafeInteger(entry.height) || entry.height<1) return null;
  entries.push({previewMediaId:entry.previewMediaId,contentType:"image/png" as const,width:entry.width,height:entry.height});
 }
 return {publicReference:reference,status:value.status,version:value.version,manifestId:value.manifestId,
  manifestVersion:value.manifestVersion,revisionRequestsUsed:value.revisionRequestsUsed,entries};
}
type Preview=NonNullable<ReturnType<typeof projectPersistentCustomerPreview>>;
type Result={status:"found";value:Preview;replayed:boolean}|typeof unavailable|typeof conflict;

/** Same customer Order gate, then fresh transactional verification. The
 * existing unified CAS command remains the only application mutation port. */
export async function executePersistentCustomerPreview(request:Request,reference:string,action:Action|null,
 environment:RuntimeEnvironment=process.env):Promise<Result>{
 try {
  const composition=resolveLocalPersistentComposition(environment,{requiredCapabilities:["fulfillment"]});
  if(composition.status!=="ready") return unavailable;
  if((await readPersistentOrderHistory(request,{publicReference:reference},environment)).status!=="found") return unavailable;
  const codec=await createPersistentOrderCapabilityCodec(environment,composition.value);
  const capability=await codec?.verify(readPersistentOrderCapabilityCookie(request),Math.floor(Date.now()/1000));
  const initial=await persistentOwnerVerifier(request,environment)();
  if(!capability || !initial) return unavailable;
  const connection=await createLocalPersistentSupabaseAdapter(environment);
  if(connection.status!=="ready" || connection.composition.projectId!==composition.value.projectId
   || connection.composition.markerDigest!==composition.value.markerDigest) return unavailable;
  const perform=async(verified:typeof initial):Promise<Result>=>{
   const owner=verified.owner,token=readCustomerAuthSessionId(request);
   if(owner.projectId!==composition.value.projectId || owner.kind==="customer" && !token) return unavailable;
   const selector=owner.kind==="guest"?await hashGuestResourceCapability(owner.ownerId):owner.ownerId;
   if(!selector) return unavailable;
   const base={p_project_id:composition.value.projectId,p_marker_digest:composition.value.markerDigest,
    p_owner_kind:owner.kind,p_owner_selector:selector,p_customer_id:owner.kind==="customer"?owner.customerId:null,
    p_session_hash:owner.kind==="customer"?await hashOpaqueCustomerSessionToken(token!):null,
    p_authority_expires_at:new Date(Math.min(verified.expiresAt,capability.expiresAtSeconds)*1000).toISOString(),
    p_capability_hash:capability.digest,p_public_reference:reference,p_key_digest:action?await digest(action.fulfillmentActionId):null,
    p_expected_preview_version:action?.expectedPreviewVersion??null,p_note:action?.revisionNote??"",
    p_expected_aggregate_version:action?.expectedAggregateVersion??null};
   const rpc=async(operation:"read"|"prepare"|"approve_preview"|"request_revision"):Promise<Record<string,unknown>>=>{
    const result=await connection.adapter.callRestrictedRpc<unknown>("fulfillment_customer_command",{...base,p_operation:operation});
    return result.status==="found" && isRecord(result.value)?result.value:unavailable;
   };
   const project=(wire:Record<string,unknown>):Result=>{
    if(wire.status==="conflict")return conflict;
    const value=wire.status==="found"?projectPersistentCustomerPreview(wire.value,reference):null;
    return value && typeof wire.replayed==="boolean"?{status:"found",value,replayed:wire.replayed}:unavailable;
   };
   if(!action)return project(await rpc("read"));
   if(action.actionKind!=="approve_preview" && action.actionKind!=="request_revision")return unavailable;
   const operation=action.actionKind;
   const prepared=await rpc("prepare");
   if(prepared.status!=="found" || !isRecord(prepared.value))return unavailable;
   const p=prepared.value;
   if(typeof p.orderId!=="string" || !uuid.test(p.orderId) || typeof p.ownerId!=="string" || !uuid.test(p.ownerId)
    || typeof p.fulfillmentId!=="string" || !uuid.test(p.fulfillmentId))return unavailable;
   const authority={kind:"verified_server_authority" as const,projectId:base.p_project_id,ownerId:p.ownerId,
    actorKind:"customer" as const,actorId:p.ownerId};
   const fingerprint=await digest(JSON.stringify([reference,p.fulfillmentId,operation,base.p_expected_preview_version,
    base.p_expected_aggregate_version,base.p_note]));
   const port:LocalCommerceFulfillmentPort<Preview,Result,Action>={
    async readExact(){return {status:"unavailable",reason:"not_supported"};},
    async command(command){
     if(command.authority!==authority || command.internalOrderId!==p.orderId || command.publicReference!==reference
      || command.action!==action || command.expectedVersion!==action.expectedAggregateVersion
      || command.idempotency.key!==base.p_key_digest || command.idempotency.fingerprint!==fingerprint)
      return {status:"unavailable",reason:"invalid_authority"};
     const result=project(await rpc(operation));
     if(result.status==="conflict")return {status:"conflict",reason:"idempotency_mismatch"};
     return result.status==="found"?{status:"found",value:{state:result.value,result}}:{status:"unavailable",reason:"rejected"};
    },
   };
   const result=await port.command({authority,internalOrderId:p.orderId,publicReference:reference,action,
    expectedVersion:action.expectedAggregateVersion,idempotency:{key:base.p_key_digest!,fingerprint}});
   return result.status==="found"?result.value.result:result.status==="conflict"?conflict:unavailable;
  };
  const result=await perform(initial);
  if(result.status!=="unavailable" || initial.owner.kind!=="guest")return result;
  // Same independently verified member fallback as the canonical Order read.
  // It does not merge/claim a guest resource or use email as authority.
  const member=await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));
  if(member.status!=="ok" || !member.value.authenticated || !member.value.ownerId)return unavailable;
  const verified=await persistentOwnerVerifier(request,environment,{kind:"customer",projectId:composition.value.projectId,
   ownerId:member.value.ownerId,customerId:member.value.customer.id})();
  return verified?await perform(verified):unavailable;
 }catch{return unavailable;}
}
