import type { RuntimeEnvironment } from "../config/server.ts";
import type { ImageCustomizationFieldConstraints, AllowedImageMimeType } from "../domain/customization-field.ts";
import type { CustomizationCropRegion } from "../domain/customization-value.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";

export const LOCAL_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 90 * 1024 * 1024;

/** Reads an actually bounded stream, including chunked or false-length input. */
export async function readBoundedImageBody(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array | null> {
  if (!body || !Number.isSafeInteger(limit) || limit <= 0) return null;
  const reader = body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  } catch { return null; } finally { reader.releaseLock(); }
}

/** Invoke only after source, origin, verified owner and current field gates. */
export async function readBoundedSingleImage(request: Request, maxBytes: number): Promise<File | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0
    || !request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) return null;
  const bytes = await readBoundedImageBody(request.body, Math.min(maxBytes, LOCAL_IMAGE_MAX_BYTES) + 64 * 1024);
  if (!bytes) return null;
  try {
    const form = await new Response(bytes as BodyInit, { headers: { "content-type": request.headers.get("content-type")! } }).formData();
    const entries = [...form.entries()];
    if (entries.length !== 1 || entries[0][0] !== "file" || !(entries[0][1] instanceof File)) return null;
    const file = entries[0][1];
    return file.size > 0 && file.size <= Math.min(maxBytes, LOCAL_IMAGE_MAX_BYTES) ? file : null;
  } catch { return null; }
}

export type LocalProcessedImage = {
  readonly status: "processed";
  readonly contentType: AllowedImageMimeType;
  readonly byteSize: number;
  readonly dimensions: { readonly width: number; readonly height: number };
  readonly outputDimensions: { readonly width: number; readonly height: number };
  readonly png: Uint8Array;
} | { readonly status: "rejected" | "unavailable" };

/** Worker-compatible HTTP client; no sharp/native module enters the app graph.
 * Receipts, original retrieval, revision allocation and publication belong to
 * the caller's canonical media authority, not this stateless processing port.
 */
export async function processLocalCommerceImage(
  environment: RuntimeEnvironment,
  bytes: Uint8Array,
  constraints: ImageCustomizationFieldConstraints,
  crop?: CustomizationCropRegion,
): Promise<LocalProcessedImage> {
  try {
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["upload", "catalog"] });
    const secret = environment.LOCAL_COMMERCE_IMAGE_HELPER_SECRET;
    if (composition.status !== "ready" || !/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "")) return { status: "unavailable" };
    if (!bytes.byteLength || bytes.byteLength > Math.min(constraints.maxBytes, LOCAL_IMAGE_MAX_BYTES)) return { status: "rejected" };
    // Fresh database marker verification before forwarding any private bytes.
    const database = await createLocalPersistentSupabaseAdapter(environment);
    if (database.status !== "ready") return { status: "unavailable" };
    const response = await fetch(`${composition.value.config.endpoints.imageHelperUrl}/process`, {
      // workerd supports manual/follow, not error. Manual never forwards the
      // private body/credential; all 3xx responses fail the non-ok gate below.
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/octet-stream",
        authorization: `Bearer ${secret}`,
        "x-commerce-project": composition.value.projectId,
        "x-commerce-marker": composition.value.markerDigest,
        "x-image-policy": JSON.stringify({ allowedMimeTypes: constraints.allowedMimeTypes,
          maxBytes: Math.min(constraints.maxBytes, LOCAL_IMAGE_MAX_BYTES), minDimensions: constraints.minDimensions,
          cropEnabled: constraints.cropEnabled, ...(crop === undefined ? {} : { crop }) }),
      }, body: bytes as BodyInit,
    });
    if (!response.ok) return { status: response.status === 400 || response.status === 413 ? "rejected" : "unavailable" };
    if (response.headers.get("content-type") !== "application/json") return { status: "unavailable" };
    const payload = await readBoundedImageBody(response.body, MAX_RESPONSE_BYTES);
    if (!payload) return { status: "unavailable" };
    const result = JSON.parse(new TextDecoder().decode(payload));
    const validDimensions = (v: { width?: number; height?: number } | undefined) => v
      && Number.isSafeInteger(v.width) && Number.isSafeInteger(v.height)
      && v.width! > 0 && v.height! > 0 && v.width! * v.height! <= 16_000_000;
    if (result.status !== "processed" || !constraints.allowedMimeTypes.includes(result.contentType)
      || result.byteSize !== bytes.byteLength || !validDimensions(result.dimensions)
      || !validDimensions(result.outputDimensions) || typeof result.png !== "string"
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.png)) return { status: "unavailable" };
    return { status: "processed", contentType: result.contentType, byteSize: result.byteSize,
      dimensions: result.dimensions, outputDimensions: result.outputDimensions,
      png: Uint8Array.from(atob(result.png), (character) => character.charCodeAt(0)) };
  } catch { return { status: "unavailable" }; }
}
