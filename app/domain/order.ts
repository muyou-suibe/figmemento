export {
  isLegacyProductOrderRequestItem,
  isNormalizedCustomizationOrderRequestItem,
  isNormalizedOrderRequestItem,
  normalizedOrderRequestItemToConfiguredItemHandoff,
  parseOrderRequestItem,
} from "./order-request-boundary.ts";
export type {
  CatalogOrderRequestItem,
  LegacyProductOrderRequestItem,
  NormalizedCustomizationOrderRequestItem,
  OrderRequestItem,
} from "./order-request-boundary.ts";
export {
  parseDeprecatedLegacyProductOrderItem,
} from "./order-catalog-compatibility.ts";
export type {
  LegacyProductOrderItemIdentity,
  NativeCatalogOrderItemIdentity,
  NativeCatalogOrderRequestItem,
} from "./order-catalog-compatibility.ts";

export type OrderCreateResponse = {
  orderNumber?: string;
  totalCents?: number;
  checkoutUrl?: string | null;
  error?: string;
};

export type OrderLookupItem = {
  product_name: string;
  quantity: number;
  is_digital: boolean;
  digital_delivery_name: string | null;
  digital_download_url: string | null;
};

export type OrderLookupResult = {
  order_number: string;
  payment_status: string;
  fulfillment_status: string;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_status: string | null;
  created_at: string;
  total_cents: number;
  currency: string;
  items: OrderLookupItem[];
};
