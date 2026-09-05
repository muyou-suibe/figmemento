import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CatalogAdminCommandRepository,
  CatalogAdminCommandResult,
} from "../../application/catalog-repository.ts";
import {
  isRecord,
  parseCatalogProduct,
  parseCategory,
  validationIssue,
  type CatalogProduct,
  type Category,
  type ProductAsset,
  type ProductFulfillmentConfig,
  type ProductOption,
  type ProductOptionValue,
  type ProductVariant,
} from "../../domain/catalog/index.ts";

export interface CatalogAdminTableWriteResult {
  data: unknown;
  error: unknown;
}

export interface CatalogAdminTableWriter {
  updateCategory(
    id: string,
    columns: {
      slug: string;
      name: string;
      description: string;
      seo: Category["seo"];
    },
  ): Promise<CatalogAdminTableWriteResult>;
  updateProduct(
    id: string,
    columns: {
      slug: string;
      category_id: string;
      name: string;
      description: string;
      seo: CatalogProduct["seo"];
    },
  ): Promise<CatalogAdminTableWriteResult>;
}

export class SupabaseCatalogAdminTableWriter implements CatalogAdminTableWriter {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async updateCategory(
    id: string,
    columns: { slug: string; name: string; description: string; seo: Category["seo"] },
  ): Promise<CatalogAdminTableWriteResult> {
    return this.client
      .from("categories")
      .update(columns)
      .eq("id", id)
      .select("id, slug, name, description, seo, lifecycle")
      .maybeSingle();
  }

  async updateProduct(
    id: string,
    columns: {
      slug: string;
      category_id: string;
      name: string;
      description: string;
      seo: CatalogProduct["seo"];
    },
  ): Promise<CatalogAdminTableWriteResult> {
    return this.client
      .from("products")
      .update(columns)
      .eq("id", id)
      .select("id, slug, category_id, name, description, seo, lifecycle")
      .maybeSingle();
  }
}

function databaseErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function safeWriteFailure<T>(error: unknown, slugPath: string): CatalogAdminCommandResult<T> {
  return databaseErrorCode(error) === "23505"
    ? {
        status: "invalid_configuration",
        issues: [validationIssue(slugPath, "duplicate", "Slug already exists.")],
      }
    : { status: "source_failure", operation: "catalog.admin.write" };
}

export class SupabaseCatalogAdminCommandRepository implements CatalogAdminCommandRepository {
  private readonly writer: CatalogAdminTableWriter;

  constructor(writer: CatalogAdminTableWriter) {
    this.writer = writer;
  }

  static fromClient(client: SupabaseClient): SupabaseCatalogAdminCommandRepository {
    return new SupabaseCatalogAdminCommandRepository(new SupabaseCatalogAdminTableWriter(client));
  }

  async saveCategory(category: Category): Promise<CatalogAdminCommandResult<Category>> {
    const result = await this.writer.updateCategory(category.id, {
      slug: category.slug,
      name: category.name,
      description: category.description,
      seo: category.seo,
    });
    if (result.error) return safeWriteFailure(result.error, "$.slug");
    if (result.data === null) return { status: "not_found" };
    const parsed = parseCategory(result.data);
    return parsed.ok
      ? { status: "applied", value: parsed.value }
      : { status: "invalid_configuration", issues: parsed.issues };
  }

  async saveProduct(product: CatalogProduct): Promise<CatalogAdminCommandResult<CatalogProduct>> {
    const result = await this.writer.updateProduct(product.id, {
      slug: product.slug,
      category_id: product.categoryId,
      name: product.name,
      description: product.description,
      seo: product.seo,
    });
    if (result.error) return safeWriteFailure(result.error, "$.slug");
    if (result.data === null) return { status: "not_found" };
    if (!isRecord(result.data)) {
      return {
        status: "invalid_configuration",
        issues: [validationIssue("$", "invalid_type", "Saved Product data is malformed.")],
      };
    }
    const parsed = parseCatalogProduct({
      id: result.data.id,
      slug: result.data.slug,
      categoryId: result.data.category_id,
      name: result.data.name,
      description: result.data.description,
      seo: result.data.seo,
      lifecycle: result.data.lifecycle,
    });
    return parsed.ok
      ? { status: "applied", value: parsed.value }
      : { status: "invalid_configuration", issues: parsed.issues };
  }

  async saveOption(): Promise<CatalogAdminCommandResult<ProductOption>> {
    return { status: "source_failure", operation: "catalog.admin.unsupported" };
  }

  async saveOptionValue(): Promise<CatalogAdminCommandResult<ProductOptionValue>> {
    return { status: "source_failure", operation: "catalog.admin.unsupported" };
  }

  async saveVariant(): Promise<CatalogAdminCommandResult<ProductVariant>> {
    return { status: "source_failure", operation: "catalog.admin.unsupported" };
  }

  async saveAsset(): Promise<CatalogAdminCommandResult<ProductAsset>> {
    return { status: "source_failure", operation: "catalog.admin.unsupported" };
  }

  async saveFulfillmentConfig(): Promise<CatalogAdminCommandResult<ProductFulfillmentConfig>> {
    return { status: "source_failure", operation: "catalog.admin.unsupported" };
  }
}
