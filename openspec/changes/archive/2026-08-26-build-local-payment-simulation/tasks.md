## 1. Dependency and Runtime Boundary

- [x] 1.1 Verify and record that the canonical Local Order dependency is 30/30, synced, archived, and available through `openspec/specs/local-order-runtime/spec.md` before Payment implementation; do not modify or reopen the archived Local Order change.
- [x] 1.2 Audit the current legacy Stripe/payment seams again at implementation time and document that they remain isolated from the Local Payment runtime.
- [x] 1.3 Add a server-only `LOCAL_PAYMENT_SOURCE` runtime configuration parser with explicit development/test `local_fake` selection, absent-by-default behavior, and production rejection.
- [x] 1.4 Add configuration tests proving that missing/production selection is unavailable, explicit development/test selection is enabled, and authoritative provider failure never falls back to local simulation.
- [x] 1.5 Add the Local Payment module boundary without importing UI state, Stripe/PayPal types, Supabase clients, or provider secrets into the local domain contract.

## 2. Local Payment Domain Contracts

- [x] 2.1 Define strict local Payment attempt, scenario, public-reference, simulated amount/currency, safe projection, and bounded issue types separately from legacy Stripe transport types.
- [x] 2.2 Define and parse the bounded mutation input containing only a public Order reference, distinct opaque `paymentAttemptId`, and allowlisted `success`/`failed`/`cancelled` outcome selector.
- [x] 2.3 Implement pure validation for supported USD, development-only arithmetic amount, `tax.status = not_activated`, `tax.amount = null`, retryable Order state for new attempts, and browser authority-field rejection; exact committed replays bypass this new-attempt validation after authorization and binding verification.
- [x] 2.4 Implement the local Payment and Local Order transition table, separating immutable Order business facts from mutable `orderStatus`/`paymentStatus` lifecycle fields; include success, failed, cancelled, retry, paid-terminal, exact-replay, and no-refund semantics without changing legacy production statuses.
- [x] 2.5 Add deterministic domain tests for parsers, lifecycle transitions, exact paid replay precedence, immutable-fact preservation, amount/currency validation, tax boundary, safe projection omissions, and unsupported/refund/authority-bearing input rejection.

## 3. Process-Memory Aggregate and Idempotency

- [x] 3.1 Define a server-only Local Payment repository/aggregate port over one canonical Local Order state store; expose no browser-callable lifecycle mutation and no second independent Order copy.
- [x] 3.2 Implement the process-memory local Payment aggregate using the existing canonical Local Order runtime state and immutable snapshots without Supabase, SQL, filesystem, SQLite, localStorage, or a second browser authority store.
- [x] 3.3 Implement synchronous staged commit/rollback semantics so the terminal Payment record and canonical Local Order lifecycle transition become visible together or neither is observable, while immutable Order facts remain unchanged.
- [x] 3.4 Implement idempotency in the required order: authorize/resolve identity, first replay an exact committed `paymentAttemptId` binding even when the Order is paid, then apply retryable-state rules only for a new selector; cover conflicts and concurrent equivalent requests.
- [x] 3.5 Add repository/aggregate tests for success, failed, cancelled, retry, exact successful replay after paid, new-selector paid rejection, duplicate submission, conflict, injected commit failure, existing protected-read visibility, one canonical store, and immutable-fact invariants.

## 4. Fresh Authority and Payment Application Service

- [x] 4.1 Implement a server-only application service that fresh-reads the canonical Local Order using the existing same-browser capability, resolves exact replay before paid-terminal rejection, and never treats public reference, email, Cart identity, or browser projection as authorization.
- [x] 4.2 Derive the simulated amount/currency only from the protected Local Order snapshot and fail closed for stale, missing, mixed-currency, non-development, tax-activated, negative, or otherwise unsafe commercial data.
- [x] 4.3 Apply the allowlisted scenario through the aggregate, map authorization/conflict/unavailable/non-retryable failures to bounded public issues, and prevent all legacy production Order/payment calls.
- [x] 4.4 Preserve Local Order creation, Cart preservation, immutable snapshot facts, restart fail-closed behavior, and existing pending semantics while adding only the approved local simulation lifecycle transitions; never rewrite facts from current Catalog/Cart authority.
- [x] 4.5 Add application tests for fresh canonical authority, exact paid replay, new-selector paid rejection, browser amount/status tampering, capability rejection, public-reference-only rejection, amount/tax rules, success/failure/cancel, retry, immutable-fact preservation, and no provider/database calls.

## 5. Local HTTP and Success-Page Experience

- [x] 5.1 Add a bounded same-origin Local Payment mutation route whose request parser accepts only the reference, payment attempt selector, and outcome, and rejects unknown authority or credential fields before privileged construction.
- [x] 5.2 Add the minimum safe read/result path needed by the existing Order Success page, reading the same canonical Local Order lifecycle state after Payment, with uniform unavailable behavior after unauthorized access or process restart and no capability in JSON or URL.
- [x] 5.3 Integrate explicit local simulation controls into the existing `/order/success/<reference>` experience only when the local runtime is enabled; do not create a production payment page or modify legacy Order routes.
- [x] 5.4 Add safe HTTP/UI projection tests for public payment reference, canonical Local Order status, simulated amount/currency, timestamp, notices, exact paid replay, safe errors, privacy omissions, same-origin enforcement, no real payment data, and no browser lifecycle authority.
- [x] 5.5 Add rendered/browser acceptance for desktop and 375px flows covering pending, success, failed, cancelled, retry, rapid duplicate-submit handling, development/test notice, tax-not-activated wording, and “No real money was charged”.

## 6. Documentation and Final Verification

- [x] 6.1 Document local Payment setup, explicit runtime selection, process-memory/restart behavior, amount semantics, lifecycle, retry/idempotency, no-money boundary, and future production handoff without secrets.
- [x] 6.2 Add provider-stop-gate and regression coverage proving no Stripe, PayPal, webhook, Supabase, migration, production Order/OrderItem, fulfillment, shipping, tax, email, tracking, DNS, Cloudflare, or deployment operation is introduced.
- [x] 6.3 Run the focused Local Payment domain/repository/application/HTTP/UI tests and the existing Local Order, Local Checkout, Cart, Customization, and CustomerUpload regression suites offline.
- [x] 6.4 Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:rendered`, `openspec validate --all --strict`, and `git diff --check`; resolve failures without weakening strictness or approved boundaries.
- [x] 6.5 Perform final human-review preparation: report Local Order dependency approval state, simulation evidence, remaining risks, exact scope exclusions, and confirm this change is not archived or promoted to production Payment.
