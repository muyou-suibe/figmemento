/**
 * The accepted local-persistent Digital Delivery policy used by the grant and
 * ticket authorities. This is a read-only projection boundary; it is not an
 * Admin mutation surface and it does not activate a production provider.
 */
export const LOCAL_PERSISTENT_DIGITAL_DELIVERY_POLICY = Object.freeze({
  status: "local_policy" as const,
  durationDays: 30 as const,
  maxDownloads: 5 as const,
});

export type LocalPersistentDigitalDeliveryPolicy = typeof LOCAL_PERSISTENT_DIGITAL_DELIVERY_POLICY;

export const LOCAL_PERSISTENT_DIGITAL_DELIVERY_WINDOW_MS =
  LOCAL_PERSISTENT_DIGITAL_DELIVERY_POLICY.durationDays * 24 * 60 * 60 * 1000;

export function readLocalPersistentDigitalDeliveryPolicy(): LocalPersistentDigitalDeliveryPolicy {
  return LOCAL_PERSISTENT_DIGITAL_DELIVERY_POLICY;
}
