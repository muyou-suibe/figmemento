import { brandName, canonicalHostname, productionOrigin } from "./config/identity.ts";

export const siteConfig = {
  brandName,
  domain: canonicalHostname,
  productionOrigin,
  shippingThreshold: 49,
  candidateCategories: ["3D keepsakes", "Pet memories", "Digital gifts"],
} as const;
