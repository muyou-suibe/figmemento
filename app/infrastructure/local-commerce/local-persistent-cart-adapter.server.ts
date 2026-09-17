import type { RuntimeEnvironment } from "../../config/server.ts";
import type { VerifiedResourceOwner } from "../../application/guest-resource-ownership.server.ts";
import { hashGuestResourceCapability } from "../../application/guest-resource-ownership.server.ts";
import { isExpectedVersion, isIdempotencyContext, type LocalCommerceCartPort, type LocalCommerceCartState, type LocalCommercePortResult, type VerifiedAuthorityContext } from "../../application/local-commerce-provider-ports.server.ts";
import { resolveLocalPersistentComposition } from "../../application/local-persistent-commerce-composition.server.ts";
import { acceptCartItem } from "../../application/shopping-cart-service.ts";
import { parseCartQuantity, type AcceptedCartItem } from "../../domain/shopping-cart.ts";
import { LocalCatalogAuthority } from "./local-catalog-authority.server.ts";
import { createLocalPersistentSupabaseAdapter, type LocalPersistentSupabaseClientFactory } from "./local-persistent-supabase-adapter.server.ts";
import type { MediaOwnerVerifier } from "./local-persistent-media-authority.server.ts";
import { persistentPurchaseReceipts } from "./local-persistent-purchase-receipts.server.ts";

type Result = LocalCommercePortResult<LocalCommerceCartState>;
const unavailable = (reason: "invalid_authority" | "invalid_request" | "source_failure" | "rejected" | "not_supported"): Result => ({ status: "unavailable", reason });
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Internal storage seam. Not exported; only the unified command adapter uses it. */
class OwnerScopedCartStore {
  private readonly invoke: CartCall;
  constructor(invoke: CartCall) { this.invoke = invoke; }
  execute(input: Parameters<CartCall>[0]) { return this.invoke(input); }
}
type CartCall = (input: {
  operation: "read" | "create" | "add" | "update" | "remove" | "clear";
  authority: VerifiedAuthorityContext; expectedVersion: number;
  idempotency?: { key: string; fingerprint: string };
  cartId?: string; lineId?: string; item?: AcceptedCartItem; quantity?: number;
}) => Promise<Result>;

/** A request-scoped adapter over the one existing application-facing Cart port. */
export async function createLocalPersistentCartPort(input: {
  environment: RuntimeEnvironment;
  owner: VerifiedResourceOwner;
  authorityExpiresAt: number;
  clientFactory?: LocalPersistentSupabaseClientFactory;
  /** Existing request/session verifier, required for private receipt admission. */
  verifyOwner?: MediaOwnerVerifier;
}): Promise<{ status: "ready"; port: LocalCommerceCartPort; authority: VerifiedAuthorityContext } | { status: "unavailable" }> {
  try {
    const composition = resolveLocalPersistentComposition(input.environment, { requiredCapabilities: ["cart"] });
    if (composition.status !== "ready" || input.owner.projectId !== composition.value.projectId
      || !Number.isFinite(input.authorityExpiresAt) || input.authorityExpiresAt <= Date.now() / 1000
      || (input.owner.kind === "guest" && input.authorityExpiresAt > input.owner.expiresAt)) return { status: "unavailable" };
    const connection = await createLocalPersistentSupabaseAdapter(input.environment, { clientFactory: input.clientFactory });
    if (connection.status !== "ready") return { status: "unavailable" };
    const selector = input.owner.kind === "guest" ? await hashGuestResourceCapability(input.owner.ownerId) : input.owner.ownerId;
    if (!selector) return { status: "unavailable" };
    const authority: VerifiedAuthorityContext = Object.freeze({ kind: "verified_server_authority", projectId: input.owner.projectId,
      ownerId: input.owner.ownerId, actorKind: "customer", actorId: input.owner.kind === "customer" ? input.owner.customerId : input.owner.ownerId });
    const catalog = new LocalCatalogAuthority(input.environment, input.clientFactory);
    const store = new OwnerScopedCartStore(async command => {
      try {
        if (input.verifyOwner) {
          const current = await input.verifyOwner();
          if (!current || current.owner.projectId !== input.owner.projectId || current.owner.ownerId !== input.owner.ownerId
            || current.owner.kind !== input.owner.kind || current.expiresAt <= Date.now() / 1000
            || (input.owner.kind === "customer" && (current.owner.kind !== "customer" || current.owner.customerId !== input.owner.customerId))) return unavailable("invalid_authority");
        }
        if (!command.authority || Object.keys(authority).some(key => command.authority[key as keyof VerifiedAuthorityContext] !== authority[key as keyof VerifiedAuthorityContext])
          || Date.now() / 1000 >= input.authorityExpiresAt) return unavailable("invalid_authority");
        if (!isExpectedVersion(command.expectedVersion) || (command.operation !== "read" && !isIdempotencyContext(command.idempotency))
          || (command.operation !== "create" && (!command.cartId || !uuid(command.cartId)))
          || (command.lineId !== undefined && !uuid(command.lineId))) return unavailable("invalid_request");
        let item = command.item;
        const invoke = (operation: string) => connection.adapter.callRestrictedRpc<Result>("cart_command", {
          p_project_id: authority.projectId, p_marker_digest: composition.value.markerDigest,
          p_owner_kind: input.owner.kind, p_owner_selector: selector,
          p_customer_id: input.owner.kind === "customer" ? input.owner.customerId : null,
          p_authority_expires_at: new Date(input.authorityExpiresAt * 1000).toISOString(),
          p_operation: operation, p_cart_id: command.cartId ?? null, p_line_id: command.lineId ?? null,
          p_expected_version: command.expectedVersion, p_command_key: command.idempotency?.key ?? null,
          p_fingerprint: command.idempotency?.fingerprint ?? null, p_item: item ?? null, p_quantity: command.quantity ?? null,
        });
        const decode = (result: { status: string; value?: Result }): Result => {
          if (result.status !== "found" || !result.value) return unavailable("source_failure");
          if (result.value.status === "found") {
            const state = result.value.value;
            if (!state || !uuid(state.cartId) || !isExpectedVersion(state.version) || !state.record
              || state.record.cartId !== state.cartId || !Array.isArray(state.record.lines)) return unavailable("source_failure");
            return { status: "found", value: { ...state, projectId: authority.projectId, ownerId: authority.ownerId } };
          }
          if (result.value.status === "unavailable" || result.value.status === "conflict") return result.value;
          return unavailable("source_failure");
        };
        if (command.operation === "add") {
          // Internal read-only replay probe: historical results do not depend on
          // current Catalog eligibility. The final RPC still checks the binding
          // atomically, including a concurrent commit after this probe.
          const replay = decode(await invoke("replay_add"));
          if (replay.status !== "unavailable" || replay.reason !== "not_found") return replay;
          const accepted = await acceptCartItem(item?.handoff, { observedAt: new Date().toISOString(),
            catalogRepository: catalog.repository, customizationFieldRepository: catalog,
            verifiedOwnerId: input.owner.ownerId,
            pricingResolver: pricingInput => catalog.resolveCustomizationPricing(pricingInput),
            receiptRepository: persistentPurchaseReceipts(input.environment, input.verifyOwner ?? (async () => null), [item?.handoff]) });
          // Fresh receipt checks remain INSIDE the unified CAS command boundary.
          if (accepted.status !== "accepted") return unavailable(accepted.reason === "source_failure" ? "source_failure" : "rejected");
          item = accepted.value;
        }
        if (command.operation === "update" && parseCartQuantity(command.quantity) === null) return unavailable("invalid_request");
        return decode(await invoke(command.operation));
      } catch { return unavailable("source_failure"); }
    });
    const port: LocalCommerceCartPort = {
      read: command => store.execute({ ...command, operation: "read", expectedVersion: 0 }),
      create: command => store.execute({ ...command, operation: "create", expectedVersion: 0 }),
      addLine: command => store.execute({ ...command, operation: "add" }),
      updateLine: command => store.execute({ ...command, operation: "update" }),
      removeLine: command => store.execute({ ...command, operation: "remove" }),
      clear: command => store.execute({ ...command, operation: "clear" }),
    };
    return { status: "ready", port, authority };
  } catch { return { status: "unavailable" }; }
}
