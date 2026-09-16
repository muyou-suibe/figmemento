import { projectHistoryForFulfillment, type CanonicalPersistentHistory } from "./local-order-consumer-projections.server.ts";

export type PersistentPhotoReviewStatus = "pending" | "approved" | "rejected";

/** Pure projection of validated, already-authorized immutable history. This is
 * neither an acquisition port nor a media-byte permission. Never call with a
 * browser/Cart/Catalog projection. Empty media and missing media are distinct. */
export function persistentPhotoReviewApplicability(items: readonly CanonicalPersistentHistory[]) {
  const unavailable = { status: "unavailable" as const };
  if (!Array.isArray(items) || items.length === 0) return unavailable;
  const first = items[0];
  const seen = new Set<string>();
  const applicableItemIds: string[] = [];
  const previewRequiredItemIds: string[] = [];
  for (const item of items) {
    // The existing projector checks the validation stamp; a structural cast or
    // cloned browser object cannot promote itself to canonical history.
    if (projectHistoryForFulfillment(item).status !== "found"
      || item.orderId !== first.orderId || item.publicReference !== first.publicReference
      || seen.has(item.orderItemId) || !Array.isArray(item.media)) return unavailable;
    seen.add(item.orderItemId);
    if (item.media.length > 0) applicableItemIds.push(item.orderItemId);
    if (item.fulfillment.requiresProductionPreview) previewRequiredItemIds.push(item.orderItemId);
  }
  return { status: "found" as const, value: Object.freeze({
    orderId: first.orderId,
    applicableItemIds: Object.freeze(applicableItemIds),
    previewRequiredItemIds: Object.freeze(previewRequiredItemIds),
  }) };
}

/** Read-only production prerequisite, NOT permission to start production.
 * Payment, actor and the independent latest-preview gate remain mandatory. */
export function persistentPhotoReviewGate(items: readonly CanonicalPersistentHistory[], reviews: readonly {
  readonly orderId: string;
  readonly orderItemId: string;
  readonly status: PersistentPhotoReviewStatus;
}[]) {
  const policy = persistentPhotoReviewApplicability(items);
  if (policy.status !== "found" || !Array.isArray(reviews)) return { status: "unavailable" as const };
  const expected = new Set(policy.value.applicableItemIds);
  const seen = new Set<string>();
  for (const review of reviews) {
    if (!review || review.orderId !== policy.value.orderId || !expected.has(review.orderItemId)
      || seen.has(review.orderItemId) || !["pending", "approved", "rejected"].includes(review.status)) {
      return { status: "unavailable" as const };
    }
    seen.add(review.orderItemId);
  }
  return { status: "found" as const, value: {
    passed: seen.size === expected.size && reviews.every(review => review.status === "approved"),
    previewRequiredItemIds: policy.value.previewRequiredItemIds,
  } };
}
