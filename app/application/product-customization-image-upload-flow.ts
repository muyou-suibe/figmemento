import type { CustomerUploadReceipt } from "../domain/customer-upload.ts";
import type {
  ProductCustomizationDraft,
  ProductCustomizationDraftAction,
} from "../domain/product-customization-draft.ts";
import type { CustomizationImageValue } from "../domain/customization-value.ts";

export function createImageUploadStartedActions(input: {
  readonly draft: ProductCustomizationDraft;
  readonly fieldId: string;
  readonly operationId: string;
  readonly slotId?: string;
}): readonly ProductCustomizationDraftAction[] {
  return [
    ...input.draft.signals.uploadFailures
      .filter((failure) => failure.fieldId === input.fieldId && failure.slotId === input.slotId)
      .map((failure) => ({ type: "clear_upload_failure" as const, operationId: failure.operationId })),
    {
      type: "upload_started" as const,
      operation: {
        operationId: input.operationId,
        fieldId: input.fieldId,
        ...(input.slotId ? { slotId: input.slotId } : {}),
      },
    },
  ];
}

/**
 * Removing a local image position makes a slot-specific upload failure
 * unreachable. Clear only failures that belong to that exact local position;
 * legacy failures without a slot identity remain intentionally untouched.
 */
export function createRemovedImageSlotActions(input: {
  readonly draft: ProductCustomizationDraft;
  readonly fieldId: string;
  readonly slotId: string;
}): readonly Extract<ProductCustomizationDraftAction, { type: "clear_upload_failure" }>[] {
  return input.draft.signals.uploadFailures
    .filter((failure) => failure.fieldId === input.fieldId && failure.slotId === input.slotId)
    .map((failure) => ({ type: "clear_upload_failure" as const, operationId: failure.operationId }));
}

export function createAcceptedImageUploadActions(input: {
  readonly fieldId: string;
  readonly fieldCode: string;
  readonly operationId: string;
  readonly receipt: CustomerUploadReceipt;
  readonly value?: CustomizationImageValue;
}): readonly ProductCustomizationDraftAction[] {
  const value = input.value ?? {
    fieldId: input.fieldId,
    fieldCode: input.fieldCode,
    kind: "image",
    images: [{ receiptId: input.receipt.receiptId }],
  } satisfies CustomizationImageValue;
  return [
    { type: "upload_finished", operationId: input.operationId },
    { type: "record_accepted_receipt", receipt: input.receipt },
    { type: "set_image_value", value },
  ];
}

export function createFailedImageUploadAction(input: {
  readonly fieldId: string;
  readonly operationId: string;
}): Extract<ProductCustomizationDraftAction, { type: "upload_failed" }> {
  return { type: "upload_failed", operationId: input.operationId, fieldId: input.fieldId };
}
