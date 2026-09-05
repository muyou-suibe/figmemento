import type { ProductArt } from "../../domain/product.ts";
import type { CatalogDataSet } from "../../application/catalog-data-set.ts";
import type { ProductVariant } from "../../domain/catalog/index.ts";

export const DEVELOPMENT_CATALOG_FIXTURE_NOTICE =
  "Development/test catalog only. Never use as production migration or fallback data.";

export const DEVELOPMENT_CATEGORY_IDS = {
  "3d-figures": "5e040e93-7924-479e-87b6-04d6126ff31f",
  "custom-crafts": "72f2a9c8-bd21-4bbe-814a-b18e727cd012",
  "pet-memories": "201e2667-9e03-46ed-bb2f-153f3d6c1e40",
  "digital-gifts": "45a2ff1d-9429-43f1-8e7b-ddc92d0114c5",
} as const;

export type DevelopmentCategorySlug = keyof typeof DEVELOPMENT_CATEGORY_IDS;

export interface DevelopmentCatalogFixtureDefinition {
  slug: string;
  name: string;
  categorySlug: DevelopmentCategorySlug;
  priceCents: number;
  description: string;
  art: ProductArt;
  tag?: string;
}

// These values are deterministic UI/test inputs. They are deliberately not
// imported by migrations or the production Supabase data source.
export const developmentCatalogFixtureDefinitions: readonly DevelopmentCatalogFixtureDefinition[] = [
  { slug: "couple-figure", name: "Custom Couple Figure", categorySlug: "3d-figures", priceCents: 6_990, tag: "Best seller", description: "Turn your favorite moment into a tiny keepsake.", art: "figure" },
  { slug: "pet-figure", name: "Pet Portrait Figurine", categorySlug: "pet-memories", priceCents: 4_590, tag: "Made for them", description: "A little portrait of the one who is always there.", art: "pet" },
  { slug: "solo-figure", name: "Photo to Mini Figure", categorySlug: "3d-figures", priceCents: 3_990, description: "A joyful, hand-finished figure made from your photo.", art: "portrait" },
  { slug: "bobblehead", name: "Custom Bobblehead", categorySlug: "3d-figures", priceCents: 5_990, description: "A playful bobblehead made from a favorite person or pet.", art: "figure" },
  { slug: "brick-person", name: "Photo Brick Figure", categorySlug: "3d-figures", priceCents: 4_990, description: "A tiny brick-style keepsake built around your favorite face.", art: "figure" },
  { slug: "pixel-cube", name: "Custom Pixel Photo Cube", categorySlug: "3d-figures", priceCents: 3_490, description: "A colorful desk piece built from your favorite faces.", art: "cube" },
  { slug: "figurine-keychain", name: "3D Printed Figurine Keychain", categorySlug: "3d-figures", priceCents: 3_990, description: "A tiny personalized keepsake you can carry with you.", art: "figure" },
  { slug: "pet-portrait", name: "Custom Pet Portrait", categorySlug: "pet-memories", priceCents: 2_790, description: "A thoughtful portrait of the companion who is always there.", art: "pet" },
  { slug: "glass-light-picture", name: "Custom Glass Light Picture", categorySlug: "custom-crafts", priceCents: 3_990, description: "Turn a meaningful image into a glowing keepsake.", art: "portrait" },
  { slug: "leaf-engraving", name: "Leaf Engraved Picture", categorySlug: "custom-crafts", priceCents: 2_190, description: "A delicate engraved keepsake inspired by your favorite memory.", art: "portrait" },
  { slug: "fridge-magnet", name: "Custom Fridge Magnet", categorySlug: "custom-crafts", priceCents: 1_290, description: "Keep a favorite face close with a custom everyday magnet.", art: "portrait" },
  { slug: "custom-puzzle", name: "Custom Photo Puzzle", categorySlug: "custom-crafts", priceCents: 2_490, description: "Piece together a memory made for a slow, happy afternoon.", art: "cube" },
  { slug: "crystal-frame", name: "Crystal Photo Frame", categorySlug: "custom-crafts", priceCents: 2_990, description: "A polished crystal keepsake for a photo worth displaying.", art: "portrait" },
  { slug: "wood-engraving", name: "Custom Wood Engraving", categorySlug: "custom-crafts", priceCents: 2_290, description: "A warm engraved wood piece made for your favorite story.", art: "portrait" },
  { slug: "herbal-tattoo", name: "Herbal Temporary Tattoo Set", categorySlug: "custom-crafts", priceCents: 1_290, description: "A small set of personalized temporary designs to share.", art: "portrait" },
  { slug: "temporary-tattoo", name: "Custom Temporary Tattoos", categorySlug: "custom-crafts", priceCents: 990, description: "Turn your artwork or memory into a playful temporary tattoo.", art: "portrait" },
  { slug: "custom-pillow", name: "Custom Photo Pillow", categorySlug: "custom-crafts", priceCents: 2_490, description: "A soft personalized pillow made from a photo you love.", art: "portrait" },
  { slug: "phone-case", name: "Custom Phone Case", categorySlug: "custom-crafts", priceCents: 1_490, description: "Carry a favorite memory with you every day.", art: "portrait" },
  { slug: "digital-portrait", name: "AI Illustrated Portrait", categorySlug: "digital-gifts", priceCents: 990, tag: "Instant delivery", description: "A ready-to-share illustrated portrait, delivered digitally.", art: "digital" },
  { slug: "ai-oil-portrait", name: "AI Oil Painting Portrait", categorySlug: "digital-gifts", priceCents: 1_290, description: "A painterly digital portrait ready to download and share.", art: "digital" },
  { slug: "digital-wallpaper", name: "Digital Wallpaper Illustration", categorySlug: "digital-gifts", priceCents: 790, description: "A personalized wallpaper or couple illustration for your screen.", art: "digital" },
  { slug: "pet-memorial", name: "Always With You Portrait", categorySlug: "pet-memories", priceCents: 2_990, description: "A gentle memorial portrait for a friend you never forget.", art: "pet" },
];

const categoryDefinitions = [
  { id: DEVELOPMENT_CATEGORY_IDS["3d-figures"], slug: "3d-figures", name: "3D Figures", description: "Development fixtures for dimensional personalized figures." },
  { id: DEVELOPMENT_CATEGORY_IDS["custom-crafts"], slug: "custom-crafts", name: "Custom Crafts", description: "Development fixtures for personalized craft gifts." },
  { id: DEVELOPMENT_CATEGORY_IDS["pet-memories"], slug: "pet-memories", name: "Pet Memories", description: "Development fixtures for meaningful pet keepsakes." },
  { id: DEVELOPMENT_CATEGORY_IDS["digital-gifts"], slug: "digital-gifts", name: "Digital Gifts", description: "Development fixtures for personalized digital gifts." },
] as const;

const COUPLE_FIGURE_PRODUCT_ID = "fixture-product-couple-figure";
const COUPLE_FIGURE_SIZE_OPTION_ID = "fixture-option-couple-figure-size";
const COUPLE_FIGURE_SIZE_VALUE_IDS = {
  mini: "fixture-value-couple-figure-size-mini",
  standard: "fixture-value-couple-figure-size-standard",
  deluxe: "fixture-value-couple-figure-size-deluxe",
} as const;

const coupleFigureOptions: CatalogDataSet["options"] = [
  {
    id: COUPLE_FIGURE_SIZE_OPTION_ID,
    productId: COUPLE_FIGURE_PRODUCT_ID,
    code: "size",
    name: "Size",
    kind: "size",
    required: true,
    position: 0,
  },
];

const coupleFigureOptionValues: CatalogDataSet["optionValues"] = [
  {
    id: COUPLE_FIGURE_SIZE_VALUE_IDS.mini,
    productId: COUPLE_FIGURE_PRODUCT_ID,
    optionId: COUPLE_FIGURE_SIZE_OPTION_ID,
    code: "mini",
    label: "Mini",
    position: 0,
  },
  {
    id: COUPLE_FIGURE_SIZE_VALUE_IDS.standard,
    productId: COUPLE_FIGURE_PRODUCT_ID,
    optionId: COUPLE_FIGURE_SIZE_OPTION_ID,
    code: "standard",
    label: "Standard",
    position: 1,
  },
  {
    id: COUPLE_FIGURE_SIZE_VALUE_IDS.deluxe,
    productId: COUPLE_FIGURE_PRODUCT_ID,
    optionId: COUPLE_FIGURE_SIZE_OPTION_ID,
    code: "deluxe",
    label: "Deluxe",
    position: 2,
  },
];

const coupleFigureVariants: readonly ProductVariant[] = [
  {
    id: "fixture-variant-couple-figure-mini",
    productId: COUPLE_FIGURE_PRODUCT_ID,
    skuCode: "DEV-COUPLE-FIGURE-MINI",
    priceCents: 6_990,
    currency: "USD",
    weightGrams: 450,
    isActive: true,
    isAvailable: true,
    isDefault: true,
    supplyMethod: "made_to_order",
    selectedOptions: [
      {
        optionId: COUPLE_FIGURE_SIZE_OPTION_ID,
        valueId: COUPLE_FIGURE_SIZE_VALUE_IDS.mini,
      },
    ],
  },
  {
    id: "fixture-variant-couple-figure-standard",
    productId: COUPLE_FIGURE_PRODUCT_ID,
    skuCode: "DEV-COUPLE-FIGURE-STANDARD",
    priceCents: 8_990,
    currency: "USD",
    weightGrams: 450,
    isActive: true,
    isAvailable: true,
    isDefault: false,
    supplyMethod: "made_to_order",
    selectedOptions: [
      {
        optionId: COUPLE_FIGURE_SIZE_OPTION_ID,
        valueId: COUPLE_FIGURE_SIZE_VALUE_IDS.standard,
      },
    ],
  },
  {
    id: "fixture-variant-couple-figure-deluxe",
    productId: COUPLE_FIGURE_PRODUCT_ID,
    skuCode: "DEV-COUPLE-FIGURE-DELUXE",
    priceCents: 10_990,
    currency: "USD",
    weightGrams: 450,
    isActive: true,
    isAvailable: false,
    isDefault: false,
    supplyMethod: "made_to_order",
    selectedOptions: [
      {
        optionId: COUPLE_FIGURE_SIZE_OPTION_ID,
        valueId: COUPLE_FIGURE_SIZE_VALUE_IDS.deluxe,
      },
    ],
  },
];

export function createDevelopmentCatalogFixtures(): CatalogDataSet {
  const products = developmentCatalogFixtureDefinitions.map((definition) => ({
    id: `fixture-product-${definition.slug}`,
    slug: definition.slug,
    categoryId: DEVELOPMENT_CATEGORY_IDS[definition.categorySlug],
    name: definition.name,
    description: definition.description,
    seo: {},
    lifecycle: "published" as const,
  }));
  const variants = developmentCatalogFixtureDefinitions.flatMap((definition) => {
    if (definition.slug === "couple-figure") {
      return coupleFigureVariants;
    }
    const digital = definition.categorySlug === "digital-gifts";
    return [{
      id: `fixture-variant-${definition.slug}`,
      productId: `fixture-product-${definition.slug}`,
      skuCode: `DEV-${definition.slug.toUpperCase()}`,
      priceCents: definition.priceCents,
      currency: "USD" as const,
      weightGrams: digital ? 0 : definition.categorySlug === "3d-figures" ? 450 : 300,
      isActive: true,
      isAvailable: true,
      isDefault: true,
      supplyMethod: digital ? "digital_delivery" as const : "made_to_order" as const,
      selectedOptions: [],
    }];
  });
  const fulfillmentConfigs = developmentCatalogFixtureDefinitions.map((definition) => {
    const digital = definition.categorySlug === "digital-gifts";
    return {
      id: `fixture-fulfillment-${definition.slug}`,
      productId: `fixture-product-${definition.slug}`,
      fulfillmentType: digital ? "digital" as const : "physical" as const,
      requiresShipping: !digital,
      productionMode: digital ? "digital_creation" as const : "custom_manufacturing" as const,
      leadTime: digital
        ? { minBusinessDays: 1, maxBusinessDays: 2 }
        : { minBusinessDays: 5, maxBusinessDays: 10 },
    };
  });
  return {
    categories: categoryDefinitions.map((category) => ({
      ...category,
      seo: {},
      lifecycle: "published" as const,
    })),
    products,
    options: coupleFigureOptions,
    optionValues: coupleFigureOptionValues,
    variants,
    assets: developmentCatalogFixtureDefinitions.map((definition) => ({
      id: `fixture-asset-${definition.slug}`,
      productId: `fixture-product-${definition.slug}`,
      mediaType: "image" as const,
      role: "thumbnail" as const,
      position: 0,
      altText: `${definition.name} development fixture`,
      visibility: "public" as const,
      source: {
        kind: "public_reference" as const,
        value: `marketing:development-catalog/${definition.slug}/thumbnail`,
      },
    })),
    fulfillmentConfigs,
  };
}
