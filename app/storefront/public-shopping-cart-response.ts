import type { ShoppingCart, ShoppingCartStatus } from "../domain/shopping-cart.ts";

const shoppingCartStatuses = new Set<ShoppingCartStatus>([
  "empty",
  "available",
  "stale",
  "unavailable_source",
  "failure",
]);

export type PublicShoppingCartLoadResult =
  | { readonly status: "ready"; readonly cart: ShoppingCart }
  | { readonly status: "unavailable" };

export function isPublicShoppingCart(value: unknown): value is ShoppingCart {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { readonly status?: unknown; readonly lines?: unknown };
  return typeof candidate.status === "string"
    && shoppingCartStatuses.has(candidate.status as ShoppingCartStatus)
    && Array.isArray(candidate.lines);
}

export async function loadPublicShoppingCart(
  request: () => Promise<Response>,
): Promise<PublicShoppingCartLoadResult> {
  try {
    const response = await request();
    if (!response.ok) return { status: "unavailable" };
    const value: unknown = await response.json();
    return isPublicShoppingCart(value)
      ? { status: "ready", cart: value }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
