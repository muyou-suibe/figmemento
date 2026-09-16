import type { CatalogDataSet } from "./catalog-data-set.ts";

/** Relevant purchase rows only. Category publication participates in current
 * public eligibility, so ONLY each purchased Product's category is included.
 * Matching rule absence is represented by no entry, not an invented version;
 * SQL recomputes this exact set while holding its phantom-protecting lock. */
export function localOrderPurchaseVersions(input: {
  readonly catalog: CatalogDataSet;
  readonly configurations: readonly Record<string, unknown>[];
  readonly rules: readonly Record<string, unknown>[];
  readonly versions: Readonly<Record<string, number>>;
  readonly selections: readonly { readonly productId: string; readonly variantId: string }[];
  readonly requiresShipping: boolean; readonly country?: string; readonly method: string; readonly couponCode: string;
}): Readonly<Record<string, number>> | null {
  const selected: Record<string, number> = {};
  function include(key: string) {
    const v = input.versions[key];
    if (!Number.isSafeInteger(v) || v < 1) throw new Error("missing purchase version");
    selected[key] = v;
  }
  try {
    for (const s of input.selections) {
      const p = input.catalog.products.find(p => p.id === s.productId);
      const c = input.configurations.filter(c => c.product_id === s.productId);
      const category = input.catalog.categories.find(c => c.id === p?.categoryId);
      if (!p || !category || category.lifecycle !== "published" || c.length !== 1
        || !input.catalog.variants.some(v => v.id === s.variantId && v.productId === s.productId)) return null;
      include(`products:${p.id}`); include(`variants:${s.variantId}`);
      include(`categories:${category.id}`); include(`configurations:${c[0].id}`);
    }
    for (const row of input.rules) {
      const r = row.definition as Record<string, unknown> | undefined;
      if (!r) return null;
      if (input.requiresShipping && r.kind === "shipping" && r.country === input.country?.toUpperCase() && r.method === input.method
        || input.couponCode && r.kind === "coupon" && r.code === input.couponCode) include(`rules:${row.id}`);
    }
    return Object.freeze(Object.fromEntries(Object.entries(selected).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
  } catch { return null; }
}
