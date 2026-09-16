import type { SupabaseClient } from "@supabase/supabase-js";
import {
  customizationFieldSourceFailure,
  type CustomizationFieldReadRepository,
  type CustomizationFieldRepositoryResult,
  type ProductCustomizationFieldConfiguration,
} from "../../application/customization-field-repository.ts";
import {
  mapSupabaseCustomizationFieldConfiguration,
  selectCurrentCustomizationConfiguration,
  stableFieldIdsFromDefinitionRows,
} from "./supabase-customization-field-mapper.ts";

export const CURRENT_CONFIGURATION_SELECT = "id, product_id, is_current, superseded_at";
export const ACTIVE_FIELD_DEFINITION_SELECT = "configuration_revision_id, product_id, stable_field_id, label, kind, required, is_active, position, max_length, help_text, allowed_mime_types, max_bytes, min_width, min_height, recommended_width, recommended_height, min_image_count, max_image_count, crop_enabled";
export const FIELD_IDENTITY_SELECT = "id, product_id, code";

export interface SupabaseCustomizationFieldTableResult {
  data: unknown;
  error: unknown;
}

export interface SupabaseCustomizationFieldTableReader {
  readCurrentConfigurations(productId: string): Promise<SupabaseCustomizationFieldTableResult>;
  readActiveFieldDefinitions(
    productId: string,
    configurationRevision: string,
  ): Promise<SupabaseCustomizationFieldTableResult>;
  readFieldIdentities(
    productId: string,
    stableFieldIds: readonly string[],
  ): Promise<SupabaseCustomizationFieldTableResult>;
}

export class SupabaseCustomizationFieldPostgrestReader
  implements SupabaseCustomizationFieldTableReader
{
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async readCurrentConfigurations(productId: string): Promise<SupabaseCustomizationFieldTableResult> {
    return await this.client
      .from("product_customization_configs")
      .select(CURRENT_CONFIGURATION_SELECT)
      .eq("product_id", productId)
      .eq("is_current", true);
  }

  async readActiveFieldDefinitions(
    productId: string,
    configurationRevision: string,
  ): Promise<SupabaseCustomizationFieldTableResult> {
    return await this.client
      .from("customization_fields")
      .select(ACTIVE_FIELD_DEFINITION_SELECT)
      .eq("product_id", productId)
      .eq("configuration_revision_id", configurationRevision)
      .eq("is_active", true)
      .order("position");
  }

  async readFieldIdentities(
    productId: string,
    stableFieldIds: readonly string[],
  ): Promise<SupabaseCustomizationFieldTableResult> {
    if (stableFieldIds.length === 0) return Promise.resolve({ data: [], error: null });
    return await this.client
      .from("customization_field_identities")
      .select(FIELD_IDENTITY_SELECT)
      .eq("product_id", productId)
      .in("id", stableFieldIds);
  }
}

function successfulRows(result: SupabaseCustomizationFieldTableResult): readonly unknown[] | null {
  return result.error || !Array.isArray(result.data) ? null : result.data;
}

/**
 * Supabase implementation of the Task 4.1 read port. It does not determine
 * public Product eligibility and deliberately owns no fixture or legacy-JSON
 * fallback behavior.
 */
export class SupabaseCustomizationFieldRepository implements CustomizationFieldReadRepository {
  private readonly reader: SupabaseCustomizationFieldTableReader;

  constructor(reader: SupabaseCustomizationFieldTableReader) {
    this.reader = reader;
  }

  static fromClient(client: SupabaseClient): SupabaseCustomizationFieldRepository {
    return new SupabaseCustomizationFieldRepository(new SupabaseCustomizationFieldPostgrestReader(client));
  }

  async getCustomizationFieldsForProduct(
    productId: string,
  ): Promise<CustomizationFieldRepositoryResult<ProductCustomizationFieldConfiguration>> {
    let currentConfigurations: readonly unknown[];
    try {
      const rows = successfulRows(await this.reader.readCurrentConfigurations(productId));
      if (!rows) return customizationFieldSourceFailure();
      currentConfigurations = rows;
    } catch {
      return customizationFieldSourceFailure();
    }

    const current = selectCurrentCustomizationConfiguration(productId, currentConfigurations);
    if (current.status !== "found") return current;

    let definitionRows: readonly unknown[];
    try {
      const rows = successfulRows(await this.reader.readActiveFieldDefinitions(productId, current.value.id));
      if (!rows) return customizationFieldSourceFailure();
      definitionRows = rows;
    } catch {
      return customizationFieldSourceFailure();
    }

    const stableFieldIds = stableFieldIdsFromDefinitionRows(definitionRows);
    if (stableFieldIds === null) {
      return mapSupabaseCustomizationFieldConfiguration(productId, current.value, definitionRows, []);
    }
    if (stableFieldIds.length === 0) {
      return mapSupabaseCustomizationFieldConfiguration(productId, current.value, definitionRows, []);
    }

    try {
      const rows = successfulRows(await this.reader.readFieldIdentities(productId, stableFieldIds));
      if (!rows) return customizationFieldSourceFailure();
      return mapSupabaseCustomizationFieldConfiguration(productId, current.value, definitionRows, rows);
    } catch {
      return customizationFieldSourceFailure();
    }
  }
}
