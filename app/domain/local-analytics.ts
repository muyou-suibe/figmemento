export const LOCAL_ANALYTICS_EVENT_NAMES = [
  "view_item",
  "select_variant",
  "begin_customization",
  "customization_complete",
  "upload_accept",
  "upload_success",
  "add_to_cart",
  "view_cart",
  "begin_checkout",
  "apply_coupon",
  "purchase",
  "view_tracking",
  "review_submit",
  "newsletter_signup",
  "newsletter_subscribe",
  "contact_submit",
] as const;

export type LocalAnalyticsEventName = (typeof LOCAL_ANALYTICS_EVENT_NAMES)[number];

export interface LocalAnalyticsEvent {
  readonly id: string;
  readonly eventName: LocalAnalyticsEventName;
  readonly productId?: string;
  readonly orderReference?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly occurredAt: string;
  readonly developmentOnly: true;
}

export type LocalAnalyticsParseResult =
  | { readonly ok: true; readonly value: Omit<LocalAnalyticsEvent, "id" | "occurredAt" | "developmentOnly"> }
  | { readonly ok: false; readonly reason: "invalid_event" };

const EVENT_NAMES = new Set<string>(LOCAL_ANALYTICS_EVENT_NAMES);
const ORDER_REFERENCE = /^FM-LOCAL-[A-Z0-9]{16}$/;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,200}$/;
const MAX_METADATA_KEYS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

export function parseLocalAnalyticsEvent(value: unknown): LocalAnalyticsParseResult {
  if (!isRecord(value)) return { ok: false, reason: "invalid_event" };
  const allowed = new Set(["eventName", "productId", "orderReference", "metadata"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return { ok: false, reason: "invalid_event" };
  const eventName = boundedString(value.eventName, 40);
  if (!eventName || !EVENT_NAMES.has(eventName)) return { ok: false, reason: "invalid_event" };

  const productId = value.productId === undefined ? undefined : boundedString(value.productId, 200);
  if (value.productId !== undefined && (!productId || !IDENTIFIER.test(productId))) return { ok: false, reason: "invalid_event" };
  const orderReference = value.orderReference === undefined ? undefined : boundedString(value.orderReference, 64);
  if (value.orderReference !== undefined && (!orderReference || !ORDER_REFERENCE.test(orderReference))) return { ok: false, reason: "invalid_event" };

  const metadata: Record<string, string> = {};
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata) || Object.keys(value.metadata).length > MAX_METADATA_KEYS) return { ok: false, reason: "invalid_event" };
    for (const [key, raw] of Object.entries(value.metadata)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key)) return { ok: false, reason: "invalid_event" };
      const item = boundedString(raw, 120);
      if (!item) return { ok: false, reason: "invalid_event" };
      metadata[key] = item;
    }
  }

  return { ok: true, value: { eventName: eventName as LocalAnalyticsEventName, ...(productId ? { productId } : {}), ...(orderReference ? { orderReference } : {}), metadata } };
}
