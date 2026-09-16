# local-payment-simulation Specification

## Purpose

Provide a deterministic development/test-only Payment simulation that consumes a freshly authorized process-memory Local Order, exercises safe success/failure/cancellation transitions, and proves the payment boundary without charging money or creating production payment records.

## Requirements

### Requirement: Explicit local simulation runtime boundary

Local Payment Simulation SHALL be available only when an explicit development/test runtime selection enables the local simulation source. It MUST be unavailable in production, unavailable when the selection is absent, and MUST NOT fall back to the simulation after an authoritative production dependency fails. This capability SHALL remain independent of Stripe, PayPal, payment webhooks, Supabase payment persistence, and production deployment.

#### Scenario: Explicit development simulation is selected
- **WHEN** the runtime is development or test and the local simulation source is explicitly enabled
- **THEN** local Payment simulation may be evaluated against the Local Order runtime and the public UI clearly identifies development/test-only behavior

#### Scenario: Production or absent selection
- **WHEN** the runtime is production or no explicit local simulation source is selected
- **THEN** Payment simulation is rejected or unavailable and no provider or database fallback is attempted

### Requirement: Fresh same-browser Local Order authorization

Every simulation request SHALL freshly resolve and authorize the referenced canonical Local Order from the current process-memory runtime using the existing valid same-browser capability. A public Order reference, browser body field, email, Cart identity, or Local Checkout result alone MUST NOT authorize payment simulation. After authorization and Order identity resolution, an exact committed `paymentAttemptId` replay SHALL be resolved before new-attempt lifecycle eligibility is evaluated. For a NEW Payment attempt only, the referenced Order MUST be in an approved retryable local state: `pending_payment`/`pending` or `payment_failed`/`failed`. A `paid`/`succeeded` Order is rejected for a new selector but does not block an exact replay of its already committed successful selector. The current protected snapshot remains the only source for new-attempt payment facts.

#### Scenario: Authorized pending Local Order
- **WHEN** a request supplies a valid public reference and the matching same-browser access capability for a current `pending_payment` or `payment_failed` Local Order
- **THEN** the server may evaluate the requested local simulation outcome using the current protected snapshot

#### Scenario: Public reference without capability
- **WHEN** a request knows a valid public reference but lacks the matching same-browser capability
- **THEN** the server returns the same bounded unavailable/unauthorized result used for protected Local Order reads and does not reveal whether the Order exists

#### Scenario: Paid Local Order is retried
- **WHEN** a request targets a Local Order already transitioned to local `paid`
- **THEN** the server first checks for an exact committed replay; the original attempt returns its prior result, while a new payment selector is rejected as non-retryable without creating another success transition

### Requirement: Immutable Local Order facts and mutable local lifecycle

Payment Simulation MUST NOT mutate historical Local Order business facts. The immutable facts SHALL include, at minimum, the contact/address snapshot, original Product identity/display snapshot, Variant/SKU and selected options, quantity, authoritative unit price/currency, line subtotal, shipping snapshot, coupon snapshot, tax snapshot, local arithmetic snapshot, customization revision/values, controlled image references/crop facts, `createdAt`, and the original Order identity.

Only the approved local lifecycle fields MAY change: `orderStatus` and `paymentStatus`. The implementation MUST NOT mutate a frozen snapshot in place, make historical facts mutable, or re-read current Catalog/Cart authority to rewrite an existing Order snapshot during payment. A lifecycle transition MAY be represented by a separate lifecycle record or by an atomically replaced newly frozen record, but the immutable facts MUST remain deep-equal to the original stored facts.

#### Scenario: Successful transition preserves Order facts
- **WHEN** Order A is created, its protected facts are captured, and a local success simulation transitions it to `paid`/`succeeded`
- **THEN** Product, SKU, selected options, quantity, price, commercial facts, customization, image facts, contact/address, identity, and creation time remain deep-equal to the original facts

#### Scenario: Failed or cancelled transition preserves Order facts
- **WHEN** Order A is created and a failed or cancelled simulation changes only the approved local lifecycle
- **THEN** all immutable Order facts remain deep-equal to the original facts and current Catalog/Cart changes cannot rewrite them

#### Scenario: Frozen snapshot is not mutated in place
- **WHEN** a lifecycle transition is applied to a stored Local Order snapshot
- **THEN** the original immutable snapshot remains unchanged and the canonical read exposes either the original lifecycle or a newly frozen record with identical immutable facts

### Requirement: Server-authorized simulation amount and currency

For a new Payment attempt, the simulated amount and currency SHALL be derived only from the freshly authorized protected Local Order commercial snapshot. The amount SHALL use the snapshot's local development arithmetic total and its authoritative currency only after the server validates the snapshot's development-only marker, `tax.status = not_activated`, `tax.amount = null`, supported currency, and non-negative arithmetic result. An exact committed replay MUST return the amount/currency stored with the original committed Payment result and MUST NOT re-derive them or re-run new-attempt commercial validation. Browser-provided amount, currency, subtotal, shipping, discount, tax, total, price, or payment status MUST be rejected or ignored.

The returned amount SHALL be labeled as a simulated development/test amount. It MUST NOT be described as payable, charged, captured, authorized, price-locked, or production money, and no real money SHALL be moved.

#### Scenario: Valid protected arithmetic snapshot
- **WHEN** the current authorized Local Order has a valid development-only arithmetic snapshot with `tax.status = not_activated`, `tax.amount = null`, and supported USD currency
- **THEN** the server derives the simulation amount and currency from that snapshot and returns them only in a safe simulation projection

#### Scenario: Browser amount tampering
- **WHEN** the browser submits a different amount, currency, tax, shipping, discount, or total
- **THEN** the server ignores or rejects those fields and the resulting simulation uses only the protected snapshot or fails closed

#### Scenario: Unsafe commercial snapshot
- **WHEN** the protected snapshot is missing, non-development, mixed-currency, tax-activated, negative, or otherwise cannot be safely interpreted
- **THEN** no Payment attempt is committed and the server returns a bounded unavailable result

### Requirement: Minimal local Payment and Local Order lifecycle

The capability SHALL define local-only Payment attempt states `pending`, `succeeded`, `failed`, and `cancelled`; `pending` is an internal in-progress state and the deterministic simulation operation SHALL expose only a committed terminal outcome. Refunds are not part of this MVP. The local Order transition mapping SHALL be:

- `pending_payment` or `payment_failed` + `success` → Order `paid`, payment status `succeeded`;
- `pending_payment` or `payment_failed` + `failed` → Order `payment_failed`, payment status `failed`;
- `pending_payment` or `payment_failed` + `cancelled` → Order `pending_payment`, payment status `pending`.

The local states MUST NOT redefine or mutate the legacy Supabase/Stripe production Order state machine. A local `paid` result MUST mean only “Paid — Local simulation”.

#### Scenario: Successful local simulation
- **WHEN** an authorized retryable Local Order receives a valid `success` simulation outcome
- **THEN** one terminal local Payment attempt is `succeeded`, the Local Order becomes `paid` with payment status `succeeded`, and the safe projection states that no real money was charged

#### Scenario: Failed local simulation
- **WHEN** an authorized retryable Local Order receives a valid `failed` simulation outcome
- **THEN** one terminal local Payment attempt is `failed`, the Local Order becomes `payment_failed` with payment status `failed`, and the Order remains eligible for a later new retry selector

#### Scenario: Cancelled local simulation
- **WHEN** an authorized retryable Local Order receives a valid `cancelled` simulation outcome
- **THEN** one terminal local Payment attempt is `cancelled`, the Local Order remains `pending_payment` with payment status `pending`, and a later retry remains possible

### Requirement: Payment attempt idempotency and retry separation

Each logical local Payment mutation SHALL require a distinct opaque `paymentAttemptId` selector. It MUST NOT reuse the Local Order `creationAttemptId`. After capability authorization and Order identity resolution, the runtime MUST first check whether the selector has an existing committed binding. An exact match of selector, authorized Order, canonical outcome, and authority context SHALL return the original committed result even if that result already transitioned the Order to `paid`/`succeeded`; it MUST not create another attempt or reapply the transition. Only when no equivalent binding exists may current retryable-state rules be evaluated. Reusing a selector with a different Order, outcome, or authority context SHALL fail with a bounded conflict. A new explicit retry MAY use a new selector and MUST be evaluated against fresh current Order authority.

#### Scenario: Same attempt is repeated
- **WHEN** the same browser repeats a successful, failed, or cancelled request with the same `paymentAttemptId` and equivalent Order/outcome context
- **THEN** the server returns the original safe result before applying current lifecycle eligibility and does not create another Payment attempt or duplicate transition

#### Scenario: Lost response replays a successful paid attempt
- **WHEN** Request A succeeds, transitions Order A to `paid`/`succeeded`, its HTTP response is lost, and the same browser retries with the same selector, Order, outcome, and authority context
- **THEN** the server returns the same Payment public reference and succeeded result, leaves Order A paid, and keeps the Payment attempt count and Order transition count at one

#### Scenario: Selector is reused for different input
- **WHEN** a `paymentAttemptId` previously bound to one Order or outcome is submitted for different context
- **THEN** the server returns a bounded conflict and leaves both the prior Payment result and Order state unchanged

#### Scenario: Explicit retry uses a new selector
- **WHEN** a failed or cancelled simulation is retried with a new `paymentAttemptId`
- **THEN** the server evaluates a new local attempt from fresh current Order authority and does not reuse the prior attempt identity

### Requirement: Atomic Payment attempt and Order transition

The local runtime SHALL have one canonical process-memory Local Order state store. Payment MUST NOT maintain a second independent mutable copy of Order lifecycle state. It MAY expose separate repository façades over one shared runtime state or use a server-only internal Local Order transition port over the existing canonical store; the existing Local Order create/read behavior and same-browser capability remain authoritative.

The runtime SHALL commit the Payment attempt terminal state and the corresponding canonical Local Order lifecycle transition as one atomic in-memory operation. The existing protected Local Order read MUST observe the transition immediately. If authorization, amount validation, outcome validation, idempotency validation, or either side of the transition fails, neither a new Payment attempt nor a partial canonical Order state change SHALL remain observable. A successful Payment attempt MUST never be visible while the canonical Local Order remains in an incompatible pending state, and a Local Order MUST never be marked locally paid without its matching Payment result. No browser caller may invoke the internal transition port, and no HTTP input may supply the target lifecycle state directly.

#### Scenario: Successful atomic commit
- **WHEN** a valid success simulation passes all checks
- **THEN** the Payment result and canonical Local Order `paid` transition become visible together, and the existing protected Local Order read observes `paid`/`succeeded`

#### Scenario: Commit failure
- **WHEN** the local runtime cannot commit the Payment attempt and Order transition together
- **THEN** the operation fails safely and subsequent Payment and canonical Local Order reads show neither a new attempt nor a partial lifecycle transition, while immutable Order facts remain unchanged

#### Scenario: Concurrent equivalent submissions
- **WHEN** equivalent concurrent requests race with the same `paymentAttemptId`
- **THEN** at most one logical attempt and one Order transition is committed, while all equivalent callers receive the same safe result

#### Scenario: Existing Local Order read sees every lifecycle result
- **WHEN** an Order is created as `pending_payment`/`pending`, then receives success, failure, or cancellation through Local Payment
- **THEN** the existing protected Local Order read returns respectively `paid`/`succeeded`, `payment_failed`/`failed`, or `pending_payment`/`pending` from the same canonical Order state

### Requirement: Bounded outcome selector and no real payment data

The simulation input SHALL contain only structural Order reference data, an opaque `paymentAttemptId`, and an allowlisted development/test scenario outcome of `success`, `failed`, or `cancelled`. The outcome is a scenario selector, not a payment authority. The system MUST NOT request, accept, log, persist, or transmit card numbers, CVV, expiry, bank details, PayPal credentials, provider tokens, or webhook secrets.

#### Scenario: Valid outcome selector
- **WHEN** a same-origin request supplies one allowlisted outcome and a valid opaque attempt selector
- **THEN** the server runs the corresponding deterministic local scenario without collecting payment credentials

#### Scenario: Invalid or authority-bearing input
- **WHEN** a request supplies an unsupported outcome or fields such as status, amount, provider token, card data, or payment credentials
- **THEN** the request is rejected or the authority-bearing fields are ignored, with no Payment side effect

### Requirement: Safe HTTP and public Payment projection

Local Payment HTTP mutations SHALL enforce same-origin protection, bounded JSON parsing, runtime gating, current same-browser authorization, and safe error mapping before creating privileged local Payment authority. A safe public projection MAY contain an opaque public Payment reference, public Order reference, local Payment status, simulated amount/currency, safe timestamp, and an explicit development/test notice. It MUST NOT expose internal IDs, Local Order capabilities, Payment capabilities, protected snapshots, upload data, customer PII beyond the existing safe Order projection, secrets, provider identifiers, SQL diagnostics, or cookies.

#### Scenario: Safe success response
- **WHEN** a valid local Payment simulation commits
- **THEN** the response contains only the safe local Payment/Order projection and explicit “Paid — Local simulation” / “No real money was charged” wording where applicable

#### Scenario: Unauthorized or malformed mutation
- **WHEN** the request is cross-origin, malformed, over-bounded, missing capability, or targets unavailable runtime state
- **THEN** it is rejected with a bounded public error before Payment mutation and without existence or internal-error leakage

#### Scenario: Public reference-only request
- **WHEN** a request supplies only a public Order reference without the browser capability
- **THEN** it is rejected uniformly and does not disclose protected Order or Payment details

### Requirement: Local Payment UI remains explicitly non-production

The existing local Order Success experience MAY expose simulation controls only when the local Payment runtime is explicitly enabled. It SHALL present success, failure, and cancellation as local simulation outcomes, show tax as not activated where the local amount is displayed, and state that no real money was charged. It MUST NOT use “Stripe confirmed”, “funds captured”, “bank charged”, production fulfillment, or shipping-started wording, and it MUST prevent or safely handle rapid duplicate submission.

#### Scenario: Local simulation controls are enabled
- **WHEN** an authorized Local Order Success page is opened in the explicit development/test simulation runtime
- **THEN** the page shows bounded simulation actions and development/test notice without asking for real payment details

#### Scenario: Simulation controls are disabled
- **WHEN** the runtime is production or the local Payment source is not explicitly enabled
- **THEN** the page does not offer a local Payment action and continues to fail closed

#### Scenario: Success UI wording
- **WHEN** a local simulation succeeds
- **THEN** the UI shows local-simulation success and no-money-charged wording, while leaving fulfillment, shipment, and production outside the result

### Requirement: Restart and production side-effect boundaries

Local Payment attempts and local Order payment transitions SHALL remain process-memory only. A runtime restart MUST lose both local Payment state and Local Order state; the system MUST NOT reconstruct either from browser data, localStorage, public references, or the other side of the relationship. This capability MUST create no Supabase record, migration, production Order/OrderItem, Payment entity, provider session, webhook state, fulfillment state, email, shipping, tax, or tracking side effect.

#### Scenario: Runtime restart
- **WHEN** the local process restarts after a simulated Payment or before a retry
- **THEN** the old Order/Payment state is unavailable and the system fails closed without fallback or resurrection

#### Scenario: Successful simulation has no production side effect
- **WHEN** a local Payment simulation succeeds
- **THEN** only the process-memory local state changes; no remote database, payment provider, production Order, fulfillment, or delivery state changes
