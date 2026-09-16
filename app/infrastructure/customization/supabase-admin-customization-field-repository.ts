import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminCustomizationFieldReadResult,
  AdminCustomizationIdentityReadResult,
  CustomizationFieldAdminReadRepository,
} from "../../application/admin-customization-field-boundary.ts";
import { isIdentifier, isRecord } from "../../domain/catalog/validation.ts";
import {
  mapSupabaseAdminCustomizationFieldConfiguration,
  selectCurrentCustomizationConfiguration,
} from "./supabase-customization-field-mapper.ts";

const CURRENT_CONFIGURATION_SELECT = "id, product_id, is_current, superseded_at";
const ADMIN_FIELD_DEFINITION_SELECT = "configuration_revision_id, product_id, stable_field_id, label, kind, required, is_active, position, max_length, help_text, allowed_mime_types, max_bytes, min_width, min_height, recommended_width, recommended_height, min_image_count, max_image_count, crop_enabled";
const FIELD_IDENTITY_SELECT = "id, product_id, code";

export interface SupabaseAdminCustomizationFieldTableResult {
  data: unknown;
  error: unknown;
}

export interface SupabaseAdminCustomizationFieldTableReader {
  readProducts(productId: string): Promise<SupabaseAdminCustomizationFieldTableResult>;
  readCurrentConfigurations(productId: string): Promise<SupabaseAdminCustomizationFieldTableResult>;
  readFieldDefinitions(productId: string, revisionId: string): Promise<SupabaseAdminCustomizationFieldTableResult>;
  readFieldIdentities(productId: string, stableFieldIds: readonly string[]): Promise<SupabaseAdminCustomizationFieldTableResult>;
}

export class SupabaseAdminCustomizationFieldPostgrestReader
  implements SupabaseAdminCustomizationFieldTableReader
{
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async readProducts(productId: string): Promise<SupabaseAdminCustomizationFieldTableResult> {
    return await this.client.from("products").select("id").eq("id", productId);
  }

  async readCurrentConfigurations(productId: string): Promise<SupabaseAdminCustomizationFieldTableResult> {
    return await this.client
      .from("product_customization_configs")
      .select(CURRENT_CONFIGURATION_SELECT)
      .eq("product_id", productId)
      .eq("is_current", true);
  }

  async readFieldDefinitions(productId: string, revisionId: string): Promise<SupabaseAdminCustomizationFieldTableResult> {
    return await this.client
      .from("customization_fields")
      .select(ADMIN_FIELD_DEFINITION_SELECT)
      .eq("product_id", productId)
      .eq("configuration_revision_id", revisionId)
      .order("position");
  }

  async readFieldIdentities(productId: string, stableFieldIds: readonly string[]): Promise<SupabaseAdminCustomizationFieldTableResult> {
    if (stableFieldIds.length === 0) return { data: [], error: null };
    return await this.client
      .from("customization_field_identities")
      .select(FIELD_IDENTITY_SELECT)
      .eq("product_id", productId)
      .in("id", stableFieldIds);
  }
}

function rows(result: SupabaseAdminCustomizationFieldTableResult): readonly unknown[] | null {
  return result.error || !Array.isArray(result.data) ? null : result.data;
}

function stableFieldIds(definitions: readonly unknown[]): readonly string[] | null {
  const ids: string[] = [];
  for (const definition of definitions) {
    if (!isRecord(definition) || !isIdentifier(definition.stable_field_id)) return null;
    ids.push(definition.stable_field_id);
  }
  return [...new Set(ids)];
}

export class SupabaseAdminCustomizationFieldRepository
  implements CustomizationFieldAdminReadRepository
{
  private readonly reader: SupabaseAdminCustomizationFieldTableReader;

  constructor(reader: SupabaseAdminCustomizationFieldTableReader) {
    this.reader = reader;
  }

  static fromClient(client: SupabaseClient): SupabaseAdminCustomizationFieldRepository {
    return new SupabaseAdminCustomizationFieldRepository(
      new SupabaseAdminCustomizationFieldPostgrestReader(client),
    );
  }

  async getCurrentConfigurationForAdmin(productId: string): Promise<AdminCustomizationFieldReadResult> {
    try {
      const productRows = rows(await this.reader.readProducts(productId));
      if (!productRows) return { status: "source_failure", operation: "customization_field_configuration.admin_read" };
      if (productRows.length === 0) return { status: "not_found" };
      if (productRows.length !== 1) return {
        status: "invalid_configuration",
        issues: [{ path: "$.product", code: "duplicate", message: "Product identity is ambiguous." }],
      };

      const currentRows = rows(await this.reader.readCurrentConfigurations(productId));
      if (!currentRows) return { status: "source_failure", operation: "customization_field_configuration.admin_read" };
      if (currentRows.length === 0) return { status: "not_configured" };
      const current = selectCurrentCustomizationConfiguration(productId, currentRows);
      if (current.status === "not_found") return { status: "not_configured" };
      if (current.status !== "found") return current;

      const definitionRows = rows(await this.reader.readFieldDefinitions(productId, current.value.id));
      if (!definitionRows) return { status: "source_failure", operation: "customization_field_configuration.admin_read" };
      const ids = stableFieldIds(definitionRows);
      if (ids === null) return {
        status: "invalid_configuration",
        issues: [{ path: "$.fieldDefinitions", code: "invalid_format", message: "Customization field definitions are malformed." }],
      };
      const identityRows = rows(await this.reader.readFieldIdentities(productId, ids));
      if (!identityRows) return { status: "source_failure", operation: "customization_field_configuration.admin_read" };
      return mapSupabaseAdminCustomizationFieldConfiguration(productId, current.value, definitionRows, identityRows);
    } catch {
      return { status: "source_failure", operation: "customization_field_configuration.admin_read" };
    }
  }

  async getStableFieldIdentitiesForAdmin(
    productId: string,
    stableFieldIds: readonly string[],
  ): Promise<AdminCustomizationIdentityReadResult> {
    try {
      const result = rows(await this.reader.readFieldIdentities(productId, stableFieldIds));
      if (!result) return { status: "source_failure", operation: "customization_field_configuration.admin_read" };
      const values = [] as { id: string; productId: string; code: string }[];
      for (const row of result) {
        if (!isRecord(row)
          || !isIdentifier(row.id) || !isIdentifier(row.product_id) || typeof row.code !== "string") {
          return {
            status: "invalid_configuration",
            issues: [{ path: "$.stableFieldIdentities", code: "invalid_format", message: "Stable field identity data is malformed." }],
          };
        }
        values.push({ id: row.id, productId: row.product_id, code: row.code });
      }
      return { status: "found", value: values };
    } catch {
      return { status: "source_failure", operation: "customization_field_configuration.admin_read" };
    }
  }
}
