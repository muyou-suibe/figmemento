/**
 * Provider-neutral public identity facts approved for the FigMemento brand.
 * This module intentionally contains no environment values or secrets.
 */
export const brandName = "FigMemento" as const;
export const productionOrigin = "https://figmemento.com" as const;
export const canonicalHostname = "figmemento.com" as const;
export const stagingHostname = "staging.figmemento.com" as const;

export const publicIdentity = {
  brandName,
  productionOrigin,
  canonicalHostname,
  stagingHostname,
} as const;
