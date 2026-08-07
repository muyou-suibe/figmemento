import { getSessionCookieName, isValidAdminSession } from "../../../lib/admin-auth";
import { getSupabaseServerClient } from "../../../lib/supabase-server";

const fulfillmentStatuses = ["awaiting_payment", "awaiting_review", "in_production", "quality_check", "shipped", "delivered", "issue"] as const;
type FulfillmentStatus = (typeof fulfillmentStatuses)[number];

function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie")?.split(";").find((part) => part.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

async function writeOrderLog(input: { orderId: string; orderItemId?: string; action: string; fromValue?: string | null; toValue?: string | null; reason?: string }) {
  try {
    const { error } = await getSupabaseServerClient().from("order_status_logs").insert({
      order_id: input.orderId,
      order_item_id: input.orderItemId || null,
      action: input.action,
      from_value: input.fromValue || null,
      to_value: input.toValue || null,
      reason: input.reason || null,
      actor: "admin",
    });
    if (error) console.error("Order operation log failed", error);
  } catch (error) {
    // Logging must not make a valid operational update fail during migration.
    console.error("Order operation log unavailable", error);
  }
}

export async function PATCH(request: Request) {
  if (!(await isValidAdminSession(getCookieValue(request, getSessionCookieName())))) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { orderNumber?: unknown; fulfillmentStatus?: unknown; trackingCarrier?: unknown; trackingNumber?: unknown; trackingStatus?: unknown; orderItemId?: unknown; photoReviewStatus?: unknown; digitalDeliveryPath?: unknown; digitalDeliveryName?: unknown };
  if (typeof body.orderNumber !== "string") return Response.json({ error: "Invalid order update." }, { status: 400 });
  const hasFulfillmentUpdate = body.fulfillmentStatus !== undefined;
  const hasTrackingUpdate = body.trackingCarrier !== undefined || body.trackingNumber !== undefined || body.trackingStatus !== undefined;
  const hasPhotoReviewUpdate = body.orderItemId !== undefined || body.photoReviewStatus !== undefined;
  const hasDigitalDeliveryUpdate = body.digitalDeliveryPath !== undefined || body.digitalDeliveryName !== undefined;
  if (!hasFulfillmentUpdate && !hasTrackingUpdate && !hasPhotoReviewUpdate && !hasDigitalDeliveryUpdate) return Response.json({ error: "No order update provided." }, { status: 400 });
  if (hasFulfillmentUpdate && !fulfillmentStatuses.includes(body.fulfillmentStatus as FulfillmentStatus)) return Response.json({ error: "Invalid fulfillment status." }, { status: 400 });
  if (hasPhotoReviewUpdate && (typeof body.orderItemId !== "string" || !["pending", "approved", "needs_reupload", "rejected"].includes(String(body.photoReviewStatus)))) return Response.json({ error: "Invalid photo review update." }, { status: 400 });
  if (hasDigitalDeliveryUpdate && (typeof body.orderItemId !== "string" || typeof body.digitalDeliveryPath !== "string" || !/^deliveries\/[a-f0-9-]+\/[a-f0-9-]+\/[A-Za-z0-9._-]+$/.test(body.digitalDeliveryPath) || (body.digitalDeliveryName !== undefined && (typeof body.digitalDeliveryName !== "string" || body.digitalDeliveryName.length > 160)))) return Response.json({ error: "Invalid digital delivery update." }, { status: 400 });
  for (const value of [body.trackingCarrier, body.trackingNumber, body.trackingStatus]) if (value !== undefined && (typeof value !== "string" || value.length > 120)) return Response.json({ error: "Tracking details are too long." }, { status: 400 });
  const supabase = getSupabaseServerClient();
  const { data: order, error: orderError } = await supabase.from("orders").select("id, payment_status, fulfillment_status, tracking_carrier, tracking_number, order_items(customization)").eq("order_number", body.orderNumber).maybeSingle();
  if (orderError) return Response.json({ error: "Could not read order." }, { status: 500 });
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
  if (hasPhotoReviewUpdate) {
    const { data: item, error: itemError } = await supabase.from("order_items").select("customization, product_id, products(is_digital)").eq("id", body.orderItemId).eq("order_id", order.id).maybeSingle();
    if (itemError) return Response.json({ error: "Could not read order item." }, { status: 500 });
    if (!item) return Response.json({ error: "Order item not found." }, { status: 404 });
    if (hasDigitalDeliveryUpdate && !(item.products as { is_digital?: boolean } | null)?.is_digital) return Response.json({ error: "Digital delivery can only be attached to a digital product." }, { status: 409 });
    const { error } = await supabase.from("order_items").update({ customization: { ...(item.customization || {}), photoReviewStatus: body.photoReviewStatus } }).eq("id", body.orderItemId).eq("order_id", order.id);
    if (error) return Response.json({ error: "Could not update photo review." }, { status: 500 });
    const { error: uploadReviewError } = await supabase.from("order_uploads").update({ review_status: body.photoReviewStatus }).eq("order_item_id", body.orderItemId);
    if (uploadReviewError) return Response.json({ error: "Could not update uploaded photo review." }, { status: 500 });
    await writeOrderLog({ orderId: order.id, orderItemId: body.orderItemId, action: "photo_review", toValue: String(body.photoReviewStatus) });
  }
  if (hasDigitalDeliveryUpdate && !hasPhotoReviewUpdate) {
    const { data: item, error: itemError } = await supabase.from("order_items").select("customization, products(is_digital)").eq("id", body.orderItemId).eq("order_id", order.id).maybeSingle();
    if (itemError) return Response.json({ error: "Could not read order item." }, { status: 500 });
    if (!item) return Response.json({ error: "Order item not found." }, { status: 404 });
    if (!(item.products as { is_digital?: boolean } | null)?.is_digital) return Response.json({ error: "Digital delivery can only be attached to a digital product." }, { status: 409 });
    const { error } = await supabase.from("order_items").update({ customization: { ...(item.customization || {}), digitalDeliveryPath: body.digitalDeliveryPath, digitalDeliveryName: body.digitalDeliveryName || "Digital delivery" } }).eq("id", body.orderItemId).eq("order_id", order.id);
    if (error) return Response.json({ error: "Could not save digital delivery." }, { status: 500 });
  }
  if (hasFulfillmentUpdate || hasTrackingUpdate) {
    const update: Record<string, string> = {};
    if (hasFulfillmentUpdate) {
      const fulfillmentStatus = body.fulfillmentStatus as FulfillmentStatus;
      const requiresPayment = ["in_production", "quality_check", "shipped", "delivered"].includes(fulfillmentStatus);
      if (order.payment_status !== "paid" && requiresPayment) return Response.json({ error: "A paid order is required before production or shipping." }, { status: 409 });
      if (order.payment_status === "paid" && fulfillmentStatus === "awaiting_payment") return Response.json({ error: "A paid order cannot be moved back to awaiting payment." }, { status: 409 });
      const items = (order.order_items || []) as Array<{ customization?: { photoPath?: string; photoReviewStatus?: string } | null }>;
      const hasUnapprovedPhoto = items.some((item) => item.customization?.photoPath && item.customization.photoReviewStatus !== "approved");
      if (["in_production", "quality_check", "shipped", "delivered"].includes(fulfillmentStatus) && hasUnapprovedPhoto) {
        return Response.json({ error: "Approve every uploaded photo before production or shipping." }, { status: 409 });
      }
      const effectiveCarrier = body.trackingCarrier !== undefined ? String(body.trackingCarrier).trim() : String(order.tracking_carrier || "").trim();
      const effectiveNumber = body.trackingNumber !== undefined ? String(body.trackingNumber).trim() : String(order.tracking_number || "").trim();
      if (["shipped", "delivered"].includes(fulfillmentStatus) && (!effectiveCarrier || !effectiveNumber)) {
        return Response.json({ error: "Add a carrier and tracking number before shipping or marking the order delivered." }, { status: 409 });
      }
      const statusByFulfillment: Record<FulfillmentStatus, string> = { awaiting_payment: "pending_payment", awaiting_review: "paid", in_production: "in_production", quality_check: "in_production", shipped: "shipped", delivered: "delivered", issue: order.payment_status === "paid" ? "paid" : "pending_payment" };
      update.fulfillment_status = fulfillmentStatus;
      update.status = statusByFulfillment[fulfillmentStatus];
    }
    if (body.trackingCarrier !== undefined) update.tracking_carrier = String(body.trackingCarrier).trim();
    if (body.trackingNumber !== undefined) update.tracking_number = String(body.trackingNumber).trim();
    if (body.trackingStatus !== undefined) update.tracking_status = String(body.trackingStatus).trim();
    const { error } = await supabase.from("orders").update(update).eq("order_number", body.orderNumber);
    if (error) return Response.json({ error: "Could not update order." }, { status: 500 });
    if (hasFulfillmentUpdate) await writeOrderLog({ orderId: order.id, action: "fulfillment_status", fromValue: order.fulfillment_status, toValue: String(body.fulfillmentStatus) });
    if (hasTrackingUpdate) await writeOrderLog({ orderId: order.id, action: "tracking", toValue: JSON.stringify({ carrier: body.trackingCarrier, number: body.trackingNumber, status: body.trackingStatus }) });
  }
  return Response.json({ ok: true });
}
