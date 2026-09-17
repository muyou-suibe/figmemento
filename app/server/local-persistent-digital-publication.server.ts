import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createExistingAdminMutationVerifier, isSameOriginAdminMutation } from "./admin-catalog-http.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";
import { resolveCanonicalLocalCommerceCapability } from "../config/server-runtime-composition.server.ts";

const MAX_BYTES = 15 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^FM-LOCAL-[A-Z0-9]{16}$/;
const ACTION = /^[A-Za-z0-9_-]{16,200}$/;

type DigitalContentType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "application/zip";

export interface SafeDigitalPublication {
  readonly publicReference: string;
  readonly orderItemId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly status: "ready" | "failed";
  readonly fileName: string;
  readonly contentType: DigitalContentType;
  readonly byteSize: number;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return hex(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer));
}

function detectedContentType(bytes: Uint8Array): DigitalContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06) || (bytes[2] === 0x07 && bytes[3] === 0x08))) return "application/zip";
  return null;
}

function safeFileName(name: string, contentType: DigitalContentType): string {
  const extension: Readonly<Record<DigitalContentType, string>> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "application/pdf": "pdf", "application/zip": "zip",
  };
  const stem = name.normalize("NFKC").replace(/[\\/\u0000-\u001f\u007f]+/g, "-")
    .replace(/\.[^.]*$/, "").replace(/\s+/g, " ").trim().slice(0, 150) || "digital-delivery";
  return `${stem}.${extension[contentType]}`.slice(0, 160);
}

function projection(value: unknown): SafeDigitalPublication | null {
  if (!isRecord(value) || !REFERENCE.test(String(value.publicReference)) || !UUID.test(String(value.orderItemId))
    || !UUID.test(String(value.versionId)) || !Number.isSafeInteger(value.versionNumber) || Number(value.versionNumber) < 1
    || (value.status !== "ready" && value.status !== "failed") || typeof value.fileName !== "string"
    || value.fileName.length < 1 || value.fileName.length > 160
    || !["image/jpeg","image/png","image/webp","application/pdf","application/zip"].includes(String(value.contentType))
    || !Number.isSafeInteger(value.byteSize) || Number(value.byteSize) < 1 || Number(value.byteSize) > MAX_BYTES) return null;
  return value as unknown as SafeDigitalPublication;
}

type CommandResult =
  | { readonly status: "found"; readonly value: unknown; readonly replayed?: boolean }
  | { readonly status: "not_found" | "conflict" | "unavailable" };

export async function publishLocalPersistentDigitalVersion(
  request: Request,
  form: FormData,
  environment: RuntimeEnvironment = process.env,
): Promise<{ readonly status: "committed" | "replayed"; readonly value: SafeDigitalPublication } | { readonly status: "conflict" | "unavailable" }> {
  try {
    const verifier = createExistingAdminMutationVerifier(request);
    const actor = await verifier.verifyAdminSession();
    if (actor.status !== "authorized" || actor.principal.role !== "admin" || !isSameOriginAdminMutation(request)) return { status: "unavailable" };
    if (resolveCanonicalLocalCommerceCapability("admin", environment) !== "selected") return { status: "unavailable" };
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["admin"] });
    if (composition.status !== "ready") return { status: "unavailable" };
    const publicReference = String(form.get("orderNumber") ?? "").trim().toUpperCase();
    const orderItemId = String(form.get("orderItemId") ?? "").trim();
    const actionId = String(form.get("publicationActionId") ?? "").trim();
    const file = form.get("file");
    if (!REFERENCE.test(publicReference) || !UUID.test(orderItemId) || !ACTION.test(actionId) || !(file instanceof File)
      || file.size < 1 || file.size > MAX_BYTES) return { status: "unavailable" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== file.size) return { status: "unavailable" };
    const contentType = detectedContentType(bytes);
    if (!contentType) return { status: "unavailable" };
    const contentDigest = await digest(bytes);
    const fileName = safeFileName(file.name, contentType);
    const input = { contentDigest, contentType, byteSize: bytes.length, fileName } as const;
    const keyDigest = await digest(actionId);
    const contextDigest = await digest(JSON.stringify([publicReference, orderItemId, actor.principal.identity, input]));
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return { status: "unavailable" };
    const base = {
      p_project_id: composition.value.projectId, p_marker_digest: composition.value.markerDigest,
      p_actor_kind: "admin" as const, p_actor_id: actor.principal.identity,
      p_public_reference: publicReference, p_order_item_id: orderItemId,
      p_key_digest: keyDigest, p_context_digest: contextDigest, p_input: input,
    };
    const authorize = async () => {
      const current = await verifier.verifyAdminSession();
      return current.status === "authorized" && current.principal.role === "admin"
        && current.principal.identity === actor.principal.identity && isSameOriginAdminMutation(request);
    };
    const command = async (operation: "probe" | "reserve") => {
      if (!await authorize()) return { status: "unavailable" } as const;
      const response = await connection.adapter.callRestrictedRpc<CommandResult>("digital_publication_command", { ...base, p_operation: operation });
      return response.status === "found" ? response.value : { status: "unavailable" } as const;
    };
    let reserved = await command("probe");
    if (reserved.status === "conflict") return { status: "conflict" };
    if (reserved.status === "found") {
      const done = projection(reserved.value);
      if (done) return { status: "replayed", value: done };
    } else if (reserved.status === "not_found") {
      reserved = await command("reserve");
    } else return { status: "unavailable" };
    if (reserved.status === "conflict") return { status: "conflict" };
    if (reserved.status !== "found" || !isRecord(reserved.value)
      || reserved.value.state !== "pending" || !UUID.test(String(reserved.value.versionId))
      || typeof reserved.value.contentReference !== "string") return { status: "unavailable" };
    const versionId = String(reserved.value.versionId);
    const locator = String(reserved.value.contentReference);
    let readback = await connection.adapter.downloadPrivateObject(locator);
    if (readback.status !== "found") {
      const uploaded = await connection.adapter.uploadPrivateObject(locator, bytes, contentType);
      if (uploaded.status !== "found" || uploaded.value.path !== locator) return { status: "unavailable" };
      readback = await connection.adapter.downloadPrivateObject(locator);
    }
    if (readback.status !== "found") return { status: "unavailable" };
    const persisted = new Uint8Array(await readback.value.arrayBuffer());
    const readbackDigest = await digest(persisted);
    const complete = async (operation: "ready" | "fail") => {
      if (!await authorize()) return { status: "unavailable" } as const;
      const response = await connection.adapter.callRestrictedRpc<CommandResult>("digital_publication_complete", {
        p_project_id: base.p_project_id, p_marker_digest: base.p_marker_digest,
        p_actor_kind: "admin", p_actor_id: base.p_actor_id, p_public_reference: publicReference,
        p_order_item_id: orderItemId, p_operation: operation, p_key_digest: keyDigest,
        p_context_digest: contextDigest, p_version_id: versionId, p_readback_digest: readbackDigest,
      });
      return response.status === "found" ? response.value : { status: "unavailable" } as const;
    };
    const exact = persisted.length === bytes.length && readbackDigest === contentDigest;
    const completed = await complete(exact ? "ready" : "fail");
    if (completed.status === "conflict") return { status: "conflict" };
    if (completed.status !== "found") return { status: "unavailable" };
    const value = projection(completed.value);
    return value ? { status: completed.replayed ? "replayed" : "committed", value } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function handleLocalPersistentDigitalPublication(request: Request, environment: RuntimeEnvironment = process.env): Promise<Response> {
  const json = (value: unknown, status: number) => Response.json(value, { status, headers: { "cache-control": "private, no-store" } });
  if (request.method !== "POST") return json({ status: "unavailable" }, 405);
  const authorization = await createExistingAdminMutationVerifier(request).verifyAdminSession().catch(() => null);
  if (!authorization || authorization.status !== "authorized") return json({ status: "unauthorized" }, 401);
  if (!isSameOriginAdminMutation(request)) return json({ status: "forbidden" }, 403);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES + 64 * 1024) return json({ status: "invalid_request" }, 413);
  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.startsWith("multipart/form-data;")) return json({ status: "invalid_request" }, 400);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ status: "invalid_request" }, 400);
  const result = await publishLocalPersistentDigitalVersion(request, form, environment);
  if (result.status === "conflict") return json({ status: "conflict" }, 409);
  if (result.status === "unavailable") return json({ status: "unavailable" }, 409);
  if (!("value" in result)) return json({ status: "unavailable" }, 409);
  return json({ status: result.status, publication: result.value }, 200);
}
