import {
  isCode,
  isIdentifier,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  isSkuCode,
  unknownFieldIssues,
  validationFailure,
  validationIssue,
  validationSuccess,
  type CatalogValidationIssue,
  type CatalogValidationResult,
} from "./validation.ts";

export type ProductOptionKind =
  | "size"
  | "person_count"
  | "material"
  | "color"
  | "other_sku";

export type VariantSupplyMethod = "made_to_order" | "digital_delivery";
export type CatalogCurrency = "USD";

export interface ProductOption {
  id: string;
  productId: string;
  code: string;
  name: string;
  kind: ProductOptionKind;
  required: boolean;
  position: number;
}

export interface ProductOptionValue {
  id: string;
  productId: string;
  optionId: string;
  code: string;
  label: string;
  position: number;
}

export interface SelectedOptionValue {
  optionId: string;
  valueId: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  skuCode: string;
  priceCents: number;
  currency: CatalogCurrency;
  weightGrams: number;
  isActive: boolean;
  isAvailable: boolean;
  isDefault: boolean;
  supplyMethod: VariantSupplyMethod;
  selectedOptions: readonly SelectedOptionValue[];
}

const OPTION_KINDS: readonly ProductOptionKind[] = [
  "size",
  "person_count",
  "material",
  "color",
  "other_sku",
];
const SUPPLY_METHODS: readonly VariantSupplyMethod[] = [
  "made_to_order",
  "digital_delivery",
];
const CUSTOMIZATION_OPTION_CODES = new Set([
  "photo",
  "photos",
  "name",
  "names",
  "text",
  "note",
  "notes",
  "pose",
  "poses",
  "style",
  "styles",
  "upload",
  "uploads",
  "file",
  "files",
  "customization",
  "personalization",
]);

export function parseProductOption(
  value: unknown,
): CatalogValidationResult<ProductOption> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue("$", "invalid_type", "Product option must be an object."));
  }
  const issues = unknownFieldIssues(value, ["id", "productId", "code", "name", "kind", "required", "position"]);
  if (!isIdentifier(value.id)) {
    issues.push(validationIssue("$.id", "invalid_format", "Option ID is invalid."));
  }
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  if (!isCode(value.code)) {
    issues.push(validationIssue("$.code", "invalid_format", "Option code is invalid."));
  } else if (CUSTOMIZATION_OPTION_CODES.has(value.code)) {
    issues.push(validationIssue("$.code", "invalid_value", "Personalization inputs are not SKU-defining Product Options."));
  }
  if (!isNonEmptyString(value.name, 120)) {
    issues.push(validationIssue("$.name", "invalid_value", "Option name must be non-empty and at most 120 characters."));
  }
  if (!OPTION_KINDS.includes(value.kind as ProductOptionKind)) {
    issues.push(validationIssue("$.kind", "invalid_value", "Option kind is not an approved SKU-defining kind."));
  }
  if (typeof value.required !== "boolean") {
    issues.push(validationIssue("$.required", "invalid_type", "Option required flag must be boolean."));
  }
  if (!isNonNegativeInteger(value.position)) {
    issues.push(validationIssue("$.position", "invalid_value", "Option position must be a non-negative integer."));
  }
  if (issues.length > 0) {
    return validationFailure(...issues);
  }
  return validationSuccess({
    id: value.id as string,
    productId: value.productId as string,
    code: value.code as string,
    name: value.name as string,
    kind: value.kind as ProductOptionKind,
    required: value.required as boolean,
    position: value.position as number,
  });
}

export function parseProductOptionValue(
  value: unknown,
): CatalogValidationResult<ProductOptionValue> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue("$", "invalid_type", "Product option value must be an object."));
  }
  const issues = unknownFieldIssues(value, ["id", "productId", "optionId", "code", "label", "position"]);
  if (!isIdentifier(value.id)) {
    issues.push(validationIssue("$.id", "invalid_format", "Option value ID is invalid."));
  }
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  if (!isIdentifier(value.optionId)) {
    issues.push(validationIssue("$.optionId", "invalid_format", "Option ID is invalid."));
  }
  if (!isCode(value.code)) {
    issues.push(validationIssue("$.code", "invalid_format", "Option value code is invalid."));
  }
  if (!isNonEmptyString(value.label, 120)) {
    issues.push(validationIssue("$.label", "invalid_value", "Option value label must be non-empty and at most 120 characters."));
  }
  if (!isNonNegativeInteger(value.position)) {
    issues.push(validationIssue("$.position", "invalid_value", "Option value position must be a non-negative integer."));
  }
  if (issues.length > 0) {
    return validationFailure(...issues);
  }
  return validationSuccess({
    id: value.id as string,
    productId: value.productId as string,
    optionId: value.optionId as string,
    code: value.code as string,
    label: value.label as string,
    position: value.position as number,
  });
}

export function parseSelectedOptions(
  value: unknown,
): CatalogValidationResult<readonly SelectedOptionValue[]> {
  if (!Array.isArray(value)) {
    return validationFailure(validationIssue("$.selectedOptions", "invalid_type", "Selected options must be an array."));
  }
  const issues: CatalogValidationIssue[] = [];
  const selections: SelectedOptionValue[] = [];
  const selectedOptionIds = new Set<string>();
  value.forEach((candidate, index) => {
    const path = `$.selectedOptions[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(validationIssue(path, "invalid_type", "Selected option must be an object."));
      return;
    }
    issues.push(...unknownFieldIssues(candidate, ["optionId", "valueId"], path));
    if (!isIdentifier(candidate.optionId)) {
      issues.push(validationIssue(`${path}.optionId`, "invalid_format", "Selected option ID is invalid."));
    }
    if (!isIdentifier(candidate.valueId)) {
      issues.push(validationIssue(`${path}.valueId`, "invalid_format", "Selected option value ID is invalid."));
    }
    if (isIdentifier(candidate.optionId) && isIdentifier(candidate.valueId)) {
      if (selectedOptionIds.has(candidate.optionId)) {
        issues.push(validationIssue(`${path}.optionId`, "duplicate", "Each Product Option may be selected only once."));
        return;
      }
      selectedOptionIds.add(candidate.optionId);
      selections.push({ optionId: candidate.optionId, valueId: candidate.valueId });
    }
  });
  return issues.length > 0
    ? validationFailure(...issues)
    : validationSuccess(selections);
}

export function parseProductVariant(
  value: unknown,
): CatalogValidationResult<ProductVariant> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue("$", "invalid_type", "Product Variant must be an object."));
  }
  const issues = unknownFieldIssues(value, [
    "id",
    "productId",
    "skuCode",
    "priceCents",
    "currency",
    "weightGrams",
    "isActive",
    "isAvailable",
    "isDefault",
    "supplyMethod",
    "selectedOptions",
  ]);
  if (!isIdentifier(value.id)) {
    issues.push(validationIssue("$.id", "invalid_format", "Variant ID is invalid."));
  }
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  if (!isSkuCode(value.skuCode)) {
    issues.push(validationIssue("$.skuCode", "invalid_format", "SKU code is invalid."));
  }
  if (!isNonNegativeInteger(value.priceCents)) {
    issues.push(validationIssue("$.priceCents", "invalid_value", "Variant price must be a non-negative integer in cents."));
  }
  if (value.currency !== "USD") {
    issues.push(validationIssue("$.currency", "invalid_value", "C1 supports USD only."));
  }
  if (!isNonNegativeInteger(value.weightGrams)) {
    issues.push(validationIssue("$.weightGrams", "invalid_value", "Variant weight must be a non-negative integer in grams."));
  }
  for (const field of ["isActive", "isAvailable", "isDefault"] as const) {
    if (typeof value[field] !== "boolean") {
      issues.push(validationIssue(`$.${field}`, "invalid_type", `${field} must be boolean.`));
    }
  }
  if (!SUPPLY_METHODS.includes(value.supplyMethod as VariantSupplyMethod)) {
    issues.push(validationIssue("$.supplyMethod", "invalid_value", "Supply method must be made_to_order or digital_delivery."));
  }
  const selectedOptions = parseSelectedOptions(value.selectedOptions);
  if (!selectedOptions.ok) {
    issues.push(...selectedOptions.issues);
  }
  if (issues.length > 0 || !selectedOptions.ok) {
    return validationFailure(...issues);
  }
  return validationSuccess({
    id: value.id as string,
    productId: value.productId as string,
    skuCode: value.skuCode as string,
    priceCents: value.priceCents as number,
    currency: "USD",
    weightGrams: value.weightGrams as number,
    isActive: value.isActive as boolean,
    isAvailable: value.isAvailable as boolean,
    isDefault: value.isDefault as boolean,
    supplyMethod: value.supplyMethod as VariantSupplyMethod,
    selectedOptions: selectedOptions.value,
  });
}

export interface VariantCombinationInput {
  productId: string;
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly ProductVariant[];
  catalogVariants?: readonly ProductVariant[];
}

export interface ValidatedVariantCombination {
  variantId: string;
  signature: string;
}

export function canonicalVariantSignature(
  selectedOptions: readonly SelectedOptionValue[],
): string {
  return [...selectedOptions]
    .sort((left, right) => left.optionId.localeCompare(right.optionId))
    .map((selection) => `${selection.optionId}=${selection.valueId}`)
    .join("|");
}

export function validateGlobalSkuCodes(
  variants: readonly ProductVariant[],
): CatalogValidationResult<true> {
  const seen = new Set<string>();
  const issues: CatalogValidationIssue[] = [];
  variants.forEach((variant, index) => {
    if (seen.has(variant.skuCode)) {
      issues.push(validationIssue(`$.variants[${index}].skuCode`, "duplicate", `SKU code '${variant.skuCode}' must be globally unique.`));
    }
    seen.add(variant.skuCode);
  });
  return issues.length > 0
    ? validationFailure(...issues)
    : validationSuccess(true);
}

export function validateVariantCombinations(
  input: VariantCombinationInput,
): CatalogValidationResult<readonly ValidatedVariantCombination[]> {
  const issues: CatalogValidationIssue[] = [];
  const optionById = new Map<string, ProductOption>();
  const valueById = new Map<string, ProductOptionValue>();
  const optionCodes = new Set<string>();
  const valueCodes = new Set<string>();

  input.options.forEach((option, index) => {
    if (option.productId !== input.productId) {
      issues.push(validationIssue(`$.options[${index}].productId`, "ownership", "Option belongs to another Product."));
    }
    if (optionById.has(option.id) || optionCodes.has(option.code)) {
      issues.push(validationIssue(`$.options[${index}]`, "duplicate", "Option IDs and codes must be unique within a Product."));
    }
    optionById.set(option.id, option);
    optionCodes.add(option.code);
  });

  input.optionValues.forEach((optionValue, index) => {
    const option = optionById.get(optionValue.optionId);
    if (optionValue.productId !== input.productId || option?.productId !== input.productId) {
      issues.push(validationIssue(`$.optionValues[${index}]`, "ownership", "Option value must belong to an Option on the same Product."));
    }
    const scopedCode = `${optionValue.optionId}:${optionValue.code}`;
    if (valueById.has(optionValue.id) || valueCodes.has(scopedCode)) {
      issues.push(validationIssue(`$.optionValues[${index}]`, "duplicate", "Option value IDs and codes must be unique in their scope."));
    }
    valueById.set(optionValue.id, optionValue);
    valueCodes.add(scopedCode);
  });

  const skuResult = validateGlobalSkuCodes(input.catalogVariants ?? input.variants);
  if (!skuResult.ok) {
    issues.push(...skuResult.issues);
  }

  const requiredOptionIds = input.options
    .filter((option) => option.required)
    .map((option) => option.id);
  const signatures = new Set<string>();
  const variantIds = new Set<string>();
  let defaultCount = 0;
  const combinations: ValidatedVariantCombination[] = [];

  input.variants.forEach((variant, variantIndex) => {
    const variantPath = `$.variants[${variantIndex}]`;
    if (variant.productId !== input.productId) {
      issues.push(validationIssue(`${variantPath}.productId`, "ownership", "Variant belongs to another Product."));
    }
    if (variantIds.has(variant.id)) {
      issues.push(validationIssue(`${variantPath}.id`, "duplicate", "Variant ID must be unique."));
    }
    variantIds.add(variant.id);
    if (variant.isDefault) {
      defaultCount += 1;
    }

    const selectedOptionIds = new Set<string>();
    variant.selectedOptions.forEach((selection, selectionIndex) => {
      const selectionPath = `${variantPath}.selectedOptions[${selectionIndex}]`;
      if (selectedOptionIds.has(selection.optionId)) {
        issues.push(validationIssue(`${selectionPath}.optionId`, "duplicate", "A Variant may select only one value per Option."));
      }
      selectedOptionIds.add(selection.optionId);
      const option = optionById.get(selection.optionId);
      const optionValue = valueById.get(selection.valueId);
      if (!option || option.productId !== input.productId) {
        issues.push(validationIssue(`${selectionPath}.optionId`, "ownership", "Selected Option does not belong to this Product."));
      }
      if (
        !optionValue ||
        optionValue.productId !== input.productId ||
        optionValue.optionId !== selection.optionId
      ) {
        issues.push(validationIssue(`${selectionPath}.valueId`, "ownership", "Selected value must belong to the selected Option and Product."));
      }
    });

    requiredOptionIds.forEach((optionId) => {
      if (!selectedOptionIds.has(optionId)) {
        issues.push(validationIssue(`${variantPath}.selectedOptions`, "incomplete", `Required Option '${optionId}' is missing.`));
      }
    });
    if (input.options.length === 0) {
      if (variant.selectedOptions.length !== 0 || !variant.isDefault) {
        issues.push(validationIssue(`${variantPath}.selectedOptions`, "invalid_value", "A Product without Options must use one empty default Variant combination."));
      }
    } else if (variant.selectedOptions.length === 0) {
      issues.push(validationIssue(`${variantPath}.selectedOptions`, "incomplete", "An empty Variant combination is valid only for a Product without Options."));
    }

    const signature = canonicalVariantSignature(variant.selectedOptions);
    if (signatures.has(signature)) {
      issues.push(validationIssue(`${variantPath}.selectedOptions`, "duplicate", "Variant option combination already exists for this Product."));
    }
    signatures.add(signature);
    combinations.push({ variantId: variant.id, signature });
  });

  if (defaultCount > 1) {
    issues.push(validationIssue("$.variants", "duplicate", "A Product may have at most one default Variant."));
  }

  return issues.length > 0
    ? validationFailure(...issues)
    : validationSuccess(combinations);
}

export type ListingPrice =
  | { kind: "single"; priceCents: number; currency: CatalogCurrency }
  | {
      kind: "starting_at";
      minPriceCents: number;
      maxPriceCents: number;
      currency: CatalogCurrency;
    };

export function deriveVariantListingPrice(
  productId: string,
  variants: readonly ProductVariant[],
): CatalogValidationResult<ListingPrice> {
  const eligible = variants.filter(
    (variant) =>
      variant.productId === productId && variant.isActive && variant.isAvailable,
  );
  if (eligible.length === 0) {
    return validationFailure(validationIssue("$.variants", "unavailable", "Product has no active and available Variant."));
  }
  const invalid = eligible.find(
    (variant) =>
      variant.currency !== "USD" || !isNonNegativeInteger(variant.priceCents),
  );
  if (invalid) {
    return validationFailure(validationIssue("$.variants", "invalid_value", "Eligible Variant price must be a non-negative USD amount."));
  }
  const prices = eligible.map((variant) => variant.priceCents);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  return minimum === maximum
    ? validationSuccess({ kind: "single", priceCents: minimum, currency: "USD" })
    : validationSuccess({
        kind: "starting_at",
        minPriceCents: minimum,
        maxPriceCents: maximum,
        currency: "USD",
      });
}

export interface VariantPriceResolutionRequest {
  productId: string;
  variantId: string;
  submittedPriceCents?: unknown;
  submittedCurrency?: unknown;
}

export interface AuthoritativeVariantPrice {
  productId: string;
  variantId: string;
  skuCode: string;
  priceCents: number;
  currency: CatalogCurrency;
}

export function resolveAuthoritativeVariantPrice(
  request: VariantPriceResolutionRequest,
  variants: readonly ProductVariant[],
): CatalogValidationResult<AuthoritativeVariantPrice> {
  const variant = variants.find((candidate) => candidate.id === request.variantId);
  if (!variant || variant.productId !== request.productId) {
    return validationFailure(validationIssue("$.variantId", "ownership", "Variant does not belong to the requested Product."));
  }
  if (!variant.isActive || !variant.isAvailable) {
    return validationFailure(validationIssue("$.variantId", "unavailable", "Variant is inactive or unavailable."));
  }
  if (variant.currency !== "USD" || !isNonNegativeInteger(variant.priceCents)) {
    return validationFailure(validationIssue("$.variantId", "invalid_value", "Variant does not have a valid authoritative USD price."));
  }
  return validationSuccess({
    productId: variant.productId,
    variantId: variant.id,
    skuCode: variant.skuCode,
    priceCents: variant.priceCents,
    currency: variant.currency,
  });
}
