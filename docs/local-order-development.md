# Local Order Runtime: Local Development

This is a **DEVELOPMENT / TEST ONLY** runtime. It creates an immutable
process-memory Local Order from a fresh server evaluation of the current Cart.
It is not production Order persistence.

## Prerequisites

Use an ignored `.env.local` file or an equivalent local shell environment. Do
not print or commit values, do not add `NODE_ENV`, and do not use real provider
secrets.

```dotenv
PHOTOGIFT_PRODUCT_SOURCE=fixture
CART_SOURCE=local_fake
CUSTOMER_UPLOAD_SOURCE=local_fake
LOCAL_CHECKOUT_SOURCE=local_fake
LOCAL_ORDER_SOURCE=local_fake
PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET=<local-only-secret>
PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS=<local-ttl>
```

`vinext` supplies the runtime mode. `LOCAL_ORDER_SOURCE` is disabled when
absent and is rejected in production. A Supabase or provider failure never
falls back to this process-memory runtime.

Run the local Worker with:

```sh
npm run dev
```

Open `http://localhost:3000`, then use the physical
`glass-light-picture` fixture for the real image flow.

## Local Order behavior

- Creation fresh-reads Cart, Product/Variant/SKU, customization, receipt
  ownership where required, shipping, coupon, tax, and arithmetic authority.
- The stored snapshot is immutable and remains readable only while the local
  process is alive.
- `pending_payment` and `paymentStatus = pending` mean that payment has not
  occurred. No Payment entity, session, authorization, capture, or webhook is
  created.
- `localArithmeticTotal` is development/test arithmetic only. It is not
  payable, charged, price-locked, or payment-authorized.
- The Cart is preserved after creation: lines, quantities, and customization
  remain available for another explicit attempt.

## Retry and access semantics

- The client creates one opaque `creationAttemptId` per explicit lifecycle.
- While submitting, the CTA is guarded. Transport retries reuse the same
  selector and the same fresh server context.
- An equivalent retry returns the original public reference and does not create
  another Local Order. If the response or `Set-Cookie` was lost, the server can
  reissue the same-browser access cookie.
- A later explicit lifecycle uses a new selector and may create another Local
  Order, including from the preserved Cart.
- One opaque HttpOnly, SameSite local access capability can authorize multiple
  Local Order references in the running process.
- A public reference is only an identifier; it is never authorization. The
  capability is not returned in JSON, URLs, or the DOM.
- Restarting the Worker loses process-memory Orders and access bindings. Reads
  then fail closed without reconstructing state from Cart, localStorage, files,
  Supabase, or another persistence source.

## Fixture coverage

There is no public physical, shipping-required, text-only Product fixture.

- `glass-light-picture` is physical with required image and optional text.
- `couple-figure` is physical and image-configured.
- `digital-portrait` is text-only but digital and is not routed through
  shipping Checkout.
- Shipping-required text-only behavior is covered by deterministic domain/HTTP
  integration using a synthetic test Catalog only. No fake public Product was
  added and no Digital Checkout was implemented.

## Image privacy

Image customization is revalidated from the current owner-scoped active
receipt at Local Order creation. The protected snapshot may retain the
controlled receipt reference and accepted crop facts. Public Order JSON and
the success page omit owner IDs, storage keys, bucket/provider locators,
signed URLs, capabilities, and private upload content.

## Future production handoff

This runtime does not implement durable Order/OrderItem persistence. A future
production change must separately define and verify:

- Supabase Order and OrderItem snapshots and migration ordering;
- durable guest access and authorization;
- production shipping and tax authority;
- payment and webhook semantics;
- email, fulfillment, tracking, and operational state.

Do not treat this Local Order, its public reference, its process-memory access
cookie, or its local arithmetic total as production authority.

## Explicit exclusions

No Payment, Stripe, PayPal, webhook, Supabase write, migration, storage-provider
decision, production shipping/tax, fulfillment, tracking, digital delivery,
email, DNS, Cloudflare deployment, or C1 backfill is part of this runtime.
