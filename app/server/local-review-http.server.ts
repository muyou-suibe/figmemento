import { parseProductReviewRequest } from "../domain/product-review.ts";
import { getSharedProductReviewRepository } from "./local-review-runtime.server.ts";
import { getSharedLocalOrderAccountReadPort, getSharedLocalOrderFulfillmentReadPort } from "./local-order-runtime.server.ts";
import { getSharedLocalTrackingRepository } from "./local-tracking-runtime.server.ts";
import { readAuthenticatedCustomer, isSameOriginCustomerAuthMutation } from "./customer-auth-http.server.ts";

function json(value: unknown, status = 200): Response { return Response.json(value, { status, headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" } }); }

function publicReview(value: { readonly id: string; readonly productId: string; readonly rating: number; readonly title?: string; readonly body: string; readonly createdAt: string }) {
  return { id: value.id, productId: value.productId, rating: value.rating, ...(value.title ? { title: value.title } : {}), body: value.body, createdAt: value.createdAt };
}

function delivered(order: { readonly internalId: string; readonly publicReference: string }): boolean {
  const result = getSharedLocalTrackingRepository().findByOrderIdentity({ internalOrderId: order.internalId, publicOrderReference: order.publicReference });
  return result.status === "found" && result.aggregate.shipment.status === "delivered";
}

export async function handleLocalReviewRequest(request: Request): Promise<Response> {
  if (request.method === "GET") {
    const productId = new URL(request.url).searchParams.get("productId") ?? "";
    if (productId.length < 8 || productId.length > 200) return json({ status: "invalid_request", reviews: [] }, 400);
    const reviews = getSharedProductReviewRepository().listPublished(productId);
    const customer = await readAuthenticatedCustomer(request);
    const eligible = customer
      ? getSharedLocalOrderAccountReadPort().findSnapshotsForCustomer(customer.id).flatMap((order) => delivered(order) ? order.lines.filter((line) => line.productId === productId && line.orderItemId).map((line) => ({ publicOrderReference: order.publicReference, orderItemId: line.orderItemId as string })) : [])
      : [];
    return json({ status: "ok", reviews: reviews.map(publicReview), eligible });
  }
  if (request.method !== "POST") return json({ status: "invalid_request" }, 405);
  if (!isSameOriginCustomerAuthMutation(request)) return json({ status: "invalid_request" }, 403);
  const customer = await readAuthenticatedCustomer(request);
  if (!customer) return json({ status: "unauthorized" }, 401);
  const parsed = parseProductReviewRequest(await request.json().catch(() => null));
  if (!parsed.ok) return json({ status: "invalid_request" }, 400);
  const order = getSharedLocalOrderFulfillmentReadPort().findSnapshotForFulfillment(parsed.value.publicOrderReference);
  if (order.status !== "found" || order.snapshot.customerId !== customer.id || !delivered(order.snapshot)) return json({ status: "ineligible" }, 409);
  const line = order.snapshot.lines.find((candidate) => candidate.orderItemId === parsed.value.orderItemId && candidate.productId === parsed.value.productId);
  if (!line) return json({ status: "ineligible" }, 409);
  const created = getSharedProductReviewRepository().create({ productId: line.productId, orderItemId: parsed.value.orderItemId, customerId: customer.id, rating: parsed.value.rating, ...(parsed.value.title ? { title: parsed.value.title } : {}), body: parsed.value.body, createdAt: new Date().toISOString() });
  return created.status === "duplicate" ? json({ status: "duplicate" }, 409) : json({ status: "created", review: publicReview(created.value!) }, 201);
}
