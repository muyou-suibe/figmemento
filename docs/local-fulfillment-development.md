# Local Fulfillment Runtime: Development and Review Guide

This guide describes the current FigMemento Local Fulfillment runtime. It is
for development and test verification only. It is not production fulfillment,
production preview generation, shipping, tracking, storage, supplier
integration, or a durable Order/Fulfillment system.

## Status and dependency gate

The Local Fulfillment runtime is enabled only by an explicit local source:

```dotenv
LOCAL_FULFILLMENT_SOURCE=local_fake
```

`local_fake` is accepted only in development or test. An absent selector keeps
the runtime unavailable, and production rejects the local selector. A
provider, database, or upstream runtime failure never activates this local
runtime as a fallback.

Fulfillment depends on the canonical local Order and Local Payment boundaries:

- a Local Order must already exist in the current process;
- the canonical Order must be `orderStatus = paid` and
  `paymentStatus = succeeded`;
- the initial Fulfillment aggregate can be created only by the explicit local
  operator `enter_photo_review` action.

The local operator seam is separate from runtime enablement. The development
operator flag is local configuration only:

```dotenv
LOCAL_FULFILLMENT_OPERATOR=enabled
```

It is not production authentication, a browser credential, a customer
capability, or an authorization value that may be sent by the browser.

Use the existing Local Catalog, Local Checkout, Local Order, and Local Payment
development guides for their prerequisites. Keep all local configuration in
an ignored local environment file or equivalent shell configuration. Never
place a real secret, cookie, capability, operator credential, provider key, or
database credential in this document or source control.

Start the local Worker with:

```sh
npm run dev
```

The local runtime normally serves `http://localhost:3000`.

## Local boundary and routes

The customer boundary is the existing Order Success / same-browser flow:

```text
/order/success/<public-order-reference>
/api/local-fulfillment/<public-order-reference>
```

Customer reads and mutations require the existing same-browser Local Order
capability. A public Order reference, Checkout email, Cart identity, browser
status field, or prior UI projection is not authority. Customer reads are
side-effect free and cannot create the initial Fulfillment aggregate.

The local operator boundary is a development/test tool:

```text
/local-fulfillment/operator
/api/local-fulfillment/operator/<public-order-reference>
```

Operator requests use the separate server-only local operator seam and do not
require the customer's same-browser capability. The operator UI is not a
production dashboard and does not introduce staff authentication, roles,
Supabase writes, or provider integrations.

## Fulfillment lifecycle

The Local Fulfillment aggregate owns its own lifecycle. It does not rename or
copy the Local Order lifecycle:

```text
paid/succeeded Local Order
  -> photo_review
  -> preview_pending
  -> preview_revision_requested
  -> preview_pending
  -> preview_approved
  -> in_production
  -> quality_check
```

The initial `photo_review` state is created only by operator
`enter_photo_review`. An operator publishes the initial preview to enter
`preview_pending`. A customer may then approve the current preview or request
a revision. Production can start only after `preview_approved`, and
`quality_check` is terminal for this local capability.

Unpaid, cancelled, invalid, stale, skipped, backward, unauthorized, and
shipping/tracking transitions fail closed. This runtime does not add
`shipment_created`, `shipped`, `in_transit`, or `delivered`.

## Preview and revision contract

- Preview versions are server-generated and limited to v1, v2, and v3.
- The initial v1 preview does not consume revision allowance.
- Customers may request at most two revisions.
- A revision request moves the aggregate to
  `preview_revision_requested`; the old preview is not immediately
  approvable.
- An operator publishes the next preview to return to `preview_pending`.
- `expectedPreviewVersion` is an optimistic stale-action guard, not an
  authority value. A stale browser action is rejected without silently
  upgrading to the current version.
- Preview metadata is deterministic, provider-neutral, and clearly local.
  It does not claim real 3D generation, production artwork, supplier files,
  or manufacturing output.

## Action identity, replay, and concurrency

Every customer or operator mutation uses its own opaque
`fulfillmentActionId`. It is separate from Local Order `creationAttemptId`
and Local Payment `paymentAttemptId`.

The server authorizes the actor and resolves canonical identity before looking
up a committed action binding. An exact equivalent committed action returns
the original result before new lifecycle, version, or revision validation. A
same selector with a different action, version, note, actor context, or other
semantic input is rejected as a conflict.

The state transition, preview/revision record, and action binding commit in
one logical atomic boundary. Concurrent revision requests cannot increase the
revision count beyond two. If a response is lost after a commit, retrying the
same selector replays the original result rather than creating a second
transition or preview.

## Authority and privacy

The canonical Local Order remains the source of paid/succeeded entry and
immutable purchase facts. Fulfillment stores only its own process-memory
lifecycle, preview, revision, timestamp, and action-binding state plus the
canonical Order identity reference. It does not create a second mutable Order
facts store.

Customer projections contain only the public Order reference, safe Fulfillment
state, current preview version, safe preview metadata, revision usage,
allowed customer actions, safe timestamps, and a development/test notice.
Operator projections contain only bounded local operational fields.

Responses must not expose owner IDs, capabilities, operator secrets, internal
Order IDs, process-memory keys, receipt IDs, storage keys, private object
paths, provider diagnostics, payment-attempt identifiers, or customer-private
upload content. Customer and operator errors use bounded unavailable,
conflict, stale, invalid-transition, or revision-limit results without
revealing unauthorized aggregate existence.

## Restart behavior

Local Order and Local Fulfillment state are process-memory only. Restarting the
Worker loses the current Order, Fulfillment aggregate, preview records,
revision records, and action bindings. Old public references and browser data
cannot resurrect the workflow. Reads and mutations fail closed after restart.

No filesystem, localStorage, database, Supabase, storage provider, or other
persistence source is used to restore local Fulfillment state.

## Day 5 handoff

`quality_check` is the final state in this Local Fulfillment capability. A
future Day 5 Tracking/Shipping change may require canonical Fulfillment to be
`quality_check` before creating shipment state, but that change must define
its own tracking number, carrier, shipping, persistence, authorization, and
provider boundaries.

Tracking is not implemented here. There is no carrier, tracking number,
shipment record, 17TRACK call, delivery state, email notification, or
production deployment behavior.

## Troubleshooting

| Symptom | Safe interpretation |
| --- | --- |
| Fulfillment is unavailable | The source is absent, production mode is active, the process restarted, or the canonical paid Order is not present. |
| Operator request is unauthorized | Runtime enablement and operator authority are separate; verify local development configuration without sending credentials from the browser. |
| Customer request is unavailable | The same-browser Local Order capability is missing/invalid, the Order is not paid/succeeded, or the Fulfillment aggregate has not been admitted by an operator. |
| Stale preview conflict | Refresh the current safe projection and retry with the current `expectedPreviewVersion`; do not silently reuse an old browser version. |
| Revision-limit result | Two customer revision requests have already been used. No third revision is permitted. |
| State disappears after restart | This is expected process-memory fail-closed behavior, not a persistence defect in this local runtime. |

Do not resolve a local failure by enabling a provider, writing Supabase data,
adding a migration, adding a browser authority field, or introducing a fake
shipment/tracking result.

## Explicit exclusions

This runtime does not implement durable Order/OrderItem/Fulfillment
persistence, production preview storage, binary preview upload, production
operator authentication, supplier/factory/ERP integration, inventory,
shipping, tracking, 17TRACK, email, production tax, Stripe, PayPal, payment
webhooks, DNS, Cloudflare deployment, or C1 backfill.
