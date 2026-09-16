/**
 * Browser-safe correlation facts for asynchronous image-slot work.
 *
 * These selectors coordinate presentation state only. They are not receipt,
 * draft, owner, or provider authority and must never be persisted as such.
 */
export interface ProductCustomizationImageSlotAsyncState {
  readonly slotId: string;
  readonly selectionGeneration: number;
  readonly activeOperationId: string | null;
}

export interface ProductCustomizationImageSlotOperation {
  readonly slotId: string;
  readonly selectionGeneration: number;
  readonly operationId: string;
}

export interface ProductCustomizationImageSlotSelection {
  readonly slotId: string;
  readonly selectionGeneration: number;
}

export function isCurrentProductCustomizationImageSlotSelection(
  slots: readonly ProductCustomizationImageSlotAsyncState[],
  selection: ProductCustomizationImageSlotSelection,
): boolean {
  return slots.some((slot) => (
    slot.slotId === selection.slotId
    && slot.selectionGeneration === selection.selectionGeneration
  ));
}

export function isCurrentProductCustomizationImageSlotOperation(
  slots: readonly ProductCustomizationImageSlotAsyncState[],
  operation: ProductCustomizationImageSlotOperation,
): boolean {
  return slots.some((slot) => (
    slot.slotId === operation.slotId
    && slot.selectionGeneration === operation.selectionGeneration
    && slot.activeOperationId === operation.operationId
  ));
}

export function applyCurrentProductCustomizationImageSlotOperation<
  Slot extends ProductCustomizationImageSlotAsyncState,
>(input: {
  readonly slots: readonly Slot[];
  readonly operation: ProductCustomizationImageSlotOperation;
  readonly update: (slot: Slot) => Slot;
}): { readonly slots: readonly Slot[]; readonly applied: boolean } {
  let applied = false;
  const slots = input.slots.map((slot) => {
    if (
      slot.slotId !== input.operation.slotId
      || slot.selectionGeneration !== input.operation.selectionGeneration
      || slot.activeOperationId !== input.operation.operationId
    ) return slot;
    applied = true;
    return input.update(slot);
  });
  return { slots: applied ? slots : input.slots, applied };
}

/**
 * A late crop-preview or draft-save result may update UI state only while its
 * captured revision is still current. Durable draft writes remain protected by
 * the server-side expectedVersion CAS boundary.
 */
export function isCurrentProductCustomizationAsyncRevision(
  currentRevision: number,
  resultRevision: number,
): boolean {
  return Number.isSafeInteger(currentRevision)
    && currentRevision >= 0
    && Number.isSafeInteger(resultRevision)
    && resultRevision === currentRevision;
}
