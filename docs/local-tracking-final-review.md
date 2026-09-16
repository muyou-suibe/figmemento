# Local Tracking Runtime: Final Review Evidence

This is the final local review packet for `build-local-tracking-runtime`. It
records development/test evidence and does not authorize archive, remote
Supabase access, migration execution, provider integration, or deployment.

## Change boundary

- Change: `build-local-tracking-runtime`
- Scope: local process-memory Shipment and Tracking only
- Task state at review: `30/30` after the gates below
- Upstream authorities: canonical Local Order, Local Payment, and Local
  Fulfillment boundaries
- Fulfillment remains `quality_check` throughout the Tracking lifecycle

## Browser acceptance evidence

Human Safari browser acceptance passed:

| Check | Result |
| --- | --- |
| Desktop customer Tracking | PASS |
| Desktop operator Tracking | PASS |
| 375px customer Tracking | PASS |
| 375px operator Tracking | PASS |
| Lifecycle buttons | PASS |
| Critical horizontal overflow | NO |
| Primary action usable | YES |
| Tracking number overflow | NO |
| Timeline readable | YES |
| Delivered terminal wording | PASS |

The verified local sequence was:

```text
paid/succeeded
-> quality_check
-> create_shipment
-> shipment_created
-> mark_shipped
-> shipped
-> mark_in_transit
-> in_transit
-> mark_delivered
-> delivered (terminal)
-> customer safe Tracking read
```

The Fulfillment lifecycle remained `quality_check`; Tracking did not rename or
mutate the upstream Fulfillment state.

## Narrow HTTP correction evidence

The real browser exposed two HTTP boundary issues during acceptance. Both were
fixed and reverified without changing business semantics:

- Operator `allowedActions` now follows canonical Shipment status rather than
  Fulfillment status.
- Operator same-origin GET without an `Origin` header is admitted when the
  request is a same-origin browser read (or has no Fetch Metadata), while
  cross-site GETs and all POST mutations retain strict origin protection.

The customer read boundary remains unchanged: same-browser Local Order
capability is required, public references do not authorize access, and reads
are side-effect free.

## Domain, authority, and privacy evidence

- One canonical process-memory Shipment exists per canonical Fulfillment.
- `trackingActionId` is independent from Shipment identity and exact committed
  replays return the original result.
- Shipment lifecycle is exactly `shipment_created -> shipped -> in_transit ->
  delivered`; `delivered` is terminal.
- Shipment admission requires paid/succeeded Local Order plus Fulfillment
  `quality_check`.
- Customer capability cannot authorize operator mutations.
- Tracking number and Shipment reference are display identifiers, not
  authority.
- Projections omit internal IDs, owner IDs, capabilities, receipt IDs,
  storage keys, credentials, tokens, SQL details, and private uploads.
- Restart loses process-memory state and fails closed without reconstruction.

## Provider and persistence stop evidence

The current Tracking implementation and routes are covered by the provider
stop gate. No Tracking path calls or writes:

- Supabase, SQL, migrations, D1/Drizzle, SQLite, or durable database state;
- 17TRACK, carrier APIs, webhooks, polling, labels, postage, customs,
  suppliers, factories, ERP, or warehouse systems;
- storage providers, email, DNS, Cloudflare, or deployment infrastructure.

The local runtime is explicitly selected with `LOCAL_TRACKING_SOURCE=local_fake`
and never falls back to a provider or claims a real carrier result.

## Verification evidence

The following gates are run for the final local review:

| Gate | Result |
| --- | --- |
| Focused Tracking and upstream HTTP tests | PASS (Tracking 39/39; Fulfillment 14/14) |
| `npm run test:tracking` | PASS (39/39) |
| `npm run test:offline` | PASS (830/830) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; 0 errors, existing warning only |
| `npm run build` | PASS |
| `npm run test:rendered` | PASS (7/7) |
| `npm run verify` | PASS |
| `openspec validate --all --strict` | PASS |
| `git diff --check` | PASS |

The existing lint warning is the known `@next/next/no-img-element` warning in
`app/storefront/ProductCustomizationImageField.tsx`; it is unrelated to the
Tracking change.

## Explicit stop conditions

This review packet does not authorize:

- archive or sync of this change;
- a later Shipping Provider or production Tracking change;
- remote Supabase inspection or mutation;
- migration, backfill, storage-provider selection, or production deployment;
- Order, Payment, Fulfillment, or Tracking semantic redesign.
