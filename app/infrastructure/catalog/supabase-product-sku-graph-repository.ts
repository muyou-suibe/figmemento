import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalVariantSignature,
  isRecord,
  validationIssue,
} from "../../domain/catalog/index.ts";
import type {
  ProductSkuGraph,
  ProductSkuGraphWriteRepository,
  ProductSkuGraphWriteResult,
} from "../../application/admin-sku-graph.ts";

export interface SaveProductSkuGraphRpcArguments {
  p_product_id: string;
  p_options: readonly Record<string, unknown>[];
  p_option_values: readonly Record<string, unknown>[];
  p_variants: readonly Record<string, unknown>[];
  p_variant_values: readonly Record<string, unknown>[];
}

export interface ProductSkuGraphRpcResult {
  data: unknown;
  error: unknown;
}

export interface ProductSkuGraphRpcClient {
  saveProductSkuGraph(
    arguments_: SaveProductSkuGraphRpcArguments,
  ): Promise<ProductSkuGraphRpcResult>;
}

function compareId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

export function toSaveProductSkuGraphRpcArguments(
  graph: ProductSkuGraph,
): SaveProductSkuGraphRpcArguments {
  const options = [...graph.options].sort(
    (left, right) => left.position - right.position || compareId(left, right),
  );
  const optionValues = [...graph.optionValues].sort(
    (left, right) =>
      left.optionId.localeCompare(right.optionId) ||
      left.position - right.position ||
      compareId(left, right),
  );
  const variants = [...graph.variants].sort(compareId);
  return {
    p_product_id: graph.productId,
    p_options: options.map((option) => ({
      id: option.id,
      product_id: graph.productId,
      code: option.code,
      name: option.name,
      kind: option.kind,
      is_required: option.required,
      position: option.position,
    })),
    p_option_values: optionValues.map((value) => ({
      id: value.id,
      product_id: graph.productId,
      option_id: value.optionId,
      code: value.code,
      label: value.label,
      position: value.position,
    })),
    p_variants: variants.map((variant) => ({
      id: variant.id,
      product_id: graph.productId,
      sku_code: variant.skuCode,
      price_cents: variant.priceCents,
      currency: variant.currency,
      weight_grams: variant.weightGrams,
      is_active: variant.isActive,
      is_available: variant.isAvailable,
      is_default: variant.isDefault,
      supply_method: variant.supplyMethod,
      combination_signature: canonicalVariantSignature(variant.selectedOptions),
    })),
    p_variant_values: variants.flatMap((variant) =>
      [...variant.selectedOptions]
        .sort(
          (left, right) =>
            left.optionId.localeCompare(right.optionId) ||
            left.valueId.localeCompare(right.valueId),
        )
        .map((selection) => ({
          variant_id: variant.id,
          product_id: graph.productId,
          option_id: selection.optionId,
          option_value_id: selection.valueId,
        })),
    ),
  };
}

function errorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function safeRpcFailure(error: unknown): ProductSkuGraphWriteResult {
  const code = errorCode(error);
  if (code === "P0002") return { status: "not_found" };
  if (code && ["22023", "23502", "23503", "23505", "23514"].includes(code)) {
    return {
      status: "invalid_configuration",
      issues: [
        validationIssue(
          "$.skuGraph",
          code === "23505" ? "duplicate" : "invalid_value",
          code === "23503"
            ? "The SKU graph conflicts with an existing catalog reference. Update related catalog data before removing this SKU."
            : "The SKU graph conflicts with the current catalog configuration.",
        ),
      ],
    };
  }
  return { status: "source_failure", operation: "catalog.admin.sku_graph" };
}

export class SupabaseProductSkuGraphRepository
  implements ProductSkuGraphWriteRepository
{
  private readonly client: ProductSkuGraphRpcClient;

  constructor(client: ProductSkuGraphRpcClient) {
    this.client = client;
  }

  static fromClient(client: SupabaseClient): SupabaseProductSkuGraphRepository {
    return new SupabaseProductSkuGraphRepository({
      async saveProductSkuGraph(arguments_) {
        return await client.rpc("save_product_sku_graph", arguments_);
      },
    });
  }

  async saveProductSkuGraph(
    graph: ProductSkuGraph,
  ): Promise<ProductSkuGraphWriteResult> {
    const arguments_ = toSaveProductSkuGraphRpcArguments(graph);
    const result = await this.client.saveProductSkuGraph(arguments_);
    return result.error
      ? safeRpcFailure(result.error)
      : { status: "applied", value: graph };
  }
}
