import type { Metadata } from "next";
import "./globals.css";
import { buildRootMetadata, buildWebSiteStructuredData } from "./config/seo-metadata.ts";
import { getSeoPolicy } from "./config/seo-policy.ts";

const seoPolicy = getSeoPolicy();
export const metadata: Metadata = buildRootMetadata(seoPolicy);
const referenceFontStylesheet = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Lato:ital,wght@0,300;0,400;0,700;0,900;1,400;1,700&family=Caveat:wght@400;600;700&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@600;700&display=swap";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = buildWebSiteStructuredData(seoPolicy);
  return <html lang="en"><head><link rel="stylesheet" href={referenceFontStylesheet} /></head><body>{children}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /></body></html>;
}
