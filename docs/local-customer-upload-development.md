# Local CustomerUpload development

## Status

This document describes the development/test-only `local_fake` CustomerUpload
runtime. It is process-local evidence for the upload → preview → Cart Add →
Checkout Readiness path. It is not production storage, receipt persistence, or
checkout authorization.

## Prerequisites

- Node.js `>=22.13.0`
- Dependencies installed with `npm install`
- No live Supabase, Storage provider, R2 bucket, provider SDK, migration, or
  production credential is required

Use a local-only signing value for the guest-owner cookie. Do not reuse a
production secret and do not commit `.env.local`.

## Local configuration

The ignored `.env.local` may contain only local development values such as:

```dotenv
PHOTOGIFT_PRODUCT_SOURCE=fixture
CUSTOMER_UPLOAD_SOURCE=local_fake
CART_SOURCE=local_fake
PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET=replace-with-a-local-only-32-plus-character-value
PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS=3600
```

`NODE_ENV=development` is supplied by the development runtime and should not
be used as a browser or production binding. Do not add Supabase, Stripe,
PayPal, Resend, 17TRACK, Storage, R2, or other provider credentials for this
flow.

## Start and verify

Run the normal local development server:

```bash
npm run dev
```

The relevant local routes are:

- `POST /api/uploads?productId=<productId>&fieldId=<fieldId>`
- `GET /api/customer-uploads/preview?receiptId=<opaque-receipt-id>`
- `POST /api/cart`
- `GET /api/checkout-readiness`

The browser sends only the multipart `file` plus the non-authoritative
Product/field selectors. The server re-resolves Product, Variant,
CustomizationField, guest owner, and receipt authority.

The focused local runtime test can be run with:

```bash
node --experimental-strip-types --test \
  tests/customer-upload-local-runtime.test.mjs \
  tests/shopping-cart.test.mjs \
  tests/checkout-readiness.test.mjs
```

The full local gates are:

```bash
npm run test:offline
npm run lint
npm run typecheck
npm run build
npm run test:rendered
openspec validate --all --strict
git diff --check
```

## Same-process limitation

Objects and receipts are held in one server process/Worker instance. A restart,
hot reload that replaces the instance, another Worker, or another server does
not recover them. Subsequent preview, Cart Add, and readiness checks fail
closed. Restarting is therefore a deliberate local failure test, not a
durability guarantee.

The Cart cookie and guest-owner cookie are separate. Cart identity never
authorizes a private upload. Cart Add and Checkout Readiness use the same
verified guest owner and the same local receipt repository only when the Cart
line contains an image receipt. Text-only configured items remain independent
of CustomerUpload source availability.

## Safety boundaries

- Receipt IDs are opaque; object locators, owner IDs, and private bytes never
  enter browser responses.
- Preview is owner-scoped and `private, no-store`.
- Each explicit successful upload POST is an independent attempt; no retry
  deduplication or idempotency is promised.
- `CUSTOMER_UPLOAD_SOURCE=disabled`, invalid source, missing owner authority,
  source failure, and production `local_fake` fail closed.
- A local success does not authorize production provider selection, retention,
  cleanup, scaling, Order/OrderItem persistence, checkout, or payment.

## Troubleshooting

- `503` from upload: verify `CUSTOMER_UPLOAD_SOURCE=local_fake`, development
  mode, and the local guest-owner configuration.
- `404` from upload: verify the exact bounded `productId` and `fieldId`; do not
  add whitespace or rely on Product slug inference.
- `400` from image Cart Add after a restart: upload again in the same runtime;
  the prior process-local receipt is intentionally gone.
- `UPLOAD_UNAVAILABLE` in readiness: the source is disabled/unavailable or the
  guest owner/receipt cannot be verified. This is a bounded local result.
- Never fix local failures by enabling a production provider or bypassing the
  server-owned Product/field/receipt checks.
