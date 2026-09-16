import { persistentPhotoReviewApplicability } from "./local-persistent-photo-review.server.ts";
import type { CanonicalPersistentHistory } from "./local-order-consumer-projections.server.ts";

/** A server-acquired production-preview artifact, never a customer receipt.
 * Storage locators stay inside the adapter and cannot enter this projection. */
export interface PersistentPreviewArtifact {
  readonly projectId: string;
  readonly ownerId: string;
  readonly orderId: string;
  readonly fulfillmentId: string;
  readonly orderItemId: string;
  readonly manifestVersion: number;
  readonly previewMediaId: string;
  readonly state: "ready";
  readonly digest: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly contentType: "image/png";
}

/** Pure completeness check AFTER actor-authorized durable acquisition and
 * private byte verification. This function does not grant read/publication
 * authority, mark media ready, allocate versions or write a manifest. */
export function preparePersistentPreviewManifest(input: {
  readonly projectId: string;
  readonly ownerId: string;
  readonly orderId: string;
  readonly fulfillmentId: string;
  readonly manifestVersion: number;
  readonly items: readonly CanonicalPersistentHistory[];
  readonly artifacts: readonly PersistentPreviewArtifact[];
}) {
  const unavailable = { status: "unavailable" as const };
  const policy = persistentPhotoReviewApplicability(input.items);
  if (policy.status !== "found" || policy.value.orderId !== input.orderId
    || !Number.isInteger(input.manifestVersion) || input.manifestVersion < 1 || input.manifestVersion > 3
    || !input.projectId || !input.ownerId || !input.fulfillmentId || !Array.isArray(input.artifacts)) return unavailable;
  const required = new Set(policy.value.previewRequiredItemIds);
  if (!required.size || input.artifacts.length !== required.size) return unavailable;
  const seenItems = new Set<string>(), seenMedia = new Set<string>();
  const entries: { orderItemId: string; previewMediaId: string; contentType: "image/png"; width: number; height: number }[] = [];
  for (const artifact of input.artifacts) {
    if (!artifact || artifact.projectId !== input.projectId || artifact.ownerId !== input.ownerId
      || artifact.orderId !== input.orderId || artifact.fulfillmentId !== input.fulfillmentId || artifact.manifestVersion !== input.manifestVersion
      || !required.has(artifact.orderItemId) || seenItems.has(artifact.orderItemId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(artifact.previewMediaId)
      || seenMedia.has(artifact.previewMediaId) || artifact.state !== "ready"
      || !/^[0-9a-f]{64}$/.test(artifact.digest) || artifact.contentType !== "image/png"
      || !Number.isSafeInteger(artifact.byteSize) || artifact.byteSize < 1 || artifact.byteSize > 90 * 1024 * 1024
      || !Number.isSafeInteger(artifact.width) || !Number.isSafeInteger(artifact.height)
      || artifact.width < 1 || artifact.height < 1 || artifact.width * artifact.height > 16_000_000) return unavailable;
    seenItems.add(artifact.orderItemId); seenMedia.add(artifact.previewMediaId);
    entries.push(Object.freeze({ orderItemId: artifact.orderItemId, previewMediaId: artifact.previewMediaId,
      contentType: artifact.contentType, width: artifact.width, height: artifact.height }));
  }
  entries.sort((a,b)=>a.orderItemId.localeCompare(b.orderItemId));
  return { status: "found" as const, value: Object.freeze({
    orderId: input.orderId, manifestVersion: input.manifestVersion, entries: Object.freeze(entries),
  }) };
}
