## Context

The repository already contains a process-memory Local Order runtime whose protected snapshot starts at `pending_payment`/`pending`, preserves Cart state, and is authorized by an opaque same-browser capability. It has no Payment entity, Payment attempt repository, or state transition. Separately, `app/domain/payment.ts`, `/api/orders`, the Stripe webhook, Supabase `orders`, and admin order paths are legacy/production seams and must not be reused as local simulation authority.

This change consumes the completed `build-local-order-runtime` boundary. That dependency has completed 30/30, passed final human/browser acceptance, synced its delta into `openspec/specs/local-order-runtime/spec.md`, and been archived. Payment Apply is allowed, but implementation MUST consume the canonical archived Local Order boundary and MUST NOT modify or reopen it. The design below is therefore a local extension of the verified Local Order boundary, not a replacement for production Order or Payment architecture.

## Goals / Non-Goals

**Goals:**

- Define a small typed local Payment domain and a deterministic outcome selector.
- Reauthorize the current Local Order for Payment mutations and, for each new Payment attempt, derive the simulation amount and currency from its protected development-only snapshot; exact committed replays return the original stored Payment result without re-derivation or commercial validation.
- Provide a process-memory Payment attempt repository with separate Payment idempotency and atomic Order transition semantics.
- Expose safe same-origin HTTP and a clearly labelled local UI path with no card or provider credentials.
- Prove success, failure, cancellation, retry, duplicate submission, unauthorized access, restart loss, snapshot immutability, and privacy with offline and rendered tests.

**Non-Goals:**

- Stripe, PayPal, SDKs, PaymentIntents, provider Orders, webhooks, real money, card/bank data, or provider network calls.
- Supabase schema, migrations, production Order/OrderItem/Payment persistence, durable payment sessions, or admin payment operations.
- Production tax, shipping, fulfillment, review, preview, tracking, email, deployment, DNS, or Cloudflare work.
- Refunds in the Day 3 MVP. A future local refund simulation, if needed, requires a separate approved decision/change.
- Changing the confirmed Local Order creation semantics or the unfinished C1/customization changes.

## Decisions

### 1. Dependency and explicit runtime gate

The Local Order dependency is now satisfied. Before implementation begins, the workflow records the canonical 30/30, synced, archived state and uses the canonical `openspec/specs/local-order-runtime/spec.md` boundary. The new runtime configuration uses a non-secret explicit local source such as `LOCAL_PAYMENT_SOURCE=local_fake`, is available only in development/test, and is absent/disabled by default. Production and an authoritative-source failure never activate the fixture.

This records the completed dependency without allowing the local simulation to become an accidental production payment path. The Local Order boundary remains canonical and immutable to this change; deterministic tests do not authorize any production payment path.

### 2. Local-only domain state, separate from legacy payment types

Add a typed local Payment contract rather than expanding the Stripe transport types in `app/domain/payment.ts`. The local contract includes an opaque public Payment reference, server-only identity/context, `paymentAttemptId`, `pending | succeeded | failed | cancelled` attempt states, `success | failed | cancelled` scenario selectors, simulated amount/currency, safe timestamps, and bounded failure codes.

The local Order state extension is explicit and local-only:

| Current local Order state | Simulation outcome | Resulting local Order state |
| --- | --- | --- |
| `pending_payment` / `pending` | `success` | `paid` / `succeeded` |
| `pending_payment` / `pending` | `failed` | `payment_failed` / `failed` |
| `pending_payment` / `pending` | `cancelled` | `pending_payment` / `pending` |
| `payment_failed` / `failed` | `success` | `paid` / `succeeded` |
| `payment_failed` / `failed` | `failed` | `payment_failed` / `failed` |
| `payment_failed` / `failed` | `cancelled` | `pending_payment` / `pending` |

`paid` is terminal for this local simulation scope. Repeated equivalent input returns its existing result; a new attempt against a paid Order is rejected. The local `payment_failed` state is retryable. A cancellation records a cancelled attempt but restores the Order's “no payment has occurred” pending state. These names are not mapped into the legacy Supabase production state machine.

The Local Order record is conceptually split into two parts. Immutable business facts are captured once at creation and include contact/address, Product/Variant/SKU identity and display snapshots, selected options, quantity, unit price/currency, line subtotal, shipping/coupon/tax/commercial snapshots, local arithmetic total, customization revision/values, controlled image references/crop facts, `createdAt`, and original Order identity. Mutable local lifecycle state contains only `orderStatus` and `paymentStatus`. Payment never re-reads current Catalog or Cart data to rewrite those facts.

The implementation may either (A) store immutable facts and lifecycle as separate fields/records inside one aggregate, or (B) atomically replace the stored Local Order with a newly frozen record whose immutable facts are byte-for-byte/deep-equal and whose lifecycle fields are the only differences. It must never mutate a frozen snapshot in place. Tests must capture Order A's facts before success, failure, and cancellation and compare them after each transition.

The alternative of reusing `StripeWebhookSession`, production `payment_status`, or `orders` status strings was rejected because those types have provider-specific and durable semantics that do not belong in process-memory simulation.

### 3. Fresh authority and simulation amount

The application service accepts only a public Order reference, `paymentAttemptId`, and allowlisted outcome selector. It first authorizes the browser capability and resolves the canonical Order identity. It then looks up the committed `paymentAttemptId` binding before any new-attempt lifecycle or commercial validation. An exact match of Order, outcome, and authority context returns the original committed Payment result and stops: it does not require the already-paid Order to be retryable, derive a new amount/currency, create a new Payment reference or attempt, reapply the Order transition, re-read Catalog/Cart, or mutate immutable facts. It reads the current Local Order through the existing same-browser capability boundary in the same process for all non-replay paths. It does not accept a browser checkout projection, local arithmetic total, amount, currency, Order status, payment status, or tax value as authority.

Only when no equivalent committed binding exists does the service validate the new-attempt lifecycle and derive `simulatedAmountCents` from the protected snapshot's `commercial.localArithmeticTotalCents` and `simulatedCurrency` from the protected snapshot's currency after validating:

- the snapshot is `developmentOnly: true`;
- currency is the launch-supported `USD` value;
- the arithmetic amount is a finite non-negative integer;
- `tax.status` is `not_activated` and `tax.amount` is `null`;
- for a new Payment attempt, the current Local Order is in an approved retryable state: `pending_payment`/`pending` or `payment_failed`/`failed`.

An exact committed replay is resolved earlier from the existing Payment-attempt binding and does not re-run new-attempt lifecycle or commercial validation.

The result is a development/test arithmetic echo, not a payable amount, authorization, charge, price lock, tax result, or production financial value. This preserves the Local Checkout and Local Order tax boundary rather than interpreting null tax as zero production tax.

### 4. One process-memory aggregate for Payment and Order atomicity

Use one canonical process-memory Local Order state store rather than two independent mutable Order maps. The existing Local Order repository remains the canonical owner of Order identity, immutable snapshots, lifecycle state, and same-browser capability bindings. Payment may be a repository façade over one shared runtime state, or it may use a server-only internal Local Order transition port over that canonical store. It must not create a parallel `LocalPaymentAggregate.orders` copy that can drift from `LocalOrderRepository.orders`.

After capability authorization and canonical Order identity resolution, the aggregate operation first checks the committed Payment-attempt binding. An exact selector/Order/outcome/context replay returns the original result—even when the canonical Order is already `paid`—without consulting paid-terminal rejection, re-deriving amount/currency, re-running new-attempt commercial validation, or reapplying the transition. Only a new selector proceeds to current retryable-state checks, then protected commercial validation, outcome validation, and staged Payment/Order transition. No `await` occurs between the final validation and commit. A failed injector/test hook or invalid transition leaves the Payment index and canonical Order store unchanged. The implementation must not emulate atomicity by writing a Payment first, writing a copy of Order state second, or repairing either side afterward.

The separate `paymentAttemptId` is the idempotency selector. Its binding includes the authorized internal Order identity, canonical outcome, and relevant authority context. A lost HTTP response can therefore replay a successful paid attempt and receive the same Payment public reference; the attempt count and lifecycle transition count remain one. A different Order/outcome returns conflict, and a new selector against a paid Order is rejected. This is intentionally distinct from Local Order `creationAttemptId`.

The existing protected Local Order read must observe every committed transition immediately: success yields `paid`/`succeeded`, failure yields `payment_failed`/`failed`, and cancellation yields `pending_payment`/`pending`. No browser caller can invoke the internal transition port and no HTTP body can supply the target lifecycle state.

### 5. Same-origin HTTP and safe projection

Add a local-only server boundary, preferably `POST /api/local-payments` with an optional protected read path if the existing Success page needs refresh. The mutation parser is bounded and accepts only the reference, attempt selector, and outcome. Same-origin protection and the existing Local Order HttpOnly capability cookie are checked before privileged local Payment authority is created.

Responses use bounded public errors for malformed, unavailable, unauthorized, conflict, non-retryable, and unsupported-runtime cases. A safe success/result projection contains only an opaque public Payment reference, public Order reference, local attempt status/outcome, simulated amount/currency, timestamp, and development/test notice. It omits internal IDs, cookies, capabilities, protected snapshots, upload receipts, provider metadata, SQL diagnostics, and secrets.

The existing `/order/success/<reference>` experience is the smallest UI integration point. It may render simulation controls only when the explicit local runtime is enabled, and it uses the existing protected read flow. A separate payment page is not necessary unless implementation discovery proves the current page cannot preserve the boundary.

### 6. No real payment input and explicit wording

The UI offers deterministic actions such as “Simulate successful payment”, “Simulate failed payment”, and “Cancel payment simulation”. It never renders card number, CVV, expiry, bank, PayPal, provider token, or webhook fields. Success is worded as “Paid — Local simulation” plus “No real money was charged”; failure and cancellation identify themselves as local simulation outcomes. No result claims fulfillment, shipping, production, capture, or real authorization.

### 7. Verification strategy

Tests remain offline and deterministic. Domain tests cover parser bounds, lifecycle mapping, amount/currency validation, tax boundary, and safe projection. Repository/aggregate tests cover immutable-fact deep equality after every lifecycle result, one canonical Order store, existing protected-read visibility, exact successful replay after `paid`, new-selector paid rejection, selector conflict, concurrent equivalent calls, atomic rollback, and restart loss. Application/HTTP tests cover fresh Order authority, public-reference-only rejection, browser field tampering, same-origin, safe errors, capability privacy, and no provider calls. Rendered/browser acceptance covers desktop and 375px pending/success/failure/cancel/retry wording and duplicate-submit prevention when the local runtime is available.

The final gates are the repository's existing offline test, typecheck, lint, build, rendered tests, strict OpenSpec validation, and diff check. Live Supabase, Stripe, PayPal, Resend, 17TRACK, DNS, Cloudflare, deployment, and real payment data are never required.

### 8. Legacy isolation

The audit classification is recorded for implementation:

- **Reusable boundary:** current Local Order snapshot, same-browser capability, safe public projection conventions, same-origin parser conventions, local runtime gating, and controlled offline test patterns.
- **Legacy only:** `app/domain/payment.ts` Stripe transport types, Supabase `orders.payment_status`, Stripe checkout creation, Stripe webhook handlers, Admin Order payment filters, and production order lookup/download gating.
- **Production-only:** `/api/orders`, `/api/webhooks/stripe`, Supabase `orders`/`order_items`, Stripe secrets, webhook secrets, and provider state transitions.
- **Unfinished/deferred:** durable Payment entity, production Order payment transition, PayPal, amount/currency verification for the real provider integration, and refund/settlement behavior.
- **New local boundary required:** local Payment domain, process-memory aggregate/repository, runtime config, safe HTTP projection, local UI actions, and local simulation documentation.

No existing legacy payment route is modified or called by the local simulation.

## Risks / Trade-offs

- [Local Order boundary could be bypassed] → Consume the canonical archived 30/30 Local Order boundary, do not modify or reopen it, and keep the Payment implementation development/test-only.
- [Two stores could diverge] → Keep one canonical Local Order state store, expose only a server-only transition port or shared runtime façade, and test protected-read visibility plus rollback and concurrent equivalent requests.
- [Lifecycle transition could rewrite purchased facts] → Freeze immutable Order facts, change only lifecycle fields, and compare the original snapshot after success, failure, and cancellation.
- [Paid-terminal validation could reject a lost-response replay] → Check exact committed `paymentAttemptId` binding before evaluating new-attempt retryability.
- [Local arithmetic total is mistaken for payable money] → Name the field simulated amount, preserve tax-not-activated/null, and require development/test/no-money wording in domain, HTTP, and rendered tests.
- [A public reference or replayed body could authorize Payment] → Require the existing same-browser capability and fresh process-memory read; reject body authority fields and public-reference-only requests.
- [Restart loses local state] → Fail closed and never reconstruct from browser, localStorage, public reference, or Payment data.
- [Legacy Stripe code is accidentally reused] → Keep separate types/modules and add provider-stop-gate tests/assertions that no Stripe/PayPal/Supabase boundary is called.
- [Browser double submit] → Bind every logical mutation to a distinct `paymentAttemptId`, make the server operation idempotent, disable the submitting control, and test rapid duplicate requests.

## Migration Plan

No database or infrastructure migration is created or applied. Apply adds only development/test application modules and offline tests against the satisfied, canonical archived Local Order boundary. Enabling requires an ignored local environment selection; absence remains disabled. Rollback removes that selection and local application modules, and a process restart naturally discards local Payment and Order state. No remote record or migration history is affected.

## Open Questions

None for the Day 3 simulation boundary. A future production payment change must separately decide durable Payment schema, real provider amount/currency verification, webhook transitions, refund semantics, and Order persistence; those decisions are intentionally not imported here.
