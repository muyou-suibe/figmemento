import { parseCustomization } from "./customization";
import type { Customization } from "./customization";

export type OrderRequestItem = {
  slug: string;
  quantity?: number;
  customization?: Customization;
};

export type OrderCreateResponse = {
  orderNumber?: string;
  totalCents?: number;
  checkoutUrl?: string | null;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOrderRequestItem(value: unknown): OrderRequestItem | null {
  if (!isRecord(value) || typeof value.slug !== "string") return null;
  if (value.quantity !== undefined && typeof value.quantity !== "number") return null;
  const customization = value.customization === undefined ? undefined : parseCustomization(value.customization);
  if (value.customization !== undefined && !customization) return null;
  return {
    slug: value.slug,
    quantity: value.quantity,
    customization: customization ?? undefined,
  };
}

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
