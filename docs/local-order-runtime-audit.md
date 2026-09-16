# Local Order Runtime Boundary Audit

Status: implementation Batch A audit, development/test only.

## Reusable authority seams

- `app/server/shopping-cart-runtime.server.ts` resolves the server-owned Cart
  through the existing HttpOnly Cart cookie and local Cart provider.
- `app/application/order-catalog-resolution.ts` re-resolves public Product,
  Variant/SKU, selected options, availability, and authoritative USD base price.
- `app/application/configured-item-handoff-acceptance.ts` is the current
  server-only customization/configuration/receipt acceptance boundary.
- `app/application/configured-item-order-compatibility.ts` maps an already
  accepted handoff into a controlled customization snapshot shape; it does not
  perform authority checks or persistence.
- `app/server/customer-upload-runtime.server.ts` resolves owner-scoped receipt
  authority for image customization. Email, address, Cart identity, account
  identity, or a browser receipt ID cannot replace that owner check.
- `app/application/local-checkout-evaluator.ts` contains the current local
  shipping, coupon, tax, and arithmetic semantics. Its accepted result remains
  a read-only observation and is not Local Order authority.

## Non-reusable or deferred paths

- `app/domain/order.ts` contains request/lookup compatibility shapes and does
  not provide an immutable Local Order snapshot or local lifecycle.
- `app/application/normalized-order-request-boundary.ts` is a compatibility
  parser/acceptance seam; it is not a browser-authoritative Order creator.
- `app/application/legacy-order-compatibility.ts` is the temporary C1
  Product-slug/default-Variant adapter and is not used as the Local Order path.
- `/api/orders`, `/api/order-lookup`, Admin Order routes, and their Supabase
  repositories are production/legacy boundaries and remain excluded.
- C1 Tasks 3.8 and 7.4 remain deferred production OrderItem snapshot work.
  This local runtime does not complete, bypass, or modify those tasks.

## Local Order boundary

The new Local Order runtime accepts only structural checkout fields and an
opaque creation attempt selector. It performs fresh server evaluation and
stores only a process-memory immutable snapshot. It has no Supabase, migration,
payment, fulfillment, storage-provider, or deployment side effect.
