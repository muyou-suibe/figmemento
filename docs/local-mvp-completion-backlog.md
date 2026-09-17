# Local MVP completion backlog

Source: [Local MVP gap audit](local-mvp-gap-audit.md). Provider work remains exclusively in `production-provider-gap-list.md`; explicit Phase 2 work is excluded.

## PART A — LOCAL ENGINEERING BACKLOG

Engineering gaps: **59**.

Severity meanings:

- `BLOCKER`: the original MVP cannot truthfully be locally complete without it.
- `HIGH`: material required commerce or operations capability.
- `MEDIUM`: required breadth, tooling or evidence that should follow blockers.
- `LOW`: bounded implementation with lower launch risk.

### A1 — Customization and photo intelligence

| Audit ID | Severity | Backlog item | Owner input | Completion evidence |
| --- | --- | --- | --- | --- |
| C03 | HIGH | Add server-owned customization surcharge rules and immutable allocation facts. | YES | Stale-rule rejection and Order snapshot tests. |
| C07 | HIGH | Add single-select customization fields. | YES | Domain, Admin, PDP, snapshot and responsive tests. |
| C08 | HIGH | Add bounded multi-select customization fields. | YES | Limit/order/normalization and snapshot tests. |
| C09 | MEDIUM | Add numeric customization fields. | YES | Range/step/server-normalization tests. |
| C10 | MEDIUM | Implement safe generic-file fields, or obtain an explicit MVP scope change. | YES | Approved scope plus MIME/size/private-storage acceptance if retained. |
| C20 | BLOCKER | Add measurable clarity/sharpness warning behavior. | YES | Real image fixtures show bounded pass/warn results. |
| C21 | BLOCKER | Add blur warning behavior. | YES | Threshold, false-positive and fallback tests. |
| C22 | HIGH | Add side-face/pose-risk warning behavior. | YES | Privacy-approved detector contract and fixtures. |
| C23 | HIGH | Add occlusion warning behavior. | YES | Bounded detector contract and fixtures. |
| C24 | HIGH | Add person-count mismatch warnings bound to Product configuration. | YES | Expected-count versus detected-count acceptance matrix. |
| C28 | HIGH | Add server-authoritative conditional-required rules tied to approved Product option/field predicates. | YES | Admin/PDP/handoff/Order snapshot tests, stale-rule rejection and cycle-safe dependency evidence. |
| C29 | HIGH | Add server-authoritative conditional-visibility rules without allowing hidden browser values to bypass validation. | YES | Visible/hidden, stale-rule, cross-field and browser-forgery acceptance matrix. |
| H03 | HIGH | Extend Admin customization editing to every approved new field/rule type. | YES | Restricted Admin HTTP and persisted Catalog read-back evidence. |
| N08 | MEDIUM | Add Product-specific upload requirements and approved example media to the PDP. | YES | Catalog-backed examples plus responsive and accessibility tests. |

### A2 — Payments, promotions and shipping

| Audit ID | Severity | Backlog item | Owner input | Completion evidence |
| --- | --- | --- | --- | --- |
| E07 | BLOCKER | Implement the provider-neutral refund domain and operator authorization. | YES | Policy-bound full/partial behavior, idempotency, concurrency and immutable ledger tests. |
| E13 | MEDIUM | Complete persistent fixed-amount coupon authority. | YES | Checkout/Order allocation evidence. |
| E14 | HIGH | Add free-shipping coupon semantics. | YES | Exact shipping allocation and stacking tests. |
| E15 | HIGH | Add coupon usage, product, country and per-user constraints. | YES | Durable redemption/race matrix. |
| E16 | HIGH | Move the 10%-off registration welcome coupon into persistent grant/redemption authority without inventing first-order eligibility. | YES | Concurrent registration grant and redemption tests. |
| E17 | MEDIUM | Add versioned threshold-discount rules. | YES | Server-calculated Order snapshot evidence. |
| E18 | MEDIUM | Add second/third-item quantity-discount rules. | YES | Quantity/stacking/allocation tests. |
| E19 | LOW | Add the configurable holiday-discount rule. | YES | Time-zone/version/stacking tests. |
| E20 | LOW | Add the configurable digital add-on price rule. | YES | Eligibility and allocation tests. |
| E28 | BLOCKER | Implement a durable provider-neutral webhook inbox, dedupe, ordering and reconciliation. | YES | Duplicate/out-of-order/crash/restart/replay tests with local signed fixtures. |
| E29 | MEDIUM | Add configurable abandoned-cart coupon capability without implementing Phase 2 recovery automation. | YES | Rule/configuration tests using an explicit eligible audience; no scheduler/email dependency. |
| F03 | HIGH | Add product-type shipping selectors. | YES | Rule precedence and mixed-Cart tests. |
| F04 | HIGH | Add authoritative weight-based shipping. | YES | Weight-source, band and snapshot evidence. |
| F05 | MEDIUM | Add quantity-based shipping rules. | YES | Boundary and mixed-line tests. |
| F06 | HIGH | Version the approved free-shipping threshold in persistent Checkout authority. | YES | Checkout/Order allocation tests around the threshold. |
| N06 | MEDIUM | Project an applicable authoritative promotion price on PDP. | YES | Promotion applicability, stale-rule and display tests. |
| N07 | HIGH | Show production and destination-aware international shipping ranges on PDP, including 7–15-day/no-exact-date policy. | YES | Range/no-promise tests across configured destinations. |
| N09 | MEDIUM | Add a clear authoritative PDP shipping explanation. | YES | Rule-backed copy and policy-link rendered tests. |
| N10 | MEDIUM | Project the Catalog-owned production-preview requirement explicitly on PDP. | NO | Required/optional products render the exact immutable configuration fact. |

### A3 — Customer account and privacy execution

| Audit ID | Severity | Backlog item | Owner input | Completion evidence |
| --- | --- | --- | --- | --- |
| G06 | HIGH | Add complete owner-scoped member Order history. | NO | Pagination, restart and cross-owner rejection tests. |
| G07 | HIGH | Add a protected account Order-detail route. | NO | Exact owner/session/capability tests and rendered UX. |
| G08 | MEDIUM | Add safe account coupon entitlement/redemption projection. | YES | Ownership and redemption tests. |
| G09 | BLOCKER | Implement an approved secure guest-Order claim contract; email alone remains insufficient. | YES | Atomic claim, conflict, audit, restart and cross-owner tests. |
| G12 | BLOCKER | Add the authenticated customer-facing personal-data deletion request entry. | YES | Fresh authorization, confirmation, idempotency and safe status tests. |
| G13 | MEDIUM | Add the exact `/account/profile` route or an explicit compatible alias with a bounded session-protected profile projection. | NO | Route/rendered tests plus signed-out, cross-owner and unavailable-state checks. |
| G14 | MEDIUM | Add `/auth/sign-in` compatibility as a real page or explicit safe redirect to the accepted local sign-in surface. | NO | Route/rendered redirect tests; G03/G04 remain separate provider acceptance. |
| K07 | BLOCKER | Implement the server-side idempotent erasure/retention executor, legal-retention separation, retries and completion audit. | YES | Restart/retry/fault tests proving erasure and retained-fact separation. |

### A4 — Admin and operational workflows

| Audit ID | Severity | Backlog item | Owner input | Completion evidence |
| --- | --- | --- | --- | --- |
| H04 | HIGH | Add restricted, audited pricing-rule management. | YES | No public mutation; stale-version and rollback tests. |
| H06 | MEDIUM | Complete persistent Admin Order filters and detail UX. | NO | Focused query/security/rendered acceptance. |
| H07 | HIGH | Expose only legal canonical lifecycle commands in the Admin console. | YES | No arbitrary status writes; command authorization and replay tests. |
| H11 | HIGH | Add restricted coupon management after coupon semantics are complete. | YES | CRUD/version/audit/redemption isolation tests. |
| H13 | MEDIUM | Add privacy-safe basic order/sales/conversion aggregates. | YES | Deterministic report fixtures and cross-project rejection. |
| H18 | HIGH | Add restricted, versioned shipping-rule configuration. | YES | Admin authorization, stale-version and Checkout-readback tests. |
| H19 | MEDIUM | Add a restricted `/admin/settings` surface for an explicit allowlist of basic non-secret business configuration. | YES | Admin authorization, audit/versioning and proof that provider credentials never enter browser-visible state. |
| M01 | HIGH | Define and implement quality redo/remake transitions. | YES | Immutable rework history and notification-trigger tests. |
| N02 | MEDIUM | Add an accessible Catalog/content-backed Home before/after composition. | YES | Desktop/mobile rendered evidence with approved paired assets. |
| N13 | MEDIUM | Add a Product-context PDP FAQ area independent of `/faq`. | YES | Catalog/content-backed FAQ rendered and interaction tests. |

### A5 — Analytics, SEO, messaging and environment contracts

| Audit ID | Severity | Backlog item | Owner input | Completion evidence |
| --- | --- | --- | --- | --- |
| J04 | MEDIUM | Prove upload-success events emit only after a server-confirmed receipt, including recovery. | NO | Focused event-correlation tests. |
| J07 | HIGH | Bind one canonical purchase event to the paid transition. | NO | Replay/concurrency produces exactly one event. |
| J08 | MEDIUM | Complete safe upload/payment/preview-revision error-event coverage. | NO | Privacy-safe failure-matrix tests. |
| K08 | HIGH | Complete environment/config inventory and fail-closed production composition. | YES | Environment matrix and secret-free configuration audit. |
| K11 | BLOCKER | Implement durable transactional-email intents, dispatcher leases/retries, suppression and callback state without activating a provider. | YES | Two-worker, crash/restart, replay and privacy tests. |
| K16 | MEDIUM | Complete per-product OpenGraph/Twitter share-image fallback. | YES | Metadata tests across the launch Catalog. |
| K17 | MEDIUM | Enforce meaningful alt descriptions for non-decorative launch assets. | YES | Catalog-readiness rejection plus rendered checks. |
| K18 | MEDIUM | Add Catalog-backed Product/Offer structured metadata. | YES | JSON-LD tests for availability, price/currency and safe canonical URL. |

## PART B — OWNER CONFIGURATION / POLICY BLOCKERS

Owner configuration gaps: **10**. Owner policy gaps: **3**.

These are not presented as code implementation tasks. Engineering work that also needs owner input remains in Part A.

| Audit ID | GAP_CLASS | Severity | Required owner decision/data | Completion evidence |
| --- | --- | --- | --- | --- |
| A02 | OWNER_CONFIGURATION | HIGH | Approved launch-country eligibility and shipping facts for US, UK, Canada and Australia. | Versioned four-country configuration accepted by owner. |
| A05 | OWNER_CONFIGURATION | BLOCKER | Final brand name and canonical domain. | Written owner approval and versioned configuration values. |
| B05 | OWNER_CONFIGURATION | HIGH | At least 21 final test SKUs with assets, prices and fulfillment facts. | Catalog readiness report shows 21+ approved purchasable SKUs. |
| B06 | OWNER_CONFIGURATION | HIGH | At least three validated supplier/product directions. | Owner-approved supplier/product feasibility packet. |
| D02 | OWNER_CONFIGURATION | HIGH | Which Product types are “complex” and must default to production preview. | Versioned classification/default policy. |
| M07 | OWNER_CONFIGURATION | HIGH | Actual support email and returns address. | Approved values in the launch configuration packet. |
| M08 | OWNER_CONFIGURATION | HIGH | Supplier cost, production lead time, packaging, weight and QC facts. | Versioned signed-off business data. |
| K06 | OWNER_POLICY | HIGH | Upload/media retention, deletion periods and exceptions. | Approved policy with version/effective date. |
| N01 | OWNER_CONFIGURATION | HIGH | Approved real finished-product imagery for the Home launch assortment. | Catalog asset readiness proves real approved finished-product media. |
| N03 | OWNER_CONFIGURATION | MEDIUM | Approved occasion/use-scene imagery for Home. | Catalog/content inventory includes accepted scene assets. |
| N05 | OWNER_CONFIGURATION | HIGH | Role-complete PDP main/detail/scene/video assets for applicable launch products. | Launch Catalog media coverage report. |
| N11 | OWNER_POLICY | HIGH | Exact scope and wording of the quality-issue free-remake promise. | Owner-approved policy version rendered on PDP and policy page. |
| N12 | OWNER_POLICY | HIGH | Exact personalized-goods no-reason-return wording, reconciled with conflicting reference copy. | Owner-approved policy version rendered consistently. |

## PART C — OPTIONAL QUALITY HARDENING

Quality-hardening recommendations: **4**. These are recommendations, not original MVP atomic requirements and not gate blockers.

| ID | Severity | Recommendation | Completion evidence |
| --- | --- | --- | --- |
| QH01 | MEDIUM | Complete keyboard, focus, accessible-name, live-status and contrast acceptance. | Automated checks plus manual keyboard evidence at required viewports. |
| QH02 | MEDIUM | Obtain independent legal review of privacy, terms, shipping and returns content. | Review record and any approved content revisions. |
| QH03 | MEDIUM | Define production observability, SLOs and alerting. | Approved operations plan plus synthetic alert evidence after hosting exists. |
| QH04 | LOW | Add per-upload consent capture/version snapshots only if legal review requires them. | Approved legal requirement plus privacy-safe implementation evidence. |

## Recommended execution order

1. Resolve Part B decisions needed by engineering: claim policy, refunds, image-inspection thresholds, retention and promotion/shipping facts.
2. Implement Part A blockers: photo intelligence, refunds, webhook inbox, guest-Order claim, deletion execution and durable email groundwork.
3. Complete customization, promotion/shipping and Admin breadth.
4. Complete account, analytics and SEO evidence.
5. Run Part C hardening independently; do not use it to redefine the source MVP.
