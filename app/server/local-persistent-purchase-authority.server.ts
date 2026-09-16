import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { resolveGuestResourceOwner, type VerifiedResourceOwner } from "../application/guest-resource-ownership.server.ts";
import { createLocalPersistentCustomerAuthProvider } from "../application/customer-auth-persistent-provider.server.ts";
import { createConfiguredGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../lib/guest-draft-owner.ts";
import { readCustomerAuthSessionId } from "./customer-auth-http.server.ts";
import { readShoppingCartId } from "./shopping-cart-runtime.server.ts";
import { createLocalPersistentCartPort } from "../infrastructure/local-commerce/local-persistent-cart-adapter.server.ts";
import type { MediaOwnerVerifier } from "../infrastructure/local-commerce/local-persistent-media-authority.server.ts";
import { selectPersistentPurchaseCart } from "../application/persistent-purchase-owner.server.ts";
export { persistentPurchaseReceipts } from "../infrastructure/local-commerce/local-persistent-purchase-receipts.server.ts";

/** Fresh existing authority, pinned by SERVER composition, never request body. */
export function persistentOwnerVerifier(request: Request, environment: RuntimeEnvironment,
  expected?: VerifiedResourceOwner): MediaOwnerVerifier {
  return async () => {
    try {
      const c = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["cart"] });
      if (c.status !== "ready") return null;
      const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim())
        .find(v => v.startsWith(getGuestDraftOwnerCookieName() + "="));
      let verified: Awaited<ReturnType<MediaOwnerVerifier>> = null;
      if (cookie && expected?.kind !== "customer") {
        const r = await resolveGuestResourceOwner({ projectId: c.value.projectId,
          context: decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)),
          ownerService: createConfiguredGuestDraftOwnerService(environment) });
        if (r.status === "authorized") verified = { owner: r.owner, expiresAt: r.owner.expiresAt };
      } else if (expected?.kind !== "guest") {
        const session = await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));
        if (session.status === "ok" && session.value.authenticated && session.value.ownerId) {
          verified = { owner: { kind: "customer", projectId: c.value.projectId,
            ownerId: session.value.ownerId, customerId: session.value.customer.id },
            expiresAt: Date.parse(session.value.expiresAt) / 1000 };
        }
      }
      if (expected && (!verified || verified.owner.kind !== expected.kind || verified.owner.ownerId !== expected.ownerId
        || verified.owner.projectId !== expected.projectId || expected.kind === "customer"
          && (verified.owner.kind !== "customer" || verified.owner.customerId !== expected.customerId))) return null;
      return verified;
    } catch { return null; }
  };
}

/** Cart selection is a read through the unified owner-scoped port, not an
 * alternative Cart command port. No owner/resource is created by this read.
 */
export async function readPersistentPurchaseCart(request: Request, environment: RuntimeEnvironment = process.env) {
  const cartId = readShoppingCartId(request);
  const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["cart"] });
  if (composition.status !== "ready") return { status: "unavailable" } as const;
  if (!cartId) return { status: "empty" } as const;
  const result = await selectPersistentPurchaseCart({
    verifyInitialOwner: persistentOwnerVerifier(request, environment),
    verifyCustomerOwner: async () => {
      const session = await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));
      if (session.status !== "ok" || !session.value.authenticated || !session.value.ownerId) return null;
      const member: VerifiedResourceOwner = { kind: "customer", projectId: composition.value.projectId,
        customerId: session.value.customer.id, ownerId: session.value.ownerId };
      return persistentOwnerVerifier(request, environment, member)();
    },
    readExact: async selected => {
      const adapter = await createLocalPersistentCartPort({ environment, owner: selected.owner, authorityExpiresAt: selected.expiresAt });
      return adapter.status === "ready" ? adapter.port.read({ authority: adapter.authority, cartId })
        : { status: "unavailable" as const, reason: "source_failure" };
    },
  });
  if (result.status !== "found") return { status: "unavailable" } as const;
  return { status: "found", record: result.value.record, version: result.value.version,
    verifyOwner: persistentOwnerVerifier(request, environment, result.selected.owner), owner: result.selected.owner } as const;
}
