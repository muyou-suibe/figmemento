import { createPersistentPreviewOperator } from "./local-persistent-preview-media.server.ts";
import { isSameOriginLocalFulfillmentRequest } from "./local-fulfillment-http.server.ts";
import { readBoundedImageBody, readBoundedSingleImage, LOCAL_IMAGE_MAX_BYTES } from "./local-commerce-image-processing.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";

const response=(value:unknown,status:number)=>Response.json(value,{status,headers:{"cache-control":"no-store"}});
const unavailable=()=>response({status:"unavailable"},404);

/** Separate production-preview input, not the customer receipt endpoint.
 * Public selectors never contain owner, locator, version allocation or trusted
 * metadata. expectedVersion is a CAS assertion, not a version assignment. */
export async function persistentPreviewHttp(request:Request,reference:string):Promise<Response> {
  try {
    if(!isSameOriginLocalFulfillmentRequest(request)) return response({status:"unavailable"},403);
    if(request.method!=="POST") return response({status:"unavailable"},405);
    const operator=await createPersistentPreviewOperator(reference);
    if(!operator) return unavailable();
    const url=new URL(request.url),query=[...url.searchParams.keys()];
    let result:Record<string,unknown>;
    if(request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      if(query.length!==3 || new Set(query).size!==3 || query.some(k=>!["orderItemId","actionId","expectedVersion"].includes(k)))
        return response({status:"unavailable"},400);
      const expected=url.searchParams.get("expectedVersion")??"";
      if(!/^[1-9][0-9]{0,8}$/.test(expected)) return response({status:"unavailable"},400);
      const file=await readBoundedSingleImage(request,LOCAL_IMAGE_MAX_BYTES);
      if(!file) return response({status:"unavailable"},400);
      result=await operator.upload(url.searchParams.get("orderItemId")??"",url.searchParams.get("actionId")??"",Number(expected),new Uint8Array(await file.arrayBuffer()));
    } else {
      if(query.length || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return response({status:"unavailable"},400);
      const bytes=await readBoundedImageBody(request.body,16*1024);
      if(!bytes) return response({status:"unavailable"},400);
      const raw:unknown=JSON.parse(new TextDecoder().decode(bytes));
      if(!isRecord(raw) || Object.keys(raw).length!==3 || Object.keys(raw).some(k=>!["actionId","expectedVersion","entries"].includes(k))
        || typeof raw.actionId!=="string" || !Number.isSafeInteger(raw.expectedVersion) || Number(raw.expectedVersion)<1
        || !Array.isArray(raw.entries) || raw.entries.some(e=>!isRecord(e) || typeof e.orderItemId!=="string" || typeof e.previewMediaId!=="string"))
        return response({status:"unavailable"},400);
      result=await operator.publish(raw.actionId,Number(raw.expectedVersion),raw.entries);
    }
    // The RPC's mutation result is already a bounded safe projection. Explicit
    // projection below ensures internal acquire/read context cannot leak.
    if(result.status!=="found" || !isRecord(result.value)) return result.status==="conflict"?response({status:"conflict"},409):unavailable();
    const v=result.value;
    const safe:Record<string,unknown>={};
    for(const key of ["previewMediaId","orderItemId","manifestId","manifestVersion","state","contentType","width","height","publicReference","status","version","revisionRequestsUsed"])
      if(v[key]!==undefined) safe[key]=v[key];
    if(Array.isArray(v.entries)) safe.entries=v.entries.map(e=>isRecord(e)?{
      orderItemId:e.orderItemId,previewMediaId:e.previewMediaId,contentType:e.contentType,width:e.width,height:e.height,
    }:null);
    return response({status:result.replayed===true?"replayed":"committed",value:safe},200);
  } catch {return unavailable();}
}
