import {
  isIdentifier,
  isRecord,
  validationIssue,
  type CatalogValidationIssue,
} from "../../domain/catalog/validation.ts";
import {
  normalizeAdminCustomizationFieldConfiguration,
  normalizeCustomizationFieldConfiguration,
  type CustomizationFieldRepositoryResult,
  type ProductCustomizationFieldConfiguration,
} from "../../application/customization-field-repository.ts";

export interface SupabaseCurrentCustomizationConfiguration {
  id: string;
  productId: string;
}

interface SupabaseCustomizationFieldIdentity {
  id: string;
  productId: string;
  code: string;
}

function invalidConfiguration(
  ...issues: CatalogValidationIssue[]
): CustomizationFieldRepositoryResult<never> {
  return { status: "invalid_configuration", issues };
}

function issue(
  path: string,
  code: CatalogValidationIssue["code"],
  message: string,
): CatalogValidationIssue {
  return validationIssue(path, code, message);
}

export function selectCurrentCustomizationConfiguration(
  expectedProductId: string,
  rows: readonly unknown[],
): CustomizationFieldRepositoryResult<SupabaseCurrentCustomizationConfiguration> {
  if (rows.length === 0) return { status: "not_found" };
  if (rows.length !== 1) {
    return invalidConfiguration(
      issue("$.currentConfigurations", "duplicate", "More than one current customization configuration exists for this Product."),
    );
  }

  const row = rows[0];
  if (!isRecord(row)) {
    return invalidConfiguration(
      issue("$.currentConfigurations[0]", "invalid_type", "Current customization configuration row must be an object."),
    );
  }
  const issues: CatalogValidationIssue[] = [];
  if (!isIdentifier(row.id)) {
    issues.push(issue("$.currentConfigurations[0].id", "invalid_format", "Current customization configuration ID is invalid."));
  }
  if (row.product_id !== expectedProductId || !isIdentifier(row.product_id)) {
    issues.push(issue("$.currentConfigurations[0].product_id", "ownership", "Current customization configuration belongs to another Product."));
  }
  if (row.is_current !== true) {
    issues.push(issue("$.currentConfigurations[0].is_current", "invalid_value", "Current customization configuration must be marked current."));
  }
  if (row.superseded_at !== null) {
    issues.push(issue("$.currentConfigurations[0].superseded_at", "invalid_value", "Current customization configuration cannot be superseded."));
  }
  if (issues.length > 0 || !isIdentifier(row.id) || !isIdentifier(row.product_id)) {
    return invalidConfiguration(...issues);
  }

  return {
    status: "found",
    value: { id: row.id, productId: row.product_id },
  };
}

export function stableFieldIdsFromDefinitionRows(rows: readonly unknown[]): readonly string[] | null {
  const stableFieldIds: string[] = [];
  for (const row of rows) {
    if (!isRecord(row) || !isIdentifier(row.stable_field_id)) return null;
    stableFieldIds.push(row.stable_field_id);
  }
  return [...new Set(stableFieldIds)];
}

function parseFieldIdentities(
  expectedProductId: string,
  rows: readonly unknown[],
): { values: ReadonlyMap<string, SupabaseCustomizationFieldIdentity>; issues: CatalogValidationIssue[] } {
  const values = new Map<string, SupabaseCustomizationFieldIdentity>();
  const issues: CatalogValidationIssue[] = [];
  rows.forEach((row, index) => {
    const path = `$.fieldIdentities[${index}]`;
    if (!isRecord(row)) {
      issues.push(issue(path, "invalid_type", "Customization field identity row must be an object."));
      return;
    }
    if (!isIdentifier(row.id)) {
      issues.push(issue(`${path}.id`, "invalid_format", "Customization field stable identity is invalid."));
      return;
    }
    if (row.product_id !== expectedProductId || !isIdentifier(row.product_id)) {
      issues.push(issue(`${path}.product_id`, "ownership", "Customization field identity belongs to another Product."));
      return;
    }
    if (typeof row.code !== "string") {
      issues.push(issue(`${path}.code`, "invalid_format", "Customization field identity code is invalid."));
      return;
    }
    if (values.has(row.id)) {
      issues.push(issue(`${path}.id`, "duplicate", "Customization field stable identity is duplicated."));
      return;
    }
    values.set(row.id, { id: row.id, productId: row.product_id, code: row.code });
  });
  return { values, issues };
}

function fieldInputFromDefinition(
  row: Record<string, unknown>,
  index: number,
  expectedProductId: string,
  configuration: SupabaseCurrentCustomizationConfiguration,
  identities: ReadonlyMap<string, SupabaseCustomizationFieldIdentity>,
  allowInactive: boolean,
): { value?: unknown; issues: CatalogValidationIssue[] } {
  const path = `$.fieldDefinitions[${index}]`;
  const issues: CatalogValidationIssue[] = [];
  if (!isIdentifier(row.configuration_revision_id) || row.configuration_revision_id !== configuration.id) {
    issues.push(issue(`${path}.configuration_revision_id`, "ownership", "Customization field belongs to another configuration revision."));
  }
  if (!isIdentifier(row.product_id) || row.product_id !== expectedProductId) {
    issues.push(issue(`${path}.product_id`, "ownership", "Customization field belongs to another Product."));
  }
  if (!isIdentifier(row.stable_field_id)) {
    issues.push(issue(`${path}.stable_field_id`, "invalid_format", "Customization field stable identity is invalid."));
  }
  if (!allowInactive && row.is_active !== true) {
    issues.push(issue(`${path}.is_active`, "invalid_value", "Inactive customization fields cannot appear in a current configuration."));
  }
  if (issues.length > 0 || !isIdentifier(row.stable_field_id)) return { issues };

  const identity = identities.get(row.stable_field_id);
  if (!identity) {
    return {
      issues: [issue(`${path}.stable_field_id`, "ownership", "Customization field is missing its stable identity.")],
    };
  }

  const input = {
    id: identity.id,
    productId: row.product_id,
    code: identity.code,
    label: row.label,
    kind: row.kind,
    required: row.required,
    isActive: row.is_active,
    position: row.position,
    configurationRevision: configuration.id,
    constraints: row.kind === "image"
      ? {
          allowedMimeTypes: row.allowed_mime_types,
          maxBytes: row.max_bytes,
          minDimensions: { width: row.min_width, height: row.min_height },
          ...(
            row.recommended_width === null && row.recommended_height === null
              ? {}
              : { recommendedDimensions: { width: row.recommended_width, height: row.recommended_height } }
          ),
          minImageCount: row.min_image_count,
          maxImageCount: row.max_image_count,
          cropEnabled: row.crop_enabled,
        }
      : {
          maxLength: row.max_length,
          ...(row.help_text === null ? {} : { helpText: row.help_text }),
        },
  };
  return { value: input, issues };
}

export function mapSupabaseCustomizationFieldConfiguration(
  expectedProductId: string,
  configuration: SupabaseCurrentCustomizationConfiguration,
  definitionRows: readonly unknown[],
  identityRows: readonly unknown[],
): CustomizationFieldRepositoryResult<ProductCustomizationFieldConfiguration> {
  const identities = parseFieldIdentities(expectedProductId, identityRows);
  const issues = [...identities.issues];
  const fields: unknown[] = [];
  const expectedStableFieldIds = new Set<string>();

  definitionRows.forEach((row, index) => {
    const path = `$.fieldDefinitions[${index}]`;
    if (!isRecord(row)) {
      issues.push(issue(path, "invalid_type", "Customization field definition row must be an object."));
      return;
    }
    if (isIdentifier(row.stable_field_id)) expectedStableFieldIds.add(row.stable_field_id);
    const mapped = fieldInputFromDefinition(row, index, expectedProductId, configuration, identities.values, false);
    issues.push(...mapped.issues);
    if (mapped.value !== undefined) fields.push(mapped.value);
  });

  for (const identityId of identities.values.keys()) {
    if (!expectedStableFieldIds.has(identityId)) {
      issues.push(issue("$.fieldIdentities", "ownership", "Customization field identity is not referenced by the active configuration."));
    }
  }

  if (issues.length > 0) return invalidConfiguration(...issues);
  return normalizeCustomizationFieldConfiguration(expectedProductId, {
    productId: expectedProductId,
    configurationRevision: configuration.id,
    fields,
  });
}

/** Maps an admin-only complete configuration, including inactive definitions. */
export function mapSupabaseAdminCustomizationFieldConfiguration(
  expectedProductId: string,
  configuration: SupabaseCurrentCustomizationConfiguration,
  definitionRows: readonly unknown[],
  identityRows: readonly unknown[],
): CustomizationFieldRepositoryResult<ProductCustomizationFieldConfiguration> {
  const identities = parseFieldIdentities(expectedProductId, identityRows);
  const issues = [...identities.issues];
  const fields: unknown[] = [];
  const expectedStableFieldIds = new Set<string>();

  definitionRows.forEach((row, index) => {
    const path = `$.fieldDefinitions[${index}]`;
    if (!isRecord(row)) {
      issues.push(issue(path, "invalid_type", "Customization field definition row must be an object."));
      return;
    }
    if (isIdentifier(row.stable_field_id)) expectedStableFieldIds.add(row.stable_field_id);
    const mapped = fieldInputFromDefinition(row, index, expectedProductId, configuration, identities.values, true);
    issues.push(...mapped.issues);
    if (mapped.value !== undefined) fields.push(mapped.value);
  });

  for (const identityId of identities.values.keys()) {
    if (!expectedStableFieldIds.has(identityId)) {
      issues.push(issue("$.fieldIdentities", "ownership", "Customization field identity is not referenced by the current configuration."));
    }
  }
  if (issues.length > 0) return invalidConfiguration(...issues);
  return normalizeAdminCustomizationFieldConfiguration(expectedProductId, {
    productId: expectedProductId,
    configurationRevision: configuration.id,
    fields,
  });
}
