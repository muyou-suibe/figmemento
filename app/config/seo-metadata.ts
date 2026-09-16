import type { Metadata } from "next";
import { brandName } from "./identity.ts";
import type { SeoPolicy } from "./seo-policy.ts";

const siteDescription = "Personalized keepsakes made from your favorite people, pets and moments.";
const siteTitle = `${brandName} — Little pieces of the people you love`;

export function buildRootMetadata(policy: SeoPolicy): Metadata {
  const canonicalUrl = policy.canonicalOrigin ? `${policy.canonicalOrigin}/` : undefined;
  return {
    title: siteTitle,
    description: siteDescription,
    keywords: ["personalized gifts", "custom keepsakes", "photo gifts", "pet memorial gifts"],
    applicationName: brandName,
    authors: [{ name: brandName }],
    ...(canonicalUrl
      ? {
          metadataBase: new URL(canonicalUrl),
          alternates: { canonical: canonicalUrl },
        }
      : {}),
    robots: policy.robots,
    openGraph: {
      type: "website",
      siteName: brandName,
      title: siteTitle,
      description: siteDescription,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
    },
    twitter: {
      card: "summary",
      title: siteTitle,
      description: siteDescription,
    },
    icons: { icon: "/brand/figmemento-logo.png", shortcut: "/brand/figmemento-logo.png" },
  };
}

export function buildWebSiteStructuredData(policy: SeoPolicy): Record<string, string> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brandName,
    description: siteDescription,
    ...(policy.canonicalOrigin ? { url: `${policy.canonicalOrigin}/` } : {}),
  };
}
