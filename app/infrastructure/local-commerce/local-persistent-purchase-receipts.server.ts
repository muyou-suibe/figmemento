import type { RuntimeEnvironment } from "../../config/server.ts";
import type { CustomerUploadReceiptRepository } from "../../application/customer-upload-repository.ts";
import type { CustomerUploadReceipt } from "../../domain/customer-upload.ts";
import { parseConfiguredItemHandoff } from "../../domain/configured-item.ts";
import { createLocalPersistentMediaAuthority, type MediaOwnerVerifier } from "./local-persistent-media-authority.server.ts";
import { createLocalPersistentGenericFileReceiptAuthority } from "./local-persistent-generic-file-receipts.server.ts";
import type { CustomizationCropRegion } from "../../domain/customization-value.ts";

type ReceiptMatch =
  | { kind: "image"; productId: string; fieldId: string; configurationRevision: string; crop?: CustomizationCropRegion }
  | { kind: "generic_file"; productId: string; fieldId: string; configurationRevision: string };

/** Bind each untrusted selector to its intended field/configuration before
 * delegating to the existing durable media authority. No receipt cache/Map.
 */
export function persistentPurchaseReceipts(environment: RuntimeEnvironment, verifyOwner: MediaOwnerVerifier,
  rawHandoffs: readonly unknown[]): Pick<CustomerUploadReceiptRepository, "findOwnedReceipt"> {
  return {
    async findOwnedReceipt(receiptId, ownerId) {
      const v = await verifyOwner();
      if (!v || v.owner.ownerId !== ownerId) return { status: "not_found" };
      const matches: ReceiptMatch[] = [];
      for (const raw of rawHandoffs) {
        const h = parseConfiguredItemHandoff(raw);
        if (!h.ok) continue;
        for (const field of h.value.customizationValues) {
          if (field.kind === "image") {
            for (const image of field.images) if (image.receiptId === receiptId) matches.push({
              kind: "image", productId: h.value.productId, fieldId: field.fieldId,
              configurationRevision: h.value.configurationRevision, ...(image.crop ? { crop: image.crop } : {}),
            });
          } else if (field.kind === "generic_file") {
            for (const file of field.files) if (file.receiptId === receiptId) matches.push({
              kind: "generic_file", productId: h.value.productId, fieldId: field.fieldId,
              configurationRevision: h.value.configurationRevision,
            });
          }
        }
      }
      if (!matches.length) return { status: "not_found" };
      const media = createLocalPersistentMediaAuthority(environment, verifyOwner);
      const generic = createLocalPersistentGenericFileReceiptAuthority(environment, verifyOwner);
      let receipt: CustomerUploadReceipt | undefined;
      for (const expected of matches) {
        const result = expected.kind === "generic_file"
          ? await generic.read({ receiptId, productId: expected.productId, fieldId: expected.fieldId,
              configurationRevision: Number(expected.configurationRevision) })
          : await media.readConfirmedReceipt(receiptId, expected);
        if (result.status !== "found") return { status: "not_found" };
        receipt = result.receipt;
      }
      return receipt ? { status: "found", value: receipt } : { status: "not_found" };
    },
  };
}
