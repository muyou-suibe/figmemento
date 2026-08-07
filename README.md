# PhotoGift

PhotoGift is a personalized-gift ecommerce MVP built with a Next.js-compatible App Router, React, TypeScript, vinext/Vite, Cloudflare Workers, Supabase PostgreSQL, private object storage, and Stripe Checkout.

The confirmed product baseline is [`独立站构建项目需求.md`](./独立站构建项目需求.md). OpenSpec changes under `openspec/changes/` control implementation scope.

## Current architecture

- `app/domain/` contains provider-neutral contracts for the existing Product, Cart, Customization, Upload, Order, and Payment payloads.
- `app/application/` contains existing use-case logic that can be tested without live services.
- `app/infrastructure/` contains Supabase and explicit fixture adapters.
- `app/config/` separates browser-safe configuration from server-only secrets and validates integrations when they are used.
- `app/api/` contains the current product, upload, coupon, order, Stripe webhook, order-lookup, and admin transport routes.
- Supabase PostgreSQL is the authoritative MVP business database. PhotoGift business persistence does not use D1 or Drizzle.
- vinext/Vite builds the application for the Cloudflare Worker entry in `worker/index.ts`.

This foundation does not add the future Product/SKU schema, customer authentication, PayPal, production preview, shipping rules, or new Stripe validation behavior.

## Prerequisites

- Node.js `>=22.13.0`
- npm
- A Supabase project when using the authoritative product and business-data source

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Keep real credentials in ignored `.env*` files or in the hosting provider's runtime-secret configuration. Never commit them.

## Product source policy

Production always uses Supabase for product data. A missing Supabase configuration or failed product query produces an explicit unavailable state; the application never silently substitutes hardcoded products.

For deterministic local UI work, fixtures may be selected explicitly in a non-production `.env.local`:

```bash
PHOTOGIFT_PRODUCT_SOURCE=fixture
```

Fixture selection is rejected when `NODE_ENV=production`. Tests inject fixture repositories directly and do not read a developer's `.env.local`.

## Environment boundaries

Browser-safe values:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_BRAND_NAME`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (reserved for the current checkout UI boundary)

Server-only values:

- `SUPABASE_SECRET_KEY`
- `SUPABASE_UPLOAD_BUCKET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ADMIN_PASSWORD`
- `PHOTOGIFT_PRODUCT_SOURCE`

Additional R2, Resend, and tracking variables in `.env.example` are placeholders for later approved changes; C0 does not integrate them.

Cloudflare may inject server secrets after compilation. Modules therefore validate each required secret before the affected integration is first used, rather than requiring every secret during the production build.

## Verification gates

```bash
npm run lint
npm run typecheck
npm run test:offline
npm run build
npm run verify
```

`test:offline` uses controlled fakes and fixtures. It must not call live Supabase, Stripe, PayPal, Resend, 17TRACK, or other third-party services. Each gate remains separately runnable so failures identify their owner.

## Database migrations

Future business migrations use timestamped, ordered SQL under `supabase/migrations/`. See [`docs/database-migrations.md`](./docs/database-migrations.md) for baseline reconciliation, RLS/index/grant verification, deployment ordering, and rollback guidance.

The existing `supabase/schema.sql`, `seed.sql`, `coupons.sql`, and `operations.sql` files are legacy bootstrap inputs. They are not proof of the connected project's applied state and are not the template for new migrations. C0 creates or applies no business migration.

## D1 and Drizzle status

The Cloudflare runtime support in `vite.config.ts`, `worker/index.ts`, `build/sites-vite-plugin.ts`, and `.openai/hosting.json` remains active. The optional D1 branch in `vite.config.ts` is retained but currently has no configured binding.

Root D1/Drizzle template files are retained as inactive material and excluded from PhotoGift compilation, linting, package scripts, dependencies, and deployment output. `examples/d1/` is explicitly example-only and is not part of PhotoGift's business architecture. See [`docs/d1-drizzle-inventory.md`](./docs/d1-drizzle-inventory.md).

## Storage status

The prototype currently uses private Supabase Storage operations. The final choice between Supabase Storage and Cloudflare R2 is intentionally unresolved and must be made by a later private-upload/storage OpenSpec change. C0 does not make that architecture decision.

## Deferred work

Known prototype gaps are listed in [`docs/deferred-assumptions.md`](./docs/deferred-assumptions.md). In particular, Stripe webhook expected amount/currency verification is deferred to `integrate-stripe-and-paypal-payments` and is not implemented by this foundation change.
