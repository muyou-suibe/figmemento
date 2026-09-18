"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import {
  addProductCustomizationImageSlot,
  admitProductCustomizationImageFiles,
  canAddProductCustomizationImageSlot,
  clearProductCustomizationImageSlotCrop,
  createEmptyProductCustomizationImageSlot,
  hydrateProductCustomizationImageSlots,
  moveProductCustomizationImageSlot,
  reorderProductCustomizationImageSlot,
  removeProductCustomizationImageSlot,
  setProductCustomizationImageSlotCrop,
  setProductCustomizationImageSlotReceipt,
  toOrderedProductCustomizationImageValue,
  type ProductCustomizationImageSlot,
} from "../application/product-customization-image-slots.ts";
import {
  createProductCustomizationCropEditorValues,
  applyProductCustomizationCropPointerDelta,
  parseProductCustomizationCropEditorValues,
  type ProductCustomizationCropPointerMode,
  type ProductCustomizationCropEditorValues,
} from "../application/product-customization-crop-editor.ts";
import {
  createAcceptedImageUploadActions,
  createFailedImageUploadAction,
  createImageUploadStartedActions,
  createRemovedImageSlotActions,
} from "../application/product-customization-image-upload-flow.ts";
import {
  applyCurrentProductCustomizationImageSlotOperation,
  isCurrentProductCustomizationImageSlotOperation,
  isCurrentProductCustomizationImageSlotSelection,
  type ProductCustomizationImageSlotOperation,
} from "../application/product-customization-image-async-fencing.ts";
import {
  createCustomerCustomizationImageOperationId,
  uploadCustomerCustomizationImage,
  type CustomerCustomizationImageFetch,
  type CustomerCustomizationImageUploadInput,
} from "../client/customer-customization-image-upload.ts";
import type {
  BrowserConfirmedDraft,
  PersistentCustomizationDraftController,
} from "../client/local-persistent-draft.ts";
import type { CustomerUploadReceipt } from "../domain/customer-upload.ts";
import {
  disposeLocalCustomerInputPreview,
  replaceLocalCustomerInputPreview,
  type LocalCustomerInputPreview,
} from "../client/local-customer-input-preview.ts";
import {
  preflightCustomerImage,
  type CustomerImagePreflightResult,
} from "../domain/customer-image-inspection.ts";
import type { CustomizationField, CustomizationDimensions } from "../domain/customization-field.ts";
import type {
  ProductCustomizationDraft,
  ProductCustomizationDraftAction,
} from "../domain/product-customization-draft.ts";
import type { CustomizationCropRegion } from "../domain/customization-value.ts";
import styles from "./catalog-storefront.module.css";
import { cropPersistentCustomizationImage } from "../client/local-persistent-draft.ts";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

type ImageCustomizationField = Extract<CustomizationField, { kind: "image" }>;
type LocalImageStatus = "idle" | "decoding" | "ready" | "decode_failed" | "uploading"
  | "server_pending" | "receipt_ready" | "draft_saving" | "accepted" | "failed";

interface PersistentSlotOperationContext {
  readonly requestKey: string;
  readonly draftId: string;
  readonly expectedVersion: number;
  readonly file: File;
  readonly operation: ProductCustomizationImageSlotOperation;
  readonly receipt?: CustomerUploadReceipt;
  readonly saveKey?: string;
  readonly saveBase?: BrowserConfirmedDraft;
}

interface ProductCustomizationImageSlotState extends ProductCustomizationImageSlot {
  readonly file: File | null;
  readonly preview: LocalCustomerInputPreview | null;
  readonly decodedDimensions: CustomizationDimensions | null;
  readonly preflight: CustomerImagePreflightResult | null;
  readonly status: LocalImageStatus;
  readonly failureMessage: string | null;
  readonly selectionGeneration: number;
  readonly activeOperationId: string | null;
  readonly inputVersion: number;
  /** Prevents a successful unchanged local File from immediately creating another receipt. */
  readonly selectedFileAccepted: boolean;
  readonly cropEditor: { readonly values: ProductCustomizationCropEditorValues; readonly feedback: string | null } | null;
  readonly persistentOperation: PersistentSlotOperationContext | null;
  readonly restored: boolean;
}

export interface RestoredProductCustomizationImageSlot {
  readonly slotId: string;
  readonly receiptReference: string;
  readonly crop?: CustomizationCropRegion;
  readonly receipt?: CustomerUploadReceipt;
}

export interface ProductCustomizationImageFieldProps {
  readonly field: ImageCustomizationField;
  readonly draft: ProductCustomizationDraft;
  readonly onDraftAction: (action: ProductCustomizationDraftAction) => void;
  readonly uploadImage?: (input: CustomerCustomizationImageUploadInput, fetchImplementation?: CustomerCustomizationImageFetch) => ReturnType<typeof uploadCustomerCustomizationImage>;
  readonly createOperationId?: () => string;
  readonly createSlotId?: () => string;
  readonly persistentDraft?: PersistentCustomizationDraftController;
  readonly restoredSlots?: readonly RestoredProductCustomizationImageSlot[];
}

const DECODE_FAILURE = {
  code: "invalid_image",
  message: "Choose a valid JPEG, PNG, or WebP image.",
} as const;

function formatBytes(bytes: number, t: (english: string) => string): string {
  if (bytes < 1024) return `${bytes} ${t("bytes")}`;
  return `${(bytes / 1024).toFixed(1)} ${t("KB")}`;
}

function formatAllowedFormats(mimeTypes: readonly string[]): string {
  return mimeTypes.map((mimeType) => ({
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
  })[mimeType] ?? mimeType).join(", ");
}

function safeFailureMessage(status: Exclude<Awaited<ReturnType<typeof uploadCustomerCustomizationImage>>["status"], "accepted">): string {
  switch (status) {
    case "invalid_request": return "Check this image and try again.";
    case "session_unavailable": return "This upload session is unavailable. Refresh and try again.";
    case "malformed_success": return "The upload could not be confirmed. Your selected image remains on this device.";
    case "temporarily_unavailable": return "Uploads are temporarily unavailable. Your selected image remains on this device.";
    case "conflict": return "This upload no longer matches the current saved customization. Try this image again.";
    case "released": return "This upload was released.";
  }
}

function toSlotState(slot: ProductCustomizationImageSlot): ProductCustomizationImageSlotState {
  return {
    slotId: slot.slotId,
    ...(slot.image ? { image: slot.image } : {}),
    file: null,
    preview: null,
    decodedDimensions: null,
    preflight: null,
    status: slot.image ? "accepted" : "idle",
    failureMessage: null,
    selectionGeneration: 0,
    activeOperationId: null,
    inputVersion: 0,
    selectedFileAccepted: false,
    cropEditor: null,
    persistentOperation: null,
    restored: false,
  };
}

function toRestoredSlotState(slot: RestoredProductCustomizationImageSlot): ProductCustomizationImageSlotState {
  const found = !!slot.receipt;
  return {
    slotId: slot.slotId,
    image: { receiptId: slot.receiptReference, ...(slot.crop ? { crop: slot.crop } : {}) },
    file: null,
    preview: found ? { url: `/api/customer-uploads/preview?receiptId=${encodeURIComponent(slot.receiptReference)}`, revoke() {} } : null,
    decodedDimensions: slot.receipt?.dimensions ?? null,
    preflight: null,
    status: found ? "accepted" : "failed",
    failureMessage: found ? "Saved image restored from the confirmed customization."
      : "Saved media is unavailable. The confirmed receipt remains recorded, but this item cannot continue until the media is available.",
    selectionGeneration: 0,
    activeOperationId: null,
    inputVersion: 0,
    selectedFileAccepted: found,
    cropEditor: null,
    persistentOperation: null,
    restored: true,
  };
}

function selectFileForSlot(slot: ProductCustomizationImageSlotState, file: File): ProductCustomizationImageSlotState {
  try {
    const preview = replaceLocalCustomerInputPreview(slot.preview, file);
    return {
      ...slot,
      file,
      preview,
      decodedDimensions: null,
      preflight: null,
      status: "decoding",
      failureMessage: null,
      selectionGeneration: slot.selectionGeneration + 1,
      activeOperationId: null,
      selectedFileAccepted: false,
      cropEditor: null,
      persistentOperation: null,
    };
  } catch {
    return {
      ...slot,
      file,
      preview: null,
      decodedDimensions: null,
      preflight: { canAttemptUpload: false, issues: [DECODE_FAILURE], warnings: [] },
      status: "decode_failed",
      failureMessage: null,
      selectionGeneration: slot.selectionGeneration + 1,
      activeOperationId: null,
      selectedFileAccepted: false,
      cropEditor: null,
      persistentOperation: null,
    };
  }
}

function imageStatusLabel(status: LocalImageStatus): string {
  switch (status) {
    case "idle": return "Awaiting image";
    case "decoding": return "Decoding image";
    case "ready": return "Pending server confirmation";
    case "uploading": return "Uploading image";
    case "server_pending": return "Server confirmation pending";
    case "receipt_ready": return "Receipt recovered";
    case "draft_saving": return "Saving customization";
    case "accepted": return "Confirmed";
    case "decode_failed":
    case "failed": return "Failed";
  }
}

function applySlotStructure(
  current: readonly ProductCustomizationImageSlotState[],
  structure: readonly ProductCustomizationImageSlot[],
): readonly ProductCustomizationImageSlotState[] {
  const currentById = new Map(current.map((slot) => [slot.slotId, slot]));
  return structure.flatMap((next) => {
    const currentSlot = currentById.get(next.slotId);
    if (!currentSlot) return [];
    const state = { ...currentSlot };
    delete state.image;
    return [{ ...state, ...(next.image ? { image: next.image } : {}) }];
  });
}

function acceptedImageValue(
  field: ImageCustomizationField,
  slots: readonly ProductCustomizationImageSlotState[],
) {
  return toOrderedProductCustomizationImageValue({ fieldId: field.id, fieldCode: field.code, slots });
}

/**
 * A bounded local slot list. Slot identity coordinates browser state only;
 * receipt order remains the normalized image value's array order.
 */
export function ProductCustomizationImageField(props: ProductCustomizationImageFieldProps) {
  const { t } = useReferenceLanguage();
  const controlPrefix = useId();
  const defaultSlotCounter = useRef(0);
  const [slotIdFactory] = useState<() => string>(() => props.createSlotId ?? (() => `${controlPrefix}-image-slot-${defaultSlotCounter.current++}`));
  const initialImages = props.draft.values.find((value) => value.fieldId === props.field.id && value.kind === "image");
  const [slots, setSlots] = useState<readonly ProductCustomizationImageSlotState[]>(() => props.restoredSlots?.length
    ? props.restoredSlots.map(toRestoredSlotState)
    : hydrateProductCustomizationImageSlots({
      images: initialImages?.kind === "image" ? initialImages.images : [],
      createSlotId: slotIdFactory,
    }).map(toSlotState),
  );
  const [rejectedFileNames, setRejectedFileNames] = useState<readonly string[]>([]);
  const [isDropActive, setDropActive] = useState(false);
  const slotsRef = useRef(slots);
  const persistentSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const reorderPointerSlotId = useRef<string | null>(null);
  const cropPointer = useRef<{
    readonly slotId: string;
    readonly pointerId: number;
    readonly mode: ProductCustomizationCropPointerMode;
    readonly startX: number;
    readonly startY: number;
    readonly boundsWidth: number;
    readonly boundsHeight: number;
    readonly crop: CustomizationDimensions & { readonly x: number; readonly y: number };
  } | null>(null);
  const atMaximum = !canAddProductCustomizationImageSlot(slots, props.field.constraints.maxImageCount);
  const occupiedSlotCount = slots.filter((slot) => Boolean(slot.file || slot.image)).length;
  const remainingCapacity = Math.max(0, props.field.constraints.maxImageCount - occupiedSlotCount);
  const bulkControlId = `${controlPrefix}-multi-image-input`;

  function writeSlots(next: readonly ProductCustomizationImageSlotState[]): void {
    slotsRef.current = next;
    setSlots(next);
  }

  function synchronizeDraftImageValue(next: readonly ProductCustomizationImageSlotState[]): void {
    const value = acceptedImageValue(props.field, next);
    props.onDraftAction(value
      ? { type: "set_image_value", value }
      : { type: "remove_customization_value", fieldId: props.field.id });
    if (!props.persistentDraft) return;
    const images = value?.images.map(image => ({ receiptReference: image.receiptId,
      ...(image.crop ? { crop: image.crop } : {}) })) ?? [];
    persistentSaveQueue.current = persistentSaveQueue.current.then(async () => {
      const ensured = await props.persistentDraft!.ensure();
      if (ensured.status !== "found") return;
      const latest = await props.persistentDraft!.read(ensured.value.draftId);
      const base = latest.status === "found" ? latest.value : ensured.value;
      let saved = await props.persistentDraft!.saveField({ base, fieldId: props.field.id,
        images, idempotencyKey: crypto.randomUUID() });
      if (saved.status === "conflict") {
        const refreshed = await props.persistentDraft!.read(base.draftId);
        if (refreshed.status === "found") saved = await props.persistentDraft!.saveField({ base: refreshed.value,
          fieldId: props.field.id, images, idempotencyKey: crypto.randomUUID() });
      }
      if (saved.status !== "found") {
        updateSlot(next[0]?.slotId ?? "", slot => ({ ...slot,
          failureMessage: "Saved customization could not be confirmed. Refresh restores the last confirmed image order and crops." }));
      }
    }).catch(() => undefined);
  }

  useEffect(() => () => {
    slotsRef.current.forEach((slot) => disposeLocalCustomerInputPreview(slot.preview));
  }, []);

  function updateSlot(slotId: string, update: (slot: ProductCustomizationImageSlotState) => ProductCustomizationImageSlotState): void {
    writeSlots(slotsRef.current.map((slot) => slot.slotId === slotId ? update(slot) : slot));
  }

  function finishActiveSlotOperation(slot: ProductCustomizationImageSlotState): void {
    if (slot.activeOperationId) {
      props.onDraftAction({ type: "upload_finished", operationId: slot.activeOperationId });
    }
  }

  function handleFileChange(slotId: string, event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.item(0) ?? null;
    if (!file) return;
    setRejectedFileNames([]);
    updateSlot(slotId, (slot) => {
      finishActiveSlotOperation(slot);
      if (slot.persistentOperation) void releasePersistentOperation(slot.persistentOperation);
      return selectFileForSlot(slot, file);
    });
  }

  function handleMultipleFiles(files: readonly File[]): void {
    if (files.length === 0) return;
    const current = slotsRef.current;
    const admission = admitProductCustomizationImageFiles({
      slots: current,
      occupiedSlotIds: new Set(current.filter((slot) => slot.file || slot.image).map((slot) => slot.slotId)),
      files,
      maxImageCount: props.field.constraints.maxImageCount,
      createSlotId: slotIdFactory,
    });
    const assignmentBySlot = new Map(admission.accepted.map((assignment) => [assignment.slotId, assignment.file]));
    const currentById = new Map(current.map((slot) => [slot.slotId, slot]));
    const next = admission.slots.map((slot) => {
      const existing = currentById.get(slot.slotId) ?? toSlotState(slot);
      const file = assignmentBySlot.get(slot.slotId);
      return file ? selectFileForSlot(existing, file) : existing;
    });
    setRejectedFileNames(admission.rejected.map((file) => file.name));
    writeSlots(next);
    const firstAcceptedSlotId = admission.accepted[0]?.slotId;
    if (firstAcceptedSlotId) {
      window.requestAnimationFrame(() => document.getElementById(`${controlPrefix}-${firstAcceptedSlotId}`)?.focus());
    }
  }

  function handleMultipleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    handleMultipleFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDropActive(false);
    handleMultipleFiles(Array.from(event.dataTransfer.files));
  }

  function handlePreviewLoad(slotId: string, selectionGeneration: number, event: SyntheticEvent<HTMLImageElement>): void {
    const observedPreviewUrl = event.currentTarget.currentSrc;
    const width = event.currentTarget.naturalWidth;
    const height = event.currentTarget.naturalHeight;
    updateSlot(slotId, (slot) => {
      if (
        !isCurrentProductCustomizationImageSlotSelection([slot], { slotId, selectionGeneration })
        || slot.preview?.url !== observedPreviewUrl
        || !slot.file
        || !Number.isInteger(width)
        || !Number.isInteger(height)
        || width <= 0
        || height <= 0
      ) return slot;
      const dimensions = { width, height };
      const preflight = preflightCustomerImage({
        declaredContentType: slot.file.type,
        declaredByteSize: slot.file.size,
        originalFilename: slot.file.name,
        decodedDimensions: dimensions,
      }, props.field.constraints);
      return {
        ...slot,
        decodedDimensions: dimensions,
        preflight,
        status: preflight.canAttemptUpload ? "ready" : "decode_failed",
      };
    });
  }

  function handlePreviewError(slotId: string, selectionGeneration: number, event: SyntheticEvent<HTMLImageElement>): void {
    const observedPreviewUrl = event.currentTarget.currentSrc;
    updateSlot(slotId, (slot) => (
      !isCurrentProductCustomizationImageSlotSelection([slot], { slotId, selectionGeneration }) || slot.preview?.url !== observedPreviewUrl
        ? slot
        : {
            ...slot,
            decodedDimensions: null,
            preflight: { canAttemptUpload: false, issues: [DECODE_FAILURE], warnings: [] },
            status: "decode_failed",
          }
    ));
  }

  async function handleUpload(slotId: string): Promise<void> {
    const slot = slotsRef.current.find((candidate) => candidate.slotId === slotId);
    if (
      !slot
      || !slot.file
      || !["ready", "failed"].includes(slot.status)
      || !slot.preflight?.canAttemptUpload
      || slot.selectedFileAccepted
      || slot.activeOperationId !== null
    ) return;

    const operationId = (props.createOperationId ?? createCustomerCustomizationImageOperationId)();
    const operation: ProductCustomizationImageSlotOperation = {
      slotId,
      selectionGeneration: slot.selectionGeneration,
      operationId,
    };
    updateSlot(slotId, (current) => (
      current.selectionGeneration === operation.selectionGeneration && current.activeOperationId === null
        ? { ...current, activeOperationId: operationId, status: "uploading", failureMessage: null }
        : current
    ));
    createImageUploadStartedActions({
      draft: props.draft,
      fieldId: props.field.id,
      slotId,
      operationId,
    }).forEach(props.onDraftAction);

    let persistent: PersistentSlotOperationContext | null = null;
    if (props.persistentDraft) {
      const ensured = await props.persistentDraft.ensure();
      if (!isCurrentProductCustomizationImageSlotOperation(slotsRef.current, operation)) return;
      if (ensured.status !== "found") {
        failCurrentOperation(operation, ensured.status === "indeterminate"
          ? "The saved customization could not be confirmed. Try again with this image."
          : "The saved customization is unavailable. Try again.");
        return;
      }
      persistent = { requestKey: crypto.randomUUID(), draftId: ensured.value.draftId,
        expectedVersion: ensured.value.version, file: slot.file, operation, saveBase: ensured.value };
      updateSlot(slotId, current => isCurrentProductCustomizationImageSlotOperation([current], operation)
        ? { ...current, persistentOperation: persistent }
        : current);
    }

    const result = await (props.uploadImage ?? uploadCustomerCustomizationImage)({
      productId: props.field.productId,
      fieldId: props.field.id,
      file: slot.file,
      ...(persistent ? { draftId: persistent.draftId, expectedVersion: persistent.expectedVersion,
        requestKey: persistent.requestKey } : {}),
    });
    if (!isCurrentProductCustomizationImageSlotOperation(slotsRef.current, operation)) {
      if (persistent && ["accepted", "temporarily_unavailable", "malformed_success"].includes(result.status)) {
        await releasePersistentOperation(persistent);
      }
      return;
    }
    if (result.status !== "accepted") {
      if (persistent && ["temporarily_unavailable", "malformed_success"].includes(result.status)) {
        updateSlot(slotId, current => isCurrentProductCustomizationImageSlotOperation([current], operation)
          ? { ...current, status: "server_pending", failureMessage: "Server confirmation is pending. Recover this upload before continuing." }
          : current);
        return;
      }
      failCurrentOperation(operation, safeFailureMessage(result.status));
      return;
    }

    if (persistent) {
      await confirmPersistentReceipt(operation, { ...persistent, receipt: result.receipt });
      return;
    }

    acceptLocalReceipt(operation, result.receipt);
  }

  function failCurrentOperation(operation: ProductCustomizationImageSlotOperation, message: string): void {
    props.onDraftAction(createFailedImageUploadAction({ fieldId: props.field.id, operationId: operation.operationId }));
    const failed = applyCurrentProductCustomizationImageSlotOperation({ slots: slotsRef.current, operation,
      update: current => ({ ...current, activeOperationId: null, status: "failed" as const,
        failureMessage: message, persistentOperation: null }) });
    if (failed.applied) writeSlots(failed.slots);
  }

  function acceptLocalReceipt(operation: ProductCustomizationImageSlotOperation, receipt: CustomerUploadReceipt): void {
    const operationId = operation.operationId;
    const slotId = operation.slotId;

    const before = slotsRef.current;
    const structure = setProductCustomizationImageSlotReceipt({
      slots: before,
      slotId,
      image: { receiptId: receipt.receiptId },
    });
    if (structure === before) {
      props.onDraftAction(createFailedImageUploadAction({ fieldId: props.field.id, operationId }));
      const failed = applyCurrentProductCustomizationImageSlotOperation({
        slots: before,
        operation,
        update: (current) => ({
          ...current,
          activeOperationId: null,
          status: "failed" as const,
          failureMessage: "This image is already used in another position. Choose a different image.",
        }),
      });
      if (failed.applied) writeSlots(failed.slots);
      return;
    }
    const next = applySlotStructure(before, structure).map((current) => current.slotId === slotId
      ? { ...current, activeOperationId: null, status: "accepted" as const, failureMessage: null, selectedFileAccepted: true }
      : current);
    writeSlots(next);
    const value = acceptedImageValue(props.field, next);
    if (!value) {
      props.onDraftAction(createFailedImageUploadAction({ fieldId: props.field.id, operationId }));
      return;
    }
    createAcceptedImageUploadActions({
      fieldId: props.field.id,
      fieldCode: props.field.code,
      operationId,
      receipt,
      value,
    }).forEach(props.onDraftAction);
    trackLocalAnalyticsEvent({
      eventName: "upload_accept",
      productId: props.field.productId,
      metadata: { fieldCode: props.field.code },
    });
    trackLocalAnalyticsEvent({
      eventName: "upload_success",
      productId: props.field.productId,
      metadata: { fieldCode: props.field.code },
    });
  }

  async function releasePersistentOperation(context: PersistentSlotOperationContext): Promise<void> {
    await (props.uploadImage ?? uploadCustomerCustomizationImage)({ productId: props.field.productId,
      fieldId: props.field.id, file: context.file, draftId: context.draftId,
      expectedVersion: context.expectedVersion, requestKey: context.requestKey, releaseOnly: true });
  }

  async function detachStalePersistentReceipt(context: PersistentSlotOperationContext,
    base: BrowserConfirmedDraft): Promise<void> {
    if (!props.persistentDraft) return;
    const currentValue = acceptedImageValue(props.field, slotsRef.current);
    const images = currentValue?.images.map(image => ({ receiptReference: image.receiptId,
      ...(image.crop ? { crop: image.crop } : {}) })) ?? [];
    let detached = await props.persistentDraft.saveField({ base, fieldId: props.field.id,
      images, idempotencyKey: crypto.randomUUID() });
    if (detached.status === "conflict") {
      const fresh = await props.persistentDraft.read(context.draftId);
      if (fresh.status === "found") detached = await props.persistentDraft.saveField({ base: fresh.value,
        fieldId: props.field.id, images, idempotencyKey: crypto.randomUUID() });
    }
    if (detached.status === "found") await releasePersistentOperation(context);
  }

  async function confirmPersistentReceipt(operation: ProductCustomizationImageSlotOperation,
    context: PersistentSlotOperationContext): Promise<void> {
    if (!context.receipt || !props.persistentDraft) return;
    if (!isCurrentProductCustomizationImageSlotOperation(slotsRef.current, operation)) {
      await releasePersistentOperation(context);
      return;
    }
    const current = slotsRef.current;
    const structure = setProductCustomizationImageSlotReceipt({ slots: current, slotId: operation.slotId,
      image: { receiptId: context.receipt.receiptId } });
    if (structure === current) {
      await releasePersistentOperation(context);
      failCurrentOperation(operation, "This image is already used in another position. Choose a different image.");
      return;
    }
    const candidate = applySlotStructure(current, structure);
    const value = acceptedImageValue(props.field, candidate);
    if (!value) {
      await releasePersistentOperation(context);
      failCurrentOperation(operation, "The saved customization could not be confirmed.");
      return;
    }
    const base = context.saveBase ?? props.persistentDraft.projection;
    if (!base || base.draftId !== context.draftId) {
      await releasePersistentOperation(context);
      failCurrentOperation(operation, "The saved customization is unavailable. Try again.");
      return;
    }
    const saveContext = { ...context, saveBase: base, saveKey: context.saveKey ?? crypto.randomUUID() };
    updateSlot(operation.slotId, slot => isCurrentProductCustomizationImageSlotOperation([slot], operation)
      ? { ...slot, status: "receipt_ready", persistentOperation: saveContext,
        failureMessage: "Image receipt confirmed; preparing saved customization…" }
      : slot);
    await Promise.resolve();
    updateSlot(operation.slotId, slot => isCurrentProductCustomizationImageSlotOperation([slot], operation)
      ? { ...slot, status: "draft_saving", persistentOperation: saveContext,
        failureMessage: "Image accepted; saving customization…" }
      : slot);
    let saved = await props.persistentDraft.saveField({ base, fieldId: props.field.id,
      images: value.images.map(image => ({ receiptReference: image.receiptId, ...(image.crop ? { crop: image.crop } : {}) })),
      idempotencyKey: saveContext.saveKey });
    if (saved.status === "conflict" && isCurrentProductCustomizationImageSlotOperation(slotsRef.current, operation)) {
      const fresh = await props.persistentDraft.read(context.draftId);
      if (fresh.status === "found" && isCurrentProductCustomizationImageSlotOperation(slotsRef.current, operation)) {
        saved = await props.persistentDraft.saveField({ base: fresh.value, fieldId: props.field.id,
          images: value.images.map(image => ({ receiptReference: image.receiptId, ...(image.crop ? { crop: image.crop } : {}) })),
          idempotencyKey: crypto.randomUUID() });
      }
    }
    if (!isCurrentProductCustomizationImageSlotOperation(slotsRef.current, operation)) {
      if (saved.status === "indeterminate") {
        saved = await props.persistentDraft.saveField({ base, fieldId: props.field.id,
          images: value.images.map(image => ({ receiptReference: image.receiptId, ...(image.crop ? { crop: image.crop } : {}) })),
          idempotencyKey: saveContext.saveKey });
      }
      if (saved.status === "found") await detachStalePersistentReceipt(context, saved.value);
      else await releasePersistentOperation(context);
      return;
    }
    if (saved.status === "indeterminate") {
      updateSlot(operation.slotId, slot => isCurrentProductCustomizationImageSlotOperation([slot], operation)
        ? { ...slot, status: "draft_saving", persistentOperation: saveContext,
          failureMessage: "Draft save confirmation is pending. Retry confirmation before continuing." }
        : slot);
      return;
    }
    if (saved.status !== "found") {
      await releasePersistentOperation(context);
      failCurrentOperation(operation, saved.status === "conflict"
        ? "The saved customization changed. Retry this image."
        : "The saved customization could not be confirmed. Retry this image.");
      return;
    }
    acceptLocalReceipt(operation, context.receipt);
    updateSlot(operation.slotId, slot => ({ ...slot, persistentOperation: null }));
  }

  async function handleRecoverPersistent(slotId: string): Promise<void> {
    const slot = slotsRef.current.find(candidate => candidate.slotId === slotId);
    const context = slot?.persistentOperation;
    if (!slot || !context || !props.persistentDraft
      || !isCurrentProductCustomizationImageSlotOperation(slotsRef.current, context.operation)) return;
    if (context.receipt) {
      await confirmPersistentReceipt(context.operation, context);
      return;
    }
    updateSlot(slotId, current => ({ ...current, status: "uploading", failureMessage: null }));
    const result = await (props.uploadImage ?? uploadCustomerCustomizationImage)({ productId: props.field.productId,
      fieldId: props.field.id, file: context.file, draftId: context.draftId,
      expectedVersion: context.expectedVersion, requestKey: context.requestKey, recoveryOnly: true });
    if (!isCurrentProductCustomizationImageSlotOperation(slotsRef.current, context.operation)) {
      if (result.status === "accepted") await releasePersistentOperation(context);
      return;
    }
    if (result.status === "accepted") await confirmPersistentReceipt(context.operation, { ...context, receipt: result.receipt });
    else if (["temporarily_unavailable", "malformed_success"].includes(result.status)) {
      updateSlot(slotId, current => ({ ...current, status: "server_pending",
        failureMessage: "Server confirmation is still pending." }));
    } else failCurrentOperation(context.operation, safeFailureMessage(result.status));
  }

  function handleAddSlot(): void {
    const structure = addProductCustomizationImageSlot({
      slots,
      maxImageCount: props.field.constraints.maxImageCount,
      createSlotId: slotIdFactory,
    });
    if (structure === slots) return;
    writeSlots([...applySlotStructure(slots, structure), toSlotState(structure[structure.length - 1])]);
  }

  function handleMove(slotId: string, direction: "up" | "down"): void {
    const structure = moveProductCustomizationImageSlot({ slots, slotId, direction });
    if (structure === slots) return;
    const next = applySlotStructure(slots, structure);
    writeSlots(next);
    synchronizeDraftImageValue(next);
  }

  function handleReorderPointerDown(slotId: string, event: ReactPointerEvent<HTMLButtonElement>): void {
    reorderPointerSlotId.current = slotId;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleReorderPointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    const slotId = reorderPointerSlotId.current;
    reorderPointerSlotId.current = null;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-image-slot-id]");
    const targetSlotId = target?.dataset.imageSlotId;
    if (!slotId || !targetSlotId) return;
    const structure = reorderProductCustomizationImageSlot({ slots: slotsRef.current, slotId, targetSlotId });
    if (structure === slotsRef.current) return;
    const next = applySlotStructure(slotsRef.current, structure);
    writeSlots(next);
    synchronizeDraftImageValue(next);
  }

  function handleOpenCropEditor(slotId: string): void {
    if (!props.field.constraints.cropEnabled) return;
    updateSlot(slotId, (slot) => (
      slot.status === "uploading" || !slot.image || !slot.preview || !slot.selectedFileAccepted
        ? slot
        : {
            ...slot,
            cropEditor: { values: createProductCustomizationCropEditorValues(slot.image.crop), feedback: null },
          }
    ));
  }

  function handleCropValueChange(
    slotId: string,
    key: keyof ProductCustomizationCropEditorValues,
    value: string,
  ): void {
    updateSlot(slotId, (slot) => slot.cropEditor
      ? { ...slot, cropEditor: { values: { ...slot.cropEditor.values, [key]: value }, feedback: null } }
      : slot);
  }

  function handleCropPointerDown(
    slotId: string,
    mode: ProductCustomizationCropPointerMode,
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    const slot = slotsRef.current.find((candidate) => candidate.slotId === slotId);
    const parsed = slot?.cropEditor ? parseProductCustomizationCropEditorValues(slot.cropEditor.values) : null;
    const boundsElement = mode === "resize"
      ? event.currentTarget.parentElement?.parentElement
      : event.currentTarget.parentElement;
    const bounds = boundsElement?.getBoundingClientRect();
    if (!parsed?.ok || !bounds || bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropPointer.current = {
      slotId,
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
      crop: parsed.value,
    };
  }

  function handleCropPointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const pointer = cropPointer.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const crop = applyProductCustomizationCropPointerDelta({
      crop: pointer.crop,
      mode: pointer.mode,
      deltaX: event.clientX - pointer.startX,
      deltaY: event.clientY - pointer.startY,
      boundsWidth: pointer.boundsWidth,
      boundsHeight: pointer.boundsHeight,
    });
    updateSlot(pointer.slotId, (slot) => slot.cropEditor
      ? { ...slot, cropEditor: { values: createProductCustomizationCropEditorValues(crop), feedback: null } }
      : slot);
  }

  function handleCropPointerEnd(event: ReactPointerEvent<HTMLElement>): void {
    if (cropPointer.current?.pointerId === event.pointerId) cropPointer.current = null;
  }

  async function handleApplyCrop(slotId: string): Promise<void> {
    if (!props.field.constraints.cropEnabled) return;
    const slot = slotsRef.current.find((candidate) => candidate.slotId === slotId);
    if (!slot?.image || !slot.preview || !slot.selectedFileAccepted || !slot.cropEditor || slot.status === "uploading") return;
    const parsed = parseProductCustomizationCropEditorValues(slot.cropEditor.values);
    if (!parsed.ok) {
      updateSlot(slotId, (current) => current.cropEditor
        ? { ...current, cropEditor: { ...current.cropEditor, feedback: parsed.issues[0]?.message ?? "Crop values are invalid." } }
        : current);
      return;
    }
    const originalReceiptId = slot.image.receiptId;
    let receiptId = originalReceiptId;
    if (props.persistentDraft?.projection) {
      const base = props.persistentDraft.projection;
      const cropped = await cropPersistentCustomizationImage({ productId: props.field.productId, fieldId: props.field.id,
        draftId: base.draftId, expectedVersion: base.version, receiptId, crop: parsed.value,
        idempotencyKey: crypto.randomUUID() });
      if (cropped.status !== "found" || slotsRef.current.find(candidate => candidate.slotId === slotId)?.image?.receiptId !== receiptId) {
        updateSlot(slotId, current => ({ ...current, failureMessage: cropped.status === "conflict"
          ? "The saved customization changed. Refresh and apply the crop again."
          : "The server could not confirm this crop. The previous saved crop remains unchanged." }));
        return;
      }
      receiptId = cropped.receipt.receiptId;
      props.onDraftAction({ type: "record_accepted_receipt", receipt: cropped.receipt });
    }
    const withReceipt = setProductCustomizationImageSlotReceipt({ slots: slotsRef.current, slotId,
      image: { receiptId } });
    const structure = setProductCustomizationImageSlotCrop({ slots: withReceipt, slotId, crop: parsed.value });
    const next = applySlotStructure(slotsRef.current, structure).map((current) => current.slotId === slotId
      ? { ...current, cropEditor: null, ...(receiptId !== originalReceiptId ? {
          preview: { url: `/api/customer-uploads/preview?receiptId=${encodeURIComponent(receiptId)}`, revoke() {} },
          restored: true,
        } : {}) }
      : current);
    writeSlots(next);
    synchronizeDraftImageValue(next);
  }

  function handleClearCrop(slotId: string): void {
    if (!props.field.constraints.cropEnabled) return;
    const slot = slotsRef.current.find((candidate) => candidate.slotId === slotId);
    if (!slot?.image || !slot.preview || !slot.selectedFileAccepted || slot.status === "uploading") return;
    const structure = clearProductCustomizationImageSlotCrop({ slots: slotsRef.current, slotId });
    const next = applySlotStructure(slotsRef.current, structure).map((current) => current.slotId === slotId
      ? { ...current, cropEditor: null }
      : current);
    writeSlots(next);
    synchronizeDraftImageValue(next);
  }

  function handleCancelCrop(slotId: string): void {
    updateSlot(slotId, (slot) => slot.cropEditor ? { ...slot, cropEditor: null } : slot);
  }

  function handleRemove(slotId: string): void {
    const removed = slotsRef.current.find((slot) => slot.slotId === slotId);
    if (!removed) return;
    finishActiveSlotOperation(removed);
    if (removed.persistentOperation) void releasePersistentOperation(removed.persistentOperation);
    createRemovedImageSlotActions({
      draft: props.draft,
      fieldId: props.field.id,
      slotId,
    }).forEach(props.onDraftAction);
    disposeLocalCustomerInputPreview(removed.preview);
    const structure = removeProductCustomizationImageSlot(slotsRef.current, slotId);
    const next = structure.length > 0
      ? applySlotStructure(slotsRef.current, structure)
      : [toSlotState(createEmptyProductCustomizationImageSlot(slotIdFactory()))];
    writeSlots(next);
    if (removed.image) synchronizeDraftImageValue(next);
  }

  function handleCancelUpload(slotId: string): void {
    updateSlot(slotId, (slot) => {
      if (slot.status !== "uploading" || !slot.activeOperationId) return slot;
      finishActiveSlotOperation(slot);
      if (slot.persistentOperation) void releasePersistentOperation(slot.persistentOperation);
      return {
        ...slot,
        activeOperationId: null,
        status: slot.preflight?.canAttemptUpload ? "ready" : "idle",
        failureMessage: null,
        persistentOperation: null,
      };
    });
  }

  return (
    <div className={styles.customizationImageField} data-customization-field-id={props.field.id}>
      <div className={styles.customizationFieldLabel}>
        <span>{props.field.label}</span>
        <span className={styles.customizationRequirement}>{props.field.required ? t("Required") : t("Optional")}</span>
      </div>
      <div className={styles.customizationImageRequirements}>
        <span>{t("Accepted formats")}: {formatAllowedFormats(props.field.constraints.allowedMimeTypes)}</span>
        <span>{t("Maximum file size")}: {formatBytes(props.field.constraints.maxBytes, t)}</span>
        <span>{t("Minimum dimensions")}: {props.field.constraints.minDimensions.width} × {props.field.constraints.minDimensions.height}px</span>
        {props.field.constraints.recommendedDimensions && <span>{t("Recommended dimensions")}: {props.field.constraints.recommendedDimensions.width} × {props.field.constraints.recommendedDimensions.height}px</span>}
      </div>
      <div
        className={styles.customizationImageDropZone}
        data-drag-active={isDropActive || undefined}
        onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
        }}
        onDrop={handleFileDrop}
        role="group"
        aria-labelledby={`${bulkControlId}-label`}
      >
        <label className={styles.customizationFileLabel} id={`${bulkControlId}-label`} htmlFor={bulkControlId}>{t("Choose one or more images")}</label>
        <input
          className={styles.customizationFileInput}
          id={bulkControlId}
          type="file"
          multiple
          accept={props.field.constraints.allowedMimeTypes.join(",")}
          disabled={remainingCapacity === 0}
          onChange={handleMultipleFileChange}
        />
        <p>{t("Drop images here or use the file button.")}</p>
        <p aria-live="polite">{t("Remaining capacity")}: {remainingCapacity} {t("of")} {props.field.constraints.maxImageCount}</p>
      </div>
      {rejectedFileNames.length > 0 && (
        <div className={styles.customizationImageCapacityFeedback} role="alert">
          <p>{t("Not accepted — image limit reached")}:</p>
          <ul>{rejectedFileNames.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul>
        </div>
      )}
      <div className={styles.customizationImageSlotList}>
        {slots.map((slot, index) => {
          const controlId = `${controlPrefix}-${slot.slotId}`;
          const feedbackId = `${controlId}-feedback`;
          const receipt = slot.image
            ? props.draft.acceptedReceipts.find((candidate) => candidate.receiptId === slot.image?.receiptId)
            : undefined;
          const uploadDisabled = !slot.file || !["ready", "failed"].includes(slot.status) || !slot.preflight?.canAttemptUpload
            || slot.selectedFileAccepted || slot.activeOperationId !== null;
          const issues = slot.preflight?.issues ?? [];
          const warnings = slot.preflight?.warnings ?? [];
          const canRemove = Boolean(slot.file || slot.image);
          const canEditCrop = props.field.constraints.cropEnabled
            && Boolean(slot.image && slot.preview && slot.selectedFileAccepted && slot.status === "accepted");
          const replacementAwaitingUpload = Boolean(slot.image && slot.file && !slot.selectedFileAccepted);
          const cropEditor = slot.cropEditor;
          return (
            <section className={styles.customizationImageSlot} key={slot.slotId} aria-label={`${t("Image")} ${index + 1}`} data-current-order={index + 1} data-image-slot-id={slot.slotId} data-upload-state={slot.status}>
              <div className={styles.customizationImageSlotHeader}>
                <h3>{t("Image")} {index + 1} {t("of")} {slots.length}</h3>
                <span className={styles.customizationImageStatus} aria-live="polite">{t(imageStatusLabel(slot.status))}</span>
                {slots.length > 1 && (
                  <div className={styles.customizationImageMoveActions}>
                    <button
                      type="button"
                      className={styles.customizationImagePointerHandle}
                      aria-label={`${t("Drag to reorder image")} ${index + 1}`}
                      onPointerDown={(event) => handleReorderPointerDown(slot.slotId, event)}
                      onPointerUp={handleReorderPointerUp}
                      onPointerCancel={() => { reorderPointerSlotId.current = null; }}
                    >↕ {t("Drag")}</button>
                    <button type="button" className={styles.customizationSecondaryButton} disabled={index === 0} onClick={() => handleMove(slot.slotId, "up")}>{t("Move image")} {index + 1} {t("up")}</button>
                    <button type="button" className={styles.customizationSecondaryButton} disabled={index === slots.length - 1} onClick={() => handleMove(slot.slotId, "down")}>{t("Move image")} {index + 1} {t("down")}</button>
                  </div>
                )}
              </div>
              <label className={styles.customizationFileLabel} htmlFor={controlId}>{t("Choose image")} {index + 1}</label>
              <input
                key={slot.inputVersion}
                className={styles.customizationFileInput}
                id={controlId}
                name={`customization-${props.field.id}-${slot.slotId}`}
                type="file"
                accept={props.field.constraints.allowedMimeTypes.join(",")}
                aria-describedby={issues.length > 0 || warnings.length > 0 || slot.failureMessage ? feedbackId : undefined}
                aria-required={props.field.required || undefined}
                onChange={(event) => handleFileChange(slot.slotId, event)}
              />
              {slot.preview && (
                <div className={styles.customizationImagePreview}>
                  <div className={styles.customizationImagePreviewMedia}>
                    <img
                      src={slot.preview.url}
                      alt={`${t("Selected customer image preview")} for ${props.field.label}, ${t("Image")} ${index + 1}`}
                      onLoad={(event) => handlePreviewLoad(slot.slotId, slot.selectionGeneration, event)}
                      onError={(event) => handlePreviewError(slot.slotId, slot.selectionGeneration, event)}
                    />
                    {canEditCrop && slot.image?.crop && !cropEditor && (
                      <div
                        className={styles.customizationCropOverlay}
                        aria-hidden="true"
                        style={{
                          left: `${slot.image.crop.x * 100}%`,
                          top: `${slot.image.crop.y * 100}%`,
                          width: `${slot.image.crop.width * 100}%`,
                          height: `${slot.image.crop.height * 100}%`,
                        }}
                      />
                    )}
                    {canEditCrop && cropEditor && (() => {
                      const parsed = parseProductCustomizationCropEditorValues(cropEditor.values);
                      if (!parsed.ok) return null;
                      return (
                        <div
                          className={`${styles.customizationCropOverlay} ${styles.customizationCropOverlayInteractive}`}
                          role="application"
                          aria-label={`${t("Move crop for image")} ${index + 1}`}
                          style={{
                            left: `${parsed.value.x * 100}%`,
                            top: `${parsed.value.y * 100}%`,
                            width: `${parsed.value.width * 100}%`,
                            height: `${parsed.value.height * 100}%`,
                          }}
                          onPointerDown={(event) => handleCropPointerDown(slot.slotId, "move", event)}
                          onPointerMove={handleCropPointerMove}
                          onPointerUp={handleCropPointerEnd}
                          onPointerCancel={handleCropPointerEnd}
                        >
                          <button
                            type="button"
                            className={styles.customizationCropResizeHandle}
                            aria-label={`${t("Resize crop for image")} ${index + 1}`}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              handleCropPointerDown(slot.slotId, "resize", event);
                            }}
                            onPointerMove={handleCropPointerMove}
                            onPointerUp={handleCropPointerEnd}
                            onPointerCancel={handleCropPointerEnd}
                          />
                        </div>
                      );
                    })()}
                  </div>
                  <p>{slot.restored
                    ? t("Saved private image preview — restored from the confirmed customization.")
                    : t("Customer input preview — this is not a production mockup.")}</p>
                </div>
              )}
              {slot.file && (
                <div className={styles.customizationImageMetadata}>
                  <span>{slot.file.name}</span>
                  <span>{slot.file.type || t("Unknown format")}</span>
                  <span>{formatBytes(slot.file.size, t)}</span>
                  {slot.decodedDimensions && <span>{slot.decodedDimensions.width} × {slot.decodedDimensions.height}px</span>}
                </div>
              )}
              {receipt && receipt.dimensions && <p className={styles.customizationAcceptedMetadata}>{t("Server accepted")}: {receipt.contentType}, {receipt.byteSize} bytes, {receipt.dimensions.width} × {receipt.dimensions.height}px.</p>}
              {props.field.constraints.cropEnabled && slot.image && (
                <div className={styles.customizationCropSection}>
                  {canEditCrop ? (
                    <>
                      <button className={styles.customizationSecondaryButton} type="button" disabled={slot.status === "uploading"} onClick={() => handleOpenCropEditor(slot.slotId)}>{t("Adjust crop")}</button>
                      {cropEditor && (
                        <div className={styles.customizationCropEditor} aria-label={`${t("Crop editor")} ${t("Image")} ${index + 1}`}>
                          <p>{t("Crop selection — customer input only. Final production framing may differ.")}</p>
                          <div className={styles.customizationCropControls}>
                            {([
                              ["x", "Crop left"],
                              ["y", "Crop top"],
                              ["width", "Crop width"],
                              ["height", "Crop height"],
                            ] as const).map(([key, label]) => {
                              const inputId = `${controlId}-crop-${key}`;
                              return (
                                <label key={key} htmlFor={inputId}>
                                  <span>{t(label)}</span>
                                  <input
                                    id={inputId}
                                    type="number"
                                    inputMode="decimal"
                                    step="any"
                                    disabled={slot.status === "uploading"}
                                    value={cropEditor.values[key]}
                                    onChange={(event) => handleCropValueChange(slot.slotId, key, event.currentTarget.value)}
                                  />
                                  <span>%</span>
                                </label>
                              );
                            })}
                          </div>
                          {cropEditor.feedback && <p className={styles.customizationCropFeedback} aria-live="polite">{t(cropEditor.feedback)}</p>}
                          <div className={styles.customizationImageActions}>
                            <button className={styles.customizationUploadButton} type="button" disabled={slot.status === "uploading"} onClick={() => void handleApplyCrop(slot.slotId)}>{t("Apply crop")}</button>
                            <button className={styles.customizationSecondaryButton} type="button" disabled={slot.status === "uploading"} onClick={() => handleClearCrop(slot.slotId)}>{t("Use full image")}</button>
                            <button className={styles.customizationSecondaryButton} type="button" disabled={slot.status === "uploading"} onClick={() => handleCancelCrop(slot.slotId)}>{t("Cancel")}</button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className={styles.customizationCropUnavailable}>
                      {replacementAwaitingUpload
                        ? t("Upload the replacement image before adjusting its crop.")
                        : t("Crop preview is unavailable in this local session.")}
                    </p>
                  )}
                </div>
              )}
              {(issues.length > 0 || warnings.length > 0 || slot.failureMessage) && (
                <div className={styles.customizationFeedback} id={feedbackId} aria-live="polite">
                  {issues.map((issue) => <p key={issue.code}>{t(issue.message)}</p>)}
                  {warnings.map((warning) => <p className={styles.customizationWarning} key={warning.code}>{t(warning.message)}</p>)}
                  {slot.failureMessage && <p>{t(slot.failureMessage)}</p>}
                </div>
              )}
              {slot.status === "uploading" && <div className={styles.customizationUploadProgress} aria-live="polite"><span>{t("Uploading image…")}</span><progress aria-label={`${t("Image")} ${index + 1} ${t("upload in progress")} `} /></div>}
              {slot.status === "server_pending" && <p className={styles.customizationWarning} aria-live="polite">{t("Server confirmation pending. Recover this upload before continuing.")}</p>}
              {slot.status === "draft_saving" && <p className={styles.customizationWarning} aria-live="polite">{t("Draft save confirmation pending.")}</p>}
              {slot.status === "accepted" && <p className={styles.customizationUploadSuccess} aria-live="polite">{slot.restored
                ? t("Saved image restored. Unsaved selections or crop changes from another tab may be lost.")
                : t("Image upload accepted.")}</p>}
              <div className={styles.customizationImageActions}>
                <button className={styles.customizationUploadButton} type="button" disabled={uploadDisabled} onClick={() => void handleUpload(slot.slotId)}>{slot.status === "failed" ? t("Retry image") : t("Upload image")} {index + 1}</button>
                {["server_pending", "draft_saving"].includes(slot.status) && <button className={styles.customizationUploadButton} type="button" onClick={() => void handleRecoverPersistent(slot.slotId)}>{t("Recover upload")} {index + 1}</button>}
                {slot.status === "uploading" && <button className={styles.customizationSecondaryButton} type="button" onClick={() => handleCancelUpload(slot.slotId)}>{t("Cancel upload")}</button>}
                <button className={styles.customizationSecondaryButton} type="button" onClick={() => document.getElementById(controlId)?.click()}>{t("Replace image")}</button>
                <button className={styles.customizationSecondaryButton} type="button" disabled={!canRemove} onClick={() => handleRemove(slot.slotId)}>{t("Remove image")}</button>
              </div>
            </section>
          );
        })}
      </div>
      {props.field.constraints.maxImageCount > 1 && (
        <div className={styles.customizationImageAddArea}>
          <button className={styles.customizationSecondaryButton} type="button" disabled={atMaximum} onClick={handleAddSlot}>{t("Add another image")}</button>
          {atMaximum && <p>{t("Maximum")} {props.field.constraints.maxImageCount} {t("images")}</p>}
        </div>
      )}
    </div>
  );
}
