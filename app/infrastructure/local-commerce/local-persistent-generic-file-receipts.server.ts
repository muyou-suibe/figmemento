import type { RuntimeEnvironment } from "../../config/server.ts";
import type { GenericFileCustomizationFieldConstraints } from "../../domain/customization-field.ts";
import { parseCustomerUploadReceipt, type CustomerUploadReceipt } from "../../domain/customer-upload.ts";
import { resolveLocalPersistentComposition } from "../../application/local-persistent-commerce-composition.server.ts";
import { hashGuestResourceCapability, type VerifiedResourceOwner } from "../../application/guest-resource-ownership.server.ts";
import type { MediaOwnerVerifier } from "./local-persistent-media-authority.server.ts";
import { createLocalPersistentSupabaseAdapter } from "./local-persistent-supabase-adapter.server.ts";

type GenericCommand = {
  status: "found";
  receipt: {
    receiptId: string;
    originalFilename?: string | null;
    contentType: string;
    byteSize: number;
    createdAt: string;
    expiresAt: string;
    lifecycle: string;
  };
  internalLocator?: string | null;
};

type GenericCommandResult = GenericCommand | { status: "not_found" | "conflict" | "unavailable" };
type GenericFailure = { status: "not_found" | "conflict" | "unavailable" | "rejected" };
export type GenericFileReceiptResult = GenericFailure | { status: "found"; receipt: CustomerUploadReceipt };

const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);

async function digest(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeReceipt(value: unknown): CustomerUploadReceipt | null {
  const parsed = parseCustomerUploadReceipt(value);
  return parsed.ok ? parsed.value : null;
}

/**
 * Durable C10 receipt authority. Generic files share the private Storage
 * bucket and owner verification with image uploads, but use their own small
 * receipt table so image dimensions/crops cannot become an accidental
 * generic-file authority.
 */
export function createLocalPersistentGenericFileReceiptAuthority(
  environment: RuntimeEnvironment,
  verifyOwner: MediaOwnerVerifier,
) {
  const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["upload", "catalog"] });
  let subject: VerifiedResourceOwner | undefined;

  const fresh = async () => {
    if (composition.status !== "ready") return null;
    const verified = await verifyOwner();
    if (!verified || verified.owner.projectId !== composition.value.projectId
      || !Number.isFinite(verified.expiresAt) || verified.expiresAt <= Date.now() / 1000
      || (verified.owner.kind === "guest" && verified.expiresAt > verified.owner.expiresAt)) return null;
    if (subject && (subject.kind !== verified.owner.kind || subject.ownerId !== verified.owner.ownerId
      || subject.projectId !== verified.owner.projectId
      || (subject.kind === "customer" && verified.owner.kind === "customer" && subject.customerId !== verified.owner.customerId))) return null;
    subject ??= verified.owner;
    return verified;
  };

  const call = async (input: {
    command: "begin" | "publish" | "read" | "remove";
    receiptReference?: string;
    productId?: string;
    fieldId?: string;
    configurationRevision?: number;
    originalFilename?: string;
    contentType?: string;
    byteSize?: number;
    contentDigest?: string;
  }): Promise<GenericCommandResult> => {
    try {
      const verified = await fresh();
      if (!verified || composition.status !== "ready") return { status: "unavailable" };
      const connection = await createLocalPersistentSupabaseAdapter(environment);
      if (connection.status !== "ready") return { status: "unavailable" };
      const selector = verified.owner.kind === "guest"
        ? await hashGuestResourceCapability(verified.owner.ownerId)
        : verified.owner.ownerId;
      if (!selector) return { status: "unavailable" };
      const result = await connection.adapter.callRestrictedRpc<GenericCommandResult>("generic_file_command", {
        p_project_id: composition.value.projectId,
        p_marker_digest: composition.value.markerDigest,
        p_owner_kind: verified.owner.kind,
        p_owner_selector: selector,
        p_customer_id: verified.owner.kind === "customer" ? verified.owner.customerId : null,
        p_authority_expires_at: new Date(verified.expiresAt * 1000).toISOString(),
        p_command: input.command,
        p_receipt_reference: input.receiptReference ?? null,
        p_product_id: input.productId ?? null,
        p_field_key: input.fieldId ?? null,
        p_configuration_revision: input.configurationRevision ?? null,
        p_original_filename: input.originalFilename ?? null,
        p_content_type: input.contentType ?? null,
        p_byte_size: input.byteSize ?? null,
        p_content_digest: input.contentDigest ?? null,
      });
      if (result.status !== "found") return { status: "unavailable" };
      return result.value;
    } catch {
      return { status: "unavailable" };
    }
  };

  const projectPath = (locator: string) => composition.status === "ready"
    && locator.startsWith(`${composition.value.projectId}/generic/`) ? locator : null;

  return {
    async accept(input: {
      productId: string;
      fieldId: string;
      configurationRevision: number;
      constraints: GenericFileCustomizationFieldConstraints;
      bytes: Uint8Array;
      originalFilename?: string;
      contentType: string;
    }): Promise<GenericFileReceiptResult> {
      if (!uuid(input.productId) || !input.fieldId || !Number.isSafeInteger(input.configurationRevision)
        || input.configurationRevision < 1 || input.bytes.byteLength < 1
        || input.bytes.byteLength > input.constraints.maxBytes || input.bytes.byteLength > 20_971_520
        || !input.constraints.allowedMimeTypes.includes(input.contentType as never)) return { status: "rejected" };
      const contentDigest = await digest(input.bytes);
      const begun = await call({ command: "begin", productId: input.productId, fieldId: input.fieldId,
        configurationRevision: input.configurationRevision, ...(input.originalFilename ? { originalFilename: input.originalFilename } : {}),
        contentType: input.contentType, byteSize: input.bytes.byteLength, contentDigest });
      if (begun.status !== "found") return begun.status === "conflict" ? { status: "conflict" } : { status: "unavailable" };
      const locator = typeof begun.internalLocator === "string" ? projectPath(begun.internalLocator) : null;
      const receipt = safeReceipt(begun.receipt);
      if (!locator || !receipt || !uuid(receipt.receiptId)) return { status: "unavailable" };
      const connection = await createLocalPersistentSupabaseAdapter(environment);
      if (connection.status !== "ready") return { status: "unavailable" };
      const stored = await connection.adapter.uploadPrivateObject(locator, input.bytes, input.contentType);
      if (stored.status !== "found") {
        await connection.adapter.removePrivateObjects([locator]);
        await call({ command: "remove", receiptReference: receipt.receiptId });
        return { status: "unavailable" };
      }
      const published = await call({ command: "publish", receiptReference: receipt.receiptId,
        contentType: input.contentType, byteSize: input.bytes.byteLength, contentDigest });
      if (published.status !== "found") {
        await connection.adapter.removePrivateObjects([locator]);
        await call({ command: "remove", receiptReference: receipt.receiptId });
        return published.status === "conflict" ? { status: "conflict" } : { status: "unavailable" };
      }
      const safe = safeReceipt(published.receipt);
      return safe ? { status: "found", receipt: safe } : { status: "unavailable" };
    },

    async read(input: { receiptId: string; productId: string; fieldId: string; configurationRevision: number }): Promise<GenericFileReceiptResult> {
      if (!uuid(input.receiptId) || !uuid(input.productId) || !input.fieldId || !Number.isSafeInteger(input.configurationRevision)) return { status: "rejected" };
      const result = await call({ command: "read", receiptReference: input.receiptId, productId: input.productId,
        fieldId: input.fieldId, configurationRevision: input.configurationRevision });
      if (result.status !== "found") return result.status === "not_found" ? { status: "not_found" } : { status: "unavailable" };
      const receipt = safeReceipt(result.receipt);
      return receipt ? { status: "found", receipt } : { status: "unavailable" };
    },
  };
}
