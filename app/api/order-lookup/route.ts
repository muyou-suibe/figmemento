import { getSupabaseServerClient } from "../../lib/supabase-server";
import { readUploadConfig } from "../../config/server";
import { omitPrivateOrderLookupFields } from "../../application/order-lookup";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { orderNumber?: unknown; email?: unknown };
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim().toUpperCase() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!/^PG-[A-Z0-9-]+$/.test(orderNumber) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid order number and checkout email." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, payment_status, fulfillment_status, tracking_carrier, tracking_number, tracking_status, created_at, total_cents, currency, order_items(product_name, quantity, customization, products(is_digital))")
    .eq("order_number", orderNumber)
    .eq("customer_email", email)
    .maybeSingle();

  if (error) {
    console.error("Order lookup failed", error);
    return Response.json({ error: "Order lookup is temporarily unavailable." }, { status: 503 });
  }
  if (!data) return Response.json({ error: "We could not find an order with those details." }, { status: 404 });

  const { bucket } = readUploadConfig();
  const items = await Promise.all(((data.order_items || []) as Array<{ product_name: string; quantity: number; customization: { digitalDeliveryPath?: string; digitalDeliveryName?: string } | null; products?: { is_digital?: boolean } | null }>).map(async (item) => {
    const path = item.customization?.digitalDeliveryPath;
    const canDownload = Boolean(item.products?.is_digital && path && data.payment_status === "paid" && ["quality_check", "shipped", "delivered"].includes(data.fulfillment_status));
    const signed = canDownload ? await supabase.storage.from(bucket).createSignedUrl(path!, 60 * 15) : null;
    return { product_name: item.product_name, quantity: item.quantity, is_digital: Boolean(item.products?.is_digital), digital_delivery_name: item.customization?.digitalDeliveryName || null, digital_download_url: signed?.data?.signedUrl || null };
  }));
  const safeOrder = omitPrivateOrderLookupFields(data);
  return Response.json({ order: { ...safeOrder, items } });
}
