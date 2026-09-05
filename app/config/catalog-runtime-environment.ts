import type { RuntimeEnvironment } from "./server.ts";

/**
 * Server-only bridge between Worker text bindings and vinext's authoritative
 * runtime mode. Keep this module out of client component imports.
 */
export function createCatalogRuntimeEnvironment(
  environment?: RuntimeEnvironment,
  runtimeMode?: string,
): RuntimeEnvironment {
  const productSource = environment
    ? environment.PHOTOGIFT_PRODUCT_SOURCE
    : process.env.PHOTOGIFT_PRODUCT_SOURCE;
  const authoritativeRuntimeMode = runtimeMode
    ?? (environment ? environment.NODE_ENV : process.env.NODE_ENV);

  return {
    PHOTOGIFT_PRODUCT_SOURCE: productSource,
    NODE_ENV: authoritativeRuntimeMode,
  };
}
