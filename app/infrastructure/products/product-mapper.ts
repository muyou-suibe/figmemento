import type { Product, ProductArt, ProductDatabaseRow, ProductCategory } from "../../domain/product";

const supportedCategories = new Set<ProductCategory>(["3D keepsakes", "Pet memories", "Digital gifts"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function artFromDatabaseKey(artKey: string | null): ProductArt {
  if (artKey === "figure" || artKey === "pet" || artKey === "portrait" || artKey === "cube" || artKey === "digital") return artKey;
  return "portrait";
}

export function parseProductDatabaseRow(value: unknown): ProductDatabaseRow | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.slug !== "string" ||
    typeof value.name !== "string" ||
    typeof value.category !== "string" ||
    typeof value.description !== "string" ||
    typeof value.price_cents !== "number" ||
    (value.art_key !== null && typeof value.art_key !== "string")
  ) {
    return null;
  }
  return {
    slug: value.slug,
    name: value.name,
    category: value.category,
    description: value.description,
    price_cents: value.price_cents,
    art_key: value.art_key,
  };
}

export function productFromDatabase(value: unknown): Product | null {
  const row = parseProductDatabaseRow(value);
  if (!row || !supportedCategories.has(row.category as ProductCategory)) return null;
  const category = row.category as ProductCategory;
  return {
    id: row.slug,
    name: row.name,
    category,
    price: row.price_cents / 100,
    description: row.description,
    art: artFromDatabaseKey(row.art_key),
    materials: category === "Digital gifts" ? "High-resolution digital file" : "Made to order from your photo",
    size: category === "Digital gifts" ? "Ready for screen or print" : "Finished size varies by design",
    leadTime: category === "Digital gifts" ? "1–2 business days" : "7–14 business days",
  };
}
