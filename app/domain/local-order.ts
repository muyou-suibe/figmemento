import {
  parseLocalCheckoutRequest,
  type LocalCheckoutAddress,
  type LocalCheckoutRequest,
  type LocalCouponResult,
  type LocalShippingResult,
  type LocalTaxState,
} from "./local-checkout.ts";
import type { SelectedOptionValue } from "./catalog/variant.ts";
import type {
  CustomizationCropRegion,
  CustomizationImageValue,
  CustomizationTextValue,
  CustomizationValues,
} from "./customization-value.ts";

export type LocalOrderStatus = "pending_payment" | "payment_failed" | "paid";
export type LocalOrderPaymentStatus = "pending" | "failed" | "succeeded";
export type LocalOrderCurrency = "USD";
export type LocalOrderFulfillmentType = "physical" | "digital";

export interface LocalOrderLifecycle {
  readonly status: LocalOrderStatus;
  readonly paymentStatus: LocalOrderPaymentStatus;
}

export interface LocalOrderCreateRequest extends LocalCheckoutRequest {
  readonly creationAttemptId: string;
}

export interface LocalOrderParseIssue {
  readonly path: string;
  readonly code: "invalid_type" | "invalid_format" | "invalid_value";
}

export type LocalOrderParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly LocalOrderParseIssue[] };

export interface LocalOrderCustomizationSnapshot {
  readonly configurationRevision: string;
  readonly values: CustomizationValues;
}

export interface LocalOrderLineSnapshot {
  /** Present on newly committed canonical lines; absent only for legacy snapshots. */
  readonly orderItemId?: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly SelectedOptionValue[];
  readonly quantity: number;
  readonly unitBasePriceCents: number;
  readonly currency: LocalOrderCurrency;
  readonly lineSubtotalCents: number;
  /** Captured from validated Catalog authority for newly committed Orders. */
  readonly fulfillmentType?: LocalOrderFulfillmentType;
  readonly customization?: LocalOrderCustomizationSnapshot;
}

export type CanonicalLocalOrderLineSnapshot = LocalOrderLineSnapshot & {
  readonly orderItemId: string;
  readonly fulfillmentType: LocalOrderFulfillmentType;
};

export type EligibleLocalShipping = Extract<LocalShippingResult, { status: "eligible" }>;

export interface LocalOrderCommercialSnapshot {
  readonly currency: LocalOrderCurrency;
  readonly subtotalCents: number;
  readonly shipping: EligibleLocalShipping;
  readonly coupon: LocalCouponResult;
  readonly promotionDiscountCents?: number;
  readonly pointsDiscountCents?: number;
  readonly pointsRedeemed?: number;
  readonly tax: LocalTaxState;
  readonly localArithmeticTotalCents: number;
  readonly developmentOnly: true;
}

export interface LocalOrderSnapshotInput {
  readonly internalId: string;
  readonly publicReference: string;
  readonly createdAt: string;
  /** Server-derived local customer ownership; absent for legitimate guests. */
  readonly customerId?: string;
  readonly contact: LocalCheckoutAddress;
  readonly commercial: LocalOrderCommercialSnapshot;
  readonly lines: readonly LocalOrderLineSnapshot[];
}

export interface LocalOrderSnapshot extends LocalOrderSnapshotInput {
  readonly kind: "local_order_snapshot";
  readonly status: LocalOrderStatus;
  readonly paymentStatus: LocalOrderPaymentStatus;
}

export type LocalOrderPublicCustomizationValue =
  | Pick<CustomizationTextValue, "fieldId" | "fieldCode" | "kind" | "value">
  | {
      readonly fieldId: string;
      readonly fieldCode: string;
      readonly kind: "image";
      readonly imageCount: number;
    };

export interface LocalOrderPublicLine {
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly SelectedOptionValue[];
  readonly quantity: number;
  readonly unitBasePriceCents: number;
  readonly currency: LocalOrderCurrency;
  readonly lineSubtotalCents: number;
  readonly customization?: readonly LocalOrderPublicCustomizationValue[];
}

export interface LocalOrderPublicProjection {
  readonly publicReference: string;
  readonly createdAt: string;
  readonly status: LocalOrderStatus;
  readonly paymentStatus: LocalOrderPaymentStatus;
  readonly contact: LocalCheckoutAddress;
  readonly commercial: LocalOrderCommercialSnapshot;
  readonly lines: readonly LocalOrderPublicLine[];
}

const CREATION_ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_ORDER_REFERENCE_PATTERN = /^FM-LOCAL-[A-Z0-9]{16}$/;
const LOCAL_ORDER_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIssue(path: string, code: LocalOrderParseIssue["code"]): LocalOrderParseIssue {
  return { path, code };
}

export function isCreationAttemptId(value: unknown): value is string {
  return typeof value === "string" && CREATION_ATTEMPT_ID_PATTERN.test(value);
}

export function isLocalOrderPublicReference(value: unknown): value is string {
  return typeof value === "string" && LOCAL_ORDER_REFERENCE_PATTERN.test(value);
}

export function isLocalOrderItemId(value: unknown): value is string {
  return typeof value === "string" && LOCAL_ORDER_ITEM_ID_PATTERN.test(value);
}

export function isLocalOrderFulfillmentType(value: unknown): value is LocalOrderFulfillmentType {
  return value === "physical" || value === "digital";
}

/** Parses browser-owned structural fields and one opaque creation selector. */
export function parseLocalOrderCreateRequest(value: unknown): LocalOrderParseResult<LocalOrderCreateRequest> {
  if (!isRecord(value)) return { ok: false, issues: [parseIssue("$", "invalid_type")] };

  const issues: LocalOrderParseIssue[] = [];
  if (!isCreationAttemptId(value.creationAttemptId)) {
    issues.push(parseIssue("creationAttemptId", typeof value.creationAttemptId === "string" ? "invalid_format" : "invalid_type"));
  }

  const checkoutInput = { ...value };
  delete checkoutInput.creationAttemptId;
  const parsedCheckout = parseLocalCheckoutRequest(checkoutInput);
  if (!parsedCheckout.ok) {
    issues.push(...parsedCheckout.issues.map((entry) => ({
      path: entry.message.split(":")[0] ?? "$",
      code: entry.message.endsWith("invalid_format") ? "invalid_format" as const : "invalid_value" as const,
    })));
  }

  if (issues.length > 0 || !parsedCheckout.ok) return { ok: false, issues };
  return {
    ok: true,
    value: {
      ...parsedCheckout.value,
      creationAttemptId: value.creationAttemptId as string,
    },
  };
}

function cloneCrop(crop: CustomizationCropRegion | undefined): CustomizationCropRegion | undefined {
  return crop ? { ...crop } : undefined;
}

function cloneCustomizationValues(values: CustomizationValues): CustomizationValues {
  return values.map((value) => {
    if (value.kind === "image") {
      return {
        ...value,
        images: value.images.map((image) => ({
          receiptId: image.receiptId,
          ...(image.crop ? { crop: cloneCrop(image.crop) } : {}),
        })),
      } satisfies CustomizationImageValue;
    }
    return { ...value } satisfies CustomizationTextValue;
  });
}

function cloneLine(line: LocalOrderLineSnapshot): LocalOrderLineSnapshot {
  return {
    ...line,
    selectedOptions: line.selectedOptions.map((selection) => ({ ...selection })),
    ...(line.customization
      ? {
          customization: {
            configurationRevision: line.customization.configurationRevision,
            values: cloneCustomizationValues(line.customization.values),
          },
        }
      : {}),
  };
}

function cloneCommercial(commercial: LocalOrderCommercialSnapshot): LocalOrderCommercialSnapshot {
  return {
    ...commercial,
    shipping: { ...commercial.shipping },
    coupon: { ...commercial.coupon },
    tax: { ...commercial.tax },
  };
}

function validateAugmentedLineFacts(
  lines: readonly LocalOrderLineSnapshot[],
  requireComplete: boolean,
): void {
  const orderItemIds = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const hasOrderItemId = line.orderItemId !== undefined;
    const hasFulfillmentType = line.fulfillmentType !== undefined;
    if (!hasOrderItemId && !hasFulfillmentType) {
      if (requireComplete) throw new Error(`Local Order line ${index} is missing canonical identity facts.`);
      continue;
    }
    if (!hasOrderItemId || !isLocalOrderItemId(line.orderItemId)) {
      throw new Error(`Local Order line ${index} has an invalid orderItemId.`);
    }
    if (!hasFulfillmentType || !isLocalOrderFulfillmentType(line.fulfillmentType)) {
      throw new Error(`Local Order line ${index} has an invalid fulfillmentType.`);
    }
    if (orderItemIds.has(line.orderItemId)) {
      throw new Error("Local Order snapshot contains duplicate orderItemId values.");
    }
    orderItemIds.add(line.orderItemId);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

function buildFrozenSnapshot(
  input: LocalOrderSnapshotInput,
  lifecycle: LocalOrderLifecycle,
): LocalOrderSnapshot {
  return deepFreeze({
    kind: "local_order_snapshot" as const,
    internalId: input.internalId,
    publicReference: input.publicReference,
    createdAt: input.createdAt,
    ...(input.customerId ? { customerId: input.customerId } : {}),
    status: lifecycle.status,
    paymentStatus: lifecycle.paymentStatus,
    contact: { ...input.contact },
    commercial: cloneCommercial(input.commercial),
    lines: input.lines.map(cloneLine),
  });
}

export function createLocalOrderSnapshot(input: LocalOrderSnapshotInput): LocalOrderSnapshot {
  if (!isLocalOrderPublicReference(input.publicReference)) {
    throw new Error("Invalid local Order public reference.");
  }
  if (input.lines.length === 0) throw new Error("Local Order snapshot requires at least one line.");

  // Existing customer-safe readers remain compatible with legacy in-memory
  // snapshots. Any augmented facts that are present must still be well formed.
  validateAugmentedLineFacts(input.lines, false);

  return buildFrozenSnapshot(input, { status: "pending_payment", paymentStatus: "pending" });
}

/** Strict constructor used only by the new Order commit path. */
export function createCanonicalLocalOrderSnapshot(input: LocalOrderSnapshotInput): LocalOrderSnapshot {
  if (!isLocalOrderPublicReference(input.publicReference)) {
    throw new Error("Invalid local Order public reference.");
  }
  if (input.lines.length === 0) throw new Error("Local Order snapshot requires at least one line.");
  validateAugmentedLineFacts(input.lines, true);
  return buildFrozenSnapshot(input, { status: "pending_payment", paymentStatus: "pending" });
}

/** Replaces only the local lifecycle while preserving all frozen Order facts. */
export function replaceLocalOrderLifecycle(
  snapshot: LocalOrderSnapshot,
  lifecycle: LocalOrderLifecycle,
): LocalOrderSnapshot {
  return buildFrozenSnapshot(snapshot, lifecycle);
}

/** Returns an immutable copy without resetting a previously committed lifecycle. */
export function cloneLocalOrderSnapshot(snapshot: LocalOrderSnapshot): LocalOrderSnapshot {
  return buildFrozenSnapshot(snapshot, {
    status: snapshot.status,
    paymentStatus: snapshot.paymentStatus,
  });
}

function projectCustomizationValues(values: CustomizationValues): readonly LocalOrderPublicCustomizationValue[] {
  return values.map((value) => {
    if (value.kind === "image") {
      return {
        fieldId: value.fieldId,
        fieldCode: value.fieldCode,
        kind: "image" as const,
        imageCount: value.images.length,
      };
    }
    return {
      fieldId: value.fieldId,
      fieldCode: value.fieldCode,
      kind: value.kind,
      value: value.value,
    };
  });
}

export function projectLocalOrderSnapshot(snapshot: LocalOrderSnapshot): LocalOrderPublicProjection {
  return {
    publicReference: snapshot.publicReference,
    createdAt: snapshot.createdAt,
    status: snapshot.status,
    paymentStatus: snapshot.paymentStatus,
    contact: { ...snapshot.contact },
    commercial: cloneCommercial(snapshot.commercial),
    lines: snapshot.lines.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      productSlug: line.productSlug,
      variantId: line.variantId,
      skuCode: line.skuCode,
      selectedOptions: line.selectedOptions.map((selection) => ({ ...selection })),
      quantity: line.quantity,
      unitBasePriceCents: line.unitBasePriceCents,
      currency: line.currency,
      lineSubtotalCents: line.lineSubtotalCents,
      ...(line.customization
        ? { customization: projectCustomizationValues(line.customization.values) }
        : {}),
    })),
  };
}
