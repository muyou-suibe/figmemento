# Local Payment Simulation: Development Guide

This guide describes the current FigMemento Local Payment simulation. It is a
deterministic development/test capability only. It is not Stripe test mode,
PayPal sandbox, PaymentIntent, authorization, charge, capture, settlement, or
a payable amount.

## Runtime selection

The server-only selector is:

```dotenv
LOCAL_PAYMENT_SOURCE=local_fake
```

`local_fake` is accepted only in development or test. An absent selector keeps
Local Payment disabled/unavailable. Production rejects the local selector.
There is no automatic fallback when an authoritative provider or database
dependency fails.

Use an ignored `.env.local` or an equivalent local shell configuration. Only
the non-secret selector is documented here; do not copy secrets, cookies,
capabilities, authority fingerprints, or provider credentials into this guide
or into source control.

```sh
npm run dev
```

The local Worker normally serves `http://localhost:3000`. Create a Local Order
through the existing development checkout flow, then use:

```text
/order/success/<reference>
```

## What the simulation does

The browser sends only the structural tuple:

```json
{
  "publicReference": "FM-LOCAL-…",
  "paymentAttemptId": "opaque-selector",
  "outcome": "success"
}
```

The existing same-browser HttpOnly Local Order capability is carried by the
browser cookie. The server resolves the canonical internal Order identity and
derives the authority context. A public reference alone is not authorization.

The simulated amount is derived only from the protected Local Order snapshot:
`commercial.localArithmeticTotalCents` and its authoritative USD currency.
It is a development/test arithmetic echo, not a payable, authorized, charged,
captured, settlement, or production price-lock amount.

Tax remains:

```text
tax.status = not_activated
tax.amount = null
```

The UI therefore says `Tax = Not activated` and does not claim production tax
calculation.

## Lifecycle

| Current Local Order | Simulation outcome | Result |
| --- | --- | --- |
| `pending_payment` / `pending` | `success` | `paid` / `succeeded` |
| `pending_payment` / `pending` | `failed` | `payment_failed` / `failed` |
| `pending_payment` / `pending` | `cancelled` | `pending_payment` / `pending` |
| `payment_failed` / `failed` | `success` | `paid` / `succeeded` |
| `payment_failed` / `failed` | `failed` | `payment_failed` / `failed` |
| `payment_failed` / `failed` | `cancelled` | `pending_payment` / `pending` |

`paid` / `succeeded` rejects a new selector. An exact committed replay of the
same selector is resolved first and returns the original Payment result.

## Retry and replay

`creationAttemptId` belongs to Local Order creation. `paymentAttemptId` belongs
to one explicit Local Payment mutation; they are never interchangeable.

The server sequence is:

```text
same-browser authorization
→ canonical internalOrderId
→ committed paymentAttemptId binding
→ exact replay, if present
→ new-attempt validation
```

An exact replay creates no new Payment reference, timestamp, amount/currency
derivation, commercial validation, or Order transition. A new explicit retry
after failure or cancellation uses a new selector. A rapid duplicate is
guarded synchronously in the client and also protected by server idempotency.
If transport outcome is unknown, the client can retry the same selector and
outcome; a known terminal result ends that logical action.

## Process-memory boundary

Local Orders, Payment attempts, and committed selector bindings live only in
the current local process. A runtime restart loses all three. Reads and
replays then fail closed; state is never reconstructed from the browser,
localStorage, filesystem, public reference, or another persistence source.

The Cart remains preserved. Payment does not rewrite immutable Product/SKU,
customization, upload, contact, address, commercial, or creation facts.

## UI wording and exclusions

The Success page is a Local Order Success page with a local simulation entry
point. It uses wording such as:

- `Paid — Local simulation`
- `Payment failed — Local simulation`
- `Payment simulation cancelled`
- `No real money was charged`

It never requests card, bank, PayPal, provider-token, webhook, or other real
payment data. A successful local result does not start production, fulfillment,
photo review, preview, shipment, tracking, email, or delivery. Fulfillment is
a separate downstream change and is not unlocked by reaching this local
Payment task target.

## Future production handoff

This simulation does not implement durable Payment or Order persistence. A
future approved production Payment change must separately decide and verify:

- durable Payment and production Order/OrderItem persistence;
- real provider and provider amount/currency verification;
- PaymentIntent/provider Order and webhook transitions;
- refund semantics;
- production tax, shipping, fulfillment, email, and tracking integration.

None of those decisions or integrations are part of this local simulation.
