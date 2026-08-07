import { getSupabaseServerClient } from "../../lib/supabase-server";
import { isStripeConfigured, readStripeServerConfig } from "../../config/server";
import { parseOrderRequestItem } from "../../domain/order";
import type { OrderRequestItem } from "../../domain/order";
import type { StripeCheckoutSession } from "../../domain/payment";
import { calculateCouponDiscount, calculateServerProductSubtotal } from "../../application/pricing";

const freeShippingCents = 4900;
const standardShippingCents = 799;

type Coupon = { code: string; discount_type: "percent" | "fixed"; discount_value: number; min_subtotal_cents: number; max_redemptions: number | null; redemption_count: number; active: boolean; expires_at: string | null };

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function createStripeCheckout(input: {
  orderNumber: string;
  email: string;
  items: Array<{ product_name: string; unit_price_cents: number; quantity: number }>;
  shippingCents: number;
  discountCents: number;
  siteUrl: string;
}): Promise<StripeCheckoutSession> {
  const { secretKey } = readStripeServerConfig();

  const params = new URLSearchParams({
    mode: "payment",
    customer_email: input.email,
    success_url: `${input.siteUrl}/?checkout=success&order=${encodeURIComponent(input.orderNumber)}`,
    cancel_url: `${input.siteUrl}/?checkout=cancelled&order=${encodeURIComponent(input.orderNumber)}`,
  });
  params.set("client_reference_id", input.orderNumber);
  params.set("metadata[order_number]", input.orderNumber);
  const itemTotals = input.items.map((item) => item.unit_price_cents * item.quantity);
  const rawSubtotal = itemTotals.reduce((sum, value) => sum + value, 0);
  let remainingDiscount = input.discountCents;
  input.items.forEach((item, index) => {
    const proportional = index === input.items.length - 1 ? remainingDiscount : Math.min(remainingDiscount, Math.floor(input.discountCents * itemTotals[index] / rawSubtotal));
    remainingDiscount -= proportional;
    const discountedTotal = Math.max(0, itemTotals[index] - proportional);
    const unitAmount = Math.max(1, Math.floor(discountedTotal / item.quantity));
    params.set(`line_items[${index}][price_data][currency]`, "usd");
    params.set(`line_items[${index}][price_data][product_data][name]`, item.product_name);
    params.set(`line_items[${index}][price_data][unit_amount]`, String(unitAmount));
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });
  if (input.shippingCents > 0) {
    params.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
    params.set("shipping_options[0][shipping_rate_data][display_name]", "Standard shipping");
    params.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(input.shippingCents));
    params.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "usd");
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const result = (await response.json()) as StripeCheckoutSession & { error?: { message?: string } };
  if (!response.ok || !result.id || !result.url) throw new Error(result.error?.message || "Stripe checkout could not be created");
  return result;
}

export async function POST(request: Request) {
  let createdOrderId: string | null = null;

  try {
    const body = (await request.json()) as { email?: unknown; items?: unknown; couponCode?: unknown };
    if (!isEmail(body.email)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
      return Response.json({ error: "Your bag is empty or too large to check out." }, { status: 400 });
    }

    const parsedItems = (body.items as unknown[]).map(parseOrderRequestItem);
    if (parsedItems.some((item) => item === null)) {
      return Response.json({ error: "One of the products in your bag is invalid." }, { status: 400 });
    }
    const requestedItems = parsedItems.filter((item): item is OrderRequestItem => item !== null);
    const quantities = new Map<string, number>();
    for (const item of requestedItems) {
      if (!item || typeof item.slug !== "string" || !/^[a-z0-9-]+$/.test(item.slug)) {
        return Response.json({ error: "One of the products in your bag is invalid." }, { status: 400 });
      }
      const customization = item.customization;
      if (!customization || typeof customization.photoPath !== "string" || !/^drafts\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(customization.photoPath)) {
        return Response.json({ error: "Please upload and save a photo for each personalized product." }, { status: 400 });
      }
      if (customization.note !== undefined && (typeof customization.note !== "string" || customization.note.length > 500)) {
        return Response.json({ error: "Please keep customization notes under 500 characters." }, { status: 400 });
      }
      if (customization.photoMeta) {
        const meta = customization.photoMeta;
        if (typeof meta.originalFilename !== "string" || meta.originalFilename.length > 255 || typeof meta.contentType !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(meta.contentType) || typeof meta.fileSizeBytes !== "number" || meta.fileSizeBytes <= 0 || meta.fileSizeBytes > 10 * 1024 * 1024 || !Number.isInteger(meta.width) || !Number.isInteger(meta.height) || meta.width <= 0 || meta.height <= 0 || !["good", "low"].includes(String(meta.quality))) {
          return Response.json({ error: "The uploaded photo metadata is invalid. Please upload the photo again." }, { status: 400 });
        }
      }
      const quantity = Math.min(Math.max(Math.floor(item.quantity ?? 1), 1), 20);
      quantities.set(item.slug, (quantities.get(item.slug) ?? 0) + quantity);
    }

    const supabase = getSupabaseServerClient();
    const slugs = [...quantities.keys()];
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, slug, name, price_cents")
      .in("slug", slugs)
      .eq("is_published", true);
    if (productsError) throw productsError;
    if (!products || products.length !== slugs.length) {
      return Response.json({ error: "A product in your bag is no longer available." }, { status: 409 });
    }

    const subtotalCents = calculateServerProductSubtotal(products, (slug) => quantities.get(slug) ?? 1);
    let discountCents = 0;
    let coupon: Coupon | null = null;
    const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim().toUpperCase() : "";
    if (couponCode) {
      const { data: foundCoupon, error: couponError } = await supabase.from("coupons").select("code, discount_type, discount_value, min_subtotal_cents, max_redemptions, redemption_count, active, expires_at").eq("code", couponCode).maybeSingle();
      if (couponError) throw new Error("COUPON_NOT_CONFIGURED");
      coupon = foundCoupon as Coupon | null;
      if (!coupon || !coupon.active || (coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now()) || (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions)) return Response.json({ error: "This coupon is unavailable." }, { status: 409 });
      if (subtotalCents < coupon.min_subtotal_cents) return Response.json({ error: `This coupon requires a subtotal of at least $${(coupon.min_subtotal_cents / 100).toFixed(2)}.` }, { status: 409 });
      discountCents = calculateCouponDiscount(coupon, subtotalCents);
    }
    const shippingCents = subtotalCents >= freeShippingCents ? 0 : standardShippingCents;
    const orderNumber = `PG-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_email: body.email,
        subtotal_cents: subtotalCents,
        shipping_cents: shippingCents,
        discount_cents: discountCents,
        coupon_code: coupon?.code || null,
        total_cents: subtotalCents - discountCents + shippingCents,
      })
      .select("id, order_number, total_cents")
      .single();
    if (orderError || !order) throw orderError ?? new Error("Could not create order");
    createdOrderId = order.id;

    const itemRows = products.map((product) => {
      const requested = requestedItems.find((item) => item.slug === product.slug);
      return {
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        unit_price_cents: product.price_cents,
        quantity: quantities.get(product.slug) ?? 1,
        customization: { ...requested?.customization, note: requested?.customization?.note?.trim() },
      };
    });
    const { data: createdItems, error: itemsError } = await supabase.from("order_items").insert(itemRows).select("id, product_id, customization");
    if (itemsError || !createdItems) throw itemsError ?? new Error("Could not save order items");
    const uploadRows = createdItems.flatMap((item) => {
      const customization = item.customization as OrderRequestItem["customization"] | null;
      if (!customization?.photoPath) return [];
      const meta = customization.photoMeta;
      return [{
        order_item_id: item.id,
        storage_key: customization.photoPath,
        original_filename: typeof meta?.originalFilename === "string" ? meta.originalFilename : null,
        content_type: typeof meta?.contentType === "string" ? meta.contentType : null,
        file_size_bytes: typeof meta?.fileSizeBytes === "number" ? meta.fileSizeBytes : null,
      }];
    });
    if (uploadRows.length > 0) {
      const { error: uploadsError } = await supabase.from("order_uploads").insert(uploadRows);
      if (uploadsError) throw uploadsError;
    }

    let checkoutUrl: string | null = null;
    if (isStripeConfigured()) {
      const session = await createStripeCheckout({
        orderNumber: order.order_number,
        email: body.email,
        items: itemRows,
        shippingCents,
        discountCents,
        // Use the current request origin so local development ports and deployed hosts stay in sync.
        siteUrl: new URL(request.url).origin,
      });
      const { error: updateError } = await supabase.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
      if (updateError) throw updateError;
      checkoutUrl = session.url;
    }

    if (coupon) {
      const { error: redemptionError } = await supabase.from("coupons").update({ redemption_count: coupon.redemption_count + 1 }).eq("code", coupon.code).eq("redemption_count", coupon.redemption_count);
      if (redemptionError) console.error("Coupon redemption update failed", redemptionError);
    }

    return Response.json({ orderNumber: order.order_number, totalCents: order.total_cents, checkoutUrl });
  } catch (error) {
    if (createdOrderId) {
      try {
        await getSupabaseServerClient().from("orders").delete().eq("id", createdOrderId);
      } catch {
        // Keep the original error response; cleanup can be handled from the admin view.
      }
    }
    console.error("Order creation failed", error);
    return Response.json({ error: "We could not start your order. Please try again." }, { status: 500 });
  }
}
