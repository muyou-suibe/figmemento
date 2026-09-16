import {
  normalizeCustomizationFieldConfiguration,
  type ProductCustomizationFieldConfiguration,
} from "../../application/customization-field-repository.ts";

export const DEVELOPMENT_CUSTOMIZATION_FIELD_FIXTURE_NOTICE =
  "DEVELOPMENT FIXTURE ONLY. NON-PRODUCTION. NOT BUSINESS APPROVED. NOT SUPPLIER DATA. NOT MIGRATION DATA.";

/**
 * These deterministic identities are local development/test inputs only.
 * They are not database revision identifiers and are never migration inputs.
 */
const developmentCustomizationFieldFixtureDefinitions = [
  {
    productId: "fixture-product-couple-figure",
    configurationRevision: "fixture-customization-revision-couple-figure-v1",
    fields: [
      {
        id: "fixture-customization-field-couple-figure-reference-images",
        productId: "fixture-product-couple-figure",
        code: "development-reference-images",
        label: "Development reference images",
        kind: "image",
        required: true,
        isActive: true,
        position: 0,
        configurationRevision: "fixture-customization-revision-couple-figure-v1",
        constraints: {
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
          maxBytes: 5_000_000,
          minDimensions: { width: 600, height: 600 },
          recommendedDimensions: { width: 1200, height: 1200 },
          minImageCount: 1,
          maxImageCount: 2,
          cropEnabled: true,
        },
      },
    ],
  },
  {
    productId: "fixture-product-glass-light-picture",
    configurationRevision: "fixture-customization-revision-glass-light-picture-v1",
    fields: [
      {
        id: "fixture-customization-field-glass-light-picture-reference-image",
        productId: "fixture-product-glass-light-picture",
        code: "development-reference-image",
        label: "Development reference image",
        kind: "image",
        required: true,
        isActive: true,
        position: 0,
        configurationRevision: "fixture-customization-revision-glass-light-picture-v1",
        constraints: {
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
          maxBytes: 5_000_000,
          minDimensions: { width: 600, height: 400 },
          minImageCount: 1,
          maxImageCount: 1,
          cropEnabled: false,
        },
      },
      {
        id: "fixture-customization-field-glass-light-picture-caption",
        productId: "fixture-product-glass-light-picture",
        code: "development-caption",
        label: "Development short text",
        kind: "short_text",
        required: false,
        isActive: true,
        position: 1,
        configurationRevision: "fixture-customization-revision-glass-light-picture-v1",
        constraints: {
          maxLength: 80,
          helpText: "Synthetic development fixture field.",
        },
      },
    ],
  },
  {
    productId: "fixture-product-digital-portrait",
    configurationRevision: "fixture-customization-revision-digital-portrait-v1",
    fields: [
      {
        id: "fixture-customization-field-digital-portrait-brief",
        productId: "fixture-product-digital-portrait",
        code: "development-brief",
        label: "Development long text",
        kind: "long_text",
        required: false,
        isActive: true,
        position: 0,
        configurationRevision: "fixture-customization-revision-digital-portrait-v1",
        constraints: {
          maxLength: 500,
          helpText: "Synthetic development fixture field.",
        },
      },
    ],
  },
  {
    productId: "fixture-product-temporary-tattoo",
    configurationRevision: "fixture-customization-revision-temporary-tattoo-v1",
    fields: [],
  },
] as const;

function parseFixtureConfiguration(
  definition: (typeof developmentCustomizationFieldFixtureDefinitions)[number],
): ProductCustomizationFieldConfiguration {
  const parsed = normalizeCustomizationFieldConfiguration(definition.productId, definition);
  if (parsed.status !== "found") {
    throw new Error(`Invalid development customization fixture: ${definition.productId}`);
  }
  return parsed.value;
}

/**
 * Returns new deterministic values on every call so fixture consumers cannot
 * mutate the module-level definitions shared by other local tests.
 */
export function createDevelopmentCustomizationFieldFixtures(): readonly ProductCustomizationFieldConfiguration[] {
  return developmentCustomizationFieldFixtureDefinitions.map(parseFixtureConfiguration);
}
