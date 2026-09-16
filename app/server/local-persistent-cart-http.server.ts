import { readCartConfig } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { ensureGuestResourceOwner, resolveGuestResourceOwner, type VerifiedResourceOwner } from "../application/guest-resource-ownership.server.ts";
import { acceptCartItem, cartErrorResponse, publicCartWithCatalogRevalidation } from "../application/shopping-cart-service.ts";
import { toPublicShoppingCart } from "../domain/shopping-cart.ts";
import { createConfiguredGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../lib/guest-draft-owner.ts";
import { createLocalPersistentCartPort } from "../infrastructure/local-commerce/local-persistent-cart-adapter.server.ts";
import { LocalCatalogAuthority } from "../infrastructure/local-commerce/local-catalog-authority.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { readCustomerAuthSessionId } from "./customer-auth-http.server.ts";
import { createCustomerAuthRuntime } from "./customer-auth-runtime.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";
import { readShoppingCartId, cartCookieHeader } from "./shopping-cart-runtime.server.ts";
import { persistentOwnerVerifier, persistentPurchaseReceipts } from "./local-persistent-purchase-authority.server.ts";

export const persistentCartSelected = () => process.env.CART_SOURCE?.trim() === "local_persistent";

/** Existing HTTP projection over the unified authorized, versioned command port. */
export async function persistentCartHttp(request: Request, operation: "read" | "add" | "update" | "remove" | "clear", lineId?: string): Promise<Response> {
  if (operation !== "read" && !isSameOriginCartMutation(request)) return cartErrorResponse(403, "Cart request was not allowed.");
  try {
    if (readCartConfig().source !== "local_persistent") throw new Error("Source unavailable");
    const composition = resolveLocalPersistentComposition(process.env, { requiredCapabilities: ["cart"] });
    if (composition.status !== "ready") throw new Error("Composition unavailable");
    if ((await createLocalPersistentSupabaseAdapter(process.env)).status !== "ready") throw new Error("Project identity unavailable");
    const cartId = readShoppingCartId(request);
    if (!cartId && operation === "read") return Response.json({ status: "empty", lines: [] });
    if (!cartId && operation !== "add") return cartErrorResponse(404, "Cart line was not found.");
    const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(getGuestDraftOwnerCookieName() + "="));
    const guestContext = cookie ? decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)) : null;
    const guestService = createConfiguredGuestDraftOwnerService();
    let owner: VerifiedResourceOwner | undefined;
    let expiresAt = 0;
    let issuedContext: string | undefined;
    // Existing guest resources are never migrated or claimed by member sign-in.
    if (guestContext && cartId) {
      const guest = await resolveGuestResourceOwner({ projectId: composition.value.projectId, context: guestContext, ownerService: guestService });
      if (guest.status === "authorized") { owner = guest.owner; expiresAt = guest.owner.expiresAt; }
    }
    if (!owner) {
      const sessionToken = readCustomerAuthSessionId(request);
      if (sessionToken) {
        const session = await createCustomerAuthRuntime().provider.getSession(sessionToken);
        if (session.status !== "ok" || !session.value.authenticated || !session.value.ownerId) throw new Error("Session unavailable");
        owner = { kind: "customer", projectId: composition.value.projectId, ownerId: session.value.ownerId, customerId: session.value.customer.id };
        expiresAt = Date.parse(session.value.expiresAt) / 1000;
      } else if (!cartId && operation === "add") {
        const guest = await ensureGuestResourceOwner({ projectId: composition.value.projectId, context: guestContext, ownerService: guestService });
        if (guest.status !== "issued" && guest.status !== "authorized") throw new Error("Guest authority unavailable");
        owner = guest.owner; expiresAt = guest.owner.expiresAt;
        if (guest.status === "issued") issuedContext = guest.context;
      }
    }
    if (!owner) return cartErrorResponse(404, "Cart was not found.");
    // A just-issued signed guest context is verified identically before its
    // response cookie exists. No browser owner ID or unsigned substitute.
    const ownerHeaders = new Headers(request.headers);
    if (issuedContext) {
      const key = getGuestDraftOwnerCookieName();
      const remaining = (ownerHeaders.get("cookie") ?? "").split(";").map(value => value.trim())
        .filter(value => value && !value.startsWith(`${key}=`));
      ownerHeaders.set("cookie", [...remaining, `${key}=${encodeURIComponent(issuedContext)}`].join("; "));
    }
    const ownerRequest = new Request(request.url, { headers: ownerHeaders });
    let adapter = await createLocalPersistentCartPort({ environment: process.env, owner, authorityExpiresAt: expiresAt,
      verifyOwner: persistentOwnerVerifier(ownerRequest, process.env, owner) });
    if (adapter.status === "ready" && cartId && owner.kind === "guest") {
      const existing = await adapter.port.read({ authority: adapter.authority, cartId });
      if (existing.status === "unavailable" && existing.reason === "not_found") {
        // A stale guest cookie must not hide an independently member-owned Cart.
        // This probes exact ownership; it never transfers the guest resource.
        const session = await createCustomerAuthRuntime().provider.getSession(readCustomerAuthSessionId(request));
        if (session.status === "ok" && session.value.authenticated && session.value.ownerId) {
          owner = { kind: "customer", projectId: composition.value.projectId, ownerId: session.value.ownerId, customerId: session.value.customer.id };
          expiresAt = Date.parse(session.value.expiresAt) / 1000;
          adapter = await createLocalPersistentCartPort({ environment: process.env, owner, authorityExpiresAt: expiresAt,
            verifyOwner: persistentOwnerVerifier(ownerRequest, process.env, owner) });
        }
      }
    }
    if (adapter.status !== "ready") throw new Error("Cart unavailable");
    const { port, authority } = adapter;
    const idempotency = () => ({ key: crypto.randomUUID(), fingerprint: operation });
    const catalog = new LocalCatalogAuthority(process.env);
    // Validate before creating a Cart. Caller prices, identities and discounts are never copied.
    let body;
    try { body = operation === "add" || operation === "update" ? await request.json() : null; }
    catch { return cartErrorResponse(400, "Cart input is invalid."); }
    const accepted = operation === "add" ? await acceptCartItem(body?.handoff, {
      observedAt: new Date().toISOString(), catalogRepository: catalog.repository, customizationFieldRepository: catalog,
      verifiedOwnerId: owner.ownerId,
      receiptRepository: persistentPurchaseReceipts(process.env, persistentOwnerVerifier(ownerRequest, process.env, owner), [body?.handoff]),
    }) : null;
    if (accepted && accepted.status !== "accepted") return cartErrorResponse(accepted.reason === "source_failure" ? 503 : 400, "Configured item is invalid.");
    const current = cartId ? await port.read({ authority, cartId }) : await port.create({ authority, idempotency: idempotency() });
    if (current.status !== "found") return cartErrorResponse(current.status === "unavailable" && current.reason === "not_found" ? 404 : 503, "Cart is unavailable.");
    const context = { authority, cartId: current.value.cartId, expectedVersion: current.value.version, idempotency: idempotency() };
    const result = operation === "read" ? current
      : operation === "add" && accepted?.status === "accepted" ? await port.addLine({ ...context, item: accepted.value })
      : operation === "update" ? await port.updateLine({ ...context, lineId: lineId ?? "", quantity: body?.quantity })
      : operation === "remove" ? await port.removeLine({ ...context, lineId: lineId ?? "" })
      : await port.clear(context);
    if (result.status !== "found") return cartErrorResponse(result.status === "conflict" ? 409 : result.reason === "invalid_request" ? 400 : result.reason === "not_found" ? 404 : 503, "Cart request could not be completed.");
    const response = Response.json(operation === "read"
      ? await publicCartWithCatalogRevalidation(result.value.record, catalog.repository)
      : toPublicShoppingCart(result.value.record));
    if (!cartId) response.headers.append("set-cookie", cartCookieHeader(result.value.cartId));
    if (issuedContext) response.headers.append("set-cookie", guestService.getSetCookieHeader(issuedContext));
    return response;
  } catch { return cartErrorResponse(503, "Cart is temporarily unavailable."); }
}
