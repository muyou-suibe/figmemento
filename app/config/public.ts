export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export type PublicSiteConfig = {
  siteUrl: string;
  brandName: string;
};

export class PublicConfigurationError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Missing public configuration: ${key}`);
    this.name = "PublicConfigurationError";
    this.key = key;
  }
}

function required(value: string | undefined, key: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new PublicConfigurationError(key);
  return normalized;
}

export function parsePublicSupabaseConfig(input: {
  url?: string;
  publishableKey?: string;
}): PublicSupabaseConfig {
  return {
    url: required(input.url, "NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: required(input.publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  return parsePublicSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function parsePublicSiteConfig(input: {
  siteUrl?: string;
  brandName?: string;
}): PublicSiteConfig {
  return {
    siteUrl: input.siteUrl?.trim() || "http://localhost:3002",
    brandName: input.brandName?.trim() || "PhotoGift",
  };
}

export function getPublicSiteConfig(): PublicSiteConfig {
  return parsePublicSiteConfig({
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    brandName: process.env.NEXT_PUBLIC_BRAND_NAME,
  });
}
