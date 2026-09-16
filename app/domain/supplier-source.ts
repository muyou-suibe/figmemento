export type SupplierSourceReviewStatus =
  | "approved"
  | "provisional"
  | "ambiguous"
  | "unmapped"
  | "unknown";

export type SupplierOperationalStatus = "active" | "inactive" | "unknown";

export type SupplierVideoCapability = "available" | "paid" | "unknown";

export type SupplierPricingBasis =
  | "fixed"
  | "variant_fixed"
  | "area_based"
  | "manual_quote_required";

export type SupplierPriceUnit = "per_unit" | "per_area" | "manual_quote" | "unknown";

export type SupplierCurrency = "CNY" | "USD";

export interface SupplierWorkbookIdentity {
  readonly requestedFilename: string;
  readonly reviewedFilename: string;
  readonly reviewedSha256: string;
  readonly supplierSheetName: "供应商对接";
  readonly instructionsSheetName: "填写说明";
  readonly filenameStatus: "requested_copy_unavailable_reviewed_copy_used";
}

export interface SupplierSourceRawValues {
  readonly supplierName: string | null;
  readonly platformOrUrl: string | null;
  readonly sourceProductLabel: string | null;
  readonly productType: string | null;
  readonly quotedPrice: string | null;
  readonly packagedWeight: string | null;
  readonly fastestProductionDays: string | null;
  readonly slowestProductionDays: string | null;
  readonly video: string | null;
  readonly returnOrRework: string | null;
  readonly shanghaiWarehouse: string | null;
  readonly listingCopy: string | null;
  readonly photoOrMethodNotes: string | null;
}

export interface SupplierSourceProvenance {
  readonly workbook: SupplierWorkbookIdentity;
  readonly sheetName: "供应商对接";
  readonly sourceRow: number;
  readonly sourceUrl: string | null;
  readonly rawValues: SupplierSourceRawValues;
  readonly reviewStatus: SupplierSourceReviewStatus;
  readonly reviewNote: string;
}

export interface LocalSupplierFixture {
  readonly supplierId: string;
  readonly displayName: string;
  readonly platform: "1688" | "Taobao" | "Tmall" | "unknown";
  readonly sourceUrl: string | null;
  readonly status: SupplierOperationalStatus;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly videoCapability: SupplierVideoCapability;
  readonly returnReworkPolicy: string | null;
  readonly notes: string | null;
  readonly provenance: readonly SupplierSourceProvenance[];
}

export type SupplierCatalogMapping =
  | {
      readonly status: "approved";
      readonly productSlug: string;
      readonly skuCode: string;
      readonly mappingKey: string;
      readonly reason: string;
      /** Optional until a reviewed Model C mapping is supplied. */
      readonly productId?: string;
      readonly catalogVariantId?: string;
      readonly selectedOptions?: readonly { readonly optionId: string; readonly valueId: string }[];
      readonly supplierOfferId?: string;
      readonly supplierOfferVariantId?: string;
    }
  | {
      readonly status: "provisional" | "ambiguous" | "unmapped";
      readonly productSlug: null;
      readonly skuCode: null;
      readonly mappingKey: string | null;
      readonly reason: string;
      readonly productId?: null;
      readonly catalogVariantId?: null;
      readonly selectedOptions?: null;
      readonly supplierOfferId?: null;
      readonly supplierOfferVariantId?: null;
    };

export interface SupplierOfferFixture {
  readonly offerId: string;
  readonly supplierId: string;
  readonly sourceProductLabel: string;
  readonly fulfillmentType: "physical";
  readonly catalogMapping: SupplierCatalogMapping;
  readonly isActive: boolean | null;
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly sourcePackagedWeightText: string | null;
  readonly notes: string | null;
  readonly provenance: readonly SupplierSourceProvenance[];
}

export interface SupplierQuotedAmount {
  /** Amount in the source pricing basis; it is not necessarily a unit price. */
  readonly amountCents: number | null;
  readonly currency: SupplierCurrency | null;
  readonly pricingBasis: SupplierPricingBasis;
  readonly priceUnit: SupplierPriceUnit;
  readonly rawText: string;
  readonly reviewStatus: SupplierSourceReviewStatus;
}

export interface SupplierOfferVariantFixture {
  readonly variantId: string;
  readonly offerId: string;
  readonly variantKey: string;
  readonly label: string;
  readonly supplierQuotedAmount: SupplierQuotedAmount;
  readonly optionSurchargeCents: number | null;
  /** Standard packaged/shipping weight. Null means no variant-specific value. */
  readonly packagedWeightGrams: number | null;
  readonly packagedWeightRawText: string | null;
  readonly packagedWeightReviewStatus: SupplierSourceReviewStatus;
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
  readonly dimensionsCm: null;
  readonly sourceVariantText: string;
  readonly notes: string | null;
  readonly provenance: readonly SupplierSourceProvenance[];
}
