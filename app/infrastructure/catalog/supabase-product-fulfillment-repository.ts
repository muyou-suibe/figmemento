import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProductFulfillmentWriteRepository,
  ProductFulfillmentWriteResult,
} from "../../application/admin-product-fulfillment.ts";
import {
  isRecord,
  parseProductFulfillmentConfig,
  validationIssue,
  type ProductFulfillmentConfig,
} from "../../domain/catalog/index.ts";

const FULFILLMENT_SELECT = "id, product_id, fulfillment_type, requires_shipping, production_mode, min_lead_time_business_days, max_lead_time_business_days";

export interface ProductFulfillmentColumns {
  id: string;
  product_id: string;
  fulfillment_type: ProductFulfillmentConfig["fulfillmentType"];
  requires_shipping: boolean;
  production_mode: ProductFulfillmentConfig["productionMode"];
  min_lead_time_business_days: number;
  max_lead_time_business_days: number;
}

export type ProductFulfillmentUpdateColumns = Omit<ProductFulfillmentColumns, "id" | "product_id">;

export interface ProductFulfillmentTableWriteResult {
  data: unknown;
  error: unknown;
}

export interface ProductFulfillmentTableWriter {
  insertConfig(columns: ProductFulfillmentColumns): Promise<ProductFulfillmentTableWriteResult>;
  updateConfig(
    id: string,
    productId: string,
    columns: ProductFulfillmentUpdateColumns,
  ): Promise<ProductFulfillmentTableWriteResult>;
}

export class SupabaseProductFulfillmentTableWriter implements ProductFulfillmentTableWriter {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async insertConfig(columns: ProductFulfillmentColumns): Promise<ProductFulfillmentTableWriteResult> {
    return this.client
      .from("product_fulfillment_configs")
      .insert(columns)
      .select(FULFILLMENT_SELECT)
      .maybeSingle();
  }

  async updateConfig(
    id: string,
    productId: string,
    columns: ProductFulfillmentUpdateColumns,
  ): Promise<ProductFulfillmentTableWriteResult> {
    return this.client
      .from("product_fulfillment_configs")
      .update(columns)
      .eq("id", id)
      .eq("product_id", productId)
      .select(FULFILLMENT_SELECT)
      .maybeSingle();
  }
}

function updateColumnsFor(config: ProductFulfillmentConfig): ProductFulfillmentUpdateColumns {
  return {
    fulfillment_type: config.fulfillmentType,
    requires_shipping: config.requiresShipping,
    production_mode: config.productionMode,
    min_lead_time_business_days: config.leadTime.minBusinessDays,
    max_lead_time_business_days: config.leadTime.maxBusinessDays,
  };
}

function columnsFor(config: ProductFulfillmentConfig): ProductFulfillmentColumns {
  return {
    id: config.id,
    product_id: config.productId,
    ...updateColumnsFor(config),
  };
}

function mapConfigRow(row: unknown): ProductFulfillmentWriteResult {
  if (!isRecord(row)) {
    return {
      status: "invalid_configuration",
      issues: [validationIssue("$", "invalid_type", "Saved FulfillmentConfig data is malformed.")],
    };
  }
  const parsed = parseProductFulfillmentConfig({
    id: row.id,
    productId: row.product_id,
    fulfillmentType: row.fulfillment_type,
    requiresShipping: row.requires_shipping,
    productionMode: row.production_mode,
    leadTime: {
      minBusinessDays: row.min_lead_time_business_days,
      maxBusinessDays: row.max_lead_time_business_days,
    },
  });
  return parsed.ok
    ? { status: "applied", value: parsed.value }
    : { status: "invalid_configuration", issues: parsed.issues };
}

function databaseErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function safeFailure(error: unknown): ProductFulfillmentWriteResult {
  const code = databaseErrorCode(error);
  if (code === "23505") {
    return {
      status: "invalid_configuration",
      issues: [validationIssue("$.productId", "duplicate", "Product already has a FulfillmentConfig. Reload and update it instead.")],
    };
  }
  if (code === "23503") {
    return {
      status: "invalid_configuration",
      issues: [validationIssue("$.productId", "ownership", "FulfillmentConfig Product is unavailable.")],
    };
  }
  return { status: "source_failure", operation: "catalog.admin.product_fulfillment" };
}

export class SupabaseProductFulfillmentRepository implements ProductFulfillmentWriteRepository {
  private readonly writer: ProductFulfillmentTableWriter;

  constructor(writer: ProductFulfillmentTableWriter) {
    this.writer = writer;
  }

  static fromClient(client: SupabaseClient): SupabaseProductFulfillmentRepository {
    return new SupabaseProductFulfillmentRepository(new SupabaseProductFulfillmentTableWriter(client));
  }

  async createProductFulfillmentConfig(
    config: ProductFulfillmentConfig,
  ): Promise<ProductFulfillmentWriteResult> {
    const result = await this.writer.insertConfig(columnsFor(config));
    if (result.error) return safeFailure(result.error);
    return result.data === null ? { status: "not_found" } : mapConfigRow(result.data);
  }

  async updateProductFulfillmentConfig(
    config: ProductFulfillmentConfig,
  ): Promise<ProductFulfillmentWriteResult> {
    const result = await this.writer.updateConfig(config.id, config.productId, updateColumnsFor(config));
    if (result.error) return safeFailure(result.error);
    return result.data === null ? { status: "not_found" } : mapConfigRow(result.data);
  }
}
