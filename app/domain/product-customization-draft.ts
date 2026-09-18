import {
  isIdentifier,
  isSkuCode,
} from "./catalog/validation.ts";
import {
  parseSelectedOptions,
  type SelectedOptionValue,
} from "./catalog/variant.ts";
import {
  hasCustomerUploadExpiryElapsed,
  parseCustomerUploadReceipt,
  type CustomerUploadReceipt,
  type CustomerUploadTimestamp,
} from "./customer-upload.ts";
import type { CustomizationField } from "./customization-field.ts";
import {
  validateCustomizationValuesAgainstFields,
  type CustomizationResolvedImageMetadata,
  type CustomizationValidationIssue,
} from "./customization-validation.ts";
import {
  parseCustomizationValue,
  type CustomizationImageValue,
  type CustomizationSingleSelectValue,
  type CustomizationTextValue,
  type CustomizationValue,
  type CustomizationValues,
} from "./customization-value.ts";

export type ProductCustomizationDraftLifecycle =
  | "empty"
  | "editing"
  | "upload_pending"
  | "ready"
  | "invalid"
  | "expired";

export interface ProductCustomizationVariantSelection {
  readonly variantId: string;
  readonly skuCode: string;
}

/**
 * This is a client-local operation identity, not a receipt or object identity.
 * It lets the pure draft distinguish an in-progress upload from an accepted
 * receipt without retaining file bytes or any external locator.
 */
export interface ProductCustomizationActiveUpload {
  readonly operationId: string;
  readonly fieldId: string;
  readonly slotId?: string;
}

export interface ProductCustomizationUploadFailure {
  readonly operationId: string;
  readonly fieldId: string;
  /** Optional only because Task 7.4 single-image uploads had no slot identity. */
  readonly slotId?: string;
  readonly code: "upload_failed";
}

/**
 * This signal may be set only from a server-recognized ownership failure. The
 * draft stores neither a guest credential nor a browser-asserted lifecycle.
 */
export interface ProductCustomizationDraftSignals {
  readonly ownerContextExpired: boolean;
  readonly uploadFailures: readonly ProductCustomizationUploadFailure[];
}

/**
 * Pure, local editing state. The Product identity is fixed at construction;
 * switching Product requires creating a new draft and never carries values.
 */
export interface ProductCustomizationDraft {
  readonly productId: string;
  readonly configurationRevision: string;
  readonly selectedVariant: ProductCustomizationVariantSelection | null;
  readonly selectedOptions: readonly SelectedOptionValue[];
  readonly values: CustomizationValues;
  /** Browser-safe copies for local evaluation only; server ownership is re-resolved later. */
  readonly acceptedReceipts: readonly CustomerUploadReceipt[];
  readonly activeUploads: readonly ProductCustomizationActiveUpload[];
  readonly signals: ProductCustomizationDraftSignals;
}

export interface ProductCustomizationDraftAuthority {
  readonly productId: string;
  readonly configurationRevision: string;
  readonly fields: readonly CustomizationField[];
}

export type ProductCustomizationDraftIssue =
  | CustomizationValidationIssue
  | {
      readonly path: string;
      readonly code:
        | "product_mismatch"
        | "variant_required"
        | "invalid_variant_selection"
        | "invalid_selected_options"
        | "receipt_metadata_missing"
        | "receipt_metadata_invalid"
        | "receipt_inactive"
        | "receipt_expired"
        | "owner_context_expired"
        | "upload_failed"
        | "invalid_upload_operation";
      readonly message: string;
    };

export interface ProductCustomizationDraftEvaluation {
  readonly state: ProductCustomizationDraftLifecycle;
  readonly issues: readonly ProductCustomizationDraftIssue[];
  /** Present only when current values passed the existing authoritative validator. */
  readonly normalizedValues?: CustomizationValues;
}

export type ProductCustomizationDraftAction =
  | { readonly type: "set_variant_selection"; readonly selection: ProductCustomizationVariantSelection | null }
  | { readonly type: "set_selected_options"; readonly selectedOptions: readonly SelectedOptionValue[] }
  | { readonly type: "set_text_value"; readonly value: CustomizationTextValue }
  | { readonly type: "set_image_value"; readonly value: CustomizationImageValue }
  | { readonly type: "set_single_select_value"; readonly value: CustomizationSingleSelectValue }
  | { readonly type: "remove_customization_value"; readonly fieldId: string }
  | { readonly type: "record_accepted_receipt"; readonly receipt: CustomerUploadReceipt }
  | { readonly type: "upload_started"; readonly operation: ProductCustomizationActiveUpload }
  | { readonly type: "upload_finished"; readonly operationId: string }
  | { readonly type: "upload_failed"; readonly operationId: string; readonly fieldId: string }
  | { readonly type: "clear_upload_failure"; readonly operationId: string }
  | { readonly type: "owner_context_expired" };

const INCOMPLETE_VALIDATION_CODES = new Set([
  "required_field_missing",
  "required_field_empty",
  "image_count_too_low",
  "variant_required",
]);

function cloneSelection(
  selection: ProductCustomizationVariantSelection | null,
): ProductCustomizationVariantSelection | null {
  return selection ? { variantId: selection.variantId, skuCode: selection.skuCode } : null;
}

function cloneSelectedOptions(options: readonly SelectedOptionValue[]): SelectedOptionValue[] {
  return options.map((option) => ({ optionId: option.optionId, valueId: option.valueId }));
}

function cloneValue(value: CustomizationValue): CustomizationValue {
  return value.kind === "image"
    ? {
        fieldId: value.fieldId,
        fieldCode: value.fieldCode,
        kind: "image",
        images: value.images.map((image) => ({
          receiptId: image.receiptId,
          ...(image.crop ? { crop: { ...image.crop } } : {}),
        })),
      }
    : value.kind === "single_select"
      ? {
          fieldId: value.fieldId,
          fieldCode: value.fieldCode,
          kind: "single_select",
          choiceId: value.choiceId,
        }
      : {
        fieldId: value.fieldId,
        fieldCode: value.fieldCode,
        kind: value.kind,
        value: value.value,
      };
}

function cloneReceipt(receipt: CustomerUploadReceipt): CustomerUploadReceipt {
  return {
    receiptId: receipt.receiptId,
    ...(receipt.originalFilename ? { originalFilename: receipt.originalFilename } : {}),
    contentType: receipt.contentType,
    byteSize: receipt.byteSize,
    dimensions: { ...receipt.dimensions },
    createdAt: receipt.createdAt,
    expiresAt: receipt.expiresAt,
    lifecycle: receipt.lifecycle,
  };
}

function cloneUpload(operation: ProductCustomizationActiveUpload): ProductCustomizationActiveUpload {
  return {
    operationId: operation.operationId,
    fieldId: operation.fieldId,
    ...(operation.slotId ? { slotId: operation.slotId } : {}),
  };
}

function cloneDraft(draft: ProductCustomizationDraft): ProductCustomizationDraft {
  return {
    productId: draft.productId,
    configurationRevision: draft.configurationRevision,
    selectedVariant: cloneSelection(draft.selectedVariant),
    selectedOptions: cloneSelectedOptions(draft.selectedOptions),
    values: draft.values.map(cloneValue),
    acceptedReceipts: draft.acceptedReceipts.map(cloneReceipt),
    activeUploads: draft.activeUploads.map(cloneUpload),
    signals: {
      ownerContextExpired: draft.signals.ownerContextExpired,
      uploadFailures: draft.signals.uploadFailures.map((failure) => ({
        ...failure,
        ...(failure.slotId ? { slotId: failure.slotId } : {}),
      })),
    },
  };
}

function upsertValue(values: readonly CustomizationValue[], value: CustomizationValue): CustomizationValues {
  const cloned = cloneValue(value);
  const index = values.findIndex((candidate) => candidate.fieldId === cloned.fieldId);
  if (index === -1) return [...values.map(cloneValue), cloned];
  return values.map((candidate, candidateIndex) => candidateIndex === index ? cloned : cloneValue(candidate));
}

function localIssue(
  path: string,
  code: Exclude<ProductCustomizationDraftIssue["code"], CustomizationValidationIssue["code"]>,
  message: string,
): ProductCustomizationDraftIssue {
  return { path, code, message };
}

function deduplicateIssues(
  issues: readonly ProductCustomizationDraftIssue[],
): readonly ProductCustomizationDraftIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}\u0000${issue.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isValidUploadOperation(operation: ProductCustomizationActiveUpload): boolean {
  return isIdentifier(operation.operationId)
    && isIdentifier(operation.fieldId)
    && (operation.slotId === undefined || isIdentifier(operation.slotId));
}

function hasProgress(draft: ProductCustomizationDraft): boolean {
  return draft.selectedVariant !== null
    || draft.selectedOptions.length > 0
    || draft.values.length > 0
    || draft.acceptedReceipts.length > 0
    || draft.activeUploads.length > 0
    || draft.signals.ownerContextExpired
    || draft.signals.uploadFailures.length > 0;
}

export function createProductCustomizationDraft(input: {
  productId: string;
  configurationRevision: string;
}): ProductCustomizationDraft {
  return {
    productId: input.productId,
    configurationRevision: input.configurationRevision,
    selectedVariant: null,
    selectedOptions: [],
    values: [],
    acceptedReceipts: [],
    activeUploads: [],
    signals: { ownerContextExpired: false, uploadFailures: [] },
  };
}

/**
 * Applies only explicit local draft events. It has no status setter, generic
 * patch operation, network call, persistence dependency, or Product switch.
 */
export function reduceProductCustomizationDraft(
  draft: ProductCustomizationDraft,
  action: ProductCustomizationDraftAction,
): ProductCustomizationDraft {
  const next = cloneDraft(draft);

  switch (action.type) {
    case "set_variant_selection":
      return { ...next, selectedVariant: cloneSelection(action.selection) };
    case "set_selected_options": {
      const parsed = parseSelectedOptions(action.selectedOptions);
      return parsed.ok
        ? { ...next, selectedOptions: cloneSelectedOptions(parsed.value) }
        : next;
    }
    case "set_text_value": {
      const parsed = parseCustomizationValue(action.value);
      return parsed.ok && (parsed.value.kind === "short_text" || parsed.value.kind === "long_text")
        ? { ...next, values: upsertValue(next.values, parsed.value) }
        : next;
    }
    case "set_image_value": {
      const parsed = parseCustomizationValue(action.value);
      return parsed.ok && parsed.value.kind === "image"
        ? { ...next, values: upsertValue(next.values, parsed.value) }
        : next;
    }
    case "set_single_select_value": {
      const parsed = parseCustomizationValue(action.value);
      return parsed.ok && parsed.value.kind === "single_select"
        ? { ...next, values: upsertValue(next.values, parsed.value) }
        : next;
    }
    case "remove_customization_value":
      return isIdentifier(action.fieldId)
        ? { ...next, values: next.values.filter((value) => value.fieldId !== action.fieldId).map(cloneValue) }
        : next;
    case "record_accepted_receipt": {
      const parsed = parseCustomerUploadReceipt(action.receipt);
      if (!parsed.ok) return next;
      const receipt = cloneReceipt(parsed.value);
      const index = next.acceptedReceipts.findIndex((candidate) => candidate.receiptId === receipt.receiptId);
      const acceptedReceipts = index === -1
        ? [...next.acceptedReceipts, receipt]
        : next.acceptedReceipts.map((candidate, candidateIndex) => candidateIndex === index ? receipt : cloneReceipt(candidate));
      return { ...next, acceptedReceipts };
    }
    case "upload_started":
      if (!isValidUploadOperation(action.operation) || next.activeUploads.some((entry) => entry.operationId === action.operation.operationId)) {
        return next;
      }
      return { ...next, activeUploads: [...next.activeUploads, cloneUpload(action.operation)] };
    case "upload_finished":
      return isIdentifier(action.operationId)
        ? { ...next, activeUploads: next.activeUploads.filter((entry) => entry.operationId !== action.operationId).map(cloneUpload) }
        : next;
    case "upload_failed": {
      if (!isIdentifier(action.operationId) || !isIdentifier(action.fieldId)) return next;
      const activeOperation = next.activeUploads.find((entry) => entry.operationId === action.operationId);
      const failure: ProductCustomizationUploadFailure = {
        operationId: action.operationId,
        fieldId: action.fieldId,
        ...(activeOperation?.slotId ? { slotId: activeOperation.slotId } : {}),
        code: "upload_failed",
      };
      return {
        ...next,
        activeUploads: next.activeUploads.filter((entry) => entry.operationId !== action.operationId).map(cloneUpload),
        signals: {
          ...next.signals,
          uploadFailures: next.signals.uploadFailures.some((entry) => entry.operationId === action.operationId)
            ? next.signals.uploadFailures
            : [...next.signals.uploadFailures, failure],
        },
      };
    }
    case "clear_upload_failure":
      return isIdentifier(action.operationId)
        ? {
            ...next,
            signals: {
              ...next.signals,
              uploadFailures: next.signals.uploadFailures.filter((entry) => entry.operationId !== action.operationId),
            },
          }
        : next;
    case "owner_context_expired":
      return { ...next, signals: { ...next.signals, ownerContextExpired: true } };
  }
}

/**
 * Derives a local readiness signal only. `ready` is not a cart, order, or
 * server-acceptance result; later server work re-resolves every authority.
 * Precedence is: expired > upload_pending > invalid > ready > editing > empty.
 */
export function evaluateProductCustomizationDraft(
  draft: ProductCustomizationDraft,
  authority: ProductCustomizationDraftAuthority,
  observedAt: CustomerUploadTimestamp,
): ProductCustomizationDraftEvaluation {
  const issues: ProductCustomizationDraftIssue[] = [];
  let expired = draft.signals.ownerContextExpired;
  if (expired) {
    issues.push(localIssue("$.signals.ownerContextExpired", "owner_context_expired", "Customer draft ownership has expired."));
  }

  if (draft.productId !== authority.productId) {
    issues.push(localIssue("$.productId", "product_mismatch", "Draft Product does not match current configuration."));
  }
  if (draft.configurationRevision !== authority.configurationRevision) {
    issues.push({
      path: "$.configurationRevision",
      code: "stale_configuration",
      message: "Customization configuration is no longer current.",
    });
  }

  if (draft.selectedVariant === null) {
    issues.push(localIssue("$.selectedVariant", "variant_required", "A Variant/SKU selection is required."));
  } else if (!isIdentifier(draft.selectedVariant.variantId) || !isSkuCode(draft.selectedVariant.skuCode)) {
    issues.push(localIssue("$.selectedVariant", "invalid_variant_selection", "Variant/SKU selection is invalid."));
  }

  const selectedOptions = parseSelectedOptions(draft.selectedOptions);
  if (!selectedOptions.ok) {
    issues.push(localIssue("$.selectedOptions", "invalid_selected_options", "Selected Variant Options are invalid."));
  }
  draft.activeUploads.forEach((operation, index) => {
    if (!isValidUploadOperation(operation)) {
      issues.push(localIssue(`$.activeUploads[${index}]`, "invalid_upload_operation", "Active upload operation is invalid."));
    }
  });
  draft.signals.uploadFailures.forEach((failure, index) => {
    issues.push(localIssue(`$.signals.uploadFailures[${index}]`, "upload_failed", "A customer upload did not complete."));
  });

  const receiptsById = new Map<string, CustomerUploadReceipt>();
  draft.acceptedReceipts.forEach((receipt) => {
    if (typeof receipt.receiptId === "string" && !receiptsById.has(receipt.receiptId)) {
      receiptsById.set(receipt.receiptId, receipt);
    }
  });

  const referencedReceiptIds = new Set<string>();
  draft.values.forEach((value, valueIndex) => {
    if (value.kind !== "image") return;
    value.images.forEach((image, imageIndex) => {
      referencedReceiptIds.add(image.receiptId);
      const receipt = receiptsById.get(image.receiptId);
      const path = `$.values[${valueIndex}].images[${imageIndex}].receiptId`;
      if (!receipt) {
        issues.push(localIssue(path, "receipt_metadata_missing", "Accepted receipt metadata is required."));
        return;
      }
      const parsed = parseCustomerUploadReceipt(receipt);
      if (!parsed.ok) {
        issues.push(localIssue(path, "receipt_metadata_invalid", "Accepted receipt metadata is invalid."));
        return;
      }
      if (parsed.value.lifecycle === "expired" || hasCustomerUploadExpiryElapsed(parsed.value, observedAt)) {
        expired = true;
        issues.push(localIssue(path, "receipt_expired", "Customer upload receipt has expired."));
      } else if (parsed.value.lifecycle !== "active") {
        issues.push(localIssue(path, "receipt_inactive", "Customer upload receipt is no longer active."));
      }
    });
  });

  const resolvedImageMetadata: CustomizationResolvedImageMetadata[] = [];
  referencedReceiptIds.forEach((receiptId) => {
    const receipt = receiptsById.get(receiptId);
    if (!receipt) return;
    const parsed = parseCustomerUploadReceipt(receipt);
    if (!parsed.ok || parsed.value.lifecycle !== "active" || hasCustomerUploadExpiryElapsed(parsed.value, observedAt)) return;
    resolvedImageMetadata.push({
      receiptId: parsed.value.receiptId,
      mimeType: parsed.value.contentType,
      fileSizeBytes: parsed.value.byteSize,
      width: parsed.value.dimensions.width,
      height: parsed.value.dimensions.height,
    });
  });

  const fieldValidation = validateCustomizationValuesAgainstFields({
    productId: authority.productId,
    configurationRevision: draft.configurationRevision,
    authoritativeConfigurationRevision: authority.configurationRevision,
    fields: authority.fields,
    values: draft.values,
    resolvedImageMetadata,
  });
  if (!fieldValidation.ok) issues.push(...fieldValidation.issues);

  const allIssues = deduplicateIssues(issues);
  const hasHardIssue = allIssues.some((issue) => !INCOMPLETE_VALIDATION_CODES.has(issue.code));
  const incomplete = allIssues.some((issue) => INCOMPLETE_VALIDATION_CODES.has(issue.code) || issue.code === "variant_required");

  if (expired) return { state: "expired", issues: allIssues };
  if (draft.activeUploads.length > 0) return { state: "upload_pending", issues: allIssues };
  if (hasHardIssue) return { state: "invalid", issues: allIssues };
  if (fieldValidation.ok && draft.selectedVariant !== null && selectedOptions.ok && !incomplete) {
    return { state: "ready", issues: allIssues, normalizedValues: fieldValidation.value };
  }
  return { state: hasProgress(draft) ? "editing" : "empty", issues: allIssues };
}
