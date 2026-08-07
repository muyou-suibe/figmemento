# Foundation verification evidence

Completed for OpenSpec change `stabilize-photogift-foundation` on 2026-08-07.

## Final gates

| Gate | Result | Evidence |
|---|---|---|
| `npm run lint` | Pass | ESLint exited 0 without disabling rules. |
| `npm run typecheck` | Pass | Strict TypeScript exited 0 with active application and Worker code included. |
| `npm run test:offline` | Pass | 17 tests passed with controlled values, repositories, and storage callbacks; no live third-party API was invoked. |
| `npm run build` | Pass | vinext completed all five production build environments and included `/api/products`. |
| `npm run test:rendered` | Pass | The built storefront rendered its shell and catalog loading state without embedding a fixture product. |
| `npm run verify` | Pass | The aggregate command ran every gate above in an attributable order and exited 0. |

## Production product-source audit

- `/api/products` creates a server-controlled repository.
- Supabase is the default and authoritative source.
- Fixture selection requires `PHOTOGIFT_PRODUCT_SOURCE=fixture` and an explicit `NODE_ENV` of `development` or `test`.
- Production or an unspecified runtime mode rejects fixture selection.
- Supabase configuration/query failures return a controlled unavailable response; there is no fallback branch to fixture data.
- The rendered storefront test asserts that the server HTML does not contain the representative fixture product.

## Infrastructure and migration audit

- Runtime-required vinext, Vite, Worker, Sites, and Cloudflare metadata paths remain.
- The optional D1 branch in `vite.config.ts` remains inactive and available.
- Root D1/Drizzle package scripts, dependencies, TypeScript/lint participation, and deployment packaging are isolated.
- `examples/d1/` remains in the repository as explicitly excluded example material.
- The production build packages only `dist/.openai/hosting.json`; it does not package root Drizzle output.
- No file under `supabase/` changed, and no `supabase/migrations/` business migration was created or applied.

## Security and scope audit

- Only `.env.example` is tracked among `.env*` files; local environment files remain ignored.
- A repository scan for common Supabase, Stripe, webhook, and assigned secret patterns returned no matching source file.
- Browser configuration exposes only allowlisted public values; server secrets are read through integration-scoped configuration functions.
- The implementation contains no `@ts-ignore`, `@ts-nocheck`, broad `any`, or disabled strictness in active application/test code.
- No Product/SKU business schema, customer authentication, PayPal, production-preview workflow, final storage-provider choice, or new Stripe expected amount/currency verification was added.

## Deferred assumptions

The remaining prototype gaps continue to be tracked in [`deferred-assumptions.md`](./deferred-assumptions.md). They must not be treated as desired behavior by later changes. In particular, expected Stripe amount/currency verification belongs to `integrate-stripe-and-paypal-payments`.
