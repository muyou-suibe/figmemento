/**
 * Compatibility-only server-side interpretation of historical order upload
 * paths. New browser uploads use opaque CustomerUploadReceipt IDs instead.
 */
export interface LegacyOrderUploadReference {
  readonly storageKey: string;
}

export function readLegacyOrderUploadReference(value: unknown): LegacyOrderUploadReference | null {
  if (!value || typeof value !== "object") return null;
  const photoPath = (value as { photoPath?: unknown }).photoPath;
  return typeof photoPath === "string" && /^drafts\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(photoPath)
    ? { storageKey: photoPath }
    : null;
}
