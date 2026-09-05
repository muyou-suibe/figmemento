import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProductAssetWriteRepository,
  ProductAssetWriteResult,
} from "../../application/admin-product-assets.ts";
import {
  isRecord,
  parseProductAsset,
  validationIssue,
  type ProductAsset,
} from "../../domain/catalog/index.ts";

const ASSET_SELECT = "id, product_id, variant_id, media_type, role, position, alt_text, title, width, height, visibility, source_kind, source_value";

export interface ProductAssetColumns {
  id: string;
  product_id: string;
  variant_id: string | null;
  media_type: ProductAsset["mediaType"];
  role: ProductAsset["role"];
  position: number;
  alt_text: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  visibility: "public";
  source_kind: ProductAsset["source"]["kind"];
  source_value: string;
}

export type ProductAssetUpdateColumns = Omit<ProductAssetColumns, "id" | "product_id">;

export interface ProductAssetTableWriteResult {
  data: unknown;
  error: unknown;
}

export interface ProductAssetTableWriter {
  insertAsset(columns: ProductAssetColumns): Promise<ProductAssetTableWriteResult>;
  updateAsset(
    id: string,
    productId: string,
    columns: ProductAssetUpdateColumns,
  ): Promise<ProductAssetTableWriteResult>;
  deleteAsset(id: string, productId: string): Promise<ProductAssetTableWriteResult>;
}

export class SupabaseProductAssetTableWriter implements ProductAssetTableWriter {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async insertAsset(columns: ProductAssetColumns): Promise<ProductAssetTableWriteResult> {
    return this.client
      .from("product_assets")
      .insert(columns)
      .select(ASSET_SELECT)
      .maybeSingle();
  }

  async updateAsset(
    id: string,
    productId: string,
    columns: ProductAssetUpdateColumns,
  ): Promise<ProductAssetTableWriteResult> {
    return this.client
      .from("product_assets")
      .update(columns)
      .eq("id", id)
      .eq("product_id", productId)
      .select(ASSET_SELECT)
      .maybeSingle();
  }

  async deleteAsset(id: string, productId: string): Promise<ProductAssetTableWriteResult> {
    return this.client
      .from("product_assets")
      .delete()
      .eq("id", id)
      .eq("product_id", productId)
      .select(ASSET_SELECT)
      .maybeSingle();
  }
}

function columnsFor(asset: ProductAsset): ProductAssetColumns {
  return {
    id: asset.id,
    product_id: asset.productId,
    ...updateColumnsFor(asset),
  };
}

function updateColumnsFor(asset: ProductAsset): ProductAssetUpdateColumns {
  return {
    variant_id: asset.variantId ?? null,
    media_type: asset.mediaType,
    role: asset.role,
    position: asset.position,
    alt_text: asset.altText ?? null,
    title: asset.title ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    visibility: "public",
    source_kind: asset.source.kind,
    source_value: asset.source.value,
  };
}

function mapAssetRow(row: unknown): ProductAssetWriteResult {
  if (!isRecord(row)) {
    return {
      status: "invalid_configuration",
      issues: [validationIssue("$", "invalid_type", "Saved ProductAsset data is malformed.")],
    };
  }
  const parsed = parseProductAsset({
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    mediaType: row.media_type,
    role: row.role,
    position: row.position,
    ...(typeof row.alt_text === "string" ? { altText: row.alt_text } : {}),
    ...(typeof row.title === "string" ? { title: row.title } : {}),
    ...(typeof row.width === "number" ? { width: row.width } : {}),
    ...(typeof row.height === "number" ? { height: row.height } : {}),
    visibility: row.visibility,
    source: { kind: row.source_kind, value: row.source_value },
  });
  return parsed.ok
    ? { status: "applied", value: parsed.value }
    : { status: "invalid_configuration", issues: parsed.issues };
}

function databaseErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function safeFailure(error: unknown): ProductAssetWriteResult {
  const code = databaseErrorCode(error);
  if (code === "23503") {
    return {
      status: "invalid_configuration",
      issues: [validationIssue("$.variantId", "ownership", "ProductAsset references unavailable catalog data or is still referenced.")],
    };
  }
  if (code === "23505") {
    return {
      status: "invalid_configuration",
      issues: [validationIssue("$.id", "duplicate", "ProductAsset identity already exists.")],
    };
  }
  return { status: "source_failure", operation: "catalog.admin.product_asset" };
}

export class SupabaseProductAssetRepository implements ProductAssetWriteRepository {
  private readonly writer: ProductAssetTableWriter;

  constructor(writer: ProductAssetTableWriter) {
    this.writer = writer;
  }

  static fromClient(client: SupabaseClient): SupabaseProductAssetRepository {
    return new SupabaseProductAssetRepository(new SupabaseProductAssetTableWriter(client));
  }

  async createProductAsset(asset: ProductAsset): Promise<ProductAssetWriteResult> {
    const result = await this.writer.insertAsset(columnsFor(asset));
    if (result.error) return safeFailure(result.error);
    return result.data === null ? { status: "not_found" } : mapAssetRow(result.data);
  }

  async updateProductAsset(asset: ProductAsset): Promise<ProductAssetWriteResult> {
    const result = await this.writer.updateAsset(asset.id, asset.productId, updateColumnsFor(asset));
    if (result.error) return safeFailure(result.error);
    return result.data === null ? { status: "not_found" } : mapAssetRow(result.data);
  }

  async removeProductAsset(asset: ProductAsset): Promise<ProductAssetWriteResult> {
    const result = await this.writer.deleteAsset(asset.id, asset.productId);
    if (result.error) return safeFailure(result.error);
    return result.data === null ? { status: "not_found" } : mapAssetRow(result.data);
  }
}
