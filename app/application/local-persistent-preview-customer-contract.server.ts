import { parseLocalFulfillmentCustomerActionInput } from "./local-fulfillment-customer-service.ts";
import { LOCAL_FULFILLMENT_REVISION_NOTE_MAX_LENGTH } from "../domain/local-fulfillment.ts";
import { isRecord } from "../domain/catalog/validation.ts";

/** Persistent admission only. Reuses the existing trim/UTF-16 length policy;
 * it does not alter the optional-note behavior of the memory runtime. Parsed
 * identifiers remain selectors, never customer or manifest authority. */
export function parsePersistentPreviewCustomerAction(value: unknown, reference: string) {
  if(!isRecord(value) || typeof value.expectedAggregateVersion!=="number"
    || !Number.isSafeInteger(value.expectedAggregateVersion) || value.expectedAggregateVersion<1) {
    return {ok:false as const,issues:[{path:"$.expectedAggregateVersion",code:"invalid_format" as const,
      message:"The observed aggregate version is required."}]};
  }
  const {expectedAggregateVersion,...customerInput}=value;
  const parsed = parseLocalFulfillmentCustomerActionInput(customerInput, reference);
  if (!parsed.ok) return parsed;
  if (parsed.value.actionKind === "request_revision"
    && (typeof parsed.value.revisionNote !== "string" || !parsed.value.revisionNote
      || parsed.value.revisionNote.length > LOCAL_FULFILLMENT_REVISION_NOTE_MAX_LENGTH)) {
    return { ok: false as const, issues: [{path: "$.revisionNote", code: "invalid_format" as const,
      message: "A non-empty revision note within the permitted length is required."}] };
  }
  return {ok:true as const,value:{...parsed.value,expectedAggregateVersion}};
}
