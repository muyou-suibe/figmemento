export const productCategories = ["3D keepsakes", "Pet memories", "Digital gifts"] as const;

export type ProductCategory = (typeof productCategories)[number];
export type Category = "All gifts" | ProductCategory;
export type ProductArt = "figure" | "pet" | "portrait" | "cube" | "digital";

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  tag?: string;
  description: string;
  art: ProductArt;
  materials?: string;
  size?: string;
  leadTime?: string;
};

export type ProductDatabaseRow = {
  slug: string;
  name: string;
  category: string;
  description: string;
  price_cents: number;
  art_key: string | null;
};

export function isProductCategory(value: string): value is ProductCategory {
  return productCategories.some((category) => category === value);
}

export function isProduct(value: unknown): value is Product {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product.id === "string" &&
    typeof product.name === "string" &&
    typeof product.category === "string" &&
    isProductCategory(product.category) &&
    typeof product.price === "number" &&
    Number.isFinite(product.price) &&
    typeof product.description === "string" &&
    (product.art === "figure" || product.art === "pet" || product.art === "portrait" || product.art === "cube" || product.art === "digital")
  );
}
