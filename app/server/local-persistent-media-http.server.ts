import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { resolveGuestResourceOwner } from "../application/guest-resource-ownership.server.ts";
import { createLocalPersistentCustomerAuthProvider } from "../application/customer-auth-persistent-provider.server.ts";
import { createConfiguredGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../lib/guest-draft-owner.ts";
import { createLocalPersistentMediaAuthority, type MediaOwnerVerifier } from "../infrastructure/local-commerce/local-persistent-media-authority.server.ts";
import { createLocalPersistentDraftPort } from "../infrastructure/local-commerce/local-persistent-draft-adapter.server.ts";
import { createServerCustomerUploadFieldResolver } from "./customer-upload-field-resolution.server.ts";
import { isSameOriginCustomerAuthMutation, readCustomerAuthSessionId } from "./customer-auth-http.server.ts";
import { readBoundedSingleImage } from "./local-commerce-image-processing.server.ts";
import { parseCustomizationCropRegion } from "../domain/customization-value.ts";

const failure = (status: number) => Response.json({ error: "Customer media is unavailable." }, { status, headers: { "cache-control": "no-store" } });

/** Existing signed guest cookie / existing durable customer session only.
 * A request ID selects a resource but never supplies owner authority.
 */
function verifier(request: Request, environment: RuntimeEnvironment): MediaOwnerVerifier {
  return async () => {
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["upload", "cart", "catalog"] });
    if (composition.status !== "ready") return null;
    const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(getGuestDraftOwnerCookieName() + "="));
    if (cookie) {
      const context = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
      const r = await resolveGuestResourceOwner({ projectId: composition.value.projectId, context,
        ownerService: createConfiguredGuestDraftOwnerService(environment) });
      return r.status === "authorized" ? { owner: r.owner, expiresAt: r.owner.expiresAt } : null;
    }
    const session = await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));
    if (session.status !== "ok" || !session.value.authenticated || !session.value.ownerId) return null;
    return { owner: { kind: "customer", projectId: composition.value.projectId, customerId: session.value.customer.id,
      ownerId: session.value.ownerId }, expiresAt: Date.parse(session.value.expiresAt) / 1000 };
  };
}

export async function persistentMediaHttp(request: Request, operation: "upload" | "preview" | "crop", environment: RuntimeEnvironment = process.env): Promise<Response> {
  try {
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["upload", "cart", "catalog"] });
    if (composition.status !== "ready") return failure(503);
    if (["upload", "crop"].includes(operation) && (request.method !== "POST" || !isSameOriginCustomerAuthMutation(request))) return failure(403);
    if (operation === "preview" && (request.method !== "GET" || request.headers.get("sec-fetch-site") === "cross-site"
      || (request.headers.has("origin") && request.headers.get("origin") !== new URL(request.url).origin))) return failure(403);
    const verifyOwner = verifier(request, environment);
    if (!await verifyOwner()) return failure(404);
    const media = createLocalPersistentMediaAuthority(environment, verifyOwner);
    const query = new URL(request.url).searchParams;
    if (operation === "preview") {
      if ([...query.keys()].length !== 1 || query.getAll("receiptId").length !== 1) return failure(404);
      const r = await media.read(query.get("receiptId")!);
      return r.status === "found" ? new Response(r.bytes as BodyInit, { headers: { "content-type": "image/png", "cache-control": "private, no-store",
        "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin", "referrer-policy": "no-referrer" } }) : failure(404);
    }
    if (operation === "crop") {
      if ([...query.keys()].length !== 0 || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return failure(400);
      const key = request.headers.get("idempotency-key");
      const text = await request.text();
      if (!key || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(key)
        || new TextEncoder().encode(text).byteLength > 16 * 1024) return failure(400);
      const raw: unknown = JSON.parse(text);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)
        || Object.keys(raw).some(candidate => !["productId", "fieldId", "draftId", "expectedVersion", "receiptId", "crop"].includes(candidate))) return failure(400);
      const input = raw as Record<string, unknown>;
      const crop = parseCustomizationCropRegion(input.crop);
      if (![input.productId, input.draftId, input.receiptId].every(value => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))
        || typeof input.fieldId !== "string" || !input.fieldId || !Number.isSafeInteger(input.expectedVersion)
        || Number(input.expectedVersion) < 1 || !crop.ok) return failure(400);
      const draft = await createLocalPersistentDraftPort({ environment, verifyOwner });
      if (draft.status !== "ready") return failure(503);
      const current = await draft.port.read({ authority: draft.authority, draftId: input.draftId as string });
      if (current.status !== "found" || current.value.productId !== input.productId
        || current.value.version !== input.expectedVersion) return failure(409);
      const selected = current.value.slots.find(slot => slot.fieldId === input.fieldId && slot.receiptReference === input.receiptId);
      if (!selected) return failure(404);
      const result = await media.accept({ draftId: current.value.draftId, expectedVersion: current.value.version,
        fieldId: input.fieldId, slotId: selected.slotId, originalReceiptId: input.receiptId as string,
        crop: crop.value, bytes: new Uint8Array() });
      return result.status === "found"
        ? Response.json({ receipt: result.receipt }, { status: 201, headers: { "cache-control": "no-store" } })
        : failure(result.status === "conflict" ? 409 : result.status === "rejected" ? 400 : 503);
    }
    // Draft IDs must already have been issued by the canonical Draft command.
    // No implicit grouping, owner/Product quota, or public Draft creation here.
    if ([...query.keys()].some(k => !["productId", "fieldId", "draftId", "expectedVersion"].includes(k))
      || ["productId", "fieldId", "draftId", "expectedVersion"].some(k => query.getAll(k).length !== 1)) return failure(400);
    const requestKey = request.headers.get("idempotency-key");
    const recovery = request.headers.get("x-upload-recovery");
    const release = request.headers.get("x-upload-release");
    if (!requestKey || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestKey)
      || (recovery !== null && recovery !== "1") || (release !== null && release !== "1")
      || (recovery === "1" && release === "1")) return failure(400);
    const policy = await createServerCustomerUploadFieldResolver(environment, environment.NODE_ENV)(request);
    if (policy.status !== "found") return failure(policy.status === "source_failure" ? 503 : 404);
    const draft = await createLocalPersistentDraftPort({ environment, verifyOwner });
    if (draft.status !== "ready") return failure(404);
    const d = await draft.port.read({ authority: draft.authority, draftId: query.get("draftId")! });
    if (d.status !== "found" || d.value.productId !== query.get("productId")) return failure(404);
    const version = Number(query.get("expectedVersion"));
    // A replay carries the ORIGINAL command version. The atomic command checks
    // its binding before current-version admission for a genuinely new upload.
    if (!Number.isSafeInteger(version) || version < 1) return failure(409);
    const file = await readBoundedSingleImage(request, policy.constraints.maxBytes);
    if (!file) return failure(400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (release === "1") {
      const released = await media.releaseUpload({ draftId: d.value.draftId, expectedVersion: version,
        fieldId: query.get("fieldId")!, bytes, requestKey });
      return released.status === "removed" ? new Response(null, { status: 204, headers: { "cache-control": "no-store" } })
        : failure(released.status === "conflict" ? 409 : released.status === "rejected" ? 400 : 503);
    }
    const r = await media.accept({ draftId: d.value.draftId, expectedVersion: version, fieldId: query.get("fieldId")!,
      bytes, requestKey, recoveryOnly: recovery === "1" });
    // No operation/slot, provider, owner or locator spread into browser JSON.
    return r.status === "found" ? Response.json({ receipt: r.receipt, warnings: [] }, { status: 201, headers: { "cache-control": "no-store" } })
      : failure(r.status === "conflict" ? 409 : r.status === "rejected" ? 400 : 503);
  } catch { return failure(503); }
}
