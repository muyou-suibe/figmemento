import type { RuntimeEnvironment } from "../../config/server.ts";
import { hashGuestResourceCapability, type VerifiedResourceOwner } from "../../application/guest-resource-ownership.server.ts";
import { isExpectedVersion, isIdempotencyContext, type VerifiedAuthorityContext, type LocalCommercePortResult } from "../../application/local-commerce-provider-ports.server.ts";
import type { ConfirmedDraft, DraftSlotInput, LocalCommerceDraftPort } from "../../application/local-commerce-draft-port.server.ts";
import { parseCustomizationCropRegion } from "../../domain/customization-value.ts";
import { resolveLocalPersistentComposition } from "../../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "./local-persistent-supabase-adapter.server.ts";

const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
type Result = LocalCommercePortResult<ConfirmedDraft>;
const unavailable = (): Result => ({ status: "unavailable", reason: "invalid_authority" });

/** Each command re-verifies the caller with the existing session/guest verifier.
 * This callback is supplied by server composition, never by browser JSON.
 * It must check durable session revoke where the owner is a member.
 */
export async function createLocalPersistentDraftPort(input: {
  readonly environment: RuntimeEnvironment;
  readonly verifyOwner: () => Promise<{ owner: VerifiedResourceOwner; expiresAt: number } | null>;
}): Promise<{ status: "ready"; port: LocalCommerceDraftPort; authority: VerifiedAuthorityContext } | { status: "unavailable" }> {
  try {
    const composition = resolveLocalPersistentComposition(input.environment, { requiredCapabilities: ["cart", "catalog"] });
    const initial = await input.verifyOwner();
    if (composition.status !== "ready" || !initial || initial.owner.projectId !== composition.value.projectId
      || !Number.isFinite(initial.expiresAt) || initial.expiresAt <= Date.now() / 1000) return { status: "unavailable" };
    const authority: VerifiedAuthorityContext = Object.freeze({ kind: "verified_server_authority", projectId: initial.owner.projectId,
      ownerId: initial.owner.ownerId, actorKind: "customer", actorId: initial.owner.kind === "customer" ? initial.owner.customerId : initial.owner.ownerId });
    const invoke = async (operation: "create" | "read" | "save", command: {
      authority: VerifiedAuthorityContext; draftId?: string; productId?: string;
      expectedVersion?: number; idempotency?: { key: string; fingerprint: string }; slots?: readonly DraftSlotInput[];
    }): Promise<Result> => {
      try {
        const verified = await input.verifyOwner();
        if (!verified || verified.owner.kind !== initial.owner.kind || verified.owner.ownerId !== authority.ownerId
          || verified.owner.projectId !== authority.projectId || !Number.isFinite(verified.expiresAt) || verified.expiresAt <= Date.now() / 1000
          || (verified.owner.kind === "guest" && verified.expiresAt > verified.owner.expiresAt)
          || (verified.owner.kind === "customer" && verified.owner.customerId !== authority.actorId)
          || !command.authority || Object.keys(authority).some(k => command.authority[k as keyof VerifiedAuthorityContext] !== authority[k as keyof VerifiedAuthorityContext])) return unavailable();
        if ((operation === "create" ? !uuid(command.productId) || command.expectedVersion !== 0 : !uuid(command.draftId))
          || (operation !== "read" && (!isExpectedVersion(command.expectedVersion) || !isIdempotencyContext(command.idempotency)))) {
          return { status: "unavailable", reason: "invalid_request" };
        }
        let slots: DraftSlotInput[] | null = null;
        if (operation === "save") {
          if (!Array.isArray(command.slots) || command.slots.length > 100) return { status: "unavailable", reason: "invalid_request" };
          slots = [];
          for (const slot of command.slots) {
            if (!slot || Object.keys(slot).some(k => !["slotId", "fieldId", "receiptReference", "crop"].includes(k))
              || !uuid(slot.receiptReference) || typeof slot.fieldId !== "string" || !slot.fieldId || slot.fieldId.length > 200
              || (slot.slotId !== undefined && !uuid(slot.slotId))) return { status: "unavailable", reason: "invalid_request" };
            const crop = slot.crop === undefined ? undefined : parseCustomizationCropRegion(slot.crop);
            if (crop && !crop.ok) return { status: "unavailable", reason: "rejected" };
            slots.push({ ...(slot.slotId ? { slotId: slot.slotId } : {}), fieldId: slot.fieldId,
              receiptReference: slot.receiptReference, ...(crop?.ok ? { crop: crop.value } : {}) });
          }
        }
        const connection = await createLocalPersistentSupabaseAdapter(input.environment);
        if (connection.status !== "ready") return { status: "unavailable", reason: "source_failure" };
        const owner = verified.owner;
        const selector = owner.kind === "guest" ? await hashGuestResourceCapability(owner.ownerId) : owner.ownerId;
        if (!selector) return unavailable();
        const result = await connection.adapter.callRestrictedRpc<Result>("draft_command", {
          p_project_id: authority.projectId, p_marker_digest: composition.value.markerDigest,
          p_owner_kind: owner.kind, p_owner_selector: selector, p_customer_id: owner.kind === "customer" ? owner.customerId : null,
          p_authority_expires_at: new Date(verified.expiresAt * 1000).toISOString(), p_operation: operation,
          p_draft_id: command.draftId ?? null, p_product_id: command.productId ?? null,
          p_expected_version: command.expectedVersion ?? 0, p_command_key: command.idempotency?.key ?? null,
          p_fingerprint: command.idempotency?.fingerprint ?? null, p_slots: slots,
        });
        if (result.status !== "found") return { status: "unavailable", reason: "source_failure" };
        if (result.value.status !== "found") return result.value;
        const value = result.value.value;
        if (!value || !uuid(value.draftId) || !uuid(value.productId) || !isExpectedVersion(value.version)
          || !Number.isSafeInteger(value.confirmedRevision) || value.confirmedRevision < 1 || !Array.isArray(value.slots)) {
          return { status: "unavailable", reason: "source_failure" };
        }
        const seen = new Set<string>();
        for (const [position, slot] of value.slots.entries()) {
          if (!slot || !uuid(slot.slotId) || seen.has(slot.slotId) || !uuid(slot.receiptReference)
            || typeof slot.fieldId !== "string" || !slot.fieldId || slot.position !== position
            || slot.confirmedRevision !== value.confirmedRevision
            || (slot.crop !== undefined && !parseCustomizationCropRegion(slot.crop).ok)) {
            return { status: "unavailable", reason: "source_failure" };
          }
          seen.add(slot.slotId);
        }
        // Explicit safe projection: no spread of provider/owner/private metadata.
        return { status: "found", value: { draftId: value.draftId, productId: value.productId, version: value.version,
          confirmedRevision: value.confirmedRevision, slots: value.slots.map(s => ({ slotId: s.slotId, fieldId: s.fieldId,
            receiptReference: s.receiptReference, position: s.position, confirmedRevision: s.confirmedRevision,
            ...(s.crop ? { crop: s.crop } : {}) })) } };
      } catch { return { status: "unavailable", reason: "source_failure" }; }
    };
    return { status: "ready", authority, port: {
      create: command => invoke("create", command), read: command => invoke("read", command), save: command => invoke("save", command),
    } };
  } catch { return { status: "unavailable" }; }
}
