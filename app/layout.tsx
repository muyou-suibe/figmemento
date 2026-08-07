import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "./site-config";

export const metadata: Metadata = {
  title: `${siteConfig.brandName} — Little pieces of the people you love`,
  description: "Personalized keepsakes made from your favorite people, pets and moments.",
  keywords: ["personalized gifts", "custom keepsakes", "photo gifts", "pet memorial gifts"],
  applicationName: siteConfig.brandName,
  authors: [{ name: siteConfig.brandName }],
  openGraph: {
    type: "website",
    siteName: siteConfig.brandName,
    title: `${siteConfig.brandName} — Little pieces of the people you love`,
    description: "Personalized keepsakes made from your favorite people, pets and moments.",
  },
  twitter: {
    card: "summary",
    title: `${siteConfig.brandName} — Little pieces of the people you love`,
    description: "Personalized keepsakes made from your favorite people, pets and moments.",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.brandName,
    description: "Personalized keepsakes made from your favorite people, pets and moments.",
    potentialAction: { "@type": "SearchAction", target: "/?q={search_term_string}", "query-input": "required name=search_term_string" },
  };
  return <html lang="en"><body>{children}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /></body></html>;
}
