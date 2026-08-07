import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { calculateCouponDiscount } from "../../../application/pricing";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { code?: unknown; subtotalCents?: unknown };
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const subtotalCents = typeof body.subtotalCents === "number" ? Math.floor(body.subtotalCents) : 0;
  if (!/^[A-Z0-9-]{3,32}$/.test(code) || subtotalCents < 0) return Response.json({ error: "Enter a valid coupon code." }, { status: 400 });
  const { data: coupon, error } = await getSupabaseServerClient().from("coupons").select("code, discount_type, discount_value, min_subtotal_cents, max_redemptions, redemption_count, active, expires_at").eq("code", code).maybeSingle();
  if (error) {
    console.error("Coupon lookup failed", error);
    return Response.json({ error: "Coupon service is not configured yet." }, { status: 503 });
  }
  if (!coupon || !coupon.active || (coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now()) || (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions)) return Response.json({ error: "This coupon is unavailable." }, { status: 404 });
  if (subtotalCents < coupon.min_subtotal_cents) return Response.json({ error: `This coupon requires a subtotal of at least $${(coupon.min_subtotal_cents / 100).toFixed(2)}.` }, { status: 409 });
  const discountType = coupon.discount_type === "percent" ? "percent" : "fixed";
  const discountCents = calculateCouponDiscount({ discount_type: discountType, discount_value: coupon.discount_value }, subtotalCents);
  return Response.json({ code: coupon.code, discountCents, label: coupon.discount_type === "percent" ? `${coupon.discount_value}% off` : `$${(coupon.discount_value / 100).toFixed(2)} off` });
}
