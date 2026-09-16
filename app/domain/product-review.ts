export type ProductReviewStatus = "published";

export interface ProductReview {
  readonly id: string;
  readonly productId: string;
  readonly orderItemId: string;
  readonly customerId: string;
  readonly rating: number;
  readonly title?: string;
  readonly body: string;
  readonly status: ProductReviewStatus;
  readonly createdAt: string;
}

export type ProductReviewParseResult =
  | { readonly ok: true; readonly value: { readonly publicOrderReference: string; readonly orderItemId: string; readonly productId: string; readonly rating: number; readonly title?: string; readonly body: string } }
  | { readonly ok: false; readonly reason: "invalid_request" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseProductReviewRequest(value: unknown): ProductReviewParseResult {
  if (!isRecord(value)) return { ok: false, reason: "invalid_request" };
  const keys = new Set(["publicOrderReference", "orderItemId", "productId", "rating", "title", "body"]);
  if (Object.keys(value).some((key) => !keys.has(key))) return { ok: false, reason: "invalid_request" };
  if (typeof value.publicOrderReference !== "string" || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(value.publicOrderReference)) return { ok: false, reason: "invalid_request" };
  if (typeof value.orderItemId !== "string" || !/^[A-Za-z0-9_-]{16,200}$/.test(value.orderItemId)) return { ok: false, reason: "invalid_request" };
  if (typeof value.productId !== "string" || value.productId.length < 8 || value.productId.length > 200) return { ok: false, reason: "invalid_request" };
  if (typeof value.rating !== "number" || !Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5) return { ok: false, reason: "invalid_request" };
  if (typeof value.body !== "string" || value.body.trim().length < 1 || value.body.trim().length > 2000) return { ok: false, reason: "invalid_request" };
  if (value.title !== undefined && (typeof value.title !== "string" || value.title.trim().length > 120)) return { ok: false, reason: "invalid_request" };
  return { ok: true, value: { publicOrderReference: value.publicOrderReference, orderItemId: value.orderItemId, productId: value.productId, rating: value.rating, ...(typeof value.title === "string" && value.title.trim() ? { title: value.title.trim() } : {}), body: value.body.trim() } };
}
