import { parseProductFulfillmentConfig, type ProductFulfillmentConfig } from "../domain/catalog/fulfillment.ts";
import { isRecord } from "../domain/catalog/validation.ts";

/** Only the persistent purchase boundary understands this extension. Never a
 * production Catalog contract, and never a default for historical purchases. */
export interface PersistentPurchaseFulfillmentAuthority {
  readonly fulfillment: ProductFulfillmentConfig;
  readonly requiresProductionPreview: boolean;
}

export function persistentBaseFulfillment(value: unknown) {
  if (!isRecord(value)) return parseProductFulfillmentConfig(value);
  const base = { ...value };
  delete base.requiresProductionPreview;
  return parseProductFulfillmentConfig(base);
}

export function parsePersistentPurchaseFulfillment(value: unknown):
  | { status: "found"; value: PersistentPurchaseFulfillmentAuthority }
  | { status: "unavailable" } {
  if (!isRecord(value) || typeof value.requiresProductionPreview !== "boolean") return { status: "unavailable" };
  const base = persistentBaseFulfillment(value);
  if (!base.ok) return { status: "unavailable" };
  return { status: "found", value: { fulfillment: base.value, requiresProductionPreview: value.requiresProductionPreview } };
}
