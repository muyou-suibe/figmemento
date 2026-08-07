export type PhotoQuality = "good" | "low";

export type PhotoMetadata = {
  originalFilename: string;
  contentType: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  quality: PhotoQuality;
};

export type Customization = {
  note?: string;
  options?: Record<string, string>;
  photoPath?: string;
  photoPaths?: string[];
  photoMeta?: PhotoMetadata;
  photoMetas?: PhotoMetadata[];
  photoReviewStatus?: string;
  digitalDeliveryPath?: string;
  digitalDeliveryName?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePhotoMetadata(value: unknown): PhotoMetadata | null {
  if (!isRecord(value)) return null;
  const { originalFilename, contentType, fileSizeBytes, width, height, quality } = value;
  if (
    typeof originalFilename !== "string" ||
    typeof contentType !== "string" ||
    typeof fileSizeBytes !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    (quality !== "good" && quality !== "low")
  ) {
    return null;
  }
  return { originalFilename, contentType, fileSizeBytes, width, height, quality };
}

export function parseCustomization(value: unknown): Customization | null {
  if (!isRecord(value)) return null;
  const result: Customization = {};

  if (value.note !== undefined) {
    if (typeof value.note !== "string") return null;
    result.note = value.note;
  }
  if (value.options !== undefined) {
    if (!isRecord(value.options) || Object.values(value.options).some((option) => typeof option !== "string")) return null;
    result.options = value.options as Record<string, string>;
  }
  for (const key of ["photoPath", "photoReviewStatus", "digitalDeliveryPath", "digitalDeliveryName"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string") return null;
      result[key] = value[key];
    }
  }
  if (value.photoPaths !== undefined) {
    if (!Array.isArray(value.photoPaths) || value.photoPaths.some((path) => typeof path !== "string")) return null;
    result.photoPaths = value.photoPaths;
  }
  if (value.photoMeta !== undefined) {
    const metadata = parsePhotoMetadata(value.photoMeta);
    if (!metadata) return null;
    result.photoMeta = metadata;
  }
  if (value.photoMetas !== undefined) {
    if (!Array.isArray(value.photoMetas)) return null;
    const metadata = value.photoMetas.map(parsePhotoMetadata);
    if (metadata.some((item) => item === null)) return null;
    result.photoMetas = metadata.filter((item): item is PhotoMetadata => item !== null);
  }
  return result;
}
