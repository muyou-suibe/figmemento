import type { CustomerUploadFieldResolution, CustomerUploadFieldResolutionRequest } from "./customer-upload-http-handler.server.ts";
import { createCatalogRuntimeEnvironment } from "../config/catalog-runtime-environment.ts";
import type { RuntimeEnvironment } from "../config/server.ts";
import { isIdentifier } from "../domain/catalog/validation.ts";
import { createServerCatalogRepository } from "../infrastructure/catalog/server-catalog-repository.ts";
import { createServerCustomizationFieldRepository } from "../infrastructure/customization/server-customization-field-repository.ts";

export interface CustomerUploadFieldSelector {
  readonly productId: string;
  readonly fieldId: string;
}

function readSelector(request: CustomerUploadFieldResolutionRequest): CustomerUploadFieldSelector | null {
  try {
    const url = new URL(request.url);
    if (url.searchParams.getAll("productId").length !== 1 || url.searchParams.getAll("fieldId").length !== 1) {
      return null;
    }
    const productId = url.searchParams.get("productId");
    const fieldId = url.searchParams.get("fieldId");
    if (!isIdentifier(productId) || !isIdentifier(fieldId)) return null;
    return { productId, fieldId };
  } catch {
    return null;
  }
}

/**
 * Resolves upload policy from the current Product and Product-owned
 * CustomizationField authority. Query identifiers select the authority; they
 * never carry constraints or any browser-controlled policy value.
 */
export function createServerCustomerUploadFieldResolver(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): (request: CustomerUploadFieldResolutionRequest) => Promise<CustomerUploadFieldResolution> {
  const runtimeEnvironment = { ...environment, ...createCatalogRuntimeEnvironment(environment, runtimeMode) };
  return async function resolve(request): Promise<CustomerUploadFieldResolution> {
    const selector = readSelector(request);
    if (!selector) return { status: "not_found" };

    const catalogResult = await createServerCatalogRepository(runtimeEnvironment, runtimeMode);
    if (catalogResult.status !== "found") {
      return catalogResult.status === "not_found" ? { status: "not_found" } : { status: "source_failure" };
    }
    const productResult = await catalogResult.value.repository.findPublicProductById(selector.productId);
    if (productResult.status !== "found") {
      return productResult.status === "not_found" || productResult.status === "unavailable"
        ? { status: "not_found" }
        : { status: "source_failure" };
    }

    const customizationResult = createServerCustomizationFieldRepository(
      runtimeEnvironment,
      runtimeMode,
    );
    const configuration = await customizationResult.repository.getCustomizationFieldsForProduct(selector.productId);
    if (configuration.status !== "found") {
      return configuration.status === "not_found" ? { status: "not_found" } : { status: "source_failure" };
    }
    const field = configuration.value.fields.find((candidate) => candidate.id === selector.fieldId);
    if (!field || field.productId !== productResult.value.product.id || field.kind !== "image" || !field.isActive) {
      return { status: "not_found" };
    }
    return { status: "found", constraints: field.constraints };
  };
}
