/** Cart mutation protection follows the existing exact-Origin convention. */
export function isSameOriginCartMutation(request: Request): boolean {
  const originValue = request.headers.get("origin");
  if (!originValue) return false;
  try {
    const origin = new URL(originValue);
    const destination = new URL(request.url);
    if (origin.origin !== destination.origin) return false;
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost && forwardedHost !== destination.host) return false;
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedProto && forwardedProto !== destination.protocol.slice(0, -1)) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return fetchSite === null || fetchSite === "same-origin";
  } catch {
    return false;
  }
}
