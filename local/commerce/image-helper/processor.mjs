import sharp from "sharp";
import { parseCustomizationCropRegion } from "../../../app/domain/customization-value.ts";
import { classifyImageClarity, CLARITY_PROFILE_VERSION, measureImageClarity } from "./quality.mjs";

// Technical resource bounds, not a per-owner/field upload quota. Never use
// metadata() alone as proof that compressed image pixels can be decoded.
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const exactKeys = (value, keys) => value && typeof value === "object"
  && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));

/** Stateless trusted processing only: no receipt, draft, slot, DB or URL I/O. */
export async function processLocalImage(bytes, policy) {
  try {
    if (!exactKeys(policy, ["allowedMimeTypes", "maxBytes", "minDimensions", "cropEnabled", "crop", "inspectClarity"])
      || !positiveInteger(policy.maxBytes) || policy.maxBytes > MAX_IMAGE_BYTES
      || !Array.isArray(policy.allowedMimeTypes) || !policy.allowedMimeTypes.length
      || policy.allowedMimeTypes.some((mime) => !Object.values(MIME).includes(mime))
      || !exactKeys(policy.minDimensions, ["width", "height"])
      || !positiveInteger(policy.minDimensions.width) || !positiveInteger(policy.minDimensions.height)
      || typeof policy.cropEnabled !== "boolean"
      || (policy.inspectClarity !== undefined && policy.inspectClarity !== true)
      || !(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > policy.maxBytes) {
      return { status: "rejected" };
    }
    // Copy input. Neither orientation normalization nor a crop mutates it.
    const original = Buffer.from(bytes);
    const options = { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS, sequentialRead: true };
    const metadata = await sharp(original, options).metadata();
    if (!MIME[metadata.format] || !policy.allowedMimeTypes.includes(MIME[metadata.format])
      || (metadata.pages ?? 1) !== 1
      || !positiveInteger(metadata.width) || !positiveInteger(metadata.height)
      || metadata.width * metadata.height > MAX_IMAGE_PIXELS) return { status: "rejected" };

    // Forces full decode, applies all eight EXIF orientations, then crops in
    // normalized, upright coordinates (the same coordinates as the editor).
    const decoded = await sharp(original, options).autoOrient().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = decoded.info;
    if (width * height > MAX_IMAGE_PIXELS || width < policy.minDimensions.width
      || height < policy.minDimensions.height) return { status: "rejected" };
    let region = { left: 0, top: 0, width, height };
    if (policy.crop !== undefined) {
      const crop = parseCustomizationCropRegion(policy.crop);
      if (!policy.cropEnabled || !crop.ok) return { status: "rejected" };
      const c = crop.value;
      const left = Math.floor(c.x * width);
      const top = Math.floor(c.y * height);
      const right = Math.min(width, Math.ceil((c.x + c.width) * width));
      const bottom = Math.min(height, Math.ceil((c.y + c.height) * height));
      region = { left, top, width: right - left, height: bottom - top };
      if (region.width < policy.minDimensions.width || region.height < policy.minDimensions.height) {
        return { status: "rejected" };
      }
    }
    const png = await sharp(decoded.data, { raw: { width, height, channels } })
      .extract(region).png().toBuffer();
    let clarity;
    if (policy.inspectClarity === true) {
      try {
        const measurement = await measureImageClarity(decoded.data, width, height, channels);
        clarity = { profileVersion: CLARITY_PROFILE_VERSION, state: classifyImageClarity(measurement) };
      } catch {
        // Optional guidance must never turn a structurally valid upload into a rejection.
        clarity = { profileVersion: CLARITY_PROFILE_VERSION, state: "unavailable" };
      }
    }
    return {
      status: "processed",
      contentType: MIME[metadata.format], byteSize: original.length,
      dimensions: { width, height }, outputDimensions: { width: region.width, height: region.height },
      png, ...(clarity ? { clarity } : {}),
    };
  } catch {
    // Decoder/codec/path diagnostics are never public protocol fields.
    return { status: "rejected" };
  }
}
