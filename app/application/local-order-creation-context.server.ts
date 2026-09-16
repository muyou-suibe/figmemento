import type { VerifiedResourceOwner } from "./guest-resource-ownership.server.ts";

const limits: Readonly<Record<string, number>> = { email: 254, firstName: 100, lastName: 100, country: 2,
  stateProvince: 120, city: 120, addressLine1: 200, postalCode: 30, phone: 40, shippingMethod: 64, couponCode: 64 };
export interface PersistentOrderStructuralInput {
  readonly creationAttemptId: string;
  readonly contact: Readonly<Record<string, string>>;
  readonly shippingMethod: string;
  readonly couponCode: string;
}

/** Bounded structure only. Physical address requirements are checked against
 * fresh item classification later, never guessed before the replay probe. */
export function parsePersistentOrderStructuralInput(value: unknown): PersistentOrderStructuralInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.creationAttemptId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(input.creationAttemptId)) return null;
  const contact: Record<string, string> = {};
  for (const [key, v] of Object.entries(input)) {
    if (key === "creationAttemptId") continue;
    if (key === "pointsToRedeem" && v === 0) continue;
    if (!Object.hasOwn(limits, key) || typeof v !== "string" || v.length > limits[key] || /[\u0000-\u001f\u007f]/.test(v)) return null;
  }
  for (const key of Object.keys(limits)) {
    if (key === "shippingMethod" || key === "couponCode") continue;
    const v = (input[key] as string | undefined)?.trim();
    if (v) contact[key] = key === "country" ? v.toUpperCase() : v;
  }
  if (!contact.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)
    || contact.country && !/^[A-Z]{2}$/.test(contact.country)) return null;
  const shippingMethod = (input.shippingMethod as string | undefined)?.trim() ?? "";
  const couponCode = (input.couponCode as string | undefined)?.trim() ?? "";
  if ([shippingMethod, couponCode].some(v => v && !/^[A-Za-z0-9_-]{1,64}$/.test(v))) return null;
  return { creationAttemptId: input.creationAttemptId, contact, shippingMethod, couponCode };
}

export async function orderDigest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join("");
}

/** One canonical replay identity; current Catalog/receipt/rule results are
 * deliberately absent. Cart CAS binds quantity/configuration/media changes. */
export async function persistentOrderCreationContext(input: PersistentOrderStructuralInput,
  owner: VerifiedResourceOwner, cartId: string, cartVersion: number) {
  if (!Number.isSafeInteger(cartVersion) || cartVersion < 1) return null;
  const canonical = ["local-order-v1", owner.projectId, owner.kind, owner.ownerId,
    owner.kind === "customer" ? owner.customerId : null, cartId, cartVersion,
    Object.entries(input.contact).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), input.shippingMethod, input.couponCode];
  return { keyDigest: await orderDigest(input.creationAttemptId), contextDigest: await orderDigest(JSON.stringify(canonical)) };
}
