## MODIFIED Requirements

### Requirement: Explicit local simulation runtime boundary

Local Payment Simulation SHALL be available only when an explicit development/test runtime selection enables `local_fake` or `local_persistent` simulation. It MUST be unavailable in production, unavailable when the selection is absent or disabled, and MUST NOT fall back to the simulation after an authoritative production dependency fails. `local_persistent` MUST also be unavailable in staging and SHALL use only the independent Docker local Supabase PostgreSQL project shared by canonical local Order and related commerce authorities. `local_fake` SHALL remain independent of Supabase persistence; the persistent exception SHALL store simulated attempts and bindings only in the independent local commerce namespace. Neither mode SHALL activate Stripe, PayPal, payment webhooks, production payment persistence, or deployment. Database, private Storage where required by upstream authority, configuration, or source-consistency failure MUST fail closed without a fake or alternate-source fallback.

#### Scenario: Explicit development simulation is selected
- **WHEN** the runtime is development or test and the local simulation source is explicitly enabled
- **THEN** local Payment simulation may be evaluated against the Local Order runtime and the public UI clearly identifies development/test-only behavior

#### Scenario: Production or absent selection
- **WHEN** the runtime is production or no explicit local simulation source is selected
- **THEN** Payment simulation is rejected or unavailable and no provider or database fallback is attempted

#### Scenario: Persistent simulation source is inconsistent
- **WHEN** persistent simulation is selected in staging or its Order/payment authorities use different projects, a remote project, or mixed memory/persistent state
- **THEN** the request fails closed without recording an attempt or changing any Order

### Requirement: Fresh same-browser Local Order authorization

Every simulation request SHALL freshly resolve and authorize the referenced canonical Local Order from the selected runtime using the existing valid same-browser capability and any required persisted member-session binding. In `local_fake` this SHALL use current process-memory authority; in `local_persistent` it SHALL use the shared local project's durable Order and grant authority, preserving guest signature/expiry rules and session expiry/revocation. A public Order reference, browser body field, email, Cart identity, or Local Checkout result alone MUST NOT authorize payment simulation. After authorization and Order identity resolution, an exact committed `paymentAttemptId` replay SHALL be resolved before new-attempt lifecycle eligibility is evaluated. For a NEW Payment attempt only, the referenced Order MUST be in an approved retryable local state: `pending_payment`/`pending` or `payment_failed`/`failed`. A `paid`/`succeeded` Order is rejected for a new selector but does not block an exact replay of its already committed successful selector. The current protected snapshot remains the only source for new-attempt payment facts.

#### Scenario: Authorized pending Local Order
- **WHEN** a request supplies a valid public reference and the matching same-browser access capability for a current `pending_payment` or `payment_failed` Local Order
- **THEN** the server may evaluate the requested local simulation outcome using the current protected snapshot and any required current member-session binding

#### Scenario: Public reference without capability
- **WHEN** a request knows a valid public reference but lacks the matching same-browser capability
- **THEN** the server returns the same bounded unavailable/unauthorized result used for protected Local Order reads and does not reveal whether the Order exists

#### Scenario: Paid Local Order is retried
- **WHEN** a request targets a Local Order already transitioned to local `paid`
- **THEN** the server first checks for an exact committed replay; the original attempt returns its prior result, while a new payment selector is rejected as non-retryable without creating another success transition

#### Scenario: Durable attempt does not bypass expired authorization
- **WHEN** an exact persistent attempt is retried with an expired guest capability or a revoked required member session
- **THEN** authorization fails before the stored attempt is disclosed and no email-based recovery is offered

### Requirement: Atomic Payment attempt and Order transition

The local runtime SHALL have one canonical Local Order state authority: process memory for `local_fake`, or the selected local project's PostgreSQL for `local_persistent`. Payment MUST NOT maintain a second independent mutable copy of Order lifecycle state. Separate provider-neutral boundaries MAY expose that same canonical state; existing Local Order create/read behavior and same-browser capability remain authoritative.

The runtime SHALL commit the Payment attempt terminal state, its idempotency binding, and the corresponding canonical Local Order lifecycle transition as one atomic operation: in-memory for `local_fake`, and one database transaction for `local_persistent`. The existing protected Local Order read MUST observe the transition immediately after commit. If authorization, amount validation, outcome validation, idempotency validation, or either side of the transition fails, neither a new Payment attempt nor a partial canonical Order state change SHALL remain observable. A successful Payment attempt MUST never be visible while the canonical Local Order remains in an incompatible pending state, and a Local Order MUST never be marked locally paid without its matching Payment result. No browser caller may invoke an internal transition authority, and no HTTP input may supply the target lifecycle state directly. Cross-instance concurrent new attempts MUST serialize against the same Order lifecycle so no two successful new attempts can both pay an already-paid Order.

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

#### Scenario: Distinct successful attempts race across instances
- **WHEN** two new success selectors race for the same persistent retryable Order
- **THEN** at most one successful attempt commits and the other receives a bounded non-retryable/conflict result without a second paid transition

### Requirement: Restart and production side-effect boundaries

In `local_fake`, Local Payment attempts and local Order payment transitions SHALL remain process-memory only. A fake runtime restart MUST lose both local Payment state and Local Order state; the system MUST NOT reconstruct either from browser data, localStorage, public references, or the other side of the relationship. In `local_persistent`, attempts, canonical transitions, and idempotency bindings SHALL survive application restart in the same independent local project and remain readable only through current Order authorization. The fake capability MUST create no Supabase record or migration; the persistent exception MUST create records only in the independent local commerce namespace and MUST NOT touch legacy `orders/order_items`, C1 backfill, or Phase C production migration. Neither mode SHALL create a production Order/OrderItem, real Payment entity, provider session, webhook state, fulfillment state, email, shipping, tax, or tracking side effect. The existing normalized `/api/orders` 503 and legacy path stop gates SHALL remain unchanged.

#### Scenario: Runtime restart
- **WHEN** the `local_fake` process restarts after a simulated Payment or before a retry
- **THEN** the old Order/Payment state is unavailable and the system fails closed without fallback or resurrection

#### Scenario: Successful simulation has no production side effect
- **WHEN** a `local_fake` Payment simulation succeeds
- **THEN** only the process-memory local state changes; no remote database, payment provider, production Order, fulfillment, or delivery state changes

#### Scenario: Persistent success is still simulated
- **WHEN** a persistent simulation commits and the application restarts
- **THEN** the matching local Order/payment result remains durable and explicitly labeled “Paid — Local simulation” and “No real money was charged”, with no real provider or automatic fulfillment action

## ADDED Requirements

### Requirement: Durable simulation replay and audit integrity

Persistent simulated attempts SHALL retain their opaque attempt/public identity, canonical Order relationship, normalized outcome, original simulated amount/currency, terminal result, timestamp, and safe authorized-context binding. After fresh authorization, equivalent committed retries SHALL return the same stored result even after restart or later lifecycle progress; they MUST NOT recompute the amount from current Catalog/Cart state or record another transition. Conflicting selector reuse SHALL fail safely. Raw capabilities, session tokens, payment credentials, and provider secrets MUST NOT be persisted in attempt or audit bindings. A bounded audit fact for each committed mutation SHALL be consistent with that same transaction.

#### Scenario: Lost successful response is retried after restart
- **WHEN** a persistent success committed but its response was lost and the same authorized selector/context is retried after restart
- **THEN** the server returns the original Payment reference, simulated amount/currency, and succeeded outcome with one attempt and one Order transition

#### Scenario: Reused persistent selector has a different outcome
- **WHEN** a committed selector is reused for another Order, outcome, or authorized context
- **THEN** the request returns a bounded conflict without exposing another customer's result or modifying the original attempt

#### Scenario: Database outage during payment
- **WHEN** a persistent mutation cannot commit its attempt, binding, audit fact, and Order transition together
- **THEN** none of the new state becomes observable and the request fails without falling back to memory or claiming money was charged