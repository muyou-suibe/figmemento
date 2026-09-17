import type { RuntimeEnvironment } from '../config/server.ts';
import type { LocalCommerceFulfillmentPort } from '../application/local-commerce-provider-ports.server.ts';
import { parsePersistentAdminTimeout } from '../application/local-persistent-admin-timeout-contract.server.ts';
import { resolveLocalPersistentComposition } from '../application/local-persistent-commerce-composition.server.ts';
import { createLocalPersistentSupabaseAdapter } from '../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts';
import { createExistingAdminMutationVerifier, isSameOriginAdminMutation } from './admin-catalog-http.server.ts';
import { projectPersistentFulfillment } from './local-persistent-fulfillment.server.ts';
import { isRecord } from '../domain/catalog/validation.ts';
import { resolveCanonicalLocalCommerceCapability } from '../config/server-runtime-composition.server.ts';

const unavailable = { status: 'unavailable' as const };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Action = NonNullable<ReturnType<typeof parsePersistentAdminTimeout>>;
export function projectAdminTimeout(raw: unknown, reference: string) {
  const fulfillment = projectPersistentFulfillment(raw, reference);
  if (!fulfillment || !isRecord(raw) || raw.decisionKind !== 'operator_timeout'
    || raw.actorId !== 'configured-admin' || typeof raw.manifestId !== 'string' || !uuid.test(raw.manifestId)
    || typeof raw.manifestVersion !== 'number' || ![1,2,3].includes(raw.manifestVersion)
    || typeof raw.reason !== 'string' || !raw.reason || raw.reason !== raw.reason.trim() || raw.reason.length > 500
    || typeof raw.confirmedAt !== 'string' || !Number.isFinite(Date.parse(raw.confirmedAt))
    || typeof raw.approvalDeadlineAt !== 'string' || !Number.isFinite(Date.parse(raw.approvalDeadlineAt))) return null;
  return {...fulfillment, decisionKind: 'operator_timeout' as const, actorId: raw.actorId,
    manifestId: raw.manifestId, manifestVersion: raw.manifestVersion, reason: raw.reason,
    confirmedAt: raw.confirmedAt, approvalDeadlineAt: raw.approvalDeadlineAt};
}

export async function persistentAdminTimeout(request: Request, reference: string, action: Action,
  environment: RuntimeEnvironment = process.env) {
  try {
    const verifier = createExistingAdminMutationVerifier(request);
    const actor = await verifier.verifyAdminSession();
    if (actor.status !== 'authorized' || actor.principal.role !== 'admin' || !isSameOriginAdminMutation(request)) return unavailable;
    // Narrow Task 7 command composition. It does not activate the broader
    // Admin Orders/Tracking/Delivery surface (Task 8), or alter fake Catalog.
    if (resolveCanonicalLocalCommerceCapability('admin', environment) !== 'selected') return unavailable;
    const composition = resolveLocalPersistentComposition(environment, {requiredCapabilities:['fulfillment']});
    if (composition.status !== 'ready' || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(reference)) return unavailable;
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== 'ready' || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return unavailable;
    const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), b => b.toString(16).padStart(2,'0')).join('');
    const key = await hash(action.fulfillmentActionId);
    const base = {p_project_id:composition.value.projectId, p_marker_digest:composition.value.markerDigest,
      p_actor_kind:'admin' as const, p_actor_id:actor.principal.identity, p_public_reference:reference,
      p_action:action.actionKind, p_expected_version:action.expectedAggregateVersion, p_key_digest:key,
      p_manifest_id:action.manifestId, p_manifest_version:action.expectedPreviewVersion, p_reason:action.reason};
    const rpc = async (operation: 'prepare'|'commit') => {
      // Permission replay is never inferred from an action ID or DB result.
      const current = await verifier.verifyAdminSession();
      if (current.status !== 'authorized' || current.principal.role !== 'admin'
        || current.principal.identity !== actor.principal.identity) return unavailable;
      const response = await connection.adapter.callRestrictedRpc<unknown>('fulfillment_admin_timeout_command', {...base,p_operation:operation});
      return response.status === 'found' && isRecord(response.value) ? response.value : unavailable;
    };
    const prepared = await rpc('prepare');
    if (prepared.status !== 'found' || !('value' in prepared) || !isRecord(prepared.value)) return unavailable;
    const p = prepared.value;
    if (typeof p.orderId !== 'string' || !uuid.test(p.orderId) || typeof p.ownerId !== 'string' || !uuid.test(p.ownerId)
      || typeof p.fulfillmentId !== 'string' || !uuid.test(p.fulfillmentId)) return unavailable;
    const authority = {kind:'verified_server_authority' as const,projectId:base.p_project_id,ownerId:p.ownerId,
      actorKind:'admin' as const,actorId:actor.principal.identity};
    const fingerprint = await hash(JSON.stringify([reference,p.fulfillmentId,action]));
    type Projection = NonNullable<ReturnType<typeof projectAdminTimeout>>;
    const port: LocalCommerceFulfillmentPort<Projection,{replayed:boolean},Action> = {
      async readExact() {return {status:'unavailable',reason:'not_supported'};},
      async command(command) {
        if (command.authority !== authority || command.internalOrderId !== p.orderId || command.publicReference !== reference
          || command.action !== action || command.expectedVersion !== action.expectedAggregateVersion
          || command.idempotency.key !== key || command.idempotency.fingerprint !== fingerprint)
          return {status:'unavailable',reason:'invalid_authority'};
        const result = await rpc('commit');
        if (result.status === 'conflict') return {status:'conflict',reason:'idempotency_mismatch'};
        const value = result.status === 'found' && 'value' in result ? projectAdminTimeout(result.value,reference) : null;
        return value && 'replayed' in result && typeof result.replayed === 'boolean'
          ? {status:'found',value:{state:value,result:{replayed:result.replayed}}} : {status:'unavailable',reason:'rejected'};
      },
    };
    const result = await port.command({authority,internalOrderId:p.orderId,publicReference:reference,action,
      expectedVersion:action.expectedAggregateVersion,idempotency:{key,fingerprint}});
    return result.status === 'found' ? {status:result.value.result.replayed ? 'replayed' as const : 'committed' as const,
      result:result.value.state} : result;
  } catch {return unavailable;}
}

export async function handlePersistentAdminTimeout(request: Request, reference: string) {
  const json = (value: unknown, status: number) => Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
  try {
    if (request.method !== 'POST') return json({status:'unavailable'},405);
    if ((await createExistingAdminMutationVerifier(request).verifyAdminSession()).status !== 'authorized') return json({status:'unauthorized'},401);
    if (!isSameOriginAdminMutation(request)) return json({status:'forbidden'},403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({status:'invalid_request'},400);
    const reader = request.body?.getReader();
    if (!reader) return json({status:'invalid_request'},400);
    let size=0; const chunks:Uint8Array[]=[];
    while (true) {const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
      if(size>16384){await reader.cancel();return json({status:'invalid_request'},400);}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const action=parsePersistentAdminTimeout(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
    if(!action)return json({status:'invalid_request'},400);
    const result=await persistentAdminTimeout(request,reference,action);
    return json(result.status==='unavailable'?unavailable:result,result.status==='unavailable'?404:result.status==='conflict'?409:200);
  } catch {return json(unavailable,404);}
}
