import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createPersistentOrderCapabilityCodec, readPersistentOrderCapabilityCookie } from "./local-order-capability.server.ts";
import { persistentOwnerVerifier } from "./local-persistent-purchase-authority.server.ts";
import { hashGuestResourceCapability } from "../application/guest-resource-ownership.server.ts";
import { hashOpaqueCustomerSessionToken } from "../application/customer-auth-session-persistence.server.ts";
import { readCustomerAuthSessionId } from "./customer-auth-http.server.ts";
import { createLocalPersistentCustomerAuthProvider } from "../application/customer-auth-persistent-provider.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";

const REFERENCE=/^FM-LOCAL-[A-Z0-9]{16}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,"0")).join("");}
async function digest(value:string){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));}
function opaqueToken(){return hex(crypto.getRandomValues(new Uint8Array(32)).buffer);}
async function body(request:Request){const declared=Number(request.headers.get("content-length")??"0");if(Number.isFinite(declared)&&declared>2048)throw new Error();const text=await request.text();if(new TextEncoder().encode(text).byteLength>2048)throw new Error();return JSON.parse(text) as unknown;}

export async function handleLocalPersistentDigitalTicketIssue(request:Request,publicReference:string,environment:RuntimeEnvironment=process.env):Promise<Response>{
 const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{"cache-control":"private, no-store","referrer-policy":"no-referrer"}});
 if(request.method!=="POST")return reply({status:"unavailable"},405);if(!isSameOriginCartMutation(request))return reply({status:"unavailable"},403);if(!REFERENCE.test(publicReference))return reply({status:"unavailable"},404);
 let raw:unknown;try{raw=await body(request);}catch{return reply({status:"invalid_request"},400);}
 if(!isRecord(raw)||Object.keys(raw).some(key=>!["orderItemId","grantId"].includes(key))||!UUID.test(String(raw.orderItemId))||!UUID.test(String(raw.grantId)))return reply({status:"invalid_request"},400);
 try{
  const composition=resolveLocalPersistentComposition(environment,{requiredCapabilities:["delivery"]});if(composition.status!=="ready")return reply({status:"unavailable"},503);
  const codec=await createPersistentOrderCapabilityCodec(environment,composition.value);const capability=await codec?.verify(readPersistentOrderCapabilityCookie(request),Math.floor(Date.now()/1000));const initial=await persistentOwnerVerifier(request,environment)();if(!capability||!initial)return reply({status:"unavailable"},404);
  const connection=await createLocalPersistentSupabaseAdapter(environment);if(connection.status!=="ready"||connection.composition.projectId!==composition.value.projectId||connection.composition.markerDigest!==composition.value.markerDigest)return reply({status:"unavailable"},503);
  const issue=async(verified:typeof initial)=>{const owner=verified.owner,sessionToken=readCustomerAuthSessionId(request);if(owner.projectId!==composition.value.projectId||owner.kind==="customer"&&!sessionToken)return null;const selector=owner.kind==="guest"?await hashGuestResourceCapability(owner.ownerId):owner.ownerId;if(!selector)return null;const ticket=opaqueToken(),ticketHash=await digest(ticket);const rpc=await connection.adapter.callRestrictedRpc<unknown>("digital_ticket_issue",{p_project_id:composition.value.projectId,p_marker_digest:composition.value.markerDigest,p_owner_kind:owner.kind,p_owner_selector:selector,p_customer_id:owner.kind==="customer"?owner.customerId:null,p_session_hash:owner.kind==="customer"?await hashOpaqueCustomerSessionToken(sessionToken!):null,p_authority_expires_at:new Date(Math.min(verified.expiresAt,capability.expiresAtSeconds)*1000).toISOString(),p_capability_hash:capability.digest,p_public_reference:publicReference,p_order_item_id:String(raw.orderItemId),p_grant_id:String(raw.grantId),p_ticket_hash:ticketHash});if(rpc.status!=="found"||!isRecord(rpc.value)||rpc.value.status!=="found"||!isRecord(rpc.value.value))return null;const value=rpc.value.value;if(!UUID.test(String(value.ticketId))||!Number.isFinite(Date.parse(String(value.issuedAt)))||!Number.isFinite(Date.parse(String(value.expiresAt)))||Date.parse(String(value.expiresAt))<=Date.parse(String(value.issuedAt))||Date.parse(String(value.expiresAt))-Date.parse(String(value.issuedAt))>600_000)return null;return{status:"issued" as const,ticket,expiresAt:String(value.expiresAt)};};
  let result=await issue(initial);if(!result&&initial.owner.kind==="guest"){const session=await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));if(session.status==="ok"&&session.value.authenticated&&session.value.ownerId){const verified=await persistentOwnerVerifier(request,environment,{kind:"customer",projectId:composition.value.projectId,ownerId:session.value.ownerId,customerId:session.value.customer.id})();if(verified)result=await issue(verified);}}
  return result?reply(result,200):reply({status:"unavailable"},404);
 }catch{return reply({status:"unavailable"},503);}
}
