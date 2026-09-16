import type { LocalSupplierConfiguration } from "../../config/local-supplier-runtime.ts";
import {
  makeSupplierCatalogMappingKey,
  type SupplierDomainDataset,
  type SupplierSelectedOption,
} from "../../domain/supplier-operations.ts";

const TEMPORARY_TATTOO_PRODUCT_ID = "fixture-product-temporary-tattoo";
const TEMPORARY_TATTOO_PRODUCT_SLUG = "temporary-tattoo";
const TEMPORARY_TATTOO_CATALOG_VARIANT_ID = "fixture-variant-temporary-tattoo";
const TEMPORARY_TATTOO_SKU_CODE = "DEV-TEMPORARY-TATTOO";
const TEMPORARY_TATTOO_SUPPLIER_ID = "supplier-tmall-baiwenmei";
const TEMPORARY_TATTOO_OFFER_ID = "offer-tmall-temporary-tattoo";
const TEMPORARY_TATTOO_SUPPLIER_VARIANT_ID = "variant-temporary-tattoo-18x28cm";
const TEMPORARY_TATTOO_SUPPLIER_SPECIFICATION_KEY = "18x28cm";

export const TEMPORARY_TATTOO_DEMO_MAPPING = {
  productId: TEMPORARY_TATTOO_PRODUCT_ID,
  productSlug: TEMPORARY_TATTOO_PRODUCT_SLUG,
  catalogVariantId: TEMPORARY_TATTOO_CATALOG_VARIANT_ID,
  skuCode: TEMPORARY_TATTOO_SKU_CODE,
  selectedOptions: [] as readonly SupplierSelectedOption[],
  fulfillmentType: "physical" as const,
  supplierId: TEMPORARY_TATTOO_SUPPLIER_ID,
  offerId: TEMPORARY_TATTOO_OFFER_ID,
  supplierOfferVariantId: TEMPORARY_TATTOO_SUPPLIER_VARIANT_ID,
  supplierSpecificationKey: TEMPORARY_TATTOO_SUPPLIER_SPECIFICATION_KEY,
} as const;

const DEVELOPMENT_TEST_MODES = new Set(["development", "test"]);

function isDevelopmentTestLocalFake(configuration: LocalSupplierConfiguration): boolean {
  return configuration.source === "local_fake" && DEVELOPMENT_TEST_MODES.has(configuration.runtimeMode);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

/**
 * Applies the owner-approved temporary-tattoo mapping only to the effective
 * local development/test dataset. The checked-in source dataset remains
 * unresolved and continues to represent source evidence, not approval.
 */
export function applyLocalSupplierDemoMappingOverlay(
  dataset: SupplierDomainDataset,
  configuration: LocalSupplierConfiguration,
): SupplierDomainDataset {
  if (!isDevelopmentTestLocalFake(configuration)) return dataset;

  const supplier = dataset.suppliers.find((entry) => entry.supplierId === TEMPORARY_TATTOO_DEMO_MAPPING.supplierId);
  const offer = dataset.offers.find((entry) => entry.offerId === TEMPORARY_TATTOO_DEMO_MAPPING.offerId);
  const variant = dataset.variants.find((entry) => entry.supplierOfferVariantId === TEMPORARY_TATTOO_DEMO_MAPPING.supplierOfferVariantId);
  if (!supplier || !offer || !variant
    || offer.supplierId !== supplier.supplierId
    || variant.offerId !== offer.offerId) return dataset;

  const mappingKey = makeSupplierCatalogMappingKey({
    productId: TEMPORARY_TATTOO_DEMO_MAPPING.productId,
    productSlug: TEMPORARY_TATTOO_DEMO_MAPPING.productSlug,
    catalogVariantId: TEMPORARY_TATTOO_DEMO_MAPPING.catalogVariantId,
    skuCode: TEMPORARY_TATTOO_DEMO_MAPPING.skuCode,
    selectedOptions: TEMPORARY_TATTOO_DEMO_MAPPING.selectedOptions,
    supplierOfferId: TEMPORARY_TATTOO_DEMO_MAPPING.offerId,
    supplierOfferVariantId: TEMPORARY_TATTOO_DEMO_MAPPING.supplierOfferVariantId,
  });

  return deepFreeze({
    suppliers: dataset.suppliers.map((entry) => entry.supplierId === supplier.supplierId
      ? { ...entry, status: "active" as const }
      : entry),
    offers: dataset.offers.map((entry) => entry.offerId === offer.offerId
      ? {
        ...entry,
        status: "active" as const,
        catalogMapping: {
          status: "approved" as const,
          productId: TEMPORARY_TATTOO_DEMO_MAPPING.productId,
          productSlug: TEMPORARY_TATTOO_DEMO_MAPPING.productSlug,
          catalogVariantId: TEMPORARY_TATTOO_DEMO_MAPPING.catalogVariantId,
          skuCode: TEMPORARY_TATTOO_DEMO_MAPPING.skuCode,
          selectedOptions: TEMPORARY_TATTOO_DEMO_MAPPING.selectedOptions,
          supplierOfferId: TEMPORARY_TATTOO_DEMO_MAPPING.offerId,
          supplierOfferVariantId: TEMPORARY_TATTOO_DEMO_MAPPING.supplierOfferVariantId,
          mappingKey,
          reason: "Owner-approved development/test local demo mapping; not production business approval.",
        },
      }
      : entry),
    variants: dataset.variants.map((entry) => entry.supplierOfferVariantId === variant.supplierOfferVariantId
      ? {
        ...entry,
        status: "active" as const,
        reviewStatus: "approved" as const,
      }
      : entry),
  });
}
