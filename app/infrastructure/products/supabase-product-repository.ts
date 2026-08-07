import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductRepository } from "../../application/product-catalog";
import type { Product } from "../../domain/product";
import { productFromDatabase } from "./product-mapper";

export class SupabaseProductRepository implements ProductRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listPublishedProducts(): Promise<Product[]> {
    const { data, error } = await this.client
      .from("products")
      .select("slug, name, category, description, price_cents, art_key")
      .eq("is_published", true)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(productFromDatabase).filter((product): product is Product => product !== null);
  }
}
