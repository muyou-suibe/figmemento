import type {
  CustomizationCropRegion,
  CustomizationImageReceiptReference,
  CustomizationImageValue,
} from "../domain/customization-value.ts";

/** Client-local position identity and its optional ordered receipt reference. */
export interface ProductCustomizationImageSlot {
  readonly slotId: string;
  readonly image?: CustomizationImageReceiptReference;
}

function cloneReference(reference: CustomizationImageReceiptReference): CustomizationImageReceiptReference {
  return {
    receiptId: reference.receiptId,
    ...(reference.crop ? { crop: { ...reference.crop } } : {}),
  };
}

function cloneSlot(slot: ProductCustomizationImageSlot): ProductCustomizationImageSlot {
  return { slotId: slot.slotId, ...(slot.image ? { image: cloneReference(slot.image) } : {}) };
}

export function createEmptyProductCustomizationImageSlot(slotId: string): ProductCustomizationImageSlot {
  return { slotId };
}

/** Hydration preserves existing draft order and adds one visible empty slot only when needed. */
export function hydrateProductCustomizationImageSlots(input: {
  readonly images: readonly CustomizationImageReceiptReference[];
  readonly createSlotId: () => string;
}): readonly ProductCustomizationImageSlot[] {
  return input.images.length > 0
    ? input.images.map((image) => ({ slotId: input.createSlotId(), image: cloneReference(image) }))
    : [createEmptyProductCustomizationImageSlot(input.createSlotId())];
}

export function canAddProductCustomizationImageSlot(
  slots: readonly ProductCustomizationImageSlot[],
  maxImageCount: number,
): boolean {
  return slots.length < maxImageCount;
}

export function addProductCustomizationImageSlot(input: {
  readonly slots: readonly ProductCustomizationImageSlot[];
  readonly maxImageCount: number;
  readonly createSlotId: () => string;
}): readonly ProductCustomizationImageSlot[] {
  return canAddProductCustomizationImageSlot(input.slots, input.maxImageCount)
    ? [...input.slots.map(cloneSlot), createEmptyProductCustomizationImageSlot(input.createSlotId())]
    : input.slots;
}

export interface ProductCustomizationImageFileAssignment<FileValue> {
  readonly slotId: string;
  readonly file: FileValue;
}

export interface ProductCustomizationImageFileAdmission<FileValue> {
  readonly slots: readonly ProductCustomizationImageSlot[];
  readonly accepted: readonly ProductCustomizationImageFileAssignment<FileValue>[];
  readonly rejected: readonly FileValue[];
  readonly remainingCapacity: number;
}

/**
 * Deterministically assigns an ordered file selection to empty/new local slots.
 * Existing occupied slots and their receipt/crop facts remain untouched. Files
 * beyond the field's remaining authority are returned explicitly to the UI.
 */
export function admitProductCustomizationImageFiles<FileValue>(input: {
  readonly slots: readonly ProductCustomizationImageSlot[];
  readonly occupiedSlotIds: ReadonlySet<string>;
  readonly files: readonly FileValue[];
  readonly maxImageCount: number;
  readonly createSlotId: () => string;
}): ProductCustomizationImageFileAdmission<FileValue> {
  const slots = input.slots.map(cloneSlot);
  const occupiedCount = slots.reduce(
    (count, slot) => count + (input.occupiedSlotIds.has(slot.slotId) ? 1 : 0),
    0,
  );
  const availableCount = Math.max(0, input.maxImageCount - occupiedCount);
  const acceptedFiles = input.files.slice(0, availableCount);
  const rejected = input.files.slice(acceptedFiles.length);
  const emptySlotIds = slots
    .filter((slot) => !input.occupiedSlotIds.has(slot.slotId))
    .map((slot) => slot.slotId);

  while (emptySlotIds.length < acceptedFiles.length && slots.length < input.maxImageCount) {
    const slot = createEmptyProductCustomizationImageSlot(input.createSlotId());
    slots.push(slot);
    emptySlotIds.push(slot.slotId);
  }

  const accepted = acceptedFiles.slice(0, emptySlotIds.length).map((file, index) => ({
    slotId: emptySlotIds[index],
    file,
  }));
  const capacityRejected = acceptedFiles.slice(accepted.length);

  return {
    slots,
    accepted,
    rejected: [...capacityRejected, ...rejected],
    remainingCapacity: Math.max(0, availableCount - accepted.length),
  };
}

export function removeProductCustomizationImageSlot(
  slots: readonly ProductCustomizationImageSlot[],
  slotId: string,
): readonly ProductCustomizationImageSlot[] {
  const index = slots.findIndex((slot) => slot.slotId === slotId);
  return index === -1 ? slots : slots.filter((slot) => slot.slotId !== slotId).map(cloneSlot);
}

export function moveProductCustomizationImageSlot(input: {
  readonly slots: readonly ProductCustomizationImageSlot[];
  readonly slotId: string;
  readonly direction: "up" | "down";
}): readonly ProductCustomizationImageSlot[] {
  const fromIndex = input.slots.findIndex((slot) => slot.slotId === input.slotId);
  const toIndex = input.direction === "up" ? fromIndex - 1 : fromIndex + 1;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= input.slots.length) return input.slots;
  const next = input.slots.map(cloneSlot);
  [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
  return next;
}

/** Reorders one complete slot to another slot's current position. */
export function reorderProductCustomizationImageSlot(input: {
  readonly slots: readonly ProductCustomizationImageSlot[];
  readonly slotId: string;
  readonly targetSlotId: string;
}): readonly ProductCustomizationImageSlot[] {
  const fromIndex = input.slots.findIndex((slot) => slot.slotId === input.slotId);
  const toIndex = input.slots.findIndex((slot) => slot.slotId === input.targetSlotId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return input.slots;
  const next = input.slots.map(cloneSlot);
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Inserts or replaces only one position. A receipt cannot occupy two local
 * positions; a duplicate attempt is a no-op rather than a malformed draft.
 */
export function setProductCustomizationImageSlotReceipt(input: {
  readonly slots: readonly ProductCustomizationImageSlot[];
  readonly slotId: string;
  readonly image: CustomizationImageReceiptReference;
}): readonly ProductCustomizationImageSlot[] {
  const target = input.slots.find((slot) => slot.slotId === input.slotId);
  if (!target) return input.slots;
  if (input.slots.some((slot) => slot.slotId !== input.slotId && slot.image?.receiptId === input.image.receiptId)) {
    return input.slots;
  }
  return input.slots.map((slot) => slot.slotId === input.slotId
    ? { slotId: slot.slotId, image: cloneReference(input.image) }
    : cloneSlot(slot));
}

/** Updates only one occupied position's non-destructive crop metadata. */
export function setProductCustomizationImageSlotCrop(input: {
  readonly slots: readonly ProductCustomizationImageSlot[];
  readonly slotId: string;
  readonly crop: CustomizationCropRegion;
}): readonly ProductCustomizationImageSlot[] {
  const target = input.slots.find((slot) => slot.slotId === input.slotId);
  if (!target?.image) return input.slots;
  return input.slots.map((slot) => slot.slotId === input.slotId
    ? { slotId: slot.slotId, image: { receiptId: slot.image!.receiptId, crop: { ...input.crop } } }
    : cloneSlot(slot));
}

/** Removes crop metadata from one occupied position without replacing its receipt. */
export function clearProductCustomizationImageSlotCrop(input: {
  readonly slots: readonly ProductCustomizationImageSlot[];
  readonly slotId: string;
}): readonly ProductCustomizationImageSlot[] {
  const target = input.slots.find((slot) => slot.slotId === input.slotId);
  if (!target?.image?.crop) return input.slots;
  return input.slots.map((slot) => slot.slotId === input.slotId
    ? { slotId: slot.slotId, image: { receiptId: slot.image!.receiptId } }
    : cloneSlot(slot));
}

/** Maps occupied positions only; their array order is the local draft order authority. */
export function toOrderedProductCustomizationImageValue(input: {
  readonly fieldId: string;
  readonly fieldCode: string;
  readonly slots: readonly ProductCustomizationImageSlot[];
}): CustomizationImageValue | undefined {
  const images = input.slots.flatMap((slot) => slot.image ? [cloneReference(slot.image)] : []);
  return images.length > 0
    ? { fieldId: input.fieldId, fieldCode: input.fieldCode, kind: "image", images }
    : undefined;
}
