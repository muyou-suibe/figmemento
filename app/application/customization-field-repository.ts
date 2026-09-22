import {
  isIdentifier,
  isRecord,
  validationIssue,
  type CatalogValidationIssue,
} from "../domain/catalog/validation.ts";
import {
  parseCustomizationField,
  type CustomizationField,
} from "../domain/customization-field.ts";
import { validateCustomizationRuleGraph } from "../domain/customization-validation.ts";

/**
 * The authoritative, current customization configuration for one Product.
 * `CustomizationField.id` is the stable logical field identity; persistence
 * implementations must not substitute a revision-row identifier for it.
 */
export interface ProductCustomizationFieldConfiguration {
  productId: string;
  configurationRevision: string;
  fields: readonly CustomizationField[];
}

export type CustomizationFieldRepositoryResult<T> =
  | { status: "found"; value: T }
  | { status: "not_found" }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] }
  | { status: "source_failure"; operation: "customization_field_configuration.read" };

/**
 * Provider-neutral read port. Implementations must resolve the Product's
 * authoritative current configuration and must not use legacy JSON or
 * development fixtures as a production fallback.
 */
export interface CustomizationFieldReadRepository {
  getCustomizationFieldsForProduct(
    productId: string,
  ): Promise<CustomizationFieldRepositoryResult<ProductCustomizationFieldConfiguration>>;
}

export const CUSTOMIZATION_FIELD_SOURCE_FAILURE_OPERATION =
  "customization_field_configuration.read" as const;

export function customizationFieldSourceFailure(): CustomizationFieldRepositoryResult<never> {
  return {
    status: "source_failure",
    operation: CUSTOMIZATION_FIELD_SOURCE_FAILURE_OPERATION,
  };
}

function configurationIssue(
  path: string,
  code: CatalogValidationIssue["code"],
  message: string,
): CatalogValidationIssue {
  return validationIssue(path, code, message);
}

function publicCustomizationField(field: CustomizationField): CustomizationField {
  if (field.kind === "single_select") {
    return {
      ...field,
      constraints: {
        ...field.constraints,
        choices: field.constraints.choices.filter((choice) => choice.isActive).map((choice) => ({ ...choice })),
      },
    };
  }
  if (field.kind !== "multi_select") return field;
  return {
    ...field,
    constraints: {
      ...field.constraints,
      choices: field.constraints.choices
        .filter((choice) => choice.isActive)
        .map((choice) => ({ ...choice })),
    },
  };
}

/**
 * Validates and normalizes data that a provider implementation has identified
 * as one current configuration. It intentionally does not perform I/O or
 * determine Product publication eligibility; those are repository/caller
 * responsibilities. A missing current configuration is represented by the
 * repository's `not_found` result, not by this parser.
 */
export function normalizeCustomizationFieldConfiguration(
  expectedProductId: string,
  value: unknown,
): CustomizationFieldRepositoryResult<ProductCustomizationFieldConfiguration> {
  return normalizeCustomizationFieldConfigurationWithActivity(
    expectedProductId,
    value,
    false,
  );
}

/**
 * Administrator reads retain inactive definitions so a complete replacement
 * can explicitly reactivate or preserve them. Public catalog reads validate
 * the complete definition before projecting active fields and choices only.
 */
export function normalizeAdminCustomizationFieldConfiguration(
  expectedProductId: string,
  value: unknown,
): CustomizationFieldRepositoryResult<ProductCustomizationFieldConfiguration> {
  return normalizeCustomizationFieldConfigurationWithActivity(
    expectedProductId,
    value,
    true,
  );
}

function normalizeCustomizationFieldConfigurationWithActivity(
  expectedProductId: string,
  value: unknown,
  allowInactive: boolean,
): CustomizationFieldRepositoryResult<ProductCustomizationFieldConfiguration> {
  if (!isIdentifier(expectedProductId)) {
    return {
      status: "invalid_configuration",
      issues: [configurationIssue("$.productId", "invalid_format", "Requested Product ID is invalid.")],
    };
  }
  if (!isRecord(value)) {
    return {
      status: "invalid_configuration",
      issues: [configurationIssue("$", "invalid_type", "Customization configuration must be an object.")],
    };
  }

  const issues: CatalogValidationIssue[] = [];
  if (value.productId !== expectedProductId) {
    issues.push(configurationIssue("$.productId", "ownership", "Customization configuration belongs to another Product."));
  }
  if (typeof value.configurationRevision !== "string" || value.configurationRevision.trim().length === 0) {
    issues.push(configurationIssue("$.configurationRevision", "invalid_value", "Customization configuration revision must not be blank."));
  }
  if (!Array.isArray(value.fields)) {
    issues.push(configurationIssue("$.fields", "invalid_type", "Customization configuration fields must be an array."));
  }
  if (issues.length > 0 || !Array.isArray(value.fields) || typeof value.configurationRevision !== "string") {
    return { status: "invalid_configuration", issues };
  }

  const fields: CustomizationField[] = [];
  for (const [index, candidate] of value.fields.entries()) {
    const parsed = parseCustomizationField(candidate);
    if (!parsed.ok) {
      issues.push(...parsed.issues.map((issue) => ({ ...issue, path: `$.fields[${index}]${issue.path.slice(1)}` })));
      continue;
    }
    if (parsed.value.productId !== expectedProductId) {
      issues.push(configurationIssue(`$.fields[${index}].productId`, "ownership", "Customization field belongs to another Product."));
    }
    if (parsed.value.configurationRevision !== value.configurationRevision) {
      issues.push(configurationIssue(`$.fields[${index}].configurationRevision`, "invalid_value", "Customization field revision does not match the current configuration."));
    }
    fields.push(parsed.value);
  }

  const duplicateFieldIds = new Set<string>();
  const duplicateCodes = new Set<string>();
  const duplicatePositions = new Set<number>();
  const seenFieldIds = new Set<string>();
  const seenCodes = new Set<string>();
  const seenPositions = new Set<number>();
  for (const field of fields) {
    if (seenFieldIds.has(field.id)) duplicateFieldIds.add(field.id);
    if (seenCodes.has(field.code)) duplicateCodes.add(field.code);
    if (seenPositions.has(field.position)) duplicatePositions.add(field.position);
    seenFieldIds.add(field.id);
    seenCodes.add(field.code);
    seenPositions.add(field.position);
  }
  for (const id of duplicateFieldIds) {
    issues.push(configurationIssue("$.fields", "duplicate", `Customization field ID '${id}' is duplicated.`));
  }
  for (const code of duplicateCodes) {
    issues.push(configurationIssue("$.fields", "duplicate", `Customization field code '${code}' is duplicated.`));
  }
  for (const position of duplicatePositions) {
    issues.push(configurationIssue("$.fields", "duplicate", `Customization field position '${position}' is duplicated.`));
  }

  if (issues.length === 0) {
    const graph = validateCustomizationRuleGraph(fields);
    if (!graph.ok) issues.push(...graph.issues.map((item) => configurationIssue(item.path, "invalid_value", item.message)));
  }
  if (issues.length > 0) return { status: "invalid_configuration", issues };

  return {
    status: "found",
    value: {
      productId: expectedProductId,
      configurationRevision: value.configurationRevision,
      fields: fields
        .toSorted((left, right) => left.position - right.position)
        .filter((field) => allowInactive || field.isActive)
        .map((field) => allowInactive ? field : publicCustomizationField(field)),
    },
  };
}
