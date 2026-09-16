# Local Checkout: Development and Demo Boundary

`build-local-checkout-runtime` adds a local development/test Checkout
evaluation. It revalidates the current Cart and returns a server-derived local
summary. It does not create an Order, collect payment, reserve inventory, or
change production state.

## Prerequisites

Use an ignored local environment file or an equivalent local shell environment.
Do not commit its values and do not set `NODE_ENV` manually: vinext supplies
the runtime mode.

```dotenv
PHOTOGIFT_PRODUCT_SOURCE=fixture
CART_SOURCE=local_fake
CUSTOMER_UPLOAD_SOURCE=local_fake
LOCAL_CHECKOUT_SOURCE=local_fake
PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET=<local-only-secret-at-least-32-characters>
PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS=3600
```

No Supabase, storage-provider, Stripe, PayPal, Resend, or tracking credential
is required for this local flow. `local_fake` is accepted only in development
or test; production rejects it. A failed authoritative source must not fall
back to these fixtures.

Run the focused contracts before using the UI:

```sh
node --experimental-strip-types --test \
  tests/local-checkout-foundation.test.mjs \
  tests/local-checkout-evaluator.test.mjs \
  tests/local-checkout-http.test.mjs
```

Then start the local Worker:

```sh
npm run dev
```

Open `http://localhost:3000` and use the public fixture catalog.

## Fixture behavior

Everything in this section is **DEVELOPMENT / TEST ONLY**.

- Shipping accepts `US` plus `local_standard`, derives USD 5.00, and displays
  `Local demo estimate: 5–10 business days`. It is not a carrier, supplier, or
  production quote.
- `WELCOME10` produces a server-derived USD 10.00 discount only when the
  current authoritative subtotal is at least USD 50.00. `UNKNOWN`, `EXPIRED10`,
  and `NOT_APPLICABLE` continue with their stated status and USD 0 discount.
- Tax remains `tax.status = not_activated` and `tax.amount = null`. The UI
  must say tax is not activated; it must not present tax as USD 0.00.
- `localDemoTotal = subtotal + shipping - discount` is development/test
  arithmetic only. It is not payable, charged, price-locked, or an Order
  authorization.

## Browser flow

Use the physical `glass-light-picture` fixture for the local physical path:

1. Open its Product page and provide the required image customization. The
   optional short-text field may also be filled.
2. Upload a valid image through the local CustomerUpload flow and add the
   configured item to Cart.
3. Open Cart and choose **Review local checkout**.
4. Enter contact and structural address fields, select US and
   `local_standard`, then submit the local review.
5. Verify the tax-not-activated notice and the non-payable Local demo total.

Submit an unsupported country or method to verify a bounded shipping failure.
Try the listed coupon codes to observe their safe server-derived outcomes.

## Fixture coverage limitation

There is no public physical, shipping-required, text-only fixture Product:

- `couple-figure` is physical and image-configured.
- `glass-light-picture` is physical and image plus optional short-text.
- `digital-portrait` is text-only but digital and not shipping-required.

Text-only Checkout capability is nevertheless covered by deterministic
shipping-required domain/HTTP integration: a valid text-only configured line
does not need a CustomerUpload owner or receipt. Do not add a fake public
physical text-only Product, force the digital fixture through shipping
Checkout, or infer a digital Checkout/delivery branch from this local runtime.

## Restart limitation and troubleshooting

Local Cart and CustomerUpload receipt stores are process memory. Restarting the
Worker loses both. A previous image receipt cannot be restored from a browser
cookie, localStorage, a file, or Cart identity; image validation fails closed.
The browser may therefore show an empty Cart after restart rather than an
image-receipt error. The deterministic fresh-process test remains the stable
evidence for old-receipt rejection.

If local Checkout is unavailable, verify all five local prerequisite values,
especially the guest-owner secret and TTL. Do not add provider credentials or
switch to a production source merely to make the local demo run.

## Explicit production exclusions

This boundary does not implement Orders, OrderItems, Order snapshots, payment,
Stripe, PayPal, webhooks, inventory, production, tracking, digital delivery,
remote Supabase, database migration, a storage-provider decision, production
shipping/tax, DNS, or deployment.
