import type { RuntimeEnvironment } from "../config/server.ts";
import { ensureGuestResourceOwner, type VerifiedResourceOwner } from "../application/guest-resource-ownership.server.ts";
import type { DraftSlotInput } from "../application/local-commerce-draft-port.server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createConfiguredGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../lib/guest-draft-owner.ts";
import { createLocalPersistentDraftPort } from "../infrastructure/local-commerce/local-persistent-draft-adapter.server.ts";
import { createLocalPersistentMediaAuthority } from "../infrastructure/local-commerce/local-persistent-media-authority.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";
import { persistentOwnerVerifier } from "./local-persistent-purchase-authority.server.ts";

const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const failed = (status: number) => Response.json({ status: "unavailable" }, { status, headers: { "cache-control": "no-store" } });
const noSavedDraft = () => Response.json({ status: "not_found" }, { status: 200, headers: { "cache-control": "no-store" } });
const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, "0")).join("");

function guestContext(request: Request): string | null {
  const key = `${getGuestDraftOwnerCookieName()}=`;
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(key));
  try { return value ? decodeURIComponent(value.slice(key.length)) : null; } catch { return null; }
}

export function getLocalPersistentDraftSelectorCookieName(productId: string): string {
  return `photogift-local-draft-${productId.toLowerCase()}`;
}

function cookieValue(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  const part = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(prefix));
  if (!part) return null;
  try { return decodeURIComponent(part.slice(prefix.length)); } catch { return null; }
}

function selectorCookie(request: Request, productId: string, draftId: string): string {
  let secure = false;
  try { secure = new URL(request.url).protocol === "https:"; } catch { /* fail to non-Secure local cookie */ }
  return `${getLocalPersistentDraftSelectorCookieName(productId)}=${encodeURIComponent(draftId)}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

async function resolveOwner(request: Request, environment: RuntimeEnvironment, allowIssue: boolean) {
  const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["cart", "catalog", "upload"] });
  if (composition.status !== "ready" || environment.CUSTOMER_UPLOAD_SOURCE?.trim() !== "local_persistent") return null;
  const existing = await persistentOwnerVerifier(request, environment)();
  if (existing) return { ...existing, request, setCookie: null as string | null };
  if (!allowIssue) return null;
  const service = createConfiguredGuestDraftOwnerService(environment);
  const issued = await ensureGuestResourceOwner({ projectId: composition.value.projectId,
    context: guestContext(request), ownerService: service });
  if (issued.status !== "issued") return null;
  const headers = new Headers(request.headers);
  headers.set("cookie", `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(issued.context)}`);
  return { owner: issued.owner, expiresAt: issued.owner.expiresAt,
    request: new Request(request.url, { headers }), setCookie: service.getSetCookieHeader(issued.context, environment.NODE_ENV) };
}

function safeRead(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  try { return !origin || new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export async function persistentDraftHttp(request: Request, operation: "create" | "read" | "save" | "restore", draftId?: string,
  environment: RuntimeEnvironment = process.env): Promise<Response> {
  try {
    if (["read", "restore"].includes(operation) ? request.method !== "GET" || !safeRead(request)
      : !["POST", "PUT"].includes(request.method) || !isSameOriginCartMutation(request)) return failed(403);
    let restoreProductId: string | null = null;
    if (operation === "restore") {
      const url = new URL(request.url);
      const values = url.searchParams.getAll("productId");
      if (values.length !== 1 || [...url.searchParams.keys()].some(key => key !== "productId") || !uuid(values[0])) return failed(400);
      restoreProductId = values[0];
      const selectedDraftId = cookieValue(request, getLocalPersistentDraftSelectorCookieName(restoreProductId));
      // A selector is never authority. Missing and malformed selectors share the
      // same coarse projection and never create an implicit Draft.
      if (!uuid(selectedDraftId)) return noSavedDraft();
      draftId = selectedDraftId;
    }
    if (operation !== "create" && !uuid(draftId)) return failed(400);
    const selected = await resolveOwner(request, environment, operation === "create");
    if (!selected) return operation === "restore" ? noSavedDraft() : failed(404);
    const verifyOwner = persistentOwnerVerifier(selected.request, environment, selected.owner as VerifiedResourceOwner);
    const adapter = await createLocalPersistentDraftPort({ environment, verifyOwner });
    if (adapter.status !== "ready") return failed(503);
    let result;
    if (operation === "read" || operation === "restore") result = await adapter.port.read({ authority: adapter.authority, draftId: draftId! });
    else {
      const key = request.headers.get("idempotency-key");
      if (!uuid(key) || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return failed(400);
      const body: unknown = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return failed(400);
      if (operation === "create") {
        if (Object.keys(body).length !== 1 || !uuid((body as { productId?: unknown }).productId)) return failed(400);
        const productId = (body as { productId: string }).productId;
        result = await adapter.port.create({ authority: adapter.authority, productId, expectedVersion: 0,
          idempotency: { key: await digest(["draft-create", key]), fingerprint: await digest(["draft-create", productId]) } });
      } else {
        const raw = body as { expectedVersion?: unknown; slots?: unknown };
        if (Object.keys(raw).some(k => !["expectedVersion", "slots"].includes(k)) || !Number.isSafeInteger(raw.expectedVersion)
          || Number(raw.expectedVersion) < 1 || !Array.isArray(raw.slots) || raw.slots.length > 100) return failed(400);
        const media = createLocalPersistentMediaAuthority(environment, verifyOwner);
        const slots: DraftSlotInput[] = [];
        for (const candidate of raw.slots) {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return failed(400);
          const slot = candidate as Record<string, unknown>;
          if (Object.keys(slot).some(k => !["slotId", "fieldId", "receiptReference", "crop"].includes(k))
            || typeof slot.fieldId !== "string" || !uuid(slot.receiptReference)) return failed(400);
          let slotId = typeof slot.slotId === "string" ? slot.slotId : undefined;
          if (!slotId) {
            const canonical = await media.resolveDraftSlot({ draftId: draftId!, fieldId: slot.fieldId, receiptId: slot.receiptReference });
            if (canonical.status !== "found") return failed(404);
            slotId = canonical.slotId;
          }
          slots.push({ slotId, fieldId: slot.fieldId, receiptReference: slot.receiptReference,
            ...(slot.crop !== undefined ? { crop: slot.crop as DraftSlotInput["crop"] } : {}) });
        }
        const normalized = { draftId: draftId!, expectedVersion: Number(raw.expectedVersion), slots };
        result = await adapter.port.save({ authority: adapter.authority, ...normalized,
          idempotency: { key: await digest(["draft-save", key]), fingerprint: await digest(["draft-save", normalized]) } });
      }
    }
    if (result.status !== "found") {
      if (operation === "restore" && result.status === "unavailable" && result.reason === "not_found") return noSavedDraft();
      return failed(result.status === "conflict" ? 409 : result.reason === "invalid_request" ? 400
        : result.reason === "not_found" ? 404 : 503);
    }
    if (operation === "restore") {
      if (result.value.productId !== restoreProductId) return noSavedDraft();
      const media = createLocalPersistentMediaAuthority(environment, verifyOwner);
      const receipts = await Promise.all(result.value.slots.map(async slot => {
        const restored = await media.restoreConfirmedReceipt({ draftId: result.value.draftId, slotId: slot.slotId,
          fieldId: slot.fieldId, receiptId: slot.receiptReference, ...(slot.crop ? { crop: slot.crop } : {}) });
        return restored.status === "found"
          ? { slotId: slot.slotId, status: "found" as const, receipt: restored.receipt }
          : { slotId: slot.slotId, status: "unavailable" as const };
      }));
      return Response.json({ status: "found", draft: result.value, receipts }, { status: 200,
        headers: { "cache-control": "no-store" } });
    }
    const response = Response.json(result.value, { status: operation === "create" ? 201 : 200,
      headers: { "cache-control": "no-store" } });
    if (selected.setCookie) response.headers.append("set-cookie", selected.setCookie);
    response.headers.append("set-cookie", selectorCookie(request, result.value.productId, result.value.draftId));
    return response;
  } catch { return failed(503); }
}
