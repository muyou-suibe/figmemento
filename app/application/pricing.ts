export type ExistingCoupon = {
  discount_type: "percent" | "fixed";
  discount_value: number;
};

export function calculateCouponDiscount(coupon: ExistingCoupon, subtotalCents: number): number {
  const discount = coupon.discount_type === "percent"
    ? Math.floor(subtotalCents * coupon.discount_value / 100)
    : coupon.discount_value;
  return Math.min(subtotalCents, discount);
}

export function calculateServerProductSubtotal(
  products: Array<{ slug: string; price_cents: number }>,
  quantityForSlug: (slug: string) => number,
): number {
  return products.reduce((sum, product) => sum + product.price_cents * quantityForSlug(product.slug), 0);
}
