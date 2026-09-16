## 1. Audit and Boundary Setup

- [x] 1.1 Reconfirm the archived Checkout Readiness, Shopping Cart, Local CustomerUpload, and Customer Auth canonical boundaries plus the currently implemented configured-item/order compatibility seams; record any active C1/Customization dependency as deferred rather than assuming its change is complete.
- [x] 1.2 Define the server-only Local Checkout request/result ports and bounded public issue vocabulary without creating a second Cart, Product, Variant, Customization, receipt, or normalized Order request model.
- [x] 1.3 Define the local runtime source/configuration boundary so local Cart, CustomerUpload, shipping, and coupon fixtures are selectable only in development/test and never become an implicit production fallback.
- [x] 1.4 Add a regression guard proving `GET /api/checkout-readiness` remains read-only, non-authorizing, non-mutating, and semantically separate from the new Checkout evaluation.

## 2. Checkout Domain Contracts

- [x] 2.1 Implement strict bounded structural parsing for `email`, `firstName`, `lastName`, `country`, `stateProvince`, `city`, `addressLine1`, `postalCode`, and `phone`; require email/firstName/lastName/country/city/addressLine1/postalCode, keep stateProvince/phone optional, and do not add postal databases, external address APIs, autocomplete, normalization providers, or phone-number libraries.
- [x] 2.2 Implement the provider-neutral local shipping contract for destination, method, eligibility, amount, currency, and estimated display range without supplier, carrier, or production-shipping semantics.
- [x] 2.3 Implement deterministic DEVELOPMENT / TEST ONLY shipping fixtures with eligible and unsupported destination/method outcomes and no production-rate claims.
- [x] 2.4 Implement the bounded coupon selector/result contract with valid, invalid, expired, and not-applicable fixture outcomes; valid may derive a discount and continue, invalid/expired/not-applicable must return zero discount and continue, and only unsafe coupon-authority failure may be unavailable/fail-closed.
- [x] 2.5 Implement `tax.status = not_activated`, `tax.amount = null`, and the server-owned `localDemoTotal = subtotal + shipping - discount` development/test arithmetic summary; never label it payable, charged, payment, or Order authority, and keep mixed-currency/base-authority failures fail-closed.

## 3. Fresh Checkout Evaluation

- [x] 3.1 Read the current server-owned Cart through the existing Cart runtime boundary without accepting Cart identity, line facts, or totals from the browser and without creating Cart state during evaluation.
- [x] 3.2 Revalidate every usable CartLine through the existing Catalog, Variant/SKU, ConfiguredItemHandoff, Customization, and current availability/price/currency boundaries; preserve distinct configured-copy lines.
- [x] 3.3 Revalidate private image receipts through the existing verified owner-scoped CustomerUpload authority while keeping checkout email, address, Cart identity, and Customer Auth identity separate from receipt ownership.
- [x] 3.4 Aggregate empty, stale, invalid, unavailable, shipping, coupon-status, tax, and dependency outcomes into a deterministic safe checkout result without refreshing or rewriting Cart snapshots; coupon statuses invalid/expired/not-applicable are non-blocking, while unsafe coupon authority failure may block.
- [x] 3.5 Return a server-only, non-durable AcceptedCheckout or equivalent evaluation result only after applicable checks pass; do not create a database entity, repository record, persisted session, durable ID, browser token, Order authority, Payment authority, price lock, reservation, or production authorization, and expose only its safe HTTP projection.
- [x] 3.6 Prove the evaluator is side-effect-free: no Order, OrderItem, payment, webhook, inventory, production, upload attachment, durable Cart mutation, provider call, or remote persistence is performed on success or rejection.

## 4. HTTP and Local Checkout UI

- [x] 4.1 Add the same-origin-protected Local Checkout HTTP boundary, parsing browser input before privileged authority construction and projecting only bounded safe success/failure results.
- [x] 4.2 Add `/checkout` using the existing application presentation structure with contact, bounded structural address validation, local shipping selection, coupon selector, `localDemoTotal`, explicit `tax.status = not_activated` / `tax.amount = null`, a visible tax-not-enabled label, and safe blocked/unavailable states; never use Amount Due, Payable Total, or Charged Total.
- [x] 4.3 Connect the page to the current server-owned Cart and configured-item line projection without introducing a second checkout Cart or exposing private handoffs, receipt IDs, owner data, storage metadata, or browser-controlled totals.
- [x] 4.4 Render valid text-only and image-configured Local Checkout flows, including image receipt revalidation feedback, stale catalog blocking, invalid address/shipping errors, coupon status feedback that does not block for invalid/expired/not-applicable outcomes, and a clear local-only/non-production notice. Prove text-only checkout with a deterministic shipping-required domain/HTTP integration fixture that succeeds without CustomerUpload receipt/owner authority; use the current real shipping-eligible physical fixture for image-configured browser behavior without fabricating a public physical text-only Product or adding digital checkout semantics.

## 5. Offline and Browser Verification

- [x] 5.1 Add offline domain tests for empty Cart, valid text item, valid image item, required/optional address fields, browser total tampering, stale Product/SKU, selected-option mismatch, quantity handling, and mixed-currency/unresolved-base-authority rejection.
- [x] 5.2 Add deterministic shipping, coupon, and tax-state tests covering eligible/unsupported destinations, valid discount continuation, invalid/expired/not-applicable zero-discount continuation, unsafe coupon-authority failure, `tax.status = not_activated`, `tax.amount = null`, `localDemoTotal`, and no guessed tax rate.
- [x] 5.3 Add authority and privacy tests proving current Catalog/Customization/CustomerUpload revalidation, owner-scoped receipt enforcement, safe failure mapping, no Cart rewrite, no side effects, and no provider/storage/owner leakage.
- [x] 5.4 Add restart and runtime-mode tests proving process-local image receipts fail closed after restart, fixture checkout is rejected in production, and authoritative-source failure never falls back to fixtures.
- [x] 5.5 Add HTTP and rendered-route tests for same-origin rejection, safe response projection, `/checkout` rendering, valid text/image paths, blocked states, and the absence of Order/Payment claims.
- [x] 5.6 Run real local development browser acceptance at 375px and desktop width using the current shipping-eligible physical `glass-light-picture` fixture for Cart → Checkout → contact/address → US local shipping → coupon → tax-not-activated → authoritative local summary, with image receipt authority revalidation, restart fail-closed behavior, unsupported-shipping feedback, and no horizontal overflow. Retain separate deterministic domain/HTTP text-only integration proof showing no CustomerUpload authority is required; do not require a fabricated public physical text-only fixture or reuse the digital text-only fixture as shipping checkout.

## 6. Documentation and Engineering Gates

- [x] 6.1 Document local Checkout prerequisites, non-secret environment configuration, fixture labels, restart limitations, bounded structural address scope, local shipping/coupon semantics, `localDemoTotal`, tax-not-activated state, troubleshooting, and the explicit Demo 1 production exclusions.
- [x] 6.2 Document how the future Local Checkout → Local Order change will fresh-read current authority and reuse `order-catalog-resolution`, `configured-item-order-compatibility`, `normalized-order-request-boundary`, and `legacy-order-compatibility` without trusting a browser-round-tripped AcceptedCheckout or treating this change as Order implementation.
- [x] 6.3 Add source/tests scans proving no remote Supabase, migration, storage provider, Stripe, PayPal, Resend, 17TRACK, DNS, Cloudflare deployment, production Cart persistence, or C1 backfill was introduced.
- [x] 6.4 Run focused Local Checkout tests and the existing offline regression gate with no live third-party service dependency.
- [x] 6.5 Run `npm run verify`, `npm run test:offline`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:rendered`, `openspec validate --all --strict`, and `git diff --check`; record independently attributable results before considering the change implementation-complete.
