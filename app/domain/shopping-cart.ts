import type { ConfiguredItemHandoff } from "./configured-item.ts";
import type { CatalogCurrency, SelectedOptionValue } from "./catalog/variant.ts";
import type { CustomizationPricingSnapshot } from "../application/customization-surcharge-pricing.ts";

export const LOCAL_CART_COOKIE_NAME = "figmemento-local-cart";
export const MAX_CART_LINE_QUANTITY = 20;

export type ShoppingCartStatus =
  | "empty"
  | "available"
  | "stale"
  | "unavailable_source"
  | "failure";

export type CartLineAvailability = "available" | "stale" | "unavailable";

export interface SafeCartCustomizationSummary {
  readonly configuration: {
    readonly sku: string | null;
    readonly options: readonly { readonly label: string; readonly value: string }[];
    readonly needsReview: boolean;
  };
  readonly personalization: {
    readonly status: "empty_configuration" | "current" | "needs_review";
    readonly rows: readonly SafeCartCustomizationRow[];
  };
}

export type SafeCartCustomizationRow =
  | {
      readonly kind: "short_text" | "long_text" | "single_select" | "multi_select";
      readonly label: string;
      readonly state: "provided" | "not_provided" | "not_provided_yet";
      readonly value?: string;
    }
  | {
      readonly kind: "image";
      readonly label: string;
      readonly state: "provided" | "not_provided" | "not_provided_yet";
      readonly imageCount: number;
    };

export interface CartCatalogSnapshot {
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly SelectedOptionValue[];
  readonly unitPriceCents: number;
  readonly currency: CatalogCurrency;
  readonly availability: CartLineAvailability;
}

export interface StoredCartLine {
  readonly lineId: string;
  readonly handoff: ConfiguredItemHandoff;
  readonly snapshot: CartCatalogSnapshot;
  readonly customization: SafeCartCustomizationSummary;
  readonly quantity: number;
  /** Server-owned pricing provenance; never included in the customer projection. */
  readonly pricingSnapshot?: CustomizationPricingSnapshot;
}

export interface ShoppingCartRecord {
  readonly cartId: string;
  readonly lines: readonly StoredCartLine[];
}

export interface CartLine extends CartCatalogSnapshot {
  readonly lineId: string;
  readonly customization: SafeCartCustomizationSummary;
  readonly quantity: number;
  readonly lineSubtotalCents: number;
}

export interface ShoppingCart {
  readonly status: ShoppingCartStatus;
  readonly lines: readonly CartLine[];
  readonly currency?: CatalogCurrency;
  readonly subtotalCents?: number;
}

export type CartProviderResult<T> =
  | { readonly status: "found"; readonly value: T }
  | { readonly status: "not_found" }
  | { readonly status: "source_failure" };

export interface AcceptedCartItem {
  readonly handoff: ConfiguredItemHandoff;
  readonly snapshot: CartCatalogSnapshot;
  readonly customization: SafeCartCustomizationSummary;
  readonly pricingSnapshot?: CustomizationPricingSnapshot;
}

export interface ShoppingCartProvider {
  getCart(cartId: string): Promise<CartProviderResult<ShoppingCartRecord>>;
  createCart(): Promise<CartProviderResult<ShoppingCartRecord>>;
  addLine(cartId: string, item: AcceptedCartItem): Promise<CartProviderResult<ShoppingCartRecord>>;
  updateLine(cartId: string, lineId: string, quantity: number): Promise<CartProviderResult<ShoppingCartRecord>>;
  removeLine(cartId: string, lineId: string): Promise<CartProviderResult<ShoppingCartRecord>>;
  clearCart(cartId: string): Promise<CartProviderResult<ShoppingCartRecord>>;
}

export function parseCartQuantity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return value >= 1 && value <= MAX_CART_LINE_QUANTITY ? value : null;
}

export function calculateCartSubtotal(lines: readonly StoredCartLine[]): number | null {
  if (lines.length === 0) return 0;
  const currency = lines[0].snapshot.currency;
  let subtotal = 0;
  for (const line of lines) {
    if (line.snapshot.currency !== currency) return null;
    const amount = line.snapshot.unitPriceCents * line.quantity;
    if (!Number.isSafeInteger(amount) || subtotal > Number.MAX_SAFE_INTEGER - amount) return null;
    subtotal += amount;
  }
  return subtotal;
}

export function toPublicShoppingCart(record: ShoppingCartRecord): ShoppingCart {
  const subtotal = calculateCartSubtotal(record.lines);
  if (subtotal === null) return { status: "failure", lines: [] };
  const lines = record.lines.map((line): CartLine => ({
    ...line.snapshot,
    lineId: line.lineId,
    customization: line.customization,
    quantity: line.quantity,
    lineSubtotalCents: line.snapshot.unitPriceCents * line.quantity,
  }));
  if (lines.length === 0) return { status: "empty", lines: [] };
  const hasUnavailable = lines.some((line) => line.availability === "unavailable");
  const hasStale = lines.some((line) => line.availability === "stale");
  return {
    status: hasUnavailable || hasStale ? "stale" : "available",
    lines,
    currency: lines[0].currency,
    subtotalCents: subtotal,
  };
}
