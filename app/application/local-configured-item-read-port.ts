import {
  isLocalOrderFulfillmentType,
  isLocalOrderItemId,
  isLocalOrderPublicReference,
  type LocalOrderLineSnapshot,
} from "../domain/local-order.ts";
import { parseCustomizationValues } from "../domain/customization-value.ts";
import type { LocalOrderFulfillmentReadPort, LocalOrderSnapshot } from "./local-order-repository.ts";

export interface LocalConfiguredItemReadInput {
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly orderItemId: string;
}

export interface ImmutableConfiguredItemOrderSnapshot {
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly skuCode: string;
  readonly selectedOptions: LocalOrderLineSnapshot["selectedOptions"];
  readonly quantity: number;
  readonly fulfillmentType: "physical" | "digital";
  readonly configurationRevision: string;
  readonly customizationValues: NonNullable<LocalOrderLineSnapshot["customization"]>["values"];
}

export type LocalConfiguredItemReadResult =
  | { readonly status: "found"; readonly item: ImmutableConfiguredItemOrderSnapshot }
  | { readonly status: "unavailable" };

export interface LocalConfiguredItemReadPort {
  findConfiguredItem(input: LocalConfiguredItemReadInput): LocalConfiguredItemReadResult;
}

/**
 * The only authority consumed by this adapter is the existing server-owned
 * Local Order snapshot read. No browser, Catalog, Cart, or Supplier source is
 * consulted while resolving historical configured-item facts.
 */
export type LocalConfiguredItemOrderSource = Pick<
  LocalOrderFulfillmentReadPort,
  "findSnapshotForFulfillmentById"
>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

function isSkuCode(value: unknown): value is string {
  return typeof value === "string" && SKU_PATTERN.test(value);
}

function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 160 && SLUG_PATTERN.test(value);
}

function isNonEmpty(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isReadInput(value: unknown): value is LocalConfiguredItemReadInput {
  return isRecord(value)
    && isIdentifier(value.internalOrderId)
    && isLocalOrderPublicReference(value.publicOrderReference)
    && isLocalOrderItemId(value.orderItemId);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

function projectLine(
  order: LocalOrderSnapshot,
  line: Record<string, unknown>,
): ImmutableConfiguredItemOrderSnapshot | null {
  if (
    !isLocalOrderItemId(line.orderItemId)
    || !isIdentifier(line.productId)
    || !isNonEmpty(line.productName, 200)
    || !isSlug(line.productSlug)
    || !isIdentifier(line.variantId)
    || !isSkuCode(line.skuCode)
    || !Array.isArray(line.selectedOptions)
    || !isPositiveInteger(line.quantity)
    || !isLocalOrderFulfillmentType(line.fulfillmentType)
    || !isRecord(line.customization)
    || !isIdentifier(line.customization.configurationRevision)
  ) {
    return null;
  }

  const customizationValues = parseCustomizationValues(line.customization.values);
  if (!customizationValues.ok) return null;

  const selectedOptionIds = new Set<string>();
  const selectedOptions = line.selectedOptions.map((selection) => {
    if (!isRecord(selection) || !isIdentifier(selection.optionId) || !isIdentifier(selection.valueId)) return null;
    if (selectedOptionIds.has(selection.optionId)) return null;
    selectedOptionIds.add(selection.optionId);
    return { optionId: selection.optionId, valueId: selection.valueId };
  });
  if (selectedOptions.some((selection) => selection === null)) return null;

  return deepFreeze({
    internalOrderId: order.internalId,
    publicOrderReference: order.publicReference,
    orderItemId: line.orderItemId,
    productId: line.productId,
    productName: line.productName,
    productSlug: line.productSlug,
    variantId: line.variantId,
    skuCode: line.skuCode,
    selectedOptions: selectedOptions as LocalOrderLineSnapshot["selectedOptions"],
    quantity: line.quantity,
    fulfillmentType: line.fulfillmentType,
    configurationRevision: line.customization.configurationRevision,
    customizationValues: customizationValues.value,
  });
}

/** Server-only read adapter over the single canonical Local Order store. */
export class LocalConfiguredItemReadAdapter implements LocalConfiguredItemReadPort {
  private readonly source: LocalConfiguredItemOrderSource;

  constructor(source: LocalConfiguredItemOrderSource) {
    this.source = source;
  }

  findConfiguredItem(input: LocalConfiguredItemReadInput): LocalConfiguredItemReadResult {
    if (!isReadInput(input)) return { status: "unavailable" };

    let orderResult;
    try {
      orderResult = this.source.findSnapshotForFulfillmentById(input.internalOrderId);
    } catch {
      return { status: "unavailable" };
    }
    if (orderResult.status !== "found") return { status: "unavailable" };

    const order = orderResult.snapshot;
    if (
      order.internalId !== input.internalOrderId
      || order.publicReference !== input.publicOrderReference
      || !Array.isArray(order.lines)
    ) {
      return { status: "unavailable" };
    }

    const matches = order.lines.filter((line) => isRecord(line) && line.orderItemId === input.orderItemId);
    if (matches.length !== 1) return { status: "unavailable" };

    const item = projectLine(order, matches[0]);
    return item ? { status: "found", item } : { status: "unavailable" };
  }
}

export function createLocalConfiguredItemReadAdapter(
  source: LocalConfiguredItemOrderSource,
): LocalConfiguredItemReadPort {
  return new LocalConfiguredItemReadAdapter(source);
}
