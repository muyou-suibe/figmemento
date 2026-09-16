import type {
  CustomizationFieldReadRepository,
  CustomizationFieldRepositoryResult,
  ProductCustomizationFieldConfiguration,
} from "../../application/customization-field-repository.ts";
import { readProductSource, type RuntimeEnvironment } from "../../config/server.ts";
import { createDevelopmentCustomizationFieldFixtures } from "./development-customization-field-fixtures.ts";

/**
 * Local-only repository. Its factory requires the existing explicit fixture
 * source selection and this implementation is never a production fallback.
 */
export class FixtureCustomizationFieldRepository implements CustomizationFieldReadRepository {
  async getCustomizationFieldsForProduct(
    productId: string,
  ): Promise<CustomizationFieldRepositoryResult<ProductCustomizationFieldConfiguration>> {
    const configuration = createDevelopmentCustomizationFieldFixtures()
      .find((candidate) => candidate.productId === productId);
    return configuration ? { status: "found", value: configuration } : { status: "not_found" };
  }
}

export function createDevelopmentCustomizationFieldRepository(
  environment: RuntimeEnvironment,
): FixtureCustomizationFieldRepository {
  if (readProductSource(environment) !== "fixture") {
    throw new Error("Development customization fixtures require explicit fixture source selection.");
  }
  return new FixtureCustomizationFieldRepository();
}
