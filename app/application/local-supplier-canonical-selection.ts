import type {
  ImmutableConfiguredItemOrderSnapshot,
  LocalConfiguredItemReadPort,
} from "./local-configured-item-read-port.ts";
import {
  validateCanonicalSupplierSelection,
  type CanonicalSupplierSelection,
  type SupplierProductionUnitIdentity,
  type SupplierValidationIssue,
  type SupplierValidationResult,
} from "../domain/supplier-operations.ts";

function unavailable(message: string): SupplierValidationResult<CanonicalSupplierSelection> {
  const issue: SupplierValidationIssue = { path: "$", code: "unavailable", message };
  return { ok: false, issues: [issue] };
}

function toSelection(item: ImmutableConfiguredItemOrderSnapshot): unknown {
  return {
    internalOrderId: item.internalOrderId,
    publicOrderReference: item.publicOrderReference,
    orderItemId: item.orderItemId,
    productId: item.productId,
    productSlug: item.productSlug,
    catalogVariantId: item.variantId,
    skuCode: item.skuCode,
    selectedOptions: item.selectedOptions.map((entry) => ({ optionId: entry.optionId, valueId: entry.valueId })),
    fulfillmentType: item.fulfillmentType,
    quantity: item.quantity,
  };
}

/** Projects only server-owned historical Order facts into the Supplier seam. */
export function readCanonicalSupplierSelection(
  port: LocalConfiguredItemReadPort,
  productionUnit: SupplierProductionUnitIdentity,
): SupplierValidationResult<CanonicalSupplierSelection> {
  let result;
  try {
    result = port.findConfiguredItem({
      internalOrderId: productionUnit.canonicalOrder.internalOrderId,
      publicOrderReference: productionUnit.canonicalOrder.publicReference,
      orderItemId: productionUnit.orderItemId,
    });
  } catch {
    return unavailable("Canonical configured Order item is unavailable.");
  }
  if (result.status !== "found") return unavailable("Canonical configured Order item is unavailable.");
  return validateCanonicalSupplierSelection(toSelection(result.item));
}
