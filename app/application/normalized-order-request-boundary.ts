import type {
  ConfiguredItemHandoffAcceptanceDependencies,
} from "./configured-item-handoff-acceptance.ts";
import {
  acceptConfiguredItemHandoff,
} from "./configured-item-handoff-acceptance.ts";
import {
  mapConfiguredItemToOrderCustomizationCompatibility,
  type OrderCustomizationCompatibilityProjection,
} from "./configured-item-order-compatibility.ts";
import {
  isNormalizedOrderRequestItem,
  normalizedOrderRequestItemToConfiguredItemHandoff,
  parseOrderRequestItem,
  type NormalizedCustomizationOrderRequestItem,
} from "../domain/order.ts";
import type { ConfiguredItemHandoff } from "../domain/configured-item.ts";
import type {
  CustomerUploadOwnerId,
  CustomerUploadTimestamp,
} from "../domain/customer-upload.ts";

/**
 * These are deliberately bounded. Task 8.1 reasons, receipt IDs, field
 * values, owner context, and provider details never cross this boundary.
 */
export type NormalizedOrderCustomizationRejectionReason =
  | "invalid_request"
  | "normalized_checkout_unavailable";

export type NormalizedOrderCustomizationPreparationResult =
  | {
      readonly status: "accepted";
      readonly item: NormalizedCustomizationOrderRequestItem;
      readonly handoff: ConfiguredItemHandoff;
      readonly compatibility: OrderCustomizationCompatibilityProjection;
    }
  | {
      readonly status: "rejected";
      readonly reason: NormalizedOrderCustomizationRejectionReason;
    };

export interface PrepareNormalizedOrderCustomizationRequestInput {
  /** Raw request item; it is parsed before any repository is accessed. */
  readonly rawItem: unknown;
  /** Derived by the server owner-context verifier, never by request JSON. */
  readonly verifiedOwnerId: CustomerUploadOwnerId;
  /** Explicit server time used by receipt expiry validation. */
  readonly observedAt: CustomerUploadTimestamp;
}

function rejected(
  reason: NormalizedOrderCustomizationRejectionReason,
): NormalizedOrderCustomizationPreparationResult {
  return { status: "rejected", reason };
}

/**
 * Testable normalized order seam. It performs structural parsing, then
 * delegates all catalog, field, and receipt authority to Task 8.1 and maps
 * only the accepted canonical handoff through Task 8.3. It does not write an
 * order, coupon, upload attachment, or payment record.
 */
export async function prepareNormalizedOrderCustomizationRequest(
  input: PrepareNormalizedOrderCustomizationRequestInput,
  dependencies: ConfiguredItemHandoffAcceptanceDependencies,
): Promise<NormalizedOrderCustomizationPreparationResult> {
  const parsed = parseOrderRequestItem(input.rawItem);
  if (!parsed || !isNormalizedOrderRequestItem(parsed)) return rejected("invalid_request");

  const handoff = normalizedOrderRequestItemToConfiguredItemHandoff(parsed);
  let accepted: Awaited<ReturnType<typeof acceptConfiguredItemHandoff>>;
  try {
    accepted = await acceptConfiguredItemHandoff({
      rawInput: handoff,
      verifiedOwnerId: input.verifiedOwnerId,
      observedAt: input.observedAt,
    }, dependencies);
  } catch {
    return rejected("normalized_checkout_unavailable");
  }
  if (accepted.status !== "accepted") return rejected("normalized_checkout_unavailable");

  return {
    status: "accepted",
    item: parsed,
    handoff: accepted.handoff,
    compatibility: mapConfiguredItemToOrderCustomizationCompatibility(accepted.handoff),
  };
}
