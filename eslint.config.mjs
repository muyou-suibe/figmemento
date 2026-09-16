import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated local Supabase runtime artifacts are not application source.
    "local/commerce/runtime/**",
    // Retained D1/Drizzle example and template material is not part of the
    // active PhotoGift Supabase application.
    "db/**",
    "drizzle/**",
    "drizzle.config.ts",
    "examples/d1/**",
  ]),
]);

export default eslintConfig;
