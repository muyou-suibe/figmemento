import { parseCustomizationCropRegion, type CustomizationCropRegion } from "../domain/customization-value.ts";
import { parseCustomerUploadReceipt, type CustomerUploadReceipt } from "../domain/customer-upload.ts";
import { reduceProductCustomizationDraft, type ProductCustomizationDraft } from "../domain/product-customization-draft.ts";

export interface BrowserConfirmedDraftSlot {
  readonly slotId: string;
  readonly fieldId: string;
  readonly receiptReference: string;
  readonly position: number;
  readonly confirmedRevision: number;
  readonly crop?: CustomizationCropRegion;
}

export interface BrowserConfirmedDraft {
  readonly draftId: string;
  readonly productId: string;
  readonly version: number;
  readonly confirmedRevision: number;
  readonly slots: readonly BrowserConfirmedDraftSlot[];
}

export interface BrowserDraftSlotInput {
  readonly slotId?: string;
  readonly fieldId: string;
  readonly receiptReference: string;
  readonly crop?: CustomizationCropRegion;
}

export type BrowserDraftResult =
  | { readonly status: "found"; readonly value: BrowserConfirmedDraft }
  | { readonly status: "conflict" }
  | { readonly status: "rejected" }
  | { readonly status: "unavailable" }
  | { readonly status: "indeterminate" };

export interface BrowserRestoredDraftReceipt {
  readonly slotId: string;
  readonly status: "found" | "unavailable";
  readonly receipt?: CustomerUploadReceipt;
}

export interface BrowserRestoredDraft {
  readonly draft: BrowserConfirmedDraft;
  readonly receipts: readonly BrowserRestoredDraftReceipt[];
}

export type BrowserDraftRestoreResult =
  | { readonly status: "found"; readonly value: BrowserRestoredDraft }
  | { readonly status: "not_found" }
  | { readonly status: "unavailable" };

export interface PersistentImageDraftValue {
  readonly receiptReference: string;
  readonly crop?: CustomizationCropRegion;
}

export interface PersistentCustomizationDraftController {
  readonly projection: BrowserConfirmedDraft | null;
  ensure(): Promise<BrowserDraftResult>;
  read(draftId: string): Promise<BrowserDraftResult>;
  saveField(input: { readonly base: BrowserConfirmedDraft; readonly fieldId: string;
    readonly images: readonly PersistentImageDraftValue[]; readonly idempotencyKey: string }): Promise<BrowserDraftResult>;
}

export type BrowserCropResult =
  | { readonly status: "found"; readonly receipt: CustomerUploadReceipt }
  | { readonly status: "conflict" | "rejected" | "unavailable" | "indeterminate" };

export async function cropPersistentCustomizationImage(input: { readonly productId: string; readonly fieldId: string;
  readonly draftId: string; readonly expectedVersion: number; readonly receiptId: string; readonly crop: CustomizationCropRegion;
  readonly idempotencyKey: string }, fetchImplementation: typeof fetch = fetch): Promise<BrowserCropResult> {
  let response: Response;
  try {
    response = await fetchImplementation("/api/customer-uploads/preview", { method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ productId: input.productId, fieldId: input.fieldId, draftId: input.draftId,
        expectedVersion: input.expectedVersion, receiptId: input.receiptId, crop: input.crop }) });
  } catch { return { status: "indeterminate" }; }
  if (response.status === 409) return { status: "conflict" };
  if ([400, 403, 404].includes(response.status)) return { status: "rejected" };
  if (!response.ok) return { status: "unavailable" };
  try {
    const body: unknown = await response.json();
    if (!isRecord(body) || Object.keys(body).some(key => key !== "receipt")) return { status: "indeterminate" };
    const receipt = parseCustomerUploadReceipt(body.receipt);
    return receipt.ok ? { status: "found", receipt: receipt.value } : { status: "indeterminate" };
  } catch { return { status: "indeterminate" }; }
}

const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDraft(value: unknown): BrowserConfirmedDraft | null {
  if (!isRecord(value) || !uuid(value.draftId) || !uuid(value.productId)
    || !Number.isSafeInteger(value.version) || Number(value.version) < 1
    || !Number.isSafeInteger(value.confirmedRevision) || Number(value.confirmedRevision) < 1
    || !Array.isArray(value.slots)
    || Object.keys(value).some(key => !["draftId", "productId", "version", "confirmedRevision", "slots"].includes(key))) return null;
  const slots: BrowserConfirmedDraftSlot[] = [];
  for (const [position, candidate] of value.slots.entries()) {
    if (!isRecord(candidate) || !uuid(candidate.slotId) || !uuid(candidate.receiptReference)
      || typeof candidate.fieldId !== "string" || !candidate.fieldId
      || candidate.position !== position || candidate.confirmedRevision !== value.confirmedRevision
      || Object.keys(candidate).some(key => !["slotId", "fieldId", "receiptReference", "position", "confirmedRevision", "crop"].includes(key))) return null;
    const crop = candidate.crop === undefined ? undefined : parseCustomizationCropRegion(candidate.crop);
    if (crop && !crop.ok) return null;
    slots.push({ slotId: candidate.slotId, fieldId: candidate.fieldId,
      receiptReference: candidate.receiptReference, position, confirmedRevision: Number(candidate.confirmedRevision),
      ...(crop?.ok ? { crop: crop.value } : {}) });
  }
  return { draftId: value.draftId, productId: value.productId, version: Number(value.version),
    confirmedRevision: Number(value.confirmedRevision), slots };
}

function parseRestoredDraft(value: unknown, productId: string): BrowserRestoredDraft | null {
  if (!isRecord(value) || value.status !== "found" || Object.keys(value).some(key => !["status", "draft", "receipts"].includes(key))) return null;
  const draft = parseDraft(value.draft);
  if (!draft || draft.productId !== productId || !Array.isArray(value.receipts) || value.receipts.length !== draft.slots.length) return null;
  const slots = new Map(draft.slots.map(slot => [slot.slotId, slot]));
  const seen = new Set<string>();
  const receipts: BrowserRestoredDraftReceipt[] = [];
  for (const candidate of value.receipts) {
    if (!isRecord(candidate) || !uuid(candidate.slotId) || !slots.has(candidate.slotId) || seen.has(candidate.slotId)
      || !["found", "unavailable"].includes(String(candidate.status))) return null;
    seen.add(candidate.slotId);
    if (candidate.status === "found") {
      if (Object.keys(candidate).some(key => !["slotId", "status", "receipt"].includes(key))) return null;
      const parsed = parseCustomerUploadReceipt(candidate.receipt);
      if (!parsed.ok || parsed.value.receiptId !== slots.get(candidate.slotId)?.receiptReference) return null;
      receipts.push({ slotId: candidate.slotId, status: "found", receipt: parsed.value });
    } else {
      if (Object.keys(candidate).some(key => !["slotId", "status"].includes(key))) return null;
      receipts.push({ slotId: candidate.slotId, status: "unavailable" });
    }
  }
  return { draft, receipts };
}

/** Same-Draft projections are monotonic. A different Draft can only be selected
 * by an explicit create/restore decision at the caller boundary. */
export function selectPersistentDraftProjection(current: BrowserConfirmedDraft | null,
  incoming: BrowserConfirmedDraft, allowDraftSelection = false): BrowserConfirmedDraft | null {
  if (!current) return allowDraftSelection ? incoming : null;
  if (current.draftId !== incoming.draftId) return current;
  if (incoming.version < current.version || incoming.confirmedRevision < current.confirmedRevision) return current;
  if (incoming.version === current.version && incoming.confirmedRevision === current.confirmedRevision) return current;
  return incoming;
}

export function hydratePersistentDraftImages(input: {
  readonly current: ProductCustomizationDraft;
  readonly fields: readonly { readonly id: string; readonly code: string; readonly kind: string; readonly isActive: boolean }[];
  readonly restored: BrowserRestoredDraft;
}): ProductCustomizationDraft {
  let next = input.current;
  const receiptBySlot = new Map(input.restored.receipts
    .filter((entry): entry is BrowserRestoredDraftReceipt & { receipt: CustomerUploadReceipt } => entry.status === "found" && !!entry.receipt)
    .map(entry => [entry.slotId, entry.receipt]));
  for (const field of input.fields) {
    if (!field.isActive || field.kind !== "image") continue;
    const slots = input.restored.draft.slots.filter(slot => slot.fieldId === field.id);
    if (slots.length === 0) continue;
    next = reduceProductCustomizationDraft(next, { type: "set_image_value", value: {
      fieldId: field.id, fieldCode: field.code, kind: "image",
      images: slots.map(slot => ({ receiptId: slot.receiptReference, ...(slot.crop ? { crop: slot.crop } : {}) })),
    } });
    for (const slot of slots) {
      const receipt = receiptBySlot.get(slot.slotId);
      if (receipt) next = reduceProductCustomizationDraft(next, { type: "record_accepted_receipt", receipt });
    }
  }
  return next;
}

async function requestDraft(url: string, init: RequestInit, mutation: boolean,
  fetchImplementation: typeof fetch): Promise<BrowserDraftResult> {
  let response: Response;
  try { response = await fetchImplementation(url, init); }
  catch { return { status: mutation ? "indeterminate" : "unavailable" }; }
  if (response.status === 409) return { status: "conflict" };
  if ([400, 403, 404].includes(response.status)) return { status: "rejected" };
  if (!response.ok) return { status: mutation ? "indeterminate" : "unavailable" };
  try {
    const value = parseDraft(await response.json());
    return value ? { status: "found", value } : { status: mutation ? "indeterminate" : "unavailable" };
  } catch { return { status: mutation ? "indeterminate" : "unavailable" }; }
}

export function createPersistentCustomizationDraft(productId: string, idempotencyKey: string,
  fetchImplementation: typeof fetch = fetch): Promise<BrowserDraftResult> {
  return requestDraft("/api/local-drafts", { method: "POST", headers: { "content-type": "application/json",
    "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ productId }) }, true, fetchImplementation);
}

export function readPersistentCustomizationDraft(draftId: string,
  fetchImplementation: typeof fetch = fetch): Promise<BrowserDraftResult> {
  return requestDraft(`/api/local-drafts/${encodeURIComponent(draftId)}`, { method: "GET", cache: "no-store" }, false, fetchImplementation);
}

export async function restorePersistentCustomizationDraft(productId: string,
  fetchImplementation: typeof fetch = fetch): Promise<BrowserDraftRestoreResult> {
  if (!uuid(productId)) return { status: "unavailable" };
  let response: Response;
  try {
    response = await fetchImplementation(`/api/local-drafts?productId=${encodeURIComponent(productId)}`,
      { method: "GET", cache: "no-store" });
  } catch { return { status: "unavailable" }; }
  if (!response.ok) return { status: "unavailable" };
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && body.status === "not_found" && Object.keys(body).length === 1) return { status: "not_found" };
    const value = parseRestoredDraft(body, productId);
    return value ? { status: "found", value } : { status: "unavailable" };
  } catch { return { status: "unavailable" }; }
}

export function savePersistentCustomizationDraft(input: { readonly draftId: string; readonly expectedVersion: number;
  readonly slots: readonly BrowserDraftSlotInput[]; readonly idempotencyKey: string },
  fetchImplementation: typeof fetch = fetch): Promise<BrowserDraftResult> {
  return requestDraft(`/api/local-drafts/${encodeURIComponent(input.draftId)}`, { method: "PUT",
    headers: { "content-type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({ expectedVersion: input.expectedVersion, slots: input.slots }) }, true, fetchImplementation);
}
