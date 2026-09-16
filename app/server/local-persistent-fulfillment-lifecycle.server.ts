import type { RuntimeEnvironment } from '../config/server.ts';
import type { LocalCommerceFulfillmentPort } from '../application/local-commerce-provider-ports.server.ts';
import { resolveLocalPersistentComposition } from '../application/local-persistent-commerce-composition.server.ts';
import { createLocalPersistentSupabaseAdapter } from '../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts';
import { createLocalFulfillmentDevelopmentOperatorVerifier } from './local-fulfillment-development-operator.server.ts';
import { projectPersistentFulfillment } from './local-persistent-fulfillment.server.ts';
import { isRecord } from '../domain/catalog/validation.ts';
type Action={fulfillmentActionId:string;actionKind:'start_production'|'mark_quality_check';expectedAggregateVersion:number};
const unavailable={status:'unavailable' as const};
export function parsePersistentLifecycleAction(raw:unknown):Action|null{
 if(!isRecord(raw)||Object.keys(raw).some(k=>!['fulfillmentActionId','actionKind','expectedAggregateVersion'].includes(k))
  ||typeof raw.fulfillmentActionId!=='string'||!/^[A-Za-z0-9_-]{16,200}$/.test(raw.fulfillmentActionId)
  ||!['start_production','mark_quality_check'].includes(String(raw.actionKind))
  ||typeof raw.expectedAggregateVersion!=='number'||!Number.isSafeInteger(raw.expectedAggregateVersion)||raw.expectedAggregateVersion<1)return null;
 return {fulfillmentActionId:raw.fulfillmentActionId,actionKind:raw.actionKind as Action['actionKind'],expectedAggregateVersion:raw.expectedAggregateVersion};
}
export async function persistentFulfillmentLifecycle(reference:string,action:Action,environment:RuntimeEnvironment=process.env){
 try{
  const composition=resolveLocalPersistentComposition(environment,{requiredCapabilities:['fulfillment']});
  const actor=createLocalFulfillmentDevelopmentOperatorVerifier().verify();
  if(composition.status!=='ready'||!actor||actor.actorKind!=='operator'||!/^FM-LOCAL-[A-Z0-9]{16}$/.test(reference))return unavailable;
  const connection=await createLocalPersistentSupabaseAdapter(environment);
  if(connection.status!=='ready'||connection.composition.projectId!==composition.value.projectId||connection.composition.markerDigest!==composition.value.markerDigest)return unavailable;
  const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
  const key=await hash(action.fulfillmentActionId);
  const base={p_project_id:composition.value.projectId,p_marker_digest:composition.value.markerDigest,p_actor_kind:actor.actorKind,
   p_actor_id:actor.actorContextId,p_public_reference:reference,p_action:action.actionKind,p_expected_version:action.expectedAggregateVersion,p_key_digest:key};
  const rpc=async(operation:'prepare'|'commit')=>{
   const current=createLocalFulfillmentDevelopmentOperatorVerifier().verify();
   if(current?.actorKind!==actor.actorKind||current.actorContextId!==actor.actorContextId)return unavailable;
   const r=await connection.adapter.callRestrictedRpc<unknown>('fulfillment_lifecycle_command',{...base,p_operation:operation});
   return r.status==='found'&&isRecord(r.value)?r.value:unavailable;
  };
  const prepared=await rpc('prepare');
  if(prepared.status!=='found'||!('value' in prepared)||!isRecord(prepared.value))return unavailable;
  const p=prepared.value,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if(typeof p.orderId!=='string'||!uuid.test(p.orderId)||typeof p.ownerId!=='string'||!uuid.test(p.ownerId)||typeof p.fulfillmentId!=='string'||!uuid.test(p.fulfillmentId))return unavailable;
  const authority={kind:'verified_server_authority' as const,projectId:base.p_project_id,ownerId:p.ownerId,actorKind:'operator' as const,actorId:actor.actorContextId};
  const fingerprint=await hash(JSON.stringify([reference,p.fulfillmentId,action.actionKind,action.expectedAggregateVersion]));
  type Projection=NonNullable<ReturnType<typeof projectPersistentFulfillment>>;
  const port:LocalCommerceFulfillmentPort<Projection,{replayed:boolean},Action>={
   async readExact(){return {status:'unavailable',reason:'not_supported'};},
   async command(command){
    if(command.authority!==authority||command.internalOrderId!==p.orderId||command.publicReference!==reference
     ||command.action!==action||command.expectedVersion!==action.expectedAggregateVersion
     ||command.idempotency.key!==key||command.idempotency.fingerprint!==fingerprint)return {status:'unavailable',reason:'invalid_authority'};
    const r=await rpc('commit');
    if(r.status==='conflict')return {status:'conflict',reason:'version_mismatch'};
    const value=r.status==='found'&&'value' in r?projectPersistentFulfillment(r.value,reference):null;
    return value&&'replayed' in r&&typeof r.replayed==='boolean'?{status:'found',value:{state:value,result:{replayed:r.replayed}}}:{status:'unavailable',reason:'rejected'};
   },
  };
  const result=await port.command({authority,internalOrderId:p.orderId,publicReference:reference,action,expectedVersion:action.expectedAggregateVersion,idempotency:{key,fingerprint}});
  return result.status==='found'?{status:result.value.result.replayed?'replayed' as const:'committed' as const,value:result.value.state}:result;
 }catch{return unavailable;}
}
