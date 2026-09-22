import sharp from "sharp";

export const CLARITY_PROFILE_VERSION = "local-clarity-v1";
export const CLARITY_ANALYSIS_SIDE = 256;
// Calibrated against the encoded-byte corpus in tests/fixtures/photo-clarity-corpus.mjs.
// These are conservative advisory cutoffs, never upload-admission criteria.
export const CLARITY_PROFILE = Object.freeze({
  version: CLARITY_PROFILE_VERSION,
  minimumBrightness: 40,
  minimumGradient: 12,
  softRatio: 0.66,
  strongRatio: 0.34,
});

export function classifyImageClarity(measurement) {
  if (!measurement || measurement.brightness < CLARITY_PROFILE.minimumBrightness
    || measurement.gradient < CLARITY_PROFILE.minimumGradient) return "inconclusive";
  const ratio = measurement.laplacian / measurement.gradient;
  if (!Number.isFinite(ratio)) return "inconclusive";
  if (ratio < CLARITY_PROFILE.strongRatio) return "strong_warning";
  if (ratio < CLARITY_PROFILE.softRatio) return "soft_warning";
  return "clear";
}

/** Measurements from already-decoded, EXIF-normalized pixels. No URL or metadata authority. */
export async function measureImageClarity(pixels, width, height, channels) {
  const sample = await sharp(pixels, { raw: { width, height, channels } })
    .resize(CLARITY_ANALYSIS_SIDE, CLARITY_ANALYSIS_SIDE, { fit: "inside", withoutEnlargement: true })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = sample.info.width;
  const h = sample.info.height;
  const p = sample.data;
  if (w < 16 || h < 16) return null;
  let brightness = 0;
  let gradient = 0;
  let laplacian = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const c = p[i];
      brightness += c;
      gradient += Math.abs(p[i + 1] - p[i - 1]) + Math.abs(p[i + w] - p[i - w]);
      laplacian += Math.abs(4 * c - p[i - 1] - p[i + 1] - p[i - w] - p[i + w]);
      count++;
    }
  }
  return { brightness: brightness / count, gradient: gradient / count,
    laplacian: laplacian / count, width: w, height: h };
}
