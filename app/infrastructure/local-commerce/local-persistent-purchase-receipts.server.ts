import type { RuntimeEnvironment } from "../../config/server.ts";
import type { CustomerUploadReceiptRepository } from "../../application/customer-upload-repository.ts";
import type { CustomerUploadReceipt } from "../../domain/customer-upload.ts";
import { parseConfiguredItemHandoff } from "../../domain/configured-item.ts";
import { createLocalPersistentMediaAuthority, type MediaOwnerVerifier } from "./local-persistent-media-authority.server.ts";

/** Bind each untrusted selector to its intended field/configuration before
 * delegating to the existing durable media authority. No receipt cache/Map.
 */
export function persistentPurchaseReceipts(environment: RuntimeEnvironment, verifyOwner: MediaOwnerVerifier,
  rawHandoffs: readonly unknown[]): Pick<CustomerUploadReceiptRepository, "findOwnedReceipt"> {
  return {
    async findOwnedReceipt(receiptId, ownerId) {
      const v = await verifyOwner();
      if (!v || v.owner.ownerId !== ownerId) return { status: "not_found" };
      const matches = rawHandoffs.flatMap(raw => {
        const h = parseConfiguredItemHandoff(raw);
        if (!h.ok) return [];
        return h.value.customizationValues.flatMap(field => field.kind !== "image" ? []
          : field.images.filter(image => image.receiptId === receiptId).map(image => ({
            productId: h.value.productId, fieldId: field.fieldId,
            configurationRevision: h.value.configurationRevision, ...(image.crop ? { crop: image.crop } : {}),
          })));
      });
      if (!matches.length) return { status: "not_found" };
      const media = createLocalPersistentMediaAuthority(environment, verifyOwner);
      let receipt: CustomerUploadReceipt | undefined;
      for (const expected of matches) {
        const result = await media.readConfirmedReceipt(receiptId, expected);
        if (result.status !== "found") return { status: "not_found" };
        receipt = result.receipt;
      }
      return receipt ? { status: "found", value: receipt } : { status: "not_found" };
    },
  };
}
