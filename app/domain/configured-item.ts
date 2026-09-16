import {
  parseSelectedOptions,
  type SelectedOptionValue,
} from "./catalog/variant.ts";
import {
  isIdentifier,
  isRecord,
  isSkuCode,
  unknownFieldIssues,
  validationFailure,
  validationIssue,
  validationSuccess,
  type CatalogValidationIssue,
  type CatalogValidationResult,
} from "./catalog/validation.ts";
import {
  parseCustomizationValues,
  type CustomizationValues,
} from "./customization-value.ts";

/**
 * The browser's normalized claim about a configured item. It is deliberately
 * not proof that the Product, Variant, field configuration, or upload receipts
 * are current, owned, or eligible for a purchase. Later server work must
 * re-resolve each of those authorities before accepting a handoff.
 */
export interface ConfiguredItemHandoff {
  productId: string;
  variantId: string;
  skuCode: string;
  selectedOptions: readonly SelectedOptionValue[];
  configurationRevision: string;
  customizationValues: CustomizationValues;
}

function prefixIssues(
  issues: readonly CatalogValidationIssue[],
  prefix: string,
): CatalogValidationIssue[] {
  return issues.map((entry) => ({
    ...entry,
    path: `${prefix}${entry.path === "$" ? "" : entry.path.slice(1)}`,
  }));
}

/**
 * Parses only the structural configured-item boundary. This function has no
 * repository, storage, ownership, price, cart, order, or network authority.
 */
export function parseConfiguredItemHandoff(
  value: unknown,
): CatalogValidationResult<ConfiguredItemHandoff> {
  if (!isRecord(value)) {
    return validationFailure(
      validationIssue("$", "invalid_type", "Configured item handoff must be an object."),
    );
  }

  const issues = unknownFieldIssues(value, [
    "productId",
    "variantId",
    "skuCode",
    "selectedOptions",
    "configurationRevision",
    "customizationValues",
  ]);

  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Configured item Product ID is invalid."));
  }
  if (!isIdentifier(value.variantId)) {
    issues.push(validationIssue("$.variantId", "invalid_format", "Configured item Variant ID is invalid."));
  }
  if (!isSkuCode(value.skuCode)) {
    issues.push(validationIssue("$.skuCode", "invalid_format", "Configured item SKU code is invalid."));
  }
  if (typeof value.configurationRevision !== "string" || value.configurationRevision.trim().length === 0) {
    issues.push(validationIssue("$.configurationRevision", "invalid_value", "Customization configuration revision must not be blank."));
  }

  const selectedOptions = parseSelectedOptions(value.selectedOptions);
  if (!selectedOptions.ok) {
    issues.push(...prefixIssues(selectedOptions.issues, "$.selectedOptions"));
  }
  const customizationValues = parseCustomizationValues(value.customizationValues);
  if (!customizationValues.ok) {
    issues.push(...prefixIssues(customizationValues.issues, "$.customizationValues"));
  }

  if (issues.length > 0 || !selectedOptions.ok || !customizationValues.ok) {
    return validationFailure(...issues);
  }

  return validationSuccess({
    productId: value.productId as string,
    variantId: value.variantId as string,
    skuCode: value.skuCode as string,
    selectedOptions: selectedOptions.value,
    configurationRevision: value.configurationRevision as string,
    customizationValues: customizationValues.value,
  });
}
