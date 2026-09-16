# Local Tracking Runtime: Development and Review Guide

This is a development/test-only local Shipment and Tracking workflow. It is
not production shipping, carrier telemetry, durable persistence, or a 17TRACK
integration.

## Prerequisites and configuration

Use Node.js `>=22.13.0`, an installed local checkout, and the same running
development Worker for the complete flow. No Supabase, migration, storage
provider, carrier credential, 17TRACK key, email provider, or deployment
configuration is required.

In the ignored `.env.local`, select the local runtime and operator seam:

```dotenv
LOCAL_TRACKING_SOURCE=local_fake
LOCAL_TRACKING_OPERATOR=enabled
```

The upstream local flow also requires its own development selectors:

```dotenv
PHOTOGIFT_PRODUCT_SOURCE=fixture
CART_SOURCE=local_fake
CUSTOMER_UPLOAD_SOURCE=local_fake
LOCAL_CHECKOUT_SOURCE=local_fake
LOCAL_ORDER_SOURCE=local_fake
LOCAL_PAYMENT_SOURCE=local_fake
LOCAL_FULFILLMENT_SOURCE=local_fake
LOCAL_FULFILLMENT_OPERATOR=enabled
PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET=<local-only-secret-at-least-32-characters>
PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS=3600
```

Do not set `NODE_ENV` manually. The development runtime supplies it. Keep the
guest-owner signing value local and secret; do not print or commit it. The
operator flag is server-only local configuration and is never sent by the
browser.

Start the Worker from the project root:

```sh
npm run dev
```

The normal local URL is `http://localhost:3000`. If the terminal selects a
different port, use the URL printed by the development runtime.

## Required upstream state

Tracking creation is admitted only after the same running process has a
canonical Local Order with:

```text
Order: paid / succeeded
Fulfillment: quality_check
```

The Tracking operator page is:

```text
/local-tracking/operator
```

The customer Tracking view is available from the same-browser Order Success
page:

```text
/order/success/<public-order-reference>
```

Customer reads use the existing same-browser Local Order capability. The
public Order reference, Shipment reference, and tracking number are not
authorization. Operator actions use the separate server-only local operator
seam and do not require the customer capability.

## Local lifecycle

The upstream and Tracking states remain separate:

```text
paid/succeeded Local Order
  -> quality_check Local Fulfillment
  -> shipment_created
  -> shipped
  -> in_transit
  -> delivered
```

There is at most one local Shipment per canonical Fulfillment. Shipment and
event actions use independent opaque `trackingActionId` selectors. Exact
retries replay the committed result; non-equivalent selectors cannot create a
second Shipment or skip a lifecycle state. `delivered` is terminal.

The server generates local-only identifiers such as:

```text
FM-LOCAL-SHP-...
FM-LOCAL-TRK-...
```

The display label is `Local Demo Carrier`. Every customer and operator surface
must retain the `DEVELOPMENT / TEST ONLY` notice.

## Customer and operator boundaries

Customer Tracking is a side-effect-free read. It does not create a Shipment,
generate a tracking number, append an event, or change a timestamp. A separate
browser without the matching same-browser capability receives a bounded
unavailable result.

Operator actions are limited to:

- `Create Shipment`
- `Mark Shipped`
- `Mark In Transit`
- `Mark Delivered`

Operator GET requests may omit `Origin` when the browser identifies the
request as same-origin (or omits Fetch Metadata), while cross-site GETs and
all mutation requests retain strict origin protection.

## Privacy and restart behavior

Safe projections contain only public Order/Shipment references, the local
carrier label, local tracking number, Shipment state, safe event labels and
timestamps, and the development notice. They exclude internal IDs, owner IDs,
capabilities, receipt IDs, storage keys, tokens, credentials, SQL details, and
private customer content.

Local Order, Fulfillment, Shipment, event, and action-binding state exists only
in process memory. Restarting or replacing the Worker intentionally loses the
workflow. Old references fail closed; state is never reconstructed from
browser storage, files, Supabase, or a provider.

## Verification and production handoff

Run the offline Tracking checks with:

```sh
npm run test:tracking
npm run test:offline
npm run typecheck
npm run lint
npm run build
npm run test:rendered
```

This local runtime does not implement durable Shipment persistence, real
shipping rates, carrier APIs, 17TRACK, webhooks, polling, labels, postage,
customs, email, production tracking, DNS, Cloudflare deployment, or C1
backfill. A future production Shipping/Tracking change must define those
boundaries independently.
