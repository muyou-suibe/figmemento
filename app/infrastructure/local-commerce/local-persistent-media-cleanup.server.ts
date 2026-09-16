import type { RuntimeEnvironment } from "../../config/server.ts";
import { resolveLocalPersistentComposition } from "../../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "./local-persistent-supabase-adapter.server.ts";

type Lease = {status:"leased";leaseToken:string;expiresAt:string;locator:string}
  | {status:"retained"|"completed"|"conflict"|"unavailable"|"failed"};
/** Internal server maintenance only; no HTTP route and no caller-supplied path.
 * DB owns eligibility, retention and fencing. Storage deletion is idempotent for
 * an immutable locator; failed cleanup never reactivates its receipt.
 */
export async function cleanupPersistentMedia(environment:RuntimeEnvironment, operationId:string, resource:"original"|"derivative"):
 Promise<{status:"completed"|"retained"|"conflict"|"unavailable"}> {
  try {
    const c=resolveLocalPersistentComposition(environment,{requiredCapabilities:["upload"]});
    if(c.status!=="ready" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(operationId)) return {status:"unavailable"};
    const db=await createLocalPersistentSupabaseAdapter(environment);
    if(db.status!=="ready") return {status:"unavailable"};
    const call=async(command:string,leaseToken:string|null=null):Promise<Lease>=>{
      const r=await db.adapter.callRestrictedRpc<Lease>("media_cleanup_command",{p_project_id:c.value.projectId,p_marker_digest:c.value.markerDigest,
        p_operation_id:operationId,p_resource:resource,p_command:command,p_lease_token:leaseToken});
      return r.status==="found" ? r.value : {status:"unavailable"};
    };
    const lease=await call("claim");
    if(lease.status!=="leased") return {status:lease.status==="failed"?"unavailable":lease.status};
    if(!lease.locator.startsWith(`${c.value.projectId}/media/`) || !Number.isFinite(Date.parse(lease.expiresAt))
      || Date.parse(lease.expiresAt)<=Date.now()) return {status:"unavailable"};
    const fenced=await call("check",lease.leaseToken);
    if(fenced.status!=="leased" || fenced.locator!==lease.locator) return {status:"conflict"};
    const deletion=await db.adapter.removePrivateObjects([lease.locator]);
    const result=await call(deletion.status==="found"?"complete":"fail",lease.leaseToken);
    return result.status==="completed" ? {status:"completed"} : {status:"unavailable"};
  } catch { return {status:"unavailable"}; }
}
