## 0. Configuration foundation

- [x] 0.1 Inventory every canonical, business, security, and provider configuration value; implement explicit typed environment composition and fail-closed mode/project/endpoint validation for K08, with no secret or provider credential in browser-visible state.
- [x] 0.2 Obtain the approved non-secret Admin-settings allowlist, then implement the restricted `/admin/settings` read/versioned-update/audit boundary for H19; reject stale, unknown, secret, cross-project, and unauthorized changes.
- [x] 0.3 Run the Phase 0 gate: environment matrix, secret/source scan, two-worker stale-version race, restart read-back, Admin authorization, rendered settings states, lint, typecheck, offline, fresh build→rendered, verify, OpenSpec strict, diff check, and migration integrity.

## 1. Customization model and Admin

- [x] 1.1 Obtain surcharge semantics and implement versioned server-owned customization surcharge rules/allocation snapshots for C03; reject browser amounts and stale revisions.
- [ ] 1.2 Obtain allowed option semantics and implement ordered single-select fields for C07 across domain, persistence, Admin, PDP, configured item, Cart, Checkout, and immutable Order snapshot.
- [ ] 1.3 Obtain bounds/ordering semantics and implement normalized bounded multi-select fields for C08 with duplicate, order, cardinality, stale-rule, and snapshot evidence.
- [ ] 1.4 Obtain range/step semantics and implement server-normalized numeric fields for C09 with exact validation and immutable snapshots.
- [ ] 1.5 Obtain generic-file policy and implement safe private generic-file fields for C10, or keep the task blocked pending an explicit MVP scope decision; do not downgrade it to image-only silently.
- [ ] 1.6 Obtain the predicate vocabulary and implement cycle-safe, versioned conditional-required rules for C28 across Admin, PDP, configured-item readiness, Cart/Checkout, and Order snapshots.
- [ ] 1.7 Implement conditional-visibility rules for C29 using the same approved predicate graph, ensuring hidden browser values cannot bypass validation or leak into accepted purchase facts.
- [ ] 1.8 Extend restricted Admin customization editing/read-back for H03 to every approved new field, surcharge, and conditional-rule type with expected version, audit, and rollback evidence.
- [ ] 1.9 Run the Phase 1 gate: real DB/RPC constraints, rule-cycle and stale-version matrix, cross-project/Admin rejection, Cart/Checkout/Order snapshot immutability, two-worker races, fault rollback, responsive PDP/Admin tests, baseline quality commands, and migration integrity.

## 2. Photo intelligence and upload guidance

- [ ] 2.1 Obtain approved sharpness thresholds/fallback policy and implement provider-neutral trusted clarity/sharpness evaluation for C20 with real private image fixtures and bounded outputs.
- [ ] 2.2 Implement the approved blur warning/rejection contract for C21, including inconclusive/unavailable and false-positive fixtures without browser-canvas authority.
- [ ] 2.3 Obtain approved pose policy and implement bounded side-face/pose-risk guidance for C22 with privacy-safe outputs.
- [ ] 2.4 Obtain approved occlusion policy and implement bounded occlusion guidance for C23 with privacy-safe outputs.
- [ ] 2.5 Obtain approved expected-person-count semantics and implement Product-bound mismatch guidance for C24, rejecting browser-authored counts as authority.
- [ ] 2.6 Obtain approved Product examples/guidance and implement the Catalog-backed PDP upload-requirements/example surface for N08 with private-media safety, accessibility, and responsive behavior.
- [ ] 2.7 Run the Phase 2 gate: real-byte fixtures, malformed/timeout/inconclusive behavior, threshold-version evidence, no external fetch/provider access, private locator leakage checks, PDP rendered/responsive tests, baseline quality commands, and migration integrity.

## 3. Payment reliability foundation

- [ ] 3.1 Obtain the refund policy and implement the provider-neutral refund aggregate/operator command for E07 with exact remaining amount, expected version, idempotency, immutable ledger, cross-owner/Admin rejection, and local fixtures only.
- [ ] 3.2 Implement the durable provider-neutral webhook inbox/reconciliation boundary for E28 with raw-evidence safety, stable dedupe, ordering, replay, crash/restart, unmatched/unknown states, and no real provider call.
- [ ] 3.3 Run the Phase 3 gate: refund concurrency/replay/fault matrix, duplicate/out-of-order inbox events, two live workers, process restart, safe Admin HTTP, no Payment/Order corruption, baseline quality commands, and migration integrity.

## 4. Promotions and coupons

- [ ] 4.1 Obtain rounding/stacking semantics and implement persistent fixed-amount coupon evaluation/allocation for E13.
- [ ] 4.2 Obtain stacking semantics and implement free-shipping coupon authority for E14 with exact shipping allocation facts.
- [ ] 4.3 Obtain usage/product/country/per-user rules and implement durable constrained redemption for E15 with atomic limit races.
- [ ] 4.4 Obtain welcome-coupon eligibility/expiry policy and implement concurrent registration grant plus redemption authority for E16 without inventing first-order eligibility.
- [ ] 4.5 Obtain threshold/stacking policy and implement versioned threshold-discount rules for E17.
- [ ] 4.6 Obtain quantity/stacking policy and implement second/third-item quantity-discount rules for E18.
- [ ] 4.7 Obtain holiday period/time-zone/stacking policy and implement versioned holiday-discount rules for E19.
- [ ] 4.8 Obtain digital add-on eligibility/allocation policy and implement the versioned price rule for E20.
- [ ] 4.9 Obtain explicit audience/expiry policy and implement abandoned-cart coupon capability for E29 without scheduler, email, recovery automation, or Phase 2 behavior.
- [ ] 4.10 Implement restricted, versioned, audited Admin coupon management for H11 after the promotion semantics above are accepted.
- [ ] 4.11 Implement owner-scoped account coupon entitlement/redemption projection for G08 with non-enumerating cross-owner failures.
- [ ] 4.12 Implement authoritative applicable PDP promotion-price projection for N06 without trusting browser or display-only discount facts.
- [ ] 4.13 Run the Phase 4 gate: all coupon terminal states, stacking/allocation, stale rules, concurrent last redemption, account/Admin/PDP authorization, Checkout/Order snapshots, rendered states, baseline quality commands, and migration integrity.

## 5. Shipping completeness

- [ ] 5.1 Obtain Product classification rules and implement product-type shipping selectors for F03 with mixed-Cart precedence evidence.
- [ ] 5.2 Obtain authoritative weights/bands and implement weight-based shipping for F04 without browser-authored weight.
- [ ] 5.3 Obtain quantity-band semantics and implement quantity-based shipping rules for F05.
- [ ] 5.4 Obtain threshold/stacking policy and implement the persistent versioned free-shipping threshold for F06 with exact Checkout/Order allocations.
- [ ] 5.5 Implement restricted versioned Admin shipping-rule configuration for H18 after F03–F06 semantics are approved.
- [ ] 5.6 Implement destination-aware PDP production/international shipping range projection for N07, including the approved 7–15-business-day/no-exact-date wording without carrier claims.
- [ ] 5.7 Implement the rule-backed PDP shipping explanation and policy link for N09.
- [ ] 5.8 Run the Phase 5 gate: destination/type/weight/quantity/threshold matrices, mixed Cart, stale/unavailable authority, Admin races, Checkout/Order snapshots, no exact ETA/carrier call, responsive PDP tests, baseline quality commands, and migration integrity.

## 6. Customer account, ownership, and privacy

- [ ] 6.1 Implement complete owner-scoped paginated member Order history for G06 using durable snapshots, restart recovery, and cross-owner rejection.
- [ ] 6.2 Implement protected account Order-detail route/read model for G07 with fresh session, exact ownership/capability, unavailable states, and rendered evidence.
- [ ] 6.3 Obtain verified-identity claim policy and implement atomic audited guest-Order claim for G09; email string alone, public reference, new session, or browser owner ID must never authorize a claim.
- [ ] 6.4 Obtain deletion confirmation/status policy and implement the authenticated personal-data deletion request surface for G12 with fresh authorization and idempotency.
- [ ] 6.5 Implement the exact session-protected `/account/profile` route for G13 with bounded profile projection and signed-out/unavailable states.
- [ ] 6.6 Implement `/auth/sign-in` route compatibility for G14 as a real safe page or explicit same-origin redirect to the accepted sign-in surface.
- [ ] 6.7 Obtain retention/exception policy and implement the idempotent server-side erasure/retention executor for K07 with leases/retries, legal-fact separation, provider-hook deferral, and completion audit.
- [ ] 6.8 Run the Phase 6 gate: guest/member continuity, multi-Order history, claim races/conflicts, restart, forged/expired/revoked authority, deletion fault/retry, retained-fact digest, route/rendered/mobile checks, baseline quality commands, and migration integrity.

## 7. Admin operations and fulfillment

- [ ] 7.1 Obtain pricing-management scope and implement restricted audited versioned pricing-rule management for H04 without public/browser price mutation.
- [ ] 7.2 Implement persistent Admin Order filters/detail for H06 using safe projections, pagination, cross-project rejection, and rendered UX.
- [ ] 7.3 Obtain the command allowlist and expose only legal canonical Admin Order/Fulfillment lifecycle commands for H07 with expected version, idempotency, and audit.
- [ ] 7.4 Obtain reporting definitions/privacy bounds and implement safe period-filtered order/sales/conversion aggregates for H13.
- [ ] 7.5 Obtain redo/remake policy and implement immutable quality redo/remake lifecycle for M01 without arbitrary status mutation or Supplier invocation.
- [ ] 7.6 Run the Phase 7 gate: Admin authorization, stale/replay/race/fault matrix, report determinism/privacy, legal lifecycle transitions, immutable Order/Payment facts, zero Supplier/Shipment side effects unless canonical command requires them, rendered Admin tests, baseline quality commands, and migration integrity.

## 8. Messaging and analytics groundwork

- [ ] 8.1 Obtain local message/suppression/retention policy and implement durable provider-neutral transactional-email intents, outbox leases/fences/retries, suppression, callback state, and truthful local outcomes for K11 without sending real email.
- [ ] 8.2 Bind J04 upload-success events to authoritative committed upload receipt/recovery results so client ambiguity or stale slots cannot emit false success.
- [ ] 8.3 Bind J07 exactly-once canonical purchase events to the durable paid transition with restart/concurrency-safe dedupe.
- [ ] 8.4 Complete privacy-safe upload/payment/preview-revision error-event coverage for J08 with bounded reason taxonomy and no secrets/private locators.
- [ ] 8.5 Run the Phase 8 gate: two-worker lease/fence, crash/restart/replay, suppression, canonical producer atomicity, exact event counts, failure matrix, no external network/provider delivery claim, baseline quality commands, and migration integrity.

## 9. SEO and customer-facing completeness

- [ ] 9.1 Obtain approved share assets/fallback policy and implement per-product OpenGraph/Twitter share-image fallback for K16.
- [ ] 9.2 Obtain/validate launch asset descriptions and enforce meaningful non-decorative alt text for K17 while preserving empty alt for decorative assets.
- [ ] 9.3 Implement Catalog-backed Product/Offer structured metadata for K18 with authoritative price/currency/availability/canonical URL and safe escaping.
- [ ] 9.4 Obtain approved paired content/assets and implement an accessible responsive Home before/after surface for N02 without fabricated outcome claims.
- [ ] 9.5 Implement explicit Catalog-owned production-preview requirement projection on PDP for N10.
- [ ] 9.6 Obtain approved Product-context FAQ content and implement the PDP FAQ area for N13 independently of the general `/faq` page.
- [ ] 9.7 Run the Phase 9 gate: metadata snapshots, Catalog readiness, missing-content states, accessibility, 1440/960/756/375 rendered checks, no fabricated claims, baseline quality commands, and migration integrity.

## 10. Final Local Engineering Gate

- [ ] 10.1 Mechanically reconcile the frozen audit, this traceability table, implementation evidence, and final code so all 59 Engineering IDs are primary-mapped once and accepted as `DONE`, with zero Provider/Phase 2/Owner-readiness scope substitution.
- [ ] 10.2 Run final security/authority regression across Catalog, Cart CAS, Checkout, immutable Orders, ownership, Upload, Payment, Fulfillment, Tracking, Digital Delivery, RLS/RPC, private Storage, idempotency, audit, cross-owner rejection, and fail-closed modes.
- [ ] 10.3 Run final lint, typecheck, offline tests, fresh build, rendered tests, full verify, OpenSpec strict, git diff check, and migration manifest/ledger/checksum validation; explain any test-count inventory change and permit no silent baseline decrease.
- [ ] 10.4 Produce the 59/59 provider-independent Local MVP completion report, separately listing unresolved Owner Configuration/Policy, Provider, Phase 2, optional hardening, and non-software readiness items without claiming production launch readiness.

## 11. Frozen 59-ID traceability

Current status for every row is the frozen audit value (`PARTIAL` or `NOT IMPLEMENTED`); target status is `DONE`. “Owner” means owner input is required before the primary task can be accepted. “Schema” is the expected implementation-time decision and does not authorize a migration during planning.

| Audit ID | Phase | Primary task | Current | Target | Owner | Schema | Primary implementation surface | Focused acceptance evidence | Final gate |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| K08 | 0 | 0.1 | PARTIAL | DONE | YES | YES | Config composition | Environment/secret/fail-closed matrix | 0.3, 10.1–10.4 |
| H19 | 0 | 0.2 | NOT IMPLEMENTED | DONE | YES | YES | Admin settings | Auth/version/audit/rendered tests | 0.3, 10.1–10.4 |
| C03 | 1 | 1.1 | NOT IMPLEMENTED | DONE | YES | YES | Pricing/config snapshots | Stale/forgery/allocation tests | 1.9, 10.1–10.4 |
| C07 | 1 | 1.2 | NOT IMPLEMENTED | DONE | YES | YES | Customization field model | Domain/Admin/PDP/snapshot tests | 1.9, 10.1–10.4 |
| C08 | 1 | 1.3 | NOT IMPLEMENTED | DONE | YES | YES | Customization field model | Bounds/order/normalization tests | 1.9, 10.1–10.4 |
| C09 | 1 | 1.4 | NOT IMPLEMENTED | DONE | YES | YES | Customization field model | Range/step/normalization tests | 1.9, 10.1–10.4 |
| C10 | 1 | 1.5 | NOT IMPLEMENTED | DONE | YES | YES | Private file customization | MIME/size/auth/storage tests | 1.9, 10.1–10.4 |
| C28 | 1 | 1.6 | NOT IMPLEMENTED | DONE | YES | YES | Conditional rules | Cycle/stale/forgery tests | 1.9, 10.1–10.4 |
| C29 | 1 | 1.7 | NOT IMPLEMENTED | DONE | YES | YES | Conditional rules | Hidden-value/visibility tests | 1.9, 10.1–10.4 |
| H03 | 1 | 1.8 | PARTIAL | DONE | YES | YES | Admin Catalog configuration | Restricted CRUD/read-back tests | 1.9, 10.1–10.4 |
| C20 | 2 | 2.1 | NOT IMPLEMENTED | DONE | YES | MAYBE | Trusted image inspection | Real-byte threshold tests | 2.7, 10.1–10.4 |
| C21 | 2 | 2.2 | NOT IMPLEMENTED | DONE | YES | MAYBE | Trusted image inspection | Blur/inconclusive tests | 2.7, 10.1–10.4 |
| C22 | 2 | 2.3 | NOT IMPLEMENTED | DONE | YES | MAYBE | Trusted image inspection | Pose/privacy fixture tests | 2.7, 10.1–10.4 |
| C23 | 2 | 2.4 | NOT IMPLEMENTED | DONE | YES | MAYBE | Trusted image inspection | Occlusion/privacy tests | 2.7, 10.1–10.4 |
| C24 | 2 | 2.5 | NOT IMPLEMENTED | DONE | YES | MAYBE | Product inspection rules | Expected/detected count matrix | 2.7, 10.1–10.4 |
| N08 | 2 | 2.6 | PARTIAL | DONE | YES | MAYBE | PDP/Catalog assets | Responsive/a11y/readiness tests | 2.7, 10.1–10.4 |
| E07 | 3 | 3.1 | NOT IMPLEMENTED | DONE | YES | YES | Refund aggregate/Admin command | Idempotency/race/ledger tests | 3.3, 10.1–10.4 |
| E28 | 3 | 3.2 | PARTIAL | DONE | YES | YES | Webhook inbox/reconciliation | Duplicate/order/restart tests | 3.3, 10.1–10.4 |
| E13 | 4 | 4.1 | PARTIAL | DONE | YES | YES | Promotion rules | Fixed allocation tests | 4.13, 10.1–10.4 |
| E14 | 4 | 4.2 | NOT IMPLEMENTED | DONE | YES | YES | Promotion rules | Free-shipping allocation tests | 4.13, 10.1–10.4 |
| E15 | 4 | 4.3 | PARTIAL | DONE | YES | YES | Coupon constraints/redemption | Limit/race matrix | 4.13, 10.1–10.4 |
| E16 | 4 | 4.4 | PARTIAL | DONE | YES | YES | Coupon grants/redemption | Concurrent registration tests | 4.13, 10.1–10.4 |
| E17 | 4 | 4.5 | PARTIAL | DONE | YES | YES | Promotion rules | Threshold boundary tests | 4.13, 10.1–10.4 |
| E18 | 4 | 4.6 | NOT IMPLEMENTED | DONE | YES | YES | Promotion rules | Quantity/allocation tests | 4.13, 10.1–10.4 |
| E19 | 4 | 4.7 | NOT IMPLEMENTED | DONE | YES | YES | Promotion rules | Time-zone/version tests | 4.13, 10.1–10.4 |
| E20 | 4 | 4.8 | NOT IMPLEMENTED | DONE | YES | YES | Promotion rules | Eligibility/allocation tests | 4.13, 10.1–10.4 |
| E29 | 4 | 4.9 | NOT IMPLEMENTED | DONE | YES | YES | Coupon capability | Audience/no-automation tests | 4.13, 10.1–10.4 |
| H11 | 4 | 4.10 | NOT IMPLEMENTED | DONE | YES | YES | Admin coupon management | Auth/version/audit tests | 4.13, 10.1–10.4 |
| G08 | 4 | 4.11 | NOT IMPLEMENTED | DONE | YES | YES | Account coupon projection | Owner/redemption tests | 4.13, 10.1–10.4 |
| N06 | 4 | 4.12 | PARTIAL | DONE | YES | NO | PDP promotion projection | Applicability/render tests | 4.13, 10.1–10.4 |
| F03 | 5 | 5.1 | NOT IMPLEMENTED | DONE | YES | YES | Shipping rules | Type/mixed-Cart tests | 5.8, 10.1–10.4 |
| F04 | 5 | 5.2 | NOT IMPLEMENTED | DONE | YES | YES | Shipping rules | Weight/band tests | 5.8, 10.1–10.4 |
| F05 | 5 | 5.3 | NOT IMPLEMENTED | DONE | YES | YES | Shipping rules | Quantity boundary tests | 5.8, 10.1–10.4 |
| F06 | 5 | 5.4 | PARTIAL | DONE | YES | YES | Shipping rules | Threshold/allocation tests | 5.8, 10.1–10.4 |
| H18 | 5 | 5.5 | NOT IMPLEMENTED | DONE | YES | YES | Admin shipping rules | Auth/stale/read-back tests | 5.8, 10.1–10.4 |
| N07 | 5 | 5.6 | PARTIAL | DONE | YES | NO | PDP shipping projection | Destination/no-promise tests | 5.8, 10.1–10.4 |
| N09 | 5 | 5.7 | NOT IMPLEMENTED | DONE | YES | NO | PDP shipping explanation | Rule/copy/link render tests | 5.8, 10.1–10.4 |
| G06 | 6 | 6.1 | PARTIAL | DONE | NO | NO | Account Order history | Pagination/restart/auth tests | 6.8, 10.1–10.4 |
| G07 | 6 | 6.2 | PARTIAL | DONE | NO | NO | Account Order detail | Session/capability/render tests | 6.8, 10.1–10.4 |
| G09 | 6 | 6.3 | NOT IMPLEMENTED | DONE | YES | YES | Guest claim command | Atomic/conflict/cross-owner tests | 6.8, 10.1–10.4 |
| G12 | 6 | 6.4 | NOT IMPLEMENTED | DONE | YES | YES | Privacy request | Fresh-auth/idempotency tests | 6.8, 10.1–10.4 |
| G13 | 6 | 6.5 | NOT IMPLEMENTED | DONE | NO | NO | Account profile route | Auth/render/unavailable tests | 6.8, 10.1–10.4 |
| G14 | 6 | 6.6 | NOT IMPLEMENTED | DONE | NO | NO | Sign-in compatibility route | Route/redirect/render tests | 6.8, 10.1–10.4 |
| K07 | 6 | 6.7 | NOT IMPLEMENTED | DONE | YES | YES | Erasure/retention executor | Lease/restart/fault/audit tests | 6.8, 10.1–10.4 |
| H04 | 7 | 7.1 | NOT IMPLEMENTED | DONE | YES | YES | Admin pricing rules | Auth/version/rollback tests | 7.6, 10.1–10.4 |
| H06 | 7 | 7.2 | PARTIAL | DONE | NO | NO | Admin Order read model | Filter/security/render tests | 7.6, 10.1–10.4 |
| H07 | 7 | 7.3 | PARTIAL | DONE | YES | MAYBE | Admin lifecycle commands | Legal transition/replay tests | 7.6, 10.1–10.4 |
| H13 | 7 | 7.4 | NOT IMPLEMENTED | DONE | YES | MAYBE | Admin aggregate reports | Deterministic/privacy tests | 7.6, 10.1–10.4 |
| M01 | 7 | 7.5 | PARTIAL | DONE | YES | YES | Quality redo/remake lifecycle | Immutable history tests | 7.6, 10.1–10.4 |
| K11 | 8 | 8.1 | NOT IMPLEMENTED | DONE | YES | YES | Durable email outbox | Lease/retry/suppression tests | 8.5, 10.1–10.4 |
| J04 | 8 | 8.2 | PARTIAL | DONE | NO | MAYBE | Upload analytics binding | Commit/recovery correlation tests | 8.5, 10.1–10.4 |
| J07 | 8 | 8.3 | PARTIAL | DONE | NO | YES | Purchase analytics binding | Exactly-once race/restart tests | 8.5, 10.1–10.4 |
| J08 | 8 | 8.4 | PARTIAL | DONE | NO | MAYBE | Error analytics taxonomy | Privacy/failure-matrix tests | 8.5, 10.1–10.4 |
| K16 | 9 | 9.1 | PARTIAL | DONE | YES | MAYBE | SEO/Catalog metadata | Product fallback snapshots | 9.7, 10.1–10.4 |
| K17 | 9 | 9.2 | PARTIAL | DONE | YES | MAYBE | Catalog asset readiness | Alt rejection/render tests | 9.7, 10.1–10.4 |
| K18 | 9 | 9.3 | PARTIAL | DONE | YES | NO | Product/Offer JSON-LD | Schema/escaping tests | 9.7, 10.1–10.4 |
| N02 | 9 | 9.4 | NOT IMPLEMENTED | DONE | YES | MAYBE | Home content/assets | Responsive/a11y tests | 9.7, 10.1–10.4 |
| N10 | 9 | 9.5 | PARTIAL | DONE | YES | NO | PDP fulfillment projection | Required/optional render tests | 9.7, 10.1–10.4 |
| N13 | 9 | 9.6 | NOT IMPLEMENTED | DONE | YES | MAYBE | PDP Product FAQ | Content/render/interaction tests | 9.7, 10.1–10.4 |
