# FigMemento Local Full-Chain Demo Runbook

This runbook is for the local development/test runtime only. It demonstrates
the existing storefront, Local Checkout, Local Order/Payment simulation,
Fulfillment, and Tracking boundaries. It does not represent production
commerce, payment authorization, durable persistence, shipping, or delivery.

## Prerequisites

- Node.js `>=22.13.0` and the repository dependencies installed.
- Work from the project root: `/Users/youmu/Documents/个性化礼品定制独立站`.
- Keep local values in an ignored `.env.local` or equivalent shell environment.
- Do not set `NODE_ENV` manually; vinext supplies the runtime mode.
- Do not print or record the guest-owner secret, Admin password, cookies,
  capabilities, tokens, or generated private identifiers.

The local selectors required for the full physical demo are:

```dotenv
PHOTOGIFT_PRODUCT_SOURCE=fixture
CART_SOURCE=local_fake
CUSTOMER_UPLOAD_SOURCE=local_fake
LOCAL_CHECKOUT_SOURCE=local_fake
LOCAL_ORDER_SOURCE=local_fake
LOCAL_PAYMENT_SOURCE=local_fake
LOCAL_FULFILLMENT_SOURCE=local_fake
LOCAL_FULFILLMENT_OPERATOR=enabled
LOCAL_TRACKING_SOURCE=local_fake
LOCAL_TRACKING_OPERATOR=enabled
ADMIN_ACCEPTANCE_SOURCE=local_fake
PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET=<SET YOUR LOCAL DEVELOPMENT SECRET>
PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS=3600
```

The selectors are non-production local choices. No Supabase, Storage, Stripe,
PayPal, carrier, 17TRACK, Resend, or other production provider credential is
needed for this demo. The Admin password, if the archived local Admin
acceptance path is shown, is a local secret and must remain outside this file.

## Start and verify

From the project root:

```sh
npm run verify
npm run dev
```

Open the URL printed by the `npm run dev` terminal. The normal URL is
`http://localhost:3000/`; if that port is occupied, use the actual printed
port (the Batch G recheck used `http://localhost:3001/`).

The storefront must show a `DEVELOPMENT / TEST ONLY` fixture notice. If the
notice is absent or the catalog is unavailable, stop and correct local
configuration; do not add provider credentials or fall back to production.

## 8–10 minute demo path

### 1. Storefront value (about 1 minute)

1. Open `/` and show the FigMemento editorial shell and a real catalog-backed
   product card.
2. Open `/shop`, then `/category/3d-figures`, to show real collection and
   category navigation. Point out the fixture notice; do not present fixtures
   as production catalog data.

### 2. Physical product configuration (about 2 minutes)

1. Open `/product/glass-light-picture`.
2. Confirm `Physical`, `Custom Manufacturing`, `Shipping Required`, and the
   5–10 business-day production estimate.
3. Select a real valid local image file that satisfies the displayed format,
   byte-size, and minimum-dimension requirements. The image preview is a
   customer-input preview, not a production mockup.
4. Optionally fill the short text field, wait for server acceptance, and add
   the configured item to Cart.

Do not use `digital-portrait` as the shipping-required demo product. There is
no public physical shipping-required text-only fixture by design.

### 3. Cart and Local Checkout (about 1 minute)

1. Open `/cart` and choose **Review local checkout**.
2. Enter the required structural contact/address fields, select `US` and
   `local_standard`, and review the result.
3. Show server-derived subtotal and local fixture shipping. Tax must read
   `Not activated`; `Local demo total` is development/test arithmetic only,
   not payable and not an authorization.

### 4. Local Order and Payment simulation (about 1 minute)

1. Choose **Create local pending order**.
2. On Order Success, choose **Simulate successful Payment**.
3. Keep the generated local Order reference in the same browser only. It is
   process-memory state and is not a public authorization token.

### 5. Fulfillment review (about 2 minutes)

1. On the customer Order Success page, confirm the paid/succeeded state.
2. In a separate tab, open `/local-fulfillment/operator` and load the local
   Order reference.
3. Choose **Enter Photo Review**, then **Publish Preview**.
4. Return to the customer Order Success page and choose **Approve Preview**.
5. Return to the operator page and choose **Start Production**, then
   **Mark Quality Check**. Confirm `quality_check` is terminal for this local
   Fulfillment runtime.

### 6. Tracking lifecycle (about 2 minutes)

1. Open `/local-tracking/operator` and load the same local Order reference.
2. Choose **Create Shipment**, **Mark Shipped**, **Mark In Transit**, and
   **Mark Delivered** in order.
3. Confirm the local fixture carrier wording, ordered timeline, and delivered
   terminal state with no further action.
4. Return to the customer Order Success / Tracking view and confirm the same
   local Shipment is safely projected without internal identifiers or private
   upload data.

### 7. Optional Admin surface (remaining time)

The archived local Admin acceptance runtime may be shown only as an authorized
local/test read and presentation boundary. It is not a production Admin
backend or persistence demonstration. Do not use this short demo to claim
durable catalog/order writes or production readiness.

## Troubleshooting

| Symptom | Safe action |
| --- | --- |
| Catalog unavailable | Confirm the explicit fixture selector and development runtime; do not add production credentials or fallback logic. |
| Image rejected | Use a real JPEG/PNG/WebP meeting the displayed byte and dimension limits; do not bypass server inspection. |
| Cart or receipt disappears | Restart/process changes intentionally clear process-memory state; restart the flow from the physical PDP. |
| Fulfillment unavailable | Confirm the same process has a paid/succeeded Local Order and the local operator selector; do not treat a public reference as authority. |
| Tracking unavailable | Confirm Fulfillment reached terminal `quality_check` in the same process and use the separate local operator boundary. |
| Port differs | Use the URL printed by `npm run dev`; do not assume a fixed port. |

## Demo 1 exclusions

Do not demonstrate or claim:

- Admin save, production Admin persistence, or catalog backfill;
- Publish/Unpublish/Retire as production lifecycle operations;
- database migration, remote Supabase, or any provider setup;
- production mode, production shipping, production tax, or production
  fulfillment/tracking;
- Stripe, PayPal, webhooks, R2, Storage, carrier APIs, 17TRACK, email, or
  deployment/DNS/Cloudflare behavior;
- Digital Checkout or digital delivery;
- a public or durable Order/Payment/Shipment authority;
- CustomerUpload private locators, capabilities, cookies, or secrets;
- a fake physical text-only Product or a digital product forced through the
  shipping demo path.

This runbook intentionally leaves Batch H / Tasks 12.1–12.2 out of scope.
