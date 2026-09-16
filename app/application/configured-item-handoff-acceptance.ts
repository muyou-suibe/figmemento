import type {
  CatalogRepositoryResult,
  PublicCatalogProductDetail,
  PublicCatalogReadRepository,
} from "./catalog-repository.ts";
import type {
  CustomizationFieldReadRepository,
  ProductCustomizationFieldConfiguration,
} from "./customization-field-repository.ts";
import type { CustomerUploadReceiptRepository } from "./customer-upload-repository.ts";
import {
  resolveVariantSelection,
  toPublicSelectorVariants,
} from "./catalog-storefront.ts";
import {
  evaluatePublicEligibility,
  canonicalVariantSignature,
} from "../domain/catalog/index.ts";
import {
  parseConfiguredItemHandoff,
  type ConfiguredItemHandoff,
} from "../domain/configured-item.ts";
import {
  validateCustomizationValuesAgainstFields,
  type CustomizationResolvedImageMetadata,
} from "../domain/customization-validation.ts";
import {
  hasCustomerUploadExpiryElapsed,
  parseCustomerUploadReceipt,
  type CustomerUploadOwnerId,
  type CustomerUploadReceipt,
  type CustomerUploadTimestamp,
} from "../domain/customer-upload.ts";

/**
 * Safe, bounded reasons for rejecting a browser handoff. The service does not
 * return parser issues, provider errors, ownership details, or object
 * topology, because those values are not safe application authority.
 */
export type SafeConfiguredItemRejectionReason =
  | "invalid_handoff"
  | "product_not_available"
  | "catalog_failure"
  | "variant_incomplete"
  | "variant_mismatch"
  | "variant_unavailable"
  | "variant_invalid"
  | "customization_not_configured"
  | "stale_configuration"
  | "invalid_customization"
  | "receipt_not_owned_or_missing"
  | "receipt_inactive"
  | "receipt_expired"
  | "source_failure";

export type ConfiguredItemHandoffAcceptanceResult =
  | {
      readonly status: "accepted";
      readonly handoff: ConfiguredItemHandoff;
    }
  | {
      readonly status: "rejected";
      readonly reason: SafeConfiguredItemRejectionReason;
    };

export interface ConfiguredItemHandoffAcceptanceDependencies {
  readonly catalogRepository: Pick<PublicCatalogReadRepository, "findPublicProductById">;
  readonly customizationFieldRepository: Pick<
    CustomizationFieldReadRepository,
    "getCustomizationFieldsForProduct"
  >;
  readonly receiptRepository: Pick<CustomerUploadReceiptRepository, "findOwnedReceipt">;
}

export interface AcceptConfiguredItemHandoffInput {
  /** Raw browser input. It is parsed before any repository is accessed. */
  readonly rawInput: unknown;
  /** Derived by a server ownership boundary; never read from rawInput. Null is valid only when no private receipt is present. */
  readonly verifiedOwnerId: CustomerUploadOwnerId | null;
  /** Explicit server observation time used for receipt expiry checks. */
  readonly observedAt: CustomerUploadTimestamp;
}

function rejected(
  reason: SafeConfiguredItemRejectionReason,
): ConfiguredItemHandoffAcceptanceResult {
  return { status: "rejected", reason };
}

function mapCatalogFailure(
  result: Exclude<CatalogRepositoryResult<PublicCatalogProductDetail>, { status: "found" }>,
): SafeConfiguredItemRejectionReason {
  return result.status === "source_failure" || result.status === "invalid_configuration"
    ? "catalog_failure"
    : "product_not_available";
}

function publicEligibilityFailure(
  detail: PublicCatalogProductDetail,
): SafeConfiguredItemRejectionReason | undefined {
  const eligibility = evaluatePublicEligibility({
    category: detail.category,
    product: detail.product,
    fulfillment: detail.fulfillment,
    options: detail.options,
    optionValues: detail.optionValues,
    variants: detail.variants,
  });
  if (eligibility.eligible) return undefined;
  return eligibility.issues.every((issue) => issue.code === "unavailable")
    ? "product_not_available"
    : "catalog_failure";
}

function selectionsMatch(
  requested: ConfiguredItemHandoff["selectedOptions"],
  authoritative: ConfiguredItemHandoff["selectedOptions"],
): boolean {
  return canonicalVariantSignature(requested) === canonicalVariantSignature(authoritative)
    && requested.length === authoritative.length;
}

function imageReceiptIds(handoff: ConfiguredItemHandoff): readonly string[] {
  const receiptIds: string[] = [];
  for (const value of handoff.customizationValues) {
    if (value.kind !== "image") continue;
    for (const image of value.images) receiptIds.push(image.receiptId);
  }
  return receiptIds;
}

function hasDuplicateReceiptIds(receiptIds: readonly string[]): boolean {
  return new Set(receiptIds).size !== receiptIds.length;
}

function hasOnlyExpectedMissingMetadata(
  issues: readonly { code: string }[],
): boolean {
  return issues.every((issue) => issue.code === "image_metadata_missing");
}

function metadataFromReceipt(
  receipt: CustomerUploadReceipt,
): CustomizationResolvedImageMetadata {
  return {
    receiptId: receipt.receiptId,
    mimeType: receipt.contentType,
    fileSizeBytes: receipt.byteSize,
    width: receipt.dimensions.width,
    height: receipt.dimensions.height,
  };
}

function canonicalizeValues(
  configuration: ProductCustomizationFieldConfiguration,
  values: ConfiguredItemHandoff["customizationValues"],
): ConfiguredItemHandoff["customizationValues"] {
  const positions = new Map(configuration.fields.map((field) => [field.id, field.position]));
  return values
    .map((value, index) => ({ value, index }))
    .sort((left, right) =>
      (positions.get(left.value.fieldId) ?? Number.MAX_SAFE_INTEGER)
      - (positions.get(right.value.fieldId) ?? Number.MAX_SAFE_INTEGER)
      || left.index - right.index,
    )
    .map((entry) => entry.value);
}

async function findOwnedReceipt(
  receiptRepository: Pick<CustomerUploadReceiptRepository, "findOwnedReceipt">,
  receiptId: string,
  verifiedOwnerId: CustomerUploadOwnerId,
): Promise<
  | { status: "found"; value: CustomerUploadReceipt }
  | { status: "rejected"; reason: SafeConfiguredItemRejectionReason }
> {
  let result: Awaited<ReturnType<CustomerUploadReceiptRepository["findOwnedReceipt"]>>;
  try {
    result = await receiptRepository.findOwnedReceipt(receiptId, verifiedOwnerId);
  } catch {
    return { status: "rejected", reason: "source_failure" };
  }
  if (result === null || typeof result !== "object" || !("status" in result)) {
    return { status: "rejected", reason: "source_failure" };
  }

  if (result.status === "not_found") {
    return { status: "rejected", reason: "receipt_not_owned_or_missing" };
  }
  if (result.status === "source_failure") {
    return { status: "rejected", reason: "source_failure" };
  }
  if (result.status === "invalid_state") {
    return { status: "rejected", reason: "receipt_inactive" };
  }
  if (result.status !== "found") {
    return { status: "rejected", reason: "source_failure" };
  }

  const parsed = parseCustomerUploadReceipt(result.value);
  if (!parsed.ok || parsed.value.receiptId !== receiptId) {
    return { status: "rejected", reason: "source_failure" };
  }
  if (parsed.value.lifecycle !== "active") {
    return { status: "rejected", reason: "receipt_inactive" };
  }
  return { status: "found", value: parsed.value };
}

/**
 * Re-resolves every server-owned part of a locally prepared configured item.
 * This service is deliberately read-only: its injected ports expose only one
 * catalog read, one field-configuration read, and owned receipt reads.
 */
export async function acceptConfiguredItemHandoff(
  input: AcceptConfiguredItemHandoffInput,
  dependencies: ConfiguredItemHandoffAcceptanceDependencies,
): Promise<ConfiguredItemHandoffAcceptanceResult> {
  const parsedHandoff = parseConfiguredItemHandoff(input.rawInput);
  if (!parsedHandoff.ok) return rejected("invalid_handoff");
  const handoff = parsedHandoff.value;

  let catalogResult: CatalogRepositoryResult<PublicCatalogProductDetail>;
  try {
    catalogResult = await dependencies.catalogRepository.findPublicProductById(handoff.productId);
  } catch {
    return rejected("catalog_failure");
  }
  if (catalogResult === null || typeof catalogResult !== "object" || !("status" in catalogResult)) {
    return rejected("catalog_failure");
  }
  if (catalogResult.status !== "found") return rejected(mapCatalogFailure(catalogResult));

  const detail = catalogResult.value;
  if (detail.product.id !== handoff.productId) return rejected("catalog_failure");
  const eligibilityFailure = publicEligibilityFailure(detail);
  if (eligibilityFailure) return rejected(eligibilityFailure);

  const resolution = resolveVariantSelection({
    productId: handoff.productId,
    options: detail.options,
    optionValues: detail.optionValues,
    variants: toPublicSelectorVariants(detail.variants),
    selectedOptions: handoff.selectedOptions,
  });
  if (resolution.status === "incomplete") return rejected("variant_incomplete");
  if (resolution.status === "unavailable") return rejected("variant_unavailable");
  if (resolution.status === "invalid") return rejected("variant_invalid");

  const authoritativeVariant = resolution.variant;
  if (
    authoritativeVariant.productId !== handoff.productId
    || authoritativeVariant.id !== handoff.variantId
    || authoritativeVariant.skuCode !== handoff.skuCode
    || !selectionsMatch(handoff.selectedOptions, authoritativeVariant.selectedOptions)
  ) {
    return rejected("variant_mismatch");
  }

  let configurationResult: Awaited<ReturnType<
    CustomizationFieldReadRepository["getCustomizationFieldsForProduct"]
  >>;
  try {
    configurationResult = await dependencies.customizationFieldRepository
      .getCustomizationFieldsForProduct(handoff.productId);
  } catch {
    return rejected("source_failure");
  }
  if (configurationResult === null || typeof configurationResult !== "object" || !("status" in configurationResult)) {
    return rejected("source_failure");
  }
  if (configurationResult.status === "not_found") {
    return rejected("customization_not_configured");
  }
  if (configurationResult.status === "source_failure") return rejected("source_failure");
  if (configurationResult.status !== "found") return rejected("invalid_customization");

  const configuration = configurationResult.value;
  if (configuration.productId !== handoff.productId) return rejected("invalid_customization");
  if (configuration.configurationRevision !== handoff.configurationRevision) {
    return rejected("stale_configuration");
  }

  const receiptIds = imageReceiptIds(handoff);
  if (hasDuplicateReceiptIds(receiptIds)) return rejected("invalid_customization");

  const preReceiptValidation = validateCustomizationValuesAgainstFields({
    productId: handoff.productId,
    configurationRevision: handoff.configurationRevision,
    authoritativeConfigurationRevision: configuration.configurationRevision,
    fields: configuration.fields,
    values: handoff.customizationValues,
    resolvedImageMetadata: [],
  });
  if (!preReceiptValidation.ok && !hasOnlyExpectedMissingMetadata(preReceiptValidation.issues)) {
    return rejected("invalid_customization");
  }

  const resolvedReceipts = new Map<string, CustomerUploadReceipt>();
  const verifiedOwnerId = input.verifiedOwnerId;
  if (receiptIds.length > 0 && verifiedOwnerId === null) {
    return rejected("receipt_not_owned_or_missing");
  }
  for (const receiptId of receiptIds) {
    if (verifiedOwnerId === null) return rejected("receipt_not_owned_or_missing");
    const receiptResult = await findOwnedReceipt(
      dependencies.receiptRepository,
      receiptId,
      verifiedOwnerId,
    );
    if (receiptResult.status !== "found") return rejected(receiptResult.reason);
    if (hasCustomerUploadExpiryElapsed(receiptResult.value, input.observedAt)) {
      return rejected("receipt_expired");
    }
    resolvedReceipts.set(receiptId, receiptResult.value);
  }

  const resolvedImageMetadata = [...resolvedReceipts.values()].map(metadataFromReceipt);
  const finalValidation = validateCustomizationValuesAgainstFields({
    productId: handoff.productId,
    configurationRevision: handoff.configurationRevision,
    authoritativeConfigurationRevision: configuration.configurationRevision,
    fields: configuration.fields,
    values: handoff.customizationValues,
    resolvedImageMetadata,
  });
  if (!finalValidation.ok) return rejected("invalid_customization");

  const canonicalHandoff = parseConfiguredItemHandoff({
    productId: detail.product.id,
    variantId: authoritativeVariant.id,
    skuCode: authoritativeVariant.skuCode,
    selectedOptions: authoritativeVariant.selectedOptions,
    configurationRevision: configuration.configurationRevision,
    customizationValues: canonicalizeValues(configuration, finalValidation.value),
  });
  return canonicalHandoff.ok
    ? { status: "accepted", handoff: canonicalHandoff.value }
    : rejected("invalid_customization");
}
