import type { VerifiedResourceOwner } from "./guest-resource-ownership.server.ts";

export interface VerifiedPurchaseOwner {
  readonly owner: VerifiedResourceOwner;
  readonly expiresAt: number;
}

type ExactRead<T> =
  | { readonly status: "found"; readonly value: T }
  | { readonly status: "unavailable"; readonly reason: string }
  | { readonly status: "conflict"; readonly reason: string };

/** Read-only selection over existing verified authority and the unified Cart
 * port. Never issues authority, creates a Cart, or transfers resources. */
export async function selectPersistentPurchaseCart<T>(input: {
  readonly verifyInitialOwner: () => Promise<VerifiedPurchaseOwner | null>;
  readonly verifyCustomerOwner: () => Promise<VerifiedPurchaseOwner | null>;
  readonly readExact: (owner: VerifiedPurchaseOwner) => Promise<ExactRead<T>>;
}): Promise<{ readonly status: "found"; readonly value: T; readonly selected: VerifiedPurchaseOwner }
  | { readonly status: "unavailable" }> {
  try {
    const initial = await input.verifyInitialOwner();
    if (!initial) return { status: "unavailable" };
    const result = await input.readExact(initial);
    if (result.status === "found") return { ...result, selected: initial };
    // A missing exact guest Cart is the ONLY reason to probe membership.
    // Invalid/expired guest authority and database outages never reach here.
    if (initial.owner.kind !== "guest" || result.status !== "unavailable" || result.reason !== "not_found") {
      return { status: "unavailable" };
    }
    const customer = await input.verifyCustomerOwner();
    if (!customer || customer.owner.kind !== "customer" || customer.owner.projectId !== initial.owner.projectId) {
      return { status: "unavailable" };
    }
    const memberCart = await input.readExact(customer);
    return memberCart.status === "found" ? { ...memberCart, selected: customer } : { status: "unavailable" };
  } catch { return { status: "unavailable" }; }
}
