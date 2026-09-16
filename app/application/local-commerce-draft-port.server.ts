import type { CustomizationCropRegion } from "../domain/customization-value.ts";
import type { LocalCommerceCommandContext, LocalCommercePortResult, VerifiedAuthorityContext } from "./local-commerce-provider-ports.server.ts";

export interface DraftSlotInput {
  /** Omit to allocate a new server ID; provided IDs must already belong to this draft. */
  readonly slotId?: string;
  readonly fieldId: string;
  readonly receiptReference: string;
  readonly crop?: CustomizationCropRegion;
}
export interface ConfirmedDraftSlot extends DraftSlotInput {
  readonly slotId: string;
  readonly position: number;
  readonly confirmedRevision: number;
}
export interface ConfirmedDraft {
  readonly draftId: string;
  readonly productId: string;
  readonly version: number;
  readonly confirmedRevision: number;
  readonly slots: readonly ConfirmedDraftSlot[];
}
export interface LocalCommerceDraftPort {
  create(input: LocalCommerceCommandContext & { readonly productId: string }): Promise<LocalCommercePortResult<ConfirmedDraft>>;
  read(input: { readonly authority: VerifiedAuthorityContext; readonly draftId: string }): Promise<LocalCommercePortResult<ConfirmedDraft>>;
  save(input: LocalCommerceCommandContext & { readonly draftId: string; readonly slots: readonly DraftSlotInput[] }): Promise<LocalCommercePortResult<ConfirmedDraft>>;
}
