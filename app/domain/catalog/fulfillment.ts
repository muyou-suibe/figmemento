import {
  isIdentifier,
  isNonNegativeInteger,
  isRecord,
  unknownFieldIssues,
  validationFailure,
  validationIssue,
  validationSuccess,
  type CatalogValidationIssue,
  type CatalogValidationResult,
} from "./validation.ts";

export type FulfillmentType = "physical" | "digital";
export type ProductionMode = "custom_manufacturing" | "digital_creation";

export interface ProductionLeadTime {
  minBusinessDays: number;
  maxBusinessDays: number;
}

export interface ProductFulfillmentConfig {
  id: string;
  productId: string;
  fulfillmentType: FulfillmentType;
  requiresShipping: boolean;
  productionMode: ProductionMode;
  leadTime: ProductionLeadTime;
}

function fulfillmentIssues(
  config: ProductFulfillmentConfig,
): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  if (config.fulfillmentType === "digital" && config.requiresShipping) {
    issues.push(validationIssue("$.requiresShipping", "invalid_value", "Digital fulfillment cannot require physical shipping."));
  }
  if (
    !isNonNegativeInteger(config.leadTime.minBusinessDays) ||
    !isNonNegativeInteger(config.leadTime.maxBusinessDays) ||
    config.leadTime.minBusinessDays > config.leadTime.maxBusinessDays
  ) {
    issues.push(validationIssue("$.leadTime", "invalid_value", "Lead-time range must use non-negative days with minimum not greater than maximum."));
  }
  return issues;
}

export function validateProductFulfillmentConfig(
  config: ProductFulfillmentConfig,
): CatalogValidationResult<true> {
  const issues = fulfillmentIssues(config);
  return issues.length > 0
    ? validationFailure(...issues)
    : validationSuccess(true);
}

export function parseProductFulfillmentConfig(
  value: unknown,
): CatalogValidationResult<ProductFulfillmentConfig> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue("$", "invalid_type", "Product fulfillment config must be an object."));
  }
  const issues = unknownFieldIssues(value, [
    "id",
    "productId",
    "fulfillmentType",
    "requiresShipping",
    "productionMode",
    "leadTime",
  ]);
  if (!isIdentifier(value.id)) {
    issues.push(validationIssue("$.id", "invalid_format", "Fulfillment config ID is invalid."));
  }
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  if (value.fulfillmentType !== "physical" && value.fulfillmentType !== "digital") {
    issues.push(validationIssue("$.fulfillmentType", "invalid_value", "Fulfillment type must be physical or digital."));
  }
  if (typeof value.requiresShipping !== "boolean") {
    issues.push(validationIssue("$.requiresShipping", "invalid_type", "requiresShipping must be boolean."));
  }
  if (
    value.productionMode !== "custom_manufacturing" &&
    value.productionMode !== "digital_creation"
  ) {
    issues.push(validationIssue("$.productionMode", "invalid_value", "Production mode must use the approved C1 vocabulary."));
  }
  if (!isRecord(value.leadTime)) {
    issues.push(validationIssue("$.leadTime", "invalid_type", "Lead-time range must be an object."));
  } else {
    issues.push(...unknownFieldIssues(value.leadTime, ["minBusinessDays", "maxBusinessDays"], "$.leadTime"));
    if (!isNonNegativeInteger(value.leadTime.minBusinessDays)) {
      issues.push(validationIssue("$.leadTime.minBusinessDays", "invalid_value", "Minimum lead time must be a non-negative integer."));
    }
    if (!isNonNegativeInteger(value.leadTime.maxBusinessDays)) {
      issues.push(validationIssue("$.leadTime.maxBusinessDays", "invalid_value", "Maximum lead time must be a non-negative integer."));
    }
    if (
      isNonNegativeInteger(value.leadTime.minBusinessDays) &&
      isNonNegativeInteger(value.leadTime.maxBusinessDays) &&
      value.leadTime.minBusinessDays > value.leadTime.maxBusinessDays
    ) {
      issues.push(validationIssue("$.leadTime", "invalid_value", "Minimum lead time cannot exceed maximum lead time."));
    }
  }
  if (issues.length > 0 || !isRecord(value.leadTime)) {
    return validationFailure(...issues);
  }
  const config: ProductFulfillmentConfig = {
    id: value.id as string,
    productId: value.productId as string,
    fulfillmentType: value.fulfillmentType as FulfillmentType,
    requiresShipping: value.requiresShipping as boolean,
    productionMode: value.productionMode as ProductionMode,
    leadTime: {
      minBusinessDays: value.leadTime.minBusinessDays as number,
      maxBusinessDays: value.leadTime.maxBusinessDays as number,
    },
  };
  const valid = validateProductFulfillmentConfig(config);
  return valid.ok ? validationSuccess(config) : validationFailure(...valid.issues);
}
