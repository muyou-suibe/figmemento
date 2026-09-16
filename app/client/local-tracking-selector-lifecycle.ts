export type LocalTrackingSelectorInput = { readonly actionKind: "create_shipment" | "mark_shipped" | "mark_in_transit" | "mark_delivered" };
export type LocalTrackingSelector = LocalTrackingSelectorInput & { readonly trackingActionId: string };
export type LocalTrackingSelectorOutcome = "transport_retry" | "committed" | "replayed" | "definitive_rejection";

export function getOrCreateLocalTrackingSelector(
  existing: LocalTrackingSelector | null,
  requested: LocalTrackingSelectorInput,
  createId: () => string,
): LocalTrackingSelector {
  return existing && existing.actionKind === requested.actionKind ? existing : { trackingActionId: createId(), ...requested };
}

export function settleLocalTrackingSelector(selector: LocalTrackingSelector | null, outcome: LocalTrackingSelectorOutcome): LocalTrackingSelector | null {
  return outcome === "transport_retry" ? selector : null;
}
