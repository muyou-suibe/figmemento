import { isRecord } from "../domain/catalog/validation.ts";
import { parsePersistentPurchaseFulfillment } from "./local-persistent-fulfillment-authority.server.ts";

/** Historical projection only. No Catalog/service fallback and no write port. */
export function parseCanonicalPersistentOrderItem(value: unknown) {
  const unavailable = { status: "unavailable" as const };
  if (!isRecord(value) || typeof value.orderId !== "string" || typeof value.orderItemId !== "string"
    || typeof value.publicReference !== "string" || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(value.publicReference)
    || !isRecord(value.purchasedItem)) return unavailable;
  const item = value.purchasedItem;
  const policy = parsePersistentPurchaseFulfillment(item.fulfillment);
  if (policy.status !== "found" || !isRecord(item.product) || !isRecord(item.variant)
    || item.product.id !== policy.value.fulfillment.productId || item.variant.productId !== item.product.id
    || typeof item.variant.skuCode !== "string" || !Array.isArray(item.selectedOptions)
    || !isRecord(item.configuration) || item.configuration.productId !== item.product.id
    || typeof item.configuration.configurationRevision !== "string" || !Array.isArray(item.configuration.fields)
    || !Array.isArray(item.customizationValues) || !Array.isArray(item.media)
    || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1
    || item.currency !== "USD" || !isRecord(item.amounts)) return unavailable;
  const snapshot = structuredClone({ orderId: value.orderId, publicReference: value.publicReference,
    orderItemId: value.orderItemId, createdAt: value.createdAt, purchasedItem: item,
    ...(value.orderLifecycle !== undefined ? {orderLifecycle:value.orderLifecycle,itemSequence:value.itemSequence,contact:value.contact} : {}) });
  freeze(snapshot);
  return { status: "found" as const, value: snapshot };
}

function freeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}
