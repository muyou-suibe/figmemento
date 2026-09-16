export type FulfillmentSelectorInput = {
  readonly actionKind: string;
  readonly expectedPreviewVersion?: number;
  readonly revisionNote?: string;
};

export type FulfillmentSelector<T extends FulfillmentSelectorInput = FulfillmentSelectorInput> = T & {
  readonly fulfillmentActionId: string;
};

export type FulfillmentSelectorOutcome = "transport_retry" | "committed" | "replayed" | "definitive_rejection";

function matchesSelector<T extends FulfillmentSelectorInput>(
  existing: FulfillmentSelector<T>,
  requested: T,
): boolean {
  return existing.actionKind === requested.actionKind
    && existing.expectedPreviewVersion === requested.expectedPreviewVersion
    && existing.revisionNote === requested.revisionNote;
}

export function getOrCreateFulfillmentSelector<T extends FulfillmentSelectorInput>(
  existing: FulfillmentSelector<T> | null,
  requested: T,
  createId: () => string,
): FulfillmentSelector<T> {
  if (existing && matchesSelector(existing, requested)) return existing;
  return { fulfillmentActionId: createId(), ...requested };
}

export function settleFulfillmentSelector<T extends FulfillmentSelectorInput>(
  selector: FulfillmentSelector<T> | null,
  outcome: FulfillmentSelectorOutcome,
): FulfillmentSelector<T> | null {
  return outcome === "transport_retry" ? selector : null;
}
