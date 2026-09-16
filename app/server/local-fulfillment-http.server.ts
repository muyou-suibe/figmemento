import { isSameOriginCartMutation } from "./cart-http.server.ts";

/**
 * Customer reads are side-effect-free, but remain explicitly scoped to the
 * same-origin request convention when the browser supplies fetch metadata.
 * Same-origin browser GETs may omit Origin; cross-site fetch metadata is still
 * rejected, while the protected Local Order capability remains required.
 */
export function isSameOriginLocalFulfillmentRequest(request: Request): boolean {
  if (request.headers.get("origin")) return isSameOriginCartMutation(request);
  const fetchSite = request.headers.get("sec-fetch-site");
  // A browser GET may omit Origin because the operation is side-effect-free.
  // Mutations require the existing exact-Origin convention.
  return request.method === "GET" && (fetchSite === null || fetchSite === "same-origin");
}
