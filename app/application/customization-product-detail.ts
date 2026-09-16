import type { CustomizationField } from "../domain/customization-field.ts";
import {
  type CustomizationFieldReadRepository,
} from "./customization-field-repository.ts";
import {
  type CatalogRepositoryResult,
  type PublicCatalogProductDetail,
  type PublicCatalogReadRepository,
} from "./catalog-repository.ts";
import { validationIssue } from "../domain/catalog/validation.ts";

export type PublicProductCustomization =
  | {
      status: "configured";
      configurationRevision: string;
      fields: readonly CustomizationField[];
    }
  | { status: "not_configured" };

export interface PublicProductDetailWithCustomization {
  catalog: PublicCatalogProductDetail;
  customization: PublicProductCustomization;
}

function forwardCatalogFailure<T>(
  result: Exclude<CatalogRepositoryResult<unknown>, { status: "found" }>,
): CatalogRepositoryResult<T> {
  return result as CatalogRepositoryResult<T>;
}

/**
 * Composes two sibling read authorities. Catalog eligibility is always
 * resolved before the Product-owned customization configuration is read.
 */
export async function loadPublicProductDetailWithCustomization(
  catalogRepository: PublicCatalogReadRepository,
  customizationRepository: CustomizationFieldReadRepository,
  slug: string,
): Promise<CatalogRepositoryResult<PublicProductDetailWithCustomization>> {
  const catalog = await catalogRepository.findPublicProductBySlug(slug);
  if (catalog.status !== "found") return forwardCatalogFailure(catalog);

  const configuration = await customizationRepository.getCustomizationFieldsForProduct(
    catalog.value.product.id,
  );
  if (configuration.status === "not_found") {
    return {
      status: "found",
      value: {
        catalog: catalog.value,
        customization: { status: "not_configured" },
      },
    };
  }
  if (configuration.status === "invalid_configuration") {
    return { status: "invalid_configuration", issues: configuration.issues };
  }
  if (configuration.status === "source_failure") {
    return { status: "source_failure", operation: configuration.operation };
  }
  if (configuration.value.productId !== catalog.value.product.id) {
    return {
      status: "invalid_configuration",
      issues: [
        validationIssue(
          "$.customization.productId",
          "ownership",
          "Customization configuration belongs to another Product.",
        ),
      ],
    };
  }

  return {
    status: "found",
    value: {
      catalog: catalog.value,
      customization: {
        status: "configured",
        configurationRevision: configuration.value.configurationRevision,
        fields: configuration.value.fields,
      },
    },
  };
}
