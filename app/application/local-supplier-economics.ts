import type { LocalOrderFulfillmentReadPort } from "./local-order-repository.ts";
import {
  validateSupplierProductionUnitIdentity,
  type SupplierAssignmentSnapshot,
  type SupplierPricingBasis,
  type SupplierPriceUnit,
  type SupplierProductionUnitIdentity,
  type SupplierReviewStatus,
} from "../domain/supplier-operations.ts";

export type SupplierCustomerRevenue =
  | { readonly status: "known"; readonly amountCents: number; readonly currency: "USD"; readonly quantity: number }
  | { readonly status: "unavailable" };

type ProductionFacts = Pick<SupplierAssignmentSnapshot,
  "supplierCostCents" | "currency" | "pricingBasis" | "priceUnit" | "optionSurchargeCents"
  | "packagedWeightGrams" | "minProductionBusinessDays" | "maxProductionBusinessDays" | "provenance"
> & Partial<Pick<SupplierAssignmentSnapshot, "packagedWeightRawText" | "packagedWeightReviewStatus" | "reviewStatus">>;

export interface SupplierEconomicsProjection {
  readonly authority: "current_source" | "committed_assignment";
  readonly customerRevenue: SupplierCustomerRevenue;
  readonly supplierProductionCost: {
    readonly status: "known" | "unknown" | "area_based" | "manual_quote_required";
    /** The source quote in its declared basis, never a fabricated unit cost. */
    readonly amountCents: number | null;
    readonly currency: "CNY" | "USD" | null;
    readonly pricingBasis: SupplierPricingBasis;
    readonly priceUnit: SupplierPriceUnit;
    readonly unitCostCents: number | null;
    readonly optionSurchargeCents: number | null;
  };
  readonly productionLeadTime:
    | { readonly status: "known"; readonly minProductionBusinessDays: number; readonly maxProductionBusinessDays: number }
    | { readonly status: "unavailable"; readonly minProductionBusinessDays: number | null; readonly maxProductionBusinessDays: number | null };
  readonly packagedWeight: {
    readonly status: "known" | "unavailable";
    readonly grams: number | null;
    readonly rawText: string | null;
    readonly reviewStatus: SupplierReviewStatus;
    readonly approvalRequired: boolean;
  };
  readonly dimensionsCm: null;
  readonly factReviewStatus: SupplierReviewStatus;
  readonly provenance: readonly {
    readonly sourceRow: number;
    readonly sourceUrl: string | null;
    readonly reviewStatus: SupplierReviewStatus;
    readonly reviewNote: string;
    readonly quotedPrice: string | null;
    readonly packagedWeight: string | null;
    readonly fastestProductionDays: string | null;
    readonly slowestProductionDays: string | null;
  }[];
  readonly landedCost: { readonly status: "unavailable" };
  readonly grossMargin: { readonly status: "unavailable" };
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function reviewStatus(value: unknown): SupplierReviewStatus {
  return value === "approved" || value === "provisional" || value === "ambiguous" || value === "unmapped"
    ? value : "unknown";
}

export function projectSupplierProductionLeadTime(minimum: number | null, maximum: number | null): SupplierEconomicsProjection["productionLeadTime"] {
  const min = nonNegativeInteger(minimum) ? minimum : null;
  const max = nonNegativeInteger(maximum) ? maximum : null;
  return min !== null && max !== null && min <= max
    ? { status: "known", minProductionBusinessDays: min, maxProductionBusinessDays: max }
    : { status: "unavailable", minProductionBusinessDays: min, maxProductionBusinessDays: max };
}

/** Called only after operator authorization; reads the existing canonical Order store. */
export function readSupplierCustomerRevenue(
  orders: Pick<LocalOrderFulfillmentReadPort, "findSnapshotForFulfillmentById">,
  productionUnit: SupplierProductionUnitIdentity,
): SupplierCustomerRevenue {
  if (!validateSupplierProductionUnitIdentity(productionUnit).ok) return { status: "unavailable" };
  try {
    const result = orders.findSnapshotForFulfillmentById(productionUnit.canonicalOrder.internalOrderId);
    if (result.status !== "found") return { status: "unavailable" };
    const order = result.snapshot;
    if (order.internalId !== productionUnit.canonicalOrder.internalOrderId
      || order.publicReference !== productionUnit.canonicalOrder.publicReference
      || !Array.isArray(order.lines)) return { status: "unavailable" };
    const matches = order.lines.filter((line) => line?.orderItemId === productionUnit.orderItemId);
    if (matches.length !== 1) return { status: "unavailable" };
    const line = matches[0];
    if (line.fulfillmentType !== "physical" || line.currency !== "USD"
      || !nonNegativeInteger(line.quantity) || line.quantity === 0
      || !nonNegativeInteger(line.unitBasePriceCents) || !nonNegativeInteger(line.lineSubtotalCents)
      || line.unitBasePriceCents * line.quantity !== line.lineSubtotalCents) return { status: "unavailable" };
    return { status: "known", amountCents: line.lineSubtotalCents, currency: line.currency, quantity: line.quantity };
  } catch {
    return { status: "unavailable" };
  }
}

/** Bounded operator projection. Has no Catalog, browser, provider, or mutable source lookup. */
export function projectSupplierEconomics(
  facts: ProductionFacts,
  authority: SupplierEconomicsProjection["authority"],
  customerRevenue: SupplierCustomerRevenue = { status: "unavailable" },
): SupplierEconomicsProjection {
  const currency = facts.currency === "CNY" || facts.currency === "USD" ? facts.currency : null;
  const amountCents = nonNegativeInteger(facts.supplierCostCents) ? facts.supplierCostCents : null;
  const unitCostCents = (facts.pricingBasis === "fixed" || facts.pricingBasis === "variant_fixed")
    && facts.priceUnit === "per_unit" && currency !== null ? amountCents : null;
  const status = facts.pricingBasis === "area_based" ? "area_based"
    : facts.pricingBasis === "manual_quote_required" ? "manual_quote_required"
      : unitCostCents !== null ? "known" : "unknown";
  const grams = nonNegativeInteger(facts.packagedWeightGrams) ? facts.packagedWeightGrams : null;
  const weightReview = reviewStatus(facts.packagedWeightReviewStatus);
  return {
    authority,
    customerRevenue: { ...customerRevenue },
    supplierProductionCost: {
      status, amountCents, currency, pricingBasis: facts.pricingBasis, priceUnit: facts.priceUnit, unitCostCents,
      optionSurchargeCents: nonNegativeInteger(facts.optionSurchargeCents) ? facts.optionSurchargeCents : null,
    },
    productionLeadTime: projectSupplierProductionLeadTime(facts.minProductionBusinessDays, facts.maxProductionBusinessDays),
    packagedWeight: {
      status: grams === null ? "unavailable" : "known", grams,
      rawText: facts.packagedWeightRawText ?? null,
      reviewStatus: weightReview, approvalRequired: weightReview !== "approved",
    },
    dimensionsCm: null,
    factReviewStatus: reviewStatus(facts.reviewStatus),
    provenance: facts.provenance.map((entry) => ({
      sourceRow: entry.sourceRow, sourceUrl: entry.sourceUrl,
      reviewStatus: entry.reviewStatus, reviewNote: entry.reviewNote,
      quotedPrice: entry.rawValues.quotedPrice, packagedWeight: entry.rawValues.packagedWeight,
      fastestProductionDays: entry.rawValues.fastestProductionDays, slowestProductionDays: entry.rawValues.slowestProductionDays,
    })),
    landedCost: { status: "unavailable" },
    grossMargin: { status: "unavailable" },
  };
}
