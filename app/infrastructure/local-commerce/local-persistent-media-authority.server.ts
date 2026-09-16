import type { RuntimeEnvironment } from "../../config/server.ts";
import { hashGuestResourceCapability, type VerifiedResourceOwner } from "../../application/guest-resource-ownership.server.ts";
import { resolveLocalPersistentComposition } from "../../application/local-persistent-commerce-composition.server.ts";
import { parseCustomerUploadReceipt, type CustomerUploadReceipt } from "../../domain/customer-upload.ts";
import type { AllowedImageMimeType } from "../../domain/customization-field.ts";
import { parseCustomizationCropRegion, type CustomizationCropRegion } from "../../domain/customization-value.ts";
import { processLocalCommerceImage } from "../../server/local-commerce-image-processing.server.ts";
import { createLocalPersistentSupabaseAdapter } from "./local-persistent-supabase-adapter.server.ts";
import { createLocalPersistentDraftPort } from "./local-persistent-draft-adapter.server.ts";
import { LocalCatalogAuthority } from "./local-catalog-authority.server.ts";
import { cleanupPersistentMedia } from "./local-persistent-media-cleanup.server.ts";

type Dimensions = { width: number; height: number };
type Source = { kind: "upload" | "replace" | "crop" | "copy"; fieldId: string; configurationRevision: number;
  digest: string; contentType: AllowedImageMimeType; byteSize: number; dimensions: Dimensions; crop?: CustomizationCropRegion };
type Output = { digest: string; byteSize: number; dimensions: Dimensions };
/** Private RPC shape. Never returned to an HTTP consumer. */
type Operation = { id: string; project_id: string; draft_id: string; slot_id: string; product_id: string; field_key: string;
  source_generation: number; crop_revision: number; configuration_revision: number; version: number;
  lifecycle: "pending" | "ready" | "failed"; normalized_input: Source; output_facts: Output | null;
  original_locator: string; derivative_locator: string; operation_kind: Source["kind"] };
type Stored = { status: "found"; operation: Operation; receipt: { receiptId: string; createdAt: string; expiresAt: string; lifecycle: string } | null };
type Failure = { status: "unavailable" | "conflict" | "rejected" };
export type MediaResult = Failure | { status: "found"; receipt: CustomerUploadReceipt;
  operationId: string; slotId: string; sourceGeneration: number; cropRevision: number };
export type MediaOwnerVerifier = () => Promise<{ owner: VerifiedResourceOwner; expiresAt: number } | null>;
const unavailable = (): Failure => ({ status: "unavailable" });
const uuid = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(s);
async function digest(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))].map(b => b.toString(16).padStart(2, "0")).join("");
}

const sameDimensions = (left: Dimensions, right: Dimensions) => left.width === right.width && left.height === right.height;
const sameCrop = (left?: CustomizationCropRegion, right?: CustomizationCropRegion) =>
  !left && !right || !!left && !!right && left.x === right.x && left.y === right.y
    && left.width === right.width && left.height === right.height;
const sameSource = (left: Source, right: Source) => left.kind === right.kind && left.fieldId === right.fieldId
  && left.configurationRevision === right.configurationRevision && left.digest === right.digest
  && left.contentType === right.contentType && left.byteSize === right.byteSize
  && sameDimensions(left.dimensions, right.dimensions) && sameCrop(left.crop, right.crop);
const sameOutput = (left: Output | null, right: Output) => !!left && left.digest === right.digest
  && left.byteSize === right.byteSize && sameDimensions(left.dimensions, right.dimensions);

/** Server-internal, read-only reconciliation for the one exact copy prepare
 * race. It grants no authority and never scans, creates, or mutates state. */
export async function reconcileExactCopyPrepareConflict(input: {
  canonical: Operation;
  output: Output;
  lookup: () => Promise<Stored | Failure>;
}): Promise<Stored | Failure> {
  const recovered = await input.lookup();
  if (recovered.status !== "found") return recovered;
  const expected = input.canonical;
  const candidate = recovered.operation;
  const sameBinding = candidate.id === expected.id && candidate.project_id === expected.project_id
    && candidate.operation_kind === "copy" && expected.operation_kind === "copy"
    && candidate.draft_id === expected.draft_id && candidate.product_id === expected.product_id
    && candidate.field_key === expected.field_key && candidate.slot_id === expected.slot_id
    && candidate.source_generation === expected.source_generation
    && candidate.crop_revision === expected.crop_revision
    && candidate.configuration_revision === expected.configuration_revision
    && candidate.original_locator === expected.original_locator
    && candidate.derivative_locator === expected.derivative_locator
    && sameSource(candidate.normalized_input, expected.normalized_input);
  if (!sameBinding) return { status: "conflict" };
  if (candidate.lifecycle === "pending" && candidate.version === expected.version + 1
    && sameOutput(candidate.output_facts, input.output)) return recovered;
  if (candidate.lifecycle === "ready" && candidate.version === expected.version + 2
    && sameOutput(candidate.output_facts, input.output) && recovered.receipt) return recovered;
  return { status: "conflict" };
}

/** Server composition supplies fresh existing guest/session authority. There is
 * no owner parameter in an application command and no process-memory receipt.
 */
export function createLocalPersistentMediaAuthority(environment: RuntimeEnvironment, verifyOwner: MediaOwnerVerifier) {
  const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["upload", "cart", "catalog"] });
  let subject: VerifiedResourceOwner | undefined;
  const fresh = async () => {
    try {
    if (composition.status !== "ready") return null;
    const v = await verifyOwner();
    if (!v || v.owner.projectId !== composition.value.projectId || !Number.isFinite(v.expiresAt) || v.expiresAt <= Date.now() / 1000
      || (v.owner.kind === "guest" && v.expiresAt > v.owner.expiresAt)) return null;
    if (subject && (subject.kind !== v.owner.kind || subject.ownerId !== v.owner.ownerId || subject.projectId !== v.owner.projectId
      || (subject.kind === "customer" && v.owner.kind === "customer" && subject.customerId !== v.owner.customerId))) return null;
    subject ??= v.owner;
    return v;
    } catch { return null; }
  };
  const rpc = async (command: string, operationId: string | null, draftId: string | null, slotId: string | null,
    version: number | null, input: unknown, binding?: { productId: string; key: string; recoveryOnly: boolean }): Promise<Stored | Failure> => {
    try {
      const v = await fresh();
      if (!v || composition.status !== "ready") return unavailable();
      const selector = v.owner.kind === "guest" ? await hashGuestResourceCapability(v.owner.ownerId) : v.owner.ownerId;
      const db = await createLocalPersistentSupabaseAdapter(environment);
      if (!selector || db.status !== "ready") return unavailable();
      const authority = {
        p_project_id: composition.value.projectId, p_marker_digest: composition.value.markerDigest,
        p_owner_kind: v.owner.kind, p_owner_selector: selector, p_customer_id: v.owner.kind === "customer" ? v.owner.customerId : null,
        p_authority_expires_at: new Date(v.expiresAt * 1000).toISOString(),
      };
      const r = binding && draftId && version !== null
        ? await db.adapter.callRestrictedRpc<Stored | Failure>("media_upload_command", {
          ...authority, p_draft_id: draftId, p_product_id: binding.productId, p_expected_version: version,
          p_key_digest: await digest(new TextEncoder().encode(binding.key.toLowerCase())),
          p_fingerprint: await digest(new TextEncoder().encode(JSON.stringify({ project: composition.value.projectId,
            owner: selector, ownerKind: v.owner.kind, draftId, productId: binding.productId, expectedVersion: version, source: input }))),
          p_recovery_only: binding.recoveryOnly, p_input: input,
        })
        : await db.adapter.callRestrictedRpc<Stored | Failure>("media_operation_command", {
        ...authority, p_command: command,
        p_operation_id: operationId, p_draft_id: draftId, p_slot_id: slotId, p_expected_version: version, p_input: input,
      });
      if (r.status !== "found") return unavailable();
      if (r.value.status !== "found") return r.value.status === "conflict" ? { status: "conflict" } : unavailable();
      const o = r.value.operation;
      if (!o || !uuid(o.id) || !uuid(o.slot_id) || o.project_id !== composition.value.projectId
        || !Number.isSafeInteger(o.version) || !o.original_locator.startsWith(`${o.project_id}/media/`)
        || o.derivative_locator !== `${o.project_id}/media/${o.id}/derivative`) return unavailable();
      return r.value;
    } catch { return unavailable(); }
  };
  const projection = (r: Stored): MediaResult => {
    if (r.operation.lifecycle !== "ready" || !r.receipt) return unavailable();
    const o = r.operation;
    const parsed = parseCustomerUploadReceipt({ receiptId: r.receipt.receiptId, createdAt: r.receipt.createdAt,
      expiresAt: r.receipt.expiresAt, lifecycle: r.receipt.lifecycle, contentType: o.normalized_input.contentType,
      byteSize: o.normalized_input.byteSize, dimensions: o.normalized_input.dimensions });
    return parsed.ok ? { status: "found", receipt: parsed.value, operationId: o.id, slotId: o.slot_id,
      sourceGeneration: o.source_generation, cropRevision: o.crop_revision } : unavailable();
  };
  const field = async (productId: string, fieldId: string) => {
    if (!await fresh()) return null;
    const catalog = new LocalCatalogAuthority(environment);
    const product = await catalog.repository.findPublicProductById(productId);
    if (product.status !== "found") return null;
    const configuration = await catalog.getCustomizationFieldsForProduct(productId);
    if (configuration.status !== "found") return null;
    const f = configuration.value.fields.find(f => f.id === fieldId && f.productId === productId && f.isActive && f.kind === "image");
    return f?.kind === "image" ? { constraints: f.constraints, revision: Number(configuration.value.configurationRevision) } : null;
  };
  const verifiedObject = async (locator: string, facts: { digest: string; byteSize: number }) => {
    if (!await fresh()) return null;
    const db = await createLocalPersistentSupabaseAdapter(environment);
    if (db.status !== "ready") return null;
    const read = await db.adapter.downloadPrivateObject(locator);
    if (read.status !== "found" || read.value.size !== facts.byteSize) return null;
    const bytes = new Uint8Array(await read.value.arrayBuffer());
    return await digest(bytes) === facts.digest ? bytes : null;
  };
  const writeVerified = async (locator: string, bytes: Uint8Array, type: string, facts: { digest: string; byteSize: number }) => {
    if (!await fresh()) return false;
    const db = await createLocalPersistentSupabaseAdapter(environment);
    if (db.status !== "ready") return false;
    // Immutable write. A duplicate-object reply alone never proves success.
    await db.adapter.uploadPrivateObject(locator, bytes, type);
    return !!await verifiedObject(locator, facts);
  };
  const resume = async (known: Stored, options: { reconcileExactCopyPrepareRace?: boolean } = {}): Promise<MediaResult> => {
    let o = known.operation;
    if (o.lifecycle === "ready") {
      if (!o.output_facts || !await verifiedObject(o.original_locator, o.normalized_input)
        || !await verifiedObject(o.derivative_locator, o.output_facts) || !await fresh()) return unavailable();
      return projection(known);
    }
    if (o.lifecycle !== "pending") return unavailable();
    const policy = await field(o.product_id, o.field_key);
    if (!policy || policy.revision !== o.configuration_revision) return { status: "conflict" };
    const original = await verifiedObject(o.original_locator, o.normalized_input);
    if (!original) return unavailable();
    // Trusted transform follows durable identity and original write/read-back.
    const processed = await processLocalCommerceImage(environment, original, policy.constraints, o.normalized_input.crop);
    if (processed.status !== "processed") return unavailable();
    const output: Output = { digest: await digest(processed.png), byteSize: processed.png.byteLength, dimensions: processed.outputDimensions };
    let prepared = await rpc("prepare", o.id, null, null, o.version, output);
    if (prepared.status === "conflict" && options.reconcileExactCopyPrepareRace) {
      prepared = await reconcileExactCopyPrepareConflict({ canonical: o, output,
        lookup: () => rpc("lookup", o.id, null, null, null, o.normalized_input) });
    }
    if (prepared.status !== "found") return prepared;
    if (prepared.operation.lifecycle === "ready") {
      if (!prepared.operation.output_facts || !await verifiedObject(prepared.operation.original_locator, prepared.operation.normalized_input)
        || !await verifiedObject(prepared.operation.derivative_locator, prepared.operation.output_facts) || !await fresh()) return unavailable();
      return projection(prepared);
    }
    o = prepared.operation;
    if (!await writeVerified(o.derivative_locator, processed.png, "image/png", output)) return unavailable();
    const published = await rpc("publish", o.id, null, null, o.version, o.normalized_input);
    // An uncertain response is NOT a rollback. Resolve only this durable ID.
    if (published.status !== "found") {
      const recovered = await rpc("lookup", o.id, null, null, null, o.normalized_input);
      return recovered.status === "found" && recovered.operation.lifecycle === "ready" ? projection(recovered) : published;
    }
    return projection(published);
  };
  const accept = async (input: { draftId: string; expectedVersion: number; fieldId: string; bytes: Uint8Array;
    slotId?: string; crop?: CustomizationCropRegion; originalReceiptId?: string;
    requestKey?: string; recoveryOnly?: boolean }): Promise<MediaResult> => {
    try {
      if (!uuid(input.draftId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1
        || (input.requestKey !== undefined && (!uuid(input.requestKey) || input.slotId !== undefined || input.originalReceiptId !== undefined || input.crop !== undefined))
        || (input.recoveryOnly && !input.requestKey)
        || (input.slotId !== undefined && !uuid(input.slotId)) || (input.crop && !parseCustomizationCropRegion(input.crop).ok)
        || (input.originalReceiptId && (!uuid(input.originalReceiptId) || !input.slotId))) return { status: "rejected" };
      const draft = await createLocalPersistentDraftPort({ environment, verifyOwner });
      if (draft.status !== "ready") return unavailable();
      const d = await draft.port.read({ authority: draft.authority, draftId: input.draftId });
      if (d.status !== "found") return unavailable();
      const policy = await field(d.value.productId, input.fieldId);
      if (!policy) return unavailable();
      let bytes = input.bytes;
      if (input.originalReceiptId) {
        const previous = await rpc("receipt", input.originalReceiptId, null, null, null, null);
        if (previous.status !== "found" || previous.operation.slot_id !== input.slotId || previous.operation.draft_id !== input.draftId) return unavailable();
        const original = await verifiedObject(previous.operation.original_locator, previous.operation.normalized_input);
        if (!original) return unavailable();
        bytes = original;
      }
      // Admission decode validates actual bytes; browser metadata is not used.
      const decoded = await processLocalCommerceImage(environment, bytes, policy.constraints);
      if (decoded.status !== "processed") return { status: decoded.status };
      const source: Source = { kind: input.originalReceiptId ? "crop" : input.slotId ? "replace" : "upload", fieldId: input.fieldId,
        configurationRevision: policy.revision, digest: await digest(bytes), contentType: decoded.contentType,
        byteSize: bytes.byteLength, dimensions: decoded.dimensions, ...(input.crop ? { crop: input.crop } : {}) };
      const begun = await rpc("begin", null, input.draftId, input.slotId ?? null, input.expectedVersion, source,
        input.requestKey ? { productId: d.value.productId, key: input.requestKey, recoveryOnly: input.recoveryOnly === true } : undefined);
      if (begun.status !== "found") return begun;
      // A committed replay never writes either immutable object a second time.
      if (begun.operation.lifecycle !== "pending") return await resume(begun);
      if (!input.originalReceiptId && !await writeVerified(begun.operation.original_locator, bytes, decoded.contentType, source)) return unavailable();
      return await resume(begun);
    } catch { return unavailable(); }
  };
  const remove = async (operationId: string): Promise<Failure | { status: "removed" }> => {
    if (!uuid(operationId)) return unavailable();
    const result = await rpc("remove", operationId, null, null, null, null);
    if (result.status !== "found") return result;
    const derivative = await cleanupPersistentMedia(environment, operationId, "derivative");
    const original = await cleanupPersistentMedia(environment, operationId, "original");
    return ["completed", "retained"].includes(derivative.status)
      && ["completed", "retained"].includes(original.status) ? { status: "removed" } : unavailable();
  };
  const retireRecovered = async (known: Stored): Promise<Failure | { status: "removed" }> => {
    if (known.operation.lifecycle === "ready") return remove(known.operation.id);
    let operation = known.operation;
    if (operation.lifecycle === "pending") {
      const failed = await rpc("fail", operation.id, null, null, operation.version, operation.normalized_input);
      if (failed.status !== "found" || failed.operation.lifecycle !== "failed") return unavailable();
      operation = failed.operation;
    }
    if (operation.lifecycle !== "failed") return unavailable();
    const derivative = await cleanupPersistentMedia(environment, operation.id, "derivative");
    const original = await cleanupPersistentMedia(environment, operation.id, "original");
    return ["completed", "retained"].includes(derivative.status)
      && ["completed", "retained"].includes(original.status) ? { status: "removed" } : unavailable();
  };
  const readConfirmed = async (receiptId: string, expected: {
    productId: string; fieldId: string; configurationRevision: string; draftId?: string; slotId?: string;
    crop?: CustomizationCropRegion;
  }): Promise<Failure | { status: "found"; receipt: CustomerUploadReceipt }> => {
    if (!uuid(receiptId)) return unavailable();
    const r = await rpc("receipt", receiptId, null, null, null, null);
    if (r.status !== "found") return unavailable();
    const o = r.operation;
    const outputFacts = o.output_facts;
    if (!outputFacts) return unavailable();
    if (o.product_id !== expected.productId || o.field_key !== expected.fieldId
      || String(o.configuration_revision) !== expected.configurationRevision
      || (expected.draftId !== undefined && o.draft_id !== expected.draftId)
      || (expected.slotId !== undefined && o.slot_id !== expected.slotId)) return unavailable();
    const sameCrop = (a?: CustomizationCropRegion, b?: CustomizationCropRegion) =>
      !a && !b || !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
    if (!sameCrop(o.normalized_input.crop, expected.crop)) return unavailable();
    const draft = await createLocalPersistentDraftPort({ environment, verifyOwner });
    if (draft.status !== "ready") return unavailable();
    const d = await draft.port.read({ authority: draft.authority, draftId: o.draft_id });
    if (d.status !== "found" || d.value.productId !== expected.productId
      || !d.value.slots.some(s => s.slotId === o.slot_id && s.fieldId === expected.fieldId
        && s.receiptReference === receiptId && sameCrop(s.crop, expected.crop))) return unavailable();
    const policy = await field(expected.productId, expected.fieldId);
    if (!policy || String(policy.revision) !== expected.configurationRevision) return unavailable();
    if (!await verifiedObject(o.original_locator, o.normalized_input)
      || !await verifiedObject(o.derivative_locator, outputFacts) || !await fresh()) return unavailable();
    const current = await rpc("receipt", receiptId, null, null, null, null);
    if (current.status !== "found") return unavailable();
    const p = projection(current);
    return p.status === "found" ? { status: "found", receipt: p.receipt } : p;
  };
  return {
    accept,
    remove,
    /** Resolve an already-bound browser retry selector and retire only its
     * exact server-owned operation. This never creates a binding and never
     * completes a pending transform merely to remove it. */
    async releaseUpload(input: { draftId: string; expectedVersion: number; fieldId: string;
      bytes: Uint8Array; requestKey: string }): Promise<Failure | { status: "removed" }> {
      try {
        if (!uuid(input.draftId) || !uuid(input.requestKey) || !Number.isSafeInteger(input.expectedVersion)
          || input.expectedVersion < 1) return { status: "rejected" };
        const draft = await createLocalPersistentDraftPort({ environment, verifyOwner });
        if (draft.status !== "ready") return unavailable();
        const d = await draft.port.read({ authority: draft.authority, draftId: input.draftId });
        if (d.status !== "found") return unavailable();
        const policy = await field(d.value.productId, input.fieldId);
        if (!policy) return unavailable();
        const decoded = await processLocalCommerceImage(environment, input.bytes, policy.constraints);
        if (decoded.status !== "processed") return { status: decoded.status };
        const source: Source = { kind: "upload", fieldId: input.fieldId, configurationRevision: policy.revision,
          digest: await digest(input.bytes), contentType: decoded.contentType, byteSize: input.bytes.byteLength,
          dimensions: decoded.dimensions };
        const bound = await rpc("begin", null, input.draftId, null, input.expectedVersion, source,
          { productId: d.value.productId, key: input.requestKey, recoveryOnly: true });
        if (bound.status !== "found") {
          const v = await fresh();
          const db = await createLocalPersistentSupabaseAdapter(environment);
          if (!v || db.status !== "ready" || composition.status !== "ready") return bound;
          const selector = v.owner.kind === "guest" ? await hashGuestResourceCapability(v.owner.ownerId) : v.owner.ownerId;
          if (!selector) return unavailable();
          const replay = await db.adapter.readMediaUploadReleaseBinding({ projectId: composition.value.projectId,
            ownerKind: v.owner.kind, ownerSelector: selector, customerId: v.owner.kind === "customer" ? v.owner.customerId : null,
            keyDigest: await digest(new TextEncoder().encode(input.requestKey.toLowerCase())),
            fingerprint: await digest(new TextEncoder().encode(JSON.stringify({ project: composition.value.projectId,
              owner: selector, ownerKind: v.owner.kind, draftId: input.draftId, productId: d.value.productId,
              expectedVersion: input.expectedVersion, source }))) });
          if (replay.status === "conflict") return { status: "conflict" };
          if (replay.status !== "found") return unavailable();
          const derivative = await cleanupPersistentMedia(environment, replay.operationId, "derivative");
          const original = await cleanupPersistentMedia(environment, replay.operationId, "original");
          return ["completed", "retained"].includes(derivative.status)
            && ["completed", "retained"].includes(original.status) ? { status: "removed" } : unavailable();
        }
        return retireRecovered(bound);
      } catch { return unavailable(); }
    },
    /** Server-only canonicalization for a browser-safe Draft save. */
    async resolveDraftSlot(input: { draftId: string; fieldId: string; receiptId: string }): Promise<Failure | { status: "found"; slotId: string }> {
      if (!uuid(input.draftId) || !uuid(input.receiptId) || !input.fieldId) return { status: "rejected" };
      const result = await rpc("receipt", input.receiptId, null, null, null, null);
      return result.status === "found" && result.operation.draft_id === input.draftId
        && result.operation.field_key === input.fieldId
        ? { status: "found", slotId: result.operation.slot_id }
        : unavailable();
    },
    /** Explicit server-owned copy command. No caller-selected owner, target
     * receipt, storage locator or bytes. The returned slot is still subordinate
     * to the existing Draft and needs its ordinary explicit CAS confirmation. */
    async copy(input: { sourceReceiptId: string; targetDraftId: string; expectedVersion: number; idempotencyKey: string }): Promise<MediaResult> {
      try {
        if (!uuid(input.sourceReceiptId) || !uuid(input.targetDraftId) || !uuid(input.idempotencyKey)
          || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion<1) return unavailable();
        const v=await fresh();
        if (!v || composition.status!=="ready") return unavailable();
        const selector=v.owner.kind==="guest"?await hashGuestResourceCapability(v.owner.ownerId):v.owner.ownerId;
        const db=await createLocalPersistentSupabaseAdapter(environment);
        if (!selector || db.status!=="ready") return unavailable();
        const result=await db.adapter.callRestrictedRpc<Stored | Failure>("media_copy_command", {
          p_project_id:composition.value.projectId,p_marker_digest:composition.value.markerDigest,
          p_owner_kind:v.owner.kind,p_owner_selector:selector,p_customer_id:v.owner.kind==="customer"?v.owner.customerId:null,
          p_authority_expires_at:new Date(v.expiresAt*1000).toISOString(),
          p_source_receipt:input.sourceReceiptId,p_target_draft:input.targetDraftId,p_expected_version:input.expectedVersion,
          p_key_digest:await digest(new TextEncoder().encode(input.idempotencyKey.toLowerCase())),
          p_input_digest:await digest(new TextEncoder().encode(JSON.stringify([composition.value.projectId,v.owner.kind,selector,input.sourceReceiptId,input.targetDraftId,input.expectedVersion]))),
        });
        if (result.status!=="found") return unavailable();
        if (result.value.status!=="found") return result.value.status==="conflict"?{status:"conflict"}:unavailable();
        const o=result.value.operation;
        if (!o || !uuid(o.id) || !uuid(o.slot_id) || o.project_id!==composition.value.projectId
          || o.draft_id!==input.targetDraftId || o.operation_kind!=="copy"
          || !o.original_locator.startsWith(`${o.project_id}/media/`)
          || o.derivative_locator!==`${o.project_id}/media/${o.id}/derivative`) return unavailable();
        return await resume(result.value, { reconcileExactCopyPrepareRace: true });
      } catch { return unavailable(); }
    },
    /** Read-only purchase admission over the SAME receipt and confirmed Draft.
     * Selectors are compared with stored facts; they never establish ownership.
     */
    async readConfirmedReceipt(receiptId: string, expected: {
      productId: string; fieldId: string; configurationRevision: string; crop?: CustomizationCropRegion;
    }): Promise<Failure | { status: "found"; receipt: CustomerUploadReceipt }> {
      return readConfirmed(receiptId, expected);
    },
    /** Refresh restoration derives configuration revision from the exact
     * server-owned receipt binding; selectors never become purchase facts. */
    async restoreConfirmedReceipt(input: { draftId: string; slotId: string; fieldId: string; receiptId: string;
      crop?: CustomizationCropRegion }): Promise<Failure | { status: "found"; receipt: CustomerUploadReceipt }> {
      if (!uuid(input.draftId) || !uuid(input.slotId) || !uuid(input.receiptId) || !input.fieldId) return { status: "rejected" };
      const r = await rpc("receipt", input.receiptId, null, null, null, null);
      if (r.status !== "found" || r.operation.draft_id !== input.draftId || r.operation.slot_id !== input.slotId
        || r.operation.field_key !== input.fieldId) return unavailable();
      return readConfirmed(input.receiptId, { productId: r.operation.product_id, fieldId: input.fieldId,
        configurationRevision: String(r.operation.configuration_revision), draftId: input.draftId,
        slotId: input.slotId, ...(input.crop ? { crop: input.crop } : {}) });
    },
    /** Only exact server-issued operation identity may be resumed. No scans. */
    async reconcile(operationId: string): Promise<MediaResult> {
      if (!uuid(operationId)) return unavailable();
      const r = await rpc("lookup", operationId, null, null, null, null);
      return r.status === "found" ? resume(r) : r;
    },
    async fail(operationId: string): Promise<Failure | { status: "failed" }> {
      if (!uuid(operationId)) return unavailable();
      const r = await rpc("lookup", operationId, null, null, null, null);
      if (r.status !== "found" || r.operation.lifecycle === "ready") return unavailable();
      const failed = r.operation.lifecycle === "failed" ? r : await rpc("fail", operationId, null, null, r.operation.version, r.operation.normalized_input);
      if (failed.status !== "found" || failed.operation.lifecycle !== "failed") return unavailable();
      const derivative = await cleanupPersistentMedia(environment, operationId, "derivative");
      const original = await cleanupPersistentMedia(environment, operationId, "original");
      return derivative.status === "completed" && ["completed", "retained"].includes(original.status) ? { status: "failed" } : unavailable();
    },
    async read(receiptId: string): Promise<Failure | { status: "found"; receipt: CustomerUploadReceipt; bytes: Uint8Array }> {
      if (!uuid(receiptId)) return unavailable();
      const r = await rpc("receipt", receiptId, null, null, null, null);
      if (r.status !== "found" || !r.operation.output_facts) return unavailable();
      const p = projection(r);
      if (p.status !== "found") return p;
      const bytes = await verifiedObject(r.operation.derivative_locator, r.operation.output_facts);
      if (!bytes || !await fresh()) return unavailable();
      return { status: "found", receipt: p.receipt, bytes };
    },
  };
}
