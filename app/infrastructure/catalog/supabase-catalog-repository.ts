import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CatalogRepositoryService,
  type CatalogDataSource,
  type CatalogRepositoryResult,
} from "../../application/catalog-repository.ts";
import type { CatalogDataSet } from "../../application/catalog-data-set.ts";
import {
  mapSupabaseCatalogRows,
  type SupabaseCatalogRows,
} from "./supabase-catalog-mapper.ts";

export interface CatalogTableReader {
  readCatalogTables(): Promise<SupabaseCatalogRows>;
}

function rowsOrThrow(table: string, data: unknown, error: unknown): readonly unknown[] {
  if (error || !Array.isArray(data)) {
    throw new Error(`Catalog source query failed for ${table}.`);
  }
  return data;
}

export class SupabaseCatalogTableReader implements CatalogTableReader {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async readCatalogTables(): Promise<SupabaseCatalogRows> {
    const [
      categories,
      products,
      productOptions,
      productOptionValues,
      productVariants,
      productVariantValues,
      productAssets,
      productFulfillmentConfigs,
    ] = await Promise.all([
      this.client.from("categories").select("id, slug, name, description, seo, lifecycle").order("slug").order("id"),
      this.client.from("products").select("id, slug, category_id, name, description, seo, lifecycle").order("slug").order("id"),
      this.client.from("product_options").select("id, product_id, code, name, kind, is_required, position").order("product_id").order("position").order("id"),
      this.client.from("product_option_values").select("id, product_id, option_id, code, label, position").order("option_id").order("position").order("id"),
      this.client.from("product_variants").select("id, product_id, sku_code, price_cents, currency, weight_grams, is_active, is_available, is_default, supply_method, combination_signature").order("product_id").order("sku_code").order("id"),
      this.client.from("product_variant_values").select("variant_id, product_id, option_id, option_value_id").order("product_id").order("variant_id").order("option_id"),
      this.client.from("product_assets").select("id, product_id, variant_id, media_type, role, position, alt_text, title, width, height, visibility, source_kind, source_value").order("product_id").order("position").order("id"),
      this.client.from("product_fulfillment_configs").select("id, product_id, fulfillment_type, requires_shipping, production_mode, min_lead_time_business_days, max_lead_time_business_days").order("product_id").order("id"),
    ]);
    return {
      categories: rowsOrThrow("categories", categories.data, categories.error),
      products: rowsOrThrow("products", products.data, products.error),
      productOptions: rowsOrThrow("product_options", productOptions.data, productOptions.error),
      productOptionValues: rowsOrThrow("product_option_values", productOptionValues.data, productOptionValues.error),
      productVariants: rowsOrThrow("product_variants", productVariants.data, productVariants.error),
      productVariantValues: rowsOrThrow("product_variant_values", productVariantValues.data, productVariantValues.error),
      productAssets: rowsOrThrow("product_assets", productAssets.data, productAssets.error),
      productFulfillmentConfigs: rowsOrThrow("product_fulfillment_configs", productFulfillmentConfigs.data, productFulfillmentConfigs.error),
    };
  }
}

export class SupabaseCatalogDataSource implements CatalogDataSource {
  private readonly reader: CatalogTableReader;

  constructor(reader: CatalogTableReader) {
    this.reader = reader;
  }

  async loadCatalogDataSet(): Promise<CatalogRepositoryResult<CatalogDataSet>> {
    try {
      return mapSupabaseCatalogRows(await this.reader.readCatalogTables());
    } catch {
      return { status: "source_failure", operation: "catalog.read" };
    }
  }
}

export class SupabaseCatalogRepository extends CatalogRepositoryService {
  constructor(reader: CatalogTableReader) {
    super(new SupabaseCatalogDataSource(reader));
  }

  static fromClient(client: SupabaseClient): SupabaseCatalogRepository {
    return new SupabaseCatalogRepository(new SupabaseCatalogTableReader(client));
  }
}
