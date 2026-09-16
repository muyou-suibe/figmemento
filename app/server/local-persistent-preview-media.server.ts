import type { RuntimeEnvironment } from "../config/server.ts";
import type { LocalCommerceFulfillmentPort } from "../application/local-commerce-provider-ports.server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createLocalFulfillmentDevelopmentOperatorVerifier } from "./local-fulfillment-development-operator.server.ts";
import { validatePersistentHistoryModel, type CanonicalPersistentHistory } from "../application/local-order-consumer-projections.server.ts";
import { persistentPhotoReviewApplicability } from "../application/local-persistent-photo-review.server.ts";
import { preparePersistentPreviewManifest, type PersistentPreviewArtifact } from "../application/local-persistent-preview-manifest.server.ts";
import { processLocalCommerceImage, readBoundedImageBody, LOCAL_IMAGE_MAX_BYTES } from "./local-commerce-image-processing.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const unavailable={status:"unavailable" as const};
type Wire = Record<string,unknown>;
type Mutation = "reserve" | "ready" | "publish";
type Command = {operation:Mutation | `probe_${Mutation}`; input:Readonly<Record<string,unknown>>};
export async function previewBytesDigest(bytes:Uint8Array):Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes as BufferSource)),b=>b.toString(16).padStart(2,"0")).join("");
}
const digestText=(value:string)=>previewBytesDigest(new TextEncoder().encode(value));

/** No HTTP input may supply canonical metadata or a private locator. This
 * factory is local-only and requires the independent existing operator gate
 * before constructing any service transport. Every later call rechecks it. */
export async function createPersistentPreviewOperator(reference:string, environment:RuntimeEnvironment=process.env) {
  try {
    const composition=resolveLocalPersistentComposition(environment,{requiredCapabilities:["fulfillment"]});
    const actor=createLocalFulfillmentDevelopmentOperatorVerifier().verify();
    if(composition.status!=="ready" || !["development","test"].includes(process.env.NODE_ENV??"")
      || !actor || actor.actorKind!=="operator" || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(reference)) return null;
    const connection=await createLocalPersistentSupabaseAdapter(environment);
    if(connection.status!=="ready" || connection.composition.projectId!==composition.value.projectId
      || connection.composition.markerDigest!==composition.value.markerDigest) return null;
    const adapter=connection.adapter;
    const base={p_project_id:composition.value.projectId,p_marker_digest:composition.value.markerDigest,
      p_actor_kind:"operator" as const,p_actor_id:actor.actorContextId,p_public_reference:reference};
    async function rpc(operation:"read"|"acquire"|Command["operation"], fulfillmentId:string|null,
      version:number|null,key:string|null,input:Readonly<Record<string,unknown>>):Promise<Wire> {
      const current=createLocalFulfillmentDevelopmentOperatorVerifier().verify();
      if(current?.actorKind!=="operator" || current.actorContextId!==actor!.actorContextId) return unavailable;
      const result=await adapter.callRestrictedRpc<unknown>("fulfillment_preview_command",{
        ...base,p_operation:operation,p_fulfillment_id:fulfillmentId,p_expected_version:version,p_key_digest:key,p_input:input});
      return result.status==="found" && isRecord(result.value)?result.value:unavailable;
    }
    const context=await rpc("read",null,null,null,{});
    if(context.status!=="found" || !isRecord(context.value)) return null;
    const c=context.value;
    // Only the restricted durable read allocates the next manifest version.
    // Null permits committed-action probes only, never new media/publication.
    if(c.targetManifestVersion!==null && c.targetManifestVersion!==1
      && c.targetManifestVersion!==2 && c.targetManifestVersion!==3) return null;
    const targetManifestVersion=c.targetManifestVersion;
    if(typeof c.orderId!=="string" || !uuid.test(c.orderId) || typeof c.ownerId!=="string" || !uuid.test(c.ownerId)
      || typeof c.fulfillmentId!=="string" || !uuid.test(c.fulfillmentId) || !Array.isArray(c.items)) return null;
    const {orderId,ownerId,fulfillmentId}=c;
    const histories:CanonicalPersistentHistory[]=[];
    for(const raw of c.items) {
      const h=validatePersistentHistoryModel(raw);
      if(h.status!=="found" || h.value.orderId!==orderId || h.value.publicReference!==reference) return null;
      histories.push(h.value);
    }
    const policy=persistentPhotoReviewApplicability(histories);
    if(policy.status!=="found") return null;
    const authority={kind:"verified_server_authority" as const,projectId:base.p_project_id,ownerId,
      actorKind:"operator" as const,actorId:actor.actorContextId};
    // Same application-facing command contract: authorization, CAS and durable
    // idempotency are mandatory. Repository transport is never an HTTP port.
    const port:LocalCommerceFulfillmentPort<Wire,Wire,Command>={
      async readExact(){return {status:"unavailable",reason:"not_supported"};},
      async command(input) {
        if(input.authority!==authority || input.internalOrderId!==orderId || input.publicReference!==reference
          || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion<1
          || input.idempotency.fingerprint!==await digestText(JSON.stringify(input.action.input)))
          return {status:"unavailable",reason:"invalid_authority"};
        const wire=await rpc(input.action.operation,fulfillmentId,input.expectedVersion,input.idempotency.key,input.action.input);
        return {status:"found",value:{state:wire,result:wire}};
      },
    };
    async function command(operation:Command["operation"],key:string,version:number,input:Readonly<Record<string,unknown>>):Promise<Wire> {
      const result=await port.command({authority,internalOrderId:orderId,publicReference:reference,expectedVersion:version,
        idempotency:{key,fingerprint:await digestText(JSON.stringify(input))},action:{operation,input}});
      return result.status==="found"?result.value.result:unavailable;
    }
    async function acquire(id:string, canonicalVersion:1|2|3) {
      if(!uuid.test(id)) return null;
      const result=await rpc("acquire",fulfillmentId,null,null,{previewMediaId:id});
      if(result.status!=="found" || !isRecord(result.value)) return null;
      const m=result.value;
      if(m.project_id!==base.p_project_id || m.owner_id!==ownerId || m.order_id!==orderId
        || m.fulfillment_id!==fulfillmentId || m.id!==id || m.manifest_version!==canonicalVersion
        || m.object_locator!==`production-preview/${orderId}/${id}.png`) return null;
      return m;
    }
    async function privateBytes(id:string) {
      const result=await adapter.downloadPrivateObject(`production-preview/${orderId}/${id}.png`);
      if(result.status!=="found" || result.value.size>90*1024*1024) return null;
      return readBoundedImageBody(result.value.stream(),90*1024*1024);
    }
    return {
      async upload(itemId:string,actionId:string,expectedVersion:number,bytes:Uint8Array):Promise<Wire> {
        try {
          if(!uuid.test(itemId) || !/^[A-Za-z0-9_-]{8,200}$/.test(actionId) || bytes.length<1
            || bytes.length>LOCAL_IMAGE_MAX_BYTES || !policy.value.previewRequiredItemIds.includes(itemId)) return unavailable;
          const key=await digestText(actionId);
          const input={orderItemId:itemId,inputDigest:await previewBytesDigest(bytes)};
          const prior=await command("probe_reserve",key,expectedVersion,input);
          if(prior.status==="not_found" && targetManifestVersion===null) return unavailable;
          const reservation=prior.status==="not_found"?await command("reserve",key,expectedVersion,input):prior;
          if(reservation.status!=="found" || !isRecord(reservation.value)) return reservation;
          const id=reservation.value.previewMediaId;
          if(typeof id!=="string" || !uuid.test(id)) return unavailable;
          const reservedVersion=reservation.value.manifestVersion;
          if(reservedVersion!==1 && reservedVersion!==2 && reservedVersion!==3) return unavailable;
          // A historical committed reservation can recover a committed ready
          // result only. It cannot obtain new-version authority from its ID.
          if(!reservation.replayed && reservedVersion!==targetManifestVersion) return unavailable;
          const stored=await acquire(id,reservedVersion);
          if(!stored) return unavailable;
          if(stored.order_item_id!==itemId) return unavailable;
          // A committed ready action is recovered before helper/new writes.
          const readyKey=await digestText(`preview_ready:${actionId}`);
          if(stored.lifecycle==="ready") {
            return command("probe_ready",readyKey,expectedVersion,{previewMediaId:id,contentDigest:stored.content_digest,
              contentType:stored.content_type,byteSize:stored.byte_size,width:stored.width,height:stored.height});
          }
          if(targetManifestVersion===null || reservedVersion!==targetManifestVersion) return unavailable;
          const processed=await processLocalCommerceImage(environment,bytes,{allowedMimeTypes:["image/jpeg","image/png","image/webp"],
            maxBytes:LOCAL_IMAGE_MAX_BYTES,minDimensions:{width:1,height:1},minImageCount:1,maxImageCount:1,cropEnabled:false});
          if(processed.status!=="processed") return unavailable;
          const digest=await previewBytesDigest(processed.png);
          // No overwrite, no DELETE and no automatic public URL. Existing bytes
          // after a lost write response must independently match read-back.
          await adapter.uploadPrivateObject(`production-preview/${orderId}/${id}.png`,new Blob([processed.png as BlobPart]),"image/png");
          const readback=await privateBytes(id);
          if(!readback || readback.length!==processed.png.length || await previewBytesDigest(readback)!==digest) return unavailable;
          return command("ready",readyKey,expectedVersion,{previewMediaId:id,contentDigest:digest,contentType:"image/png",
            byteSize:readback.length,width:processed.outputDimensions.width,height:processed.outputDimensions.height});
        } catch {return unavailable;}
      },
      async publish(actionId:string,expectedVersion:number,entries:readonly {orderItemId:string;previewMediaId:string}[]):Promise<Wire> {
        try {
          if(!/^[A-Za-z0-9_-]{8,200}$/.test(actionId) || !Array.isArray(entries) || entries.length>100
            || entries.some(e=>!e || !uuid.test(e.orderItemId) || !uuid.test(e.previewMediaId)
              || Object.keys(e).some(k=>k!=="orderItemId" && k!=="previewMediaId"))) return unavailable;
          const normalized=[...entries].sort((a,b)=>a.orderItemId.localeCompare(b.orderItemId))
            .map(e=>({orderItemId:e.orderItemId,previewMediaId:e.previewMediaId}));
          const key=await digestText(actionId), input={entries:normalized};
          const replay=await command("probe_publish",key,expectedVersion,input);
          if(replay.status!=="not_found") return replay;
          if(targetManifestVersion===null) return unavailable;
          const artifacts:PersistentPreviewArtifact[]=[];
          for(const e of normalized) {
            const m=await acquire(e.previewMediaId,targetManifestVersion);
            if(!m || m.lifecycle!=="ready" || m.order_item_id!==e.orderItemId) return unavailable;
            const bytes=await privateBytes(e.previewMediaId);
            if(!bytes || bytes.length!==m.byte_size || await previewBytesDigest(bytes)!==m.content_digest) return unavailable;
            artifacts.push({projectId:base.p_project_id,ownerId,orderId,fulfillmentId,orderItemId:e.orderItemId,
              manifestVersion:targetManifestVersion,previewMediaId:e.previewMediaId,state:"ready",digest:String(m.content_digest),
              byteSize:Number(m.byte_size),width:Number(m.width),height:Number(m.height),contentType:m.content_type as "image/png"});
          }
          if(preparePersistentPreviewManifest({projectId:base.p_project_id,ownerId,orderId,fulfillmentId,
            manifestVersion:targetManifestVersion,items:histories,artifacts}).status!=="found") return unavailable;
          return command("publish",key,expectedVersion,input);
        } catch {return unavailable;}
      },
    };
  } catch {return null;}
}
