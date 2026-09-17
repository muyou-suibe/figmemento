# Local MVP gap audit

Audit basis: `独立站构建项目需求.md` at `80a0698898c5e43e9de56341582f5826c198fde5`.

This audit treats the original requirement as authority. `docs/production-handoff/` and the completed OpenSpec change are evidence only. A row is `DONE` only when repository evidence supports the exact requirement. `PROVIDER-DEPENDENT` is reserved for a true external account, credential, network or provider acceptance dependency. `PHASE 2` is used only where the source explicitly defers the requirement.

## Raw summary

- Atomic requirements: **210**
- MVP rows: **196**
- Explicit Phase 2 rows: **14**
- `DONE`: **105**
- `PARTIAL`: **34**
- `PROVIDER-DEPENDENT`: **19**
- `NOT IMPLEMENTED`: **38**
- `PHASE 2`: **14**
- Engineering gaps remaining: **59**
- Owner-configuration gaps remaining: **10**
- Owner-policy gaps remaining: **3**
- Provider-dependent remaining: **19**
- Quality-hardening recommendations: **4**
- Optional production extensions: **1**
- Accepted implementation extras outside source count: **6**
- Non-software KPI / out-of-software-handoff items: **7**
- Owner input required: **97**

Local engineering gate: **FAIL — 59 ENGINEERING GAPS REMAIN**

Owner/business readiness gate: **FAIL — 13 OWNER CONFIGURATION/POLICY GAPS REMAIN**

Provider handoff count: **19**

Phase 2 count: **14**

## Gap-class ledger

Every non-`DONE` original atomic row appears exactly once below. `OWNER_INPUT_REQUIRED` remains independent: an engineering row may still need an owner policy decision before implementation starts.

| GAP_CLASS | Atomic requirement IDs | Count |
| --- | --- | ---: |
| ENGINEERING | C03, C07, C08, C09, C10, C20, C21, C22, C23, C24, C28, C29, E07, E13, E14, E15, E16, E17, E18, E19, E20, E28, E29, F03, F04, F05, F06, G06, G07, G08, G09, G12, G13, G14, H03, H04, H06, H07, H11, H13, H18, H19, J04, J07, J08, K07, K08, K11, K16, K17, K18, M01, N02, N06, N07, N08, N09, N10, N13 | 59 |
| OWNER_CONFIGURATION | A02, A05, B05, B06, D02, M07, M08, N01, N03, N05 | 10 |
| OWNER_POLICY | K06, N11, N12 | 3 |
| PROVIDER | A01, D11, E08, E09, E10, E27, F09, G03, G04, G10, I08, J09, J10, J11, K12, K13, K14, M04, M05 | 19 |
| PHASE_2 | A18, K10, L01, L02, L03, L04, L05, L06, L07, L08, L09, L10, L11, L12 | 14 |

## Owner-added / engineering quality hardening

These recommendations are intentionally outside the original atomic MVP count and neither gate.

| ID | Recommendation | GAP_CLASS | Source basis | Current evidence | Recommended action |
| --- | --- | --- | --- | --- | --- |
| QH01 | Complete keyboard, focus, accessible-name, live-status and contrast acceptance. | QUALITY_HARDENING | Owner-added engineering quality recommendation; the original source requires responsive/no-overflow and understandable feedback but does not specify a complete WCAG matrix. | Components use labels, ARIA controls/live regions and semantic buttons; no complete accessibility audit is recorded. | Run focused automated and manual accessibility acceptance at required viewports. |
| QH02 | Obtain independent legal review of privacy, terms, shipping and returns content before public launch. | QUALITY_HARDENING | Owner-readiness recommendation; the original source requires the policy pages/content but does not explicitly require independent legal approval. | Policy pages exist; no legal-review artifact is recorded. | Seek jurisdiction-appropriate review before launch without treating it as a code gap. |
| QH03 | Define production observability, SLOs and alerting. | QUALITY_HARDENING | Production-operations recommendation; the original source requires testing and launch but does not specify an observability/SLO platform. | Local tests and bounded errors exist; no production telemetry/SLO evidence exists. | Select an observability approach during production operations planning. |
| QH04 | Add per-upload consent capture and consent-version snapshots if legal review requires them. | QUALITY_HARDENING | Privacy hardening; the source requires privacy disclosure, retention/deletion policy and a deletion path, but not a per-upload checkbox or consent-version record. | Private media and privacy copy exist; no per-upload consent snapshot exists. | Decide after legal review without weakening K02, K06 or K07. |

## Optional production extensions

These are useful capabilities not required by the original MVP and are excluded from all original requirement counts and gates.

| ID | Extension | Why optional | Current evidence |
| --- | --- | --- | --- |
| OP01 | Carrier quotation and shipping-label APIs | The source requires configured shipping rules and assigns 17TRACK to tracking, explicitly not quotation. It never requires carrier rate-shopping or label purchase. | No carrier rate/label provider exists; this is not an MVP defect. |

## Accepted implementation extras outside source count

These useful accepted behaviors have no exact original requirement as separate MVP atoms. They remain documented without inflating source coverage or either gate.

| ID | Accepted extra | Evidence |
| --- | --- | --- |
| X01 | Bounded Contact message intake | `app/contact/page.tsx`, `app/api/local-contact/route.ts`, `tests/local-contact.test.mjs` |
| X02 | Canonical Order creation does not silently clear retained Cart lines | Order-success Cart-retention contracts and Task 11 recovery evidence |
| X03 | Tax is explicitly not activated and amount remains null | Local Checkout/Order contract tests |
| X04 | Local database migrations are ordered, checksummed and rebuildable | 37/37 manifest/ledger/rebuild evidence |
| X05 | Logout revokes a durable session across processes | Durable revoke and multi-process acceptance evidence |
| X06 | Customization fields support an unconditional static `required` flag | `CustomizationFieldCore.required` is persisted and enforced by `validateCustomizationValues`; this does not satisfy source-required conditional-required rules. |

## Non-software project KPI / out-of-software handoff

These source obligations are tracked so they are not silently lost, but they measure business, marketing or schedule execution rather than local software completeness. They do not block the Local Engineering Gate. SKU and supplier readiness remain in the atomic matrix as `B05` and `B06` because those facts directly determine whether the website can present a launch assortment.

| ID | Source obligation | Classification | Handoff evidence needed |
| --- | --- | --- | --- |
| NS01 | Complete at least 10 competitor teardowns. | NON_SOFTWARE_PROJECT_KPI | Research packet listing the compared sites and findings. |
| NS02 | Select 1–2 lead categories only after research and performance evidence. | NON_SOFTWARE_PROJECT_KPI | Owner decision linked to research, margin and conversion/content evidence. |
| NS03 | Target website launch in week three. | NON_SOFTWARE_PROJECT_KPI | Project schedule/outcome record; not a code capability. |
| NS04 | Operate TikTok, Instagram and Pinterest accounts/content launch. | NON_SOFTWARE_PROJECT_KPI | Account/content publication record. |
| NS05 | Prepare at least 30 content items. | NON_SOFTWARE_PROJECT_KPI | Approved content inventory. |
| NS06 | Contact at least 30 creators/influencers. | NON_SOFTWARE_PROJECT_KPI | Outreach log. |
| NS07 | Use first-month advertising to validate creative, audience and funnel rather than impose a profit target. | NON_SOFTWARE_PROJECT_KPI | Campaign brief and measurement report. |

## Atomic requirement matrix

| ID | Requirement | Original source section/line | MVP or Phase 2 | Status | GAP_CLASS | LOCAL_COMPLETION_REQUIRED | OWNER_INPUT_REQUIRED | Evidence | Gap | Recommended next action | Provider dependency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | Launch as a real overseas personalized-gift commerce site | Goals, 14–25 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | `docs/production-handoff/handoff-status.md` classifies the local core complete but every production row unlaunched. | Public production activation is not performed. | Complete local gaps, then execute separately authorized production integration. | Hosting, DNS and production data. |
| A02 | Initial markets are US, UK, Canada and Australia | Document info, 6–12 | MVP | PARTIAL | OWNER_CONFIGURATION | YES | YES | `docs/production-handoff/09-business-configuration.md` leaves launch countries/rules open; local fixture proves US only. | No accepted four-country rule matrix. | Approve and encode launch-country eligibility and rates. | None for static rules. |
| A03 | Initial language is English | Document info, 6–12 | MVP | DONE | — | NO | NO | `app/storefront/ReferenceLanguageProvider.tsx`; English is the default shell language. | None locally. | Preserve as default. | None. |
| A04 | Initial settlement/display currency is USD | Document info, 6–12 | MVP | DONE | — | NO | NO | `app/application/catalog-storefront.ts`; local Catalog and Checkout tests use canonical USD cents. | None locally. | Preserve server-owned currency. | Payment providers later. |
| A05 | Final brand name and domain are approved | Document info and owner inputs, 6–12, 533–553 | MVP | PARTIAL | OWNER_CONFIGURATION | YES | YES | `app/config/identity.ts` uses FigMemento; requirement says PhotoGift is provisional; handoff business checklist is open. | Final owner approval is absent. | Owner supplies final brand/domain; update configuration under a separate change. | Registrar/DNS after decision. |
| A06 | Homepage presents the brand and priority product categories | Goals and storefront, 29–45, 82–94 | MVP | DONE | — | NO | NO | `app/page.tsx`; Fusion Home rendered/visual tests. | None. | Maintain. | None. |
| A07 | Shop supports product browsing | User journey and pages, 60–94 | MVP | DONE | — | NO | NO | `app/shop/page.tsx`; `tests/figmemento-fusion-discovery.test.mjs`. | None. | Maintain. | None. |
| A08 | Category pages browse real Catalog categories | Pages, 82–94, 216–251 | MVP | DONE | — | NO | NO | `app/category/[slug]/page.tsx`; Catalog storefront authority tests. | None. | Maintain Catalog-backed routing. | None. |
| A09 | Search can find Catalog products | Pages, 82–94, 216–251 | MVP | DONE | — | NO | NO | Shared shell search and `app/api/products/route.ts`; discovery/rendered contracts. | None. | Maintain. | None. |
| A10 | Product detail page shows media, copy, price and availability | PDP, 253–273 | MVP | DONE | — | NO | NO | `app/product/[slug]/page.tsx`; `tests/figmemento-fusion-pdp.test.mjs`. | None. | Maintain dynamic Catalog facts. | None. |
| A11 | Cart page supports line display, quantity and removal | Pages, 82–94 | MVP | DONE | — | NO | NO | `app/cart/page.tsx`; persistent Cart CAS and rendered tests. | None. | Maintain. | None. |
| A12 | Checkout collects customer and shipping information | Journey and pages, 60–94 | MVP | DONE | — | NO | NO | `app/checkout/page.tsx`; `app/domain/local-checkout.ts`; checkout tests. | None locally. | Maintain server validation. | None. |
| A13 | Order success presents safe order state | Pages, 82–94 | MVP | DONE | — | NO | NO | `app/order/success/[reference]/page.tsx`; Fusion order tests. | None locally. | Maintain capability/session authorization. | None. |
| A14 | Customer can track an order | Journey and pages, 60–94 | MVP | DONE | — | NO | NO | `app/track-order/page.tsx`; customer tracking HTTP and rendered tests. | Real carrier data is separate. | Maintain safe projection. | 17TRACK for production data. |
| A16 | FAQ, Terms, Privacy and Shipping & Returns pages exist | Pages, 82–94, 216–251 | MVP | DONE | — | NO | NO | `app/faq`, `app/privacy`, `app/terms`, `app/shipping-returns`; About, Journal and Contact are extra surfaces rather than source atoms. | None against the exact required-page list. | Maintain; independent legal review remains optional hardening QH02. | None. |
| A17 | Responsive desktop/tablet/mobile storefront has no horizontal overflow | UX and acceptance, 443–484 | MVP | DONE | — | NO | NO | Fusion rendered suites and final customer-polish acceptance cover desktop/mobile overflow. | None in accepted local baseline. | Preserve focused tests. | None. |
| A18 | Spanish localization | Phase 2 language, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | `ReferenceLanguageProvider.tsx` and completeness tests implement Spanish ahead of the source schedule; Chinese is an extra implementation beyond the original requirement. | Source explicitly defers Spanish; production localization governance and professional review are unapproved. | Treat ES and bonus ZH implementation as non-MVP evidence; complete localization governance in Phase 2. | Professional translation review. |
| A20 | Safe unavailable/error states preserve navigation and do not leak internals | Acceptance/security, 455–484 | MVP | DONE | — | NO | NO | `tests/rendered-html.test.mjs`, response-leakage and fail-closed regression tests. | None locally. | Maintain. | None. |
| B01 | Product, SKU, variant and selected options are data-configured canonical facts | Product strategy/model, 29–45, 275–288 | MVP | DONE | — | NO | NO | Catalog domain, persistent Catalog schema and Task 4 acceptance evidence. | None locally. | Maintain Catalog authority. | None. |
| B02 | Categories are data-configured | Product strategy/model, 29–45, 275–288 | MVP | DONE | — | NO | NO | Admin Catalog category boundary and persistent Catalog migrations/tests. | None locally. | Maintain. | None. |
| B03 | Product assets and SEO metadata are data-configured | Product strategy/model, 29–45, 275–288 | MVP | DONE | — | NO | NO | `app/domain/catalog/asset.ts`, category-product SEO fields and Admin asset routes/tests. | None locally. | Maintain. | Production media later. |
| B04 | Fulfillment classification is data-configured | Product model, 275–288 | MVP | DONE | — | NO | NO | Product fulfillment configuration domain, Admin route and persistent fixture evidence. | None locally. | Maintain immutable purchase snapshot. | None. |
| B05 | Catalog supports at least 21 test SKUs before launch | KPI, 519–531 | MVP | NOT IMPLEMENTED | OWNER_CONFIGURATION | YES | YES | Existing synthetic persistent fixtures cover only a small acceptance set; no evidence of 21 approved SKUs. | Assortment and content are missing. | Owner supplies 21 SKU facts/assets/prices; load via authorized Catalog workflow. | Supplier/business input. |
| B06 | At least three product directions/suppliers are validated | KPI and owner inputs, 519–553 | MVP | NOT IMPLEMENTED | OWNER_CONFIGURATION | YES | YES | Supplier runtime is local memory/test-only; handoff freezes persistent Supplier as unsupported. | No accepted supplier roster or production feasibility. | Owner selects suppliers and supplies mappings/cost/lead-time facts. | Supplier coordination. |
| B07 | Current Catalog may not be hardcoded into presentation | Product strategy, 29–45 | MVP | DONE | — | NO | NO | Catalog repository boundary and dynamic PDP/Shop tests. | None. | Maintain. | None. |
| B08 | Historical Order snapshots do not re-resolve from current Catalog | Data model, 275–288, 384–407 | MVP | DONE | — | NO | NO | Immutable purchase snapshot migrations and Task 11 recovery evidence. | None. | Maintain. | None. |
| C01 | Customer selects real SKU/specification options | Customization, 96–108 | MVP | DONE | — | NO | NO | `VariantSelector.tsx`, configured-item handoff acceptance and Catalog SKU graph tests. | None. | Maintain. | None. |
| C02 | Option selection updates authoritative price | Customization, 96–108 | MVP | DONE | — | NO | NO | Catalog price projection, configured-item and Checkout authority tests. | Only SKU pricing, not arbitrary customization surcharge rules. | Preserve canonical SKU price; complete C03 separately. | None. |
| C03 | Customization rules can add server-calculated surcharges | Customization/model, 96–108, 275–288 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Customization field model has no surcharge rule authority; price comes from SKU/rules only. | Per-customization surcharge model/editor/snapshot absent. | Define bounded surcharge rule schema and acceptance contract. | None. |
| C04 | A product can have one or multiple customization fields | Customization, 96–108 | MVP | DONE | — | NO | NO | Configuration revisions contain ordered field arrays; PDP composition tests cover multiple fields. | None. | Maintain. | None. |
| C05 | Short-text customization field | Customization/model, 96–108, 275–288 | MVP | DONE | — | NO | NO | `CustomizationFieldKind` includes `short_text`; tests cover it. | None. | Maintain. | None. |
| C06 | Long-text customization field | Customization/model, 96–108, 275–288 | MVP | DONE | — | NO | NO | `CustomizationFieldKind` includes `long_text`; tests cover it. | None. | Maintain. | None. |
| C07 | Single-select customization field independent of SKU options | Customization/model, 96–108, 275–288 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | `app/domain/customization-field.ts` permits only image/short_text/long_text. | Field kind, validation, editor and snapshots absent. | Add under a reviewed customization expansion. | None. |
| C08 | Multi-select customization field | Customization/model, 96–108, 275–288 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Same three-kind type boundary. | Multi-select semantics absent. | Specify limits/order/pricing then implement. | None. |
| C09 | Numeric customization field | Customization/model, 96–108, 275–288 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Same three-kind type boundary. | Range/step/normalization absent. | Specify numeric contract then implement. | None. |
| C10 | Generic file customization field | Customization/model, 96–108, 275–288 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Upload authority accepts image fields only. | Non-image file policy/storage/preview absent. | Decide whether MVP truly needs generic files; then design safe type boundary. | None. |
| C11 | One-photo customization | Customization, 96–108 | MVP | DONE | — | NO | NO | Image constraints support min/max count; image-field tests. | None. | Maintain. | None. |
| C12 | Multi-photo customization | Customization, 96–108 | MVP | DONE | — | NO | NO | Durable multi-slot Draft and Task 10/11 evidence. | None. | Maintain. | None. |
| C13 | Drag/drop photo upload | Customization, 96–108 | MVP | DONE | — | NO | NO | `ProductCustomizationImageField.tsx`; Task 10 browser evidence. | None. | Maintain accessible fallback. | None. |
| C14 | Reorder uploaded photos | Customization, 96–108 | MVP | DONE | — | NO | NO | Stable slot reorder implementation and recovery evidence. | None. | Maintain. | None. |
| C15 | Crop and preview uploaded photos | Customization, 96–108 | MVP | DONE | — | NO | NO | Crop editor, trusted helper and orientation/crop tests. | Preview is local renderer evidence, not production renderer. | Preserve; select production renderer later. | Production media runtime. |
| C16 | Validate declared and detected MIME | Customization/security, 96–108, 332–345 | MVP | DONE | — | NO | NO | Upload inspection and worker media matrix. | None locally. | Maintain. | None. |
| C17 | Validate actual bytes and decoded image integrity | Customization/security, 96–108, 332–345 | MVP | DONE | — | NO | NO | Sharp helper acceptance rejects malformed/decompression payloads. | None locally. | Maintain. | None. |
| C18 | Validate byte-size limits | Customization/security, 96–108, 332–345 | MVP | DONE | — | NO | NO | Authoritative field `maxBytes` and upload tests. | None. | Maintain. | None. |
| C19 | Validate decoded dimensions and pixel count | Customization/security, 96–108, 332–345 | MVP | DONE | — | NO | NO | Image field constraints plus server decode tests. | None. | Maintain. | None. |
| C20 | Detect image clarity/sharpness problems | Customization, 96–108 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Final traceability explicitly states no image-content recognition; no sharpness score authority exists. | Required warning is absent. | Define measurable local threshold and false-positive policy. | Optional vision service only if chosen. |
| C21 | Detect blur | Customization, 96–108 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No blur detector or test; marketing references to blurry photos are not validation. | Required warning is absent. | Add deterministic inspection or approved provider adapter. | Optional vision service. |
| C22 | Detect side-face/pose risk | Customization, 96–108 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No face/pose inspection authority. | Required warning is absent. | Owner approves model/privacy policy; implement warning-only adapter. | Likely image-analysis provider/model. |
| C23 | Detect occlusion | Customization, 96–108 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No occlusion inspection authority. | Required warning is absent. | Same as C22. | Likely image-analysis provider/model. |
| C24 | Detect person-count mismatch | Customization, 96–108 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No people-count inspection authority. | Required warning is absent. | Bind expected subject count to product config and safe inspection result. | Likely image-analysis provider/model. |
| C25 | Customer can add special instructions | Customization/PDP, 96–108, 253–273 | MVP | DONE | — | NO | NO | Long/short text fields and configured-item snapshots. | Product fixture must configure one. | Ensure launch Catalog fields are populated. | Owner Catalog input. |
| C26 | Order stores original receipt, crop, order and customization snapshots | Customization/model, 96–108, 275–288 | MVP | DONE | — | NO | NO | Receipt bindings, immutable Order item snapshots and Task 6/11 evidence. | None. | Maintain. | None. |
| C28 | CustomizationRule can make a field conditionally required | Product model, 275–288 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | The model has only a static boolean `required`; `customization-deferred-feature-drift.test.mjs` explicitly rejects `condition` and `dependsOn`. | No server-owned predicate language, dependency graph, stale-rule versioning or conditional-required evaluation exists. | Define a bounded rule vocabulary tied to Product options/fields and enforce it in Admin, PDP, handoff and Order snapshots. | None. |
| C29 | CustomizationRule can conditionally show or hide a field | Product model, 275–288 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Active fields render as an ordered list; the domain and Admin parser reject condition/dependency properties. | No authoritative conditional-visibility rule or client/server evaluation contract exists. | Add a cycle-safe versioned visibility rule and prove browser visibility cannot bypass server validation. | None. |
| D01 | Production preview requirement is configurable per product | Preview, 110–122 | MVP | DONE | — | NO | NO | Product fulfillment configuration and immutable `requiresProductionPreview` purchase fact. | Launch values require owner input. | Configure launch products. | None. |
| D02 | Complex products default to preview-required | Preview, 110–122 | MVP | PARTIAL | OWNER_CONFIGURATION | YES | YES | Mechanism exists; no evidence that all launch complex-product fixtures use the owner-approved default. | Launch Catalog classification incomplete. | Owner defines complex types and default policy; assert fixtures. | None. |
| D03 | Operator can publish immutable complete previews | Preview, 110–122 | MVP | DONE | — | NO | NO | Operator preview route; manifest v1–v3 Task 7 acceptance. | None locally. | Maintain. | None. |
| D04 | Customer can view current preview in account/order flow | Preview, 110–122 | MVP | DONE | — | NO | NO | Customer preview HTTP boundary and Order success/account presentation. | Email entry is external. | Maintain. | Email provider for notification. |
| D05 | Customer can approve exact current preview | Preview, 110–122 | MVP | DONE | — | NO | NO | Task 7.3 customer approval HTTP/DB evidence. | None. | Maintain fresh auth/version check. | None. |
| D06 | Customer can request revision with bounded text | Preview, 110–122 | MVP | DONE | — | NO | NO | Task 7.3 revision decision, note bound and replay evidence. | None. | Maintain. | None. |
| D07 | Revision requests are limited to two per Order | Preview, 110–122 | MVP | DONE | — | NO | NO | Durable per-Order counter and no-v4 tests. | None. | Maintain. | None. |
| D08 | Preview decisions and operations are audited | Preview/security, 110–122, 332–345 | MVP | DONE | — | NO | NO | Fulfillment decisions/action/audit persistence and security evidence. | None locally. | Maintain. | None. |
| D09 | Admin can timeout-confirm after server-owned deadline | Preview, 110–122 | MVP | DONE | — | NO | NO | Signed Admin timeout route and Task 7.6 acceptance. | Local signed Admin is not production identity. | Preserve contract; integrate production Admin later. | Production Admin identity. |
| D10 | Production cannot start before required confirmation | Preview, 110–122 | MVP | DONE | — | NO | NO | Task 7.5 production gate and real acceptance. | None. | Maintain. | None. |
| D11 | Preview/revision customer notifications are sent | Preview/email, 110–122, 409–425 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | `docs/production-handoff/05-email-integration.md`: no production email sent; provider triggers are planned only. | Real transactional messaging absent. | Implement durable outbox/dispatcher and approved provider. | Resend/SMTP and sending domain. |
| D12 | Authorized operator can start production after all gates | Fulfillment lifecycle, 290–330 | MVP | DONE | — | NO | NO | `start_production` canonical command and Task 7.5/11 acceptance. | Supplier execution is separate. | Maintain. | None. |
| D13 | Authorized operator can mark quality check only after production | Fulfillment lifecycle, 290–330 | MVP | DONE | — | NO | NO | `mark_quality_check` command and production/QC HTTP tests. | Redo path is M01. | Maintain. | None. |
| D14 | Operator preview/Fulfillment UI exercises the canonical lifecycle | Preview/Admin pages, 110–122, 163–178 | MVP | DONE | — | NO | NO | `app/local-fulfillment/operator/page.tsx`; Task 10 browser and Task 11 runtime evidence. | Production operator identity remains external. | Maintain. | Production Admin identity. |
| E01 | Guest checkout is supported | Orders/payment, 124–135 | MVP | DONE | — | NO | NO | Signed guest owner and Order capability flows; Task 6/11 evidence. | None locally. | Maintain. | None. |
| E02 | Checkout requires valid email | Orders/payment, 124–135 | MVP | DONE | — | NO | NO | `app/domain/local-checkout.ts` validates bounded email. | Deliverability is not verified. | Maintain syntax boundary; provider email later. | Email delivery. |
| E03 | Canonical Order creation is atomic/idempotent | Orders/model, 124–135, 384–407 | MVP | DONE | — | NO | NO | Persistent Order RPC, replay and fault/recovery evidence. | None. | Maintain. | None. |
| E04 | Payment success lifecycle exists locally | Orders/payment, 124–135 | MVP | DONE | — | NO | NO | Local payment simulation supports canonical paid transition. | No real money. | Keep as acceptance simulator. | Stripe/PayPal. |
| E05 | Payment failure lifecycle exists locally | Orders/payment, 124–135 | MVP | DONE | — | NO | NO | Payment transition tests and Task 11 failed→succeeded history. | No provider reconciliation. | Preserve adapter-neutral state. | Stripe/PayPal. |
| E06 | Payment cancellation/expiry lifecycle exists locally | Orders/payment, 124–135 | MVP | DONE | — | NO | NO | Local payment domain covers cancelled and retries. | Provider redirect/webhook semantics absent. | Preserve; integrate provider events. | Stripe/PayPal. |
| E07 | Refund domain and operator flow | Orders/payment, 124–135 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | `tests/local-payment-domain.test.mjs` asserts `refund_unsupported`; handoff requires a new approved policy. | No refund command/reservation/reconciliation. | Approve full/partial policy and add provider-neutral refund domain first. | Provider refund APIs later. |
| E08 | Stripe checkout and verified payment | Orders/payment, 124–135 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Legacy Stripe-shaped route is explicitly not production evidence; provider handoff remains unchecked. | Real account/create/retrieve/webhook acceptance absent. | Implement authorized Stripe adapter and sandbox evidence. | Stripe. |
| E09 | PayPal create/capture and verified payment | Orders/payment, 124–135 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | No PayPal adapter; handoff lists production integration. | Entire provider integration absent. | Implement authorized PayPal adapter and sandbox evidence. | PayPal. |
| E10 | Verified provider webhook may change canonical Payment state; redirect/callback is never payment authority | Orders/payment/security, 124–135, 332–345 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Canonical local Payment commands reject browser authority; no accepted provider-to-canonical transition exists. | Verified provider reconciliation into canonical Payment is absent. | Bind verified provider facts to the existing Payment command boundary. | Stripe/PayPal webhooks and retrieve APIs. |
| E11 | Coupon code validation is server-authoritative | Orders/payment, 124–135 | MVP | DONE | — | NO | NO | Persistent coupon rule resolution; invalid/expired/not-applicable are bounded and non-blocking. | Breadth of rules is separate below. | Maintain. | None. |
| E12 | Percentage coupon | Business rules, 427–441 | MVP | DONE | — | NO | NO | Persistent coupon fixture uses `discountType: percent`; Checkout tests. | Launch code/config not approved. | Configure approved offer. | Owner input. |
| E13 | Fixed-amount coupon | Business rules, 427–441 | MVP | PARTIAL | ENGINEERING | YES | YES | Local promotion supports amount-like discount behavior, but persistent launch fixture/evidence centers on percent. | Durable authoritative fixed-rule acceptance for launch is incomplete. | Add exact persistent fixture and focused acceptance. | None. |
| E14 | Free-shipping coupon | Business rules, 427–441 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No coupon result type that authoritatively zeroes shipping as a distinct promotion. | Rule/model/snapshot semantics absent. | Add bounded free-shipping discount classification. | None. |
| E15 | Coupon constraints cover expiry, usage, product, country, minimum and user | Business rules, 427–441 | MVP | PARTIAL | ENGINEERING | YES | YES | Expiry and minimum subtotal exist; product/country/per-user/use-limit evidence is absent. | Constraint matrix incomplete. | Extend versioned rule definition and redemption ledger. | None. |
| E16 | Registration welcome coupon: 10% off | Business rules, 427–441 | MVP | PARTIAL | ENGINEERING | YES | YES | `local-promotion.ts` has a WELCOME10 simulation; persistent registration-triggered grant and durable redemption are not established. | Registration grant/eligibility and durable redemption are incomplete; the source does not impose a first-order-only rule. | Move the approved registration-welcome rule into persistent coupon authority without inventing first-order eligibility. | Owner approves issuance/expiry/stacking details. |
| E17 | Configurable order-threshold discount such as $79-$5 | Business rules, 427–441 | MVP | PARTIAL | ENGINEERING | YES | YES | Local deterministic promotion exists; durable persistent business configuration is not accepted. | Configuration/editor/redemption incomplete. | Implement as versioned persistent rule. | Owner approves threshold. |
| E18 | Second/third-item quantity discount | Business rules, 427–441 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No authoritative Cart/Checkout quantity promotion rule. | Rule and allocation snapshots absent. | Define stacking/allocation semantics and implement. | Owner approves offer. |
| E19 | Holiday promotion | Business rules, 427–441 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No scheduled promotion authority. | Schedule/timezone/stacking absent. | Defer or define versioned campaign rules. | Owner campaign input. |
| E20 | Digital add-on promotion | Business rules, 427–441 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No cross-item digital add-on pricing rule. | Eligibility/allocation absent. | Define bundle/add-on semantics or defer explicitly. | Owner input. |
| E29 | Configurable abandoned-cart coupon capability | Business rules, 427–441 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No abandoned-cart coupon rule/audience code is present; Phase 2 abandoned-cart recovery does not satisfy this separate configurable coupon requirement. | Coupon capability is absent even without detection, scheduling or outbound email. | Define a bounded coupon rule usable by an explicitly supplied eligible campaign audience; keep automated recovery in Phase 2. | None for the coupon rule; email automation remains Phase 2. |
| E21 | Guest Cart is owner-scoped | Cart/Auth, 60–78, 152–161 | MVP | DONE | — | NO | NO | Signed guest owner context and persistent Cart acceptance. | None. | Maintain. | None. |
| E22 | Member Cart is customer-session scoped | Cart/Auth, 60–78, 152–161 | MVP | DONE | — | NO | NO | Persistent customer session and member Cart acceptance. | No automatic guest merge by design. | Maintain. | None. |
| E23 | Cart survives process restart | Cart/data, 60–78, 384–407 | MVP | DONE | — | NO | NO | Task 11.1 full recovery includes exact Cart digest. | None. | Maintain. | None. |
| E24 | Cart mutations use server-owned version/CAS | Cart/security, 60–78, 332–345 | MVP | DONE | — | NO | NO | Persistent Cart CAS/concurrency tests. | None. | Maintain. | None. |
| E27 | Payment webhook signatures are verified against raw provider payload | Payment/security, 124–135, 332–345 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | No accepted real provider verifier; legacy Stripe-shaped route is not production evidence. | Provider-specific signature verification absent. | Implement per-provider verifier with raw-body fixtures and sandbox secrets. | Stripe/PayPal. |
| E28 | Payment webhook delivery is durably idempotent and ordered | Payment/security, 124–135, 332–345 | MVP | PARTIAL | ENGINEERING | YES | YES | Local Payment action idempotency is complete; no provider-neutral durable webhook inbox/reconciliation exists. | Provider-independent inbox/order/replay groundwork is missing. | Implement durable inbox and deterministic reconciliation before activation. | Provider fixtures locally; live webhooks later. |
| F01 | Shipping eligibility can vary by destination country | Shipping, 137–150 | MVP | DONE | — | NO | NO | Versioned local shipping rule includes country and eligibility. | Only accepted fixture breadth is narrow. | Populate four-country rules. | Owner input. |
| F02 | Shipping method and amount/currency are server-owned | Shipping, 137–150 | MVP | DONE | — | NO | NO | Local Checkout resolves method, amount, currency and rule version. | None structurally. | Maintain. | None. |
| F03 | Shipping rules vary by product type | Shipping, 137–150 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Current rule definition is country/method/subtotal based; no product-type selector evidence. | Required selector absent. | Extend bounded rule matching and snapshot. | None. |
| F04 | Shipping rules vary by weight | Shipping, 137–150 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Product weight exists only in supplier-domain concepts; Checkout rule has no weight bands. | Canonical packaged weight/rate matching absent. | Define source of weight and versioned bands. | Owner/supplier facts. |
| F05 | Shipping rules vary by quantity | Shipping, 137–150 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No quantity-band shipping rule evidence. | Required selector absent. | Add bounded quantity bands and tests. | None. |
| F06 | Free-shipping threshold is configurable, initially $49 | Shipping/business rules, 137–150, 427–441 | MVP | PARTIAL | ENGINEERING | YES | YES | Local promotion tests threshold behavior; persistent shipping rule fixture does not prove approved $49 launch authority. | Launch config and allocation semantics incomplete. | Owner approves threshold; encode/version/snapshot it. | None. |
| F07 | Delivery estimate is shown as a range, not an exact promise | Shipping/PDP, 137–150, 253–273, 555–564 | MVP | DONE | — | NO | NO | Shipping result contains min/max display days; copy avoids exact arrival. | Launch ranges need owner/supplier facts. | Populate approved ranges. | Owner/supplier facts. |
| F08 | Manual local Shipment and tracking lifecycle | Shipping/tracking, 137–150 | MVP | DONE | — | NO | NO | Unique Shipment and ordered event lifecycle accepted in Tasks 8/11. | Carrier is synthetic. | Maintain as bounded fallback. | None. |
| F09 | 17TRACK integration contract and real events | Shipping/tracking, 137–150 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Handoff states no account/key/webhook/polling integration. | Real tracking ingestion absent. | Select polling/webhook policy and integrate. | 17TRACK. |
| G01 | Guest browsing and checkout without login | Auth, 152–161 | MVP | DONE | — | NO | NO | Guest owner and capability flows. | None. | Maintain. | None. |
| G02 | Durable customer account/session core | Auth, 152–161 | MVP | DONE | — | NO | NO | Local password hash/session hash/expiry/revoke/recovery accepted. | Local provider is development-only. | Preserve contract for production adapter. | Supabase Auth. |
| G03 | Email OTP sign-in | Auth, 152–161 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | `customer-auth.test.mjs` forbids OTP routes; handoff requires Supabase Auth SMTP. | OTP flow/provider absent. | Implement Supabase Auth OTP with approved SMTP and BFF session. | Supabase Auth + SMTP. |
| G04 | Google OAuth sign-in | Auth, 152–161 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | No callback/PKCE flow; handoff marks required. | Entire provider flow absent. | Configure Google/Supabase and implement state/PKCE callback. | Google OAuth + Supabase Auth. |
| G05 | Account dashboard | Auth/pages, 152–161, 216–251 | MVP | DONE | — | NO | NO | `app/account/page.tsx`; account visual/rendered evidence. | Production identity integration separate. | Maintain. | Supabase Auth later. |
| G06 | Account order history list | Auth/pages, 152–161, 216–251 | MVP | PARTIAL | ENGINEERING | YES | NO | `app/account/orders/page.tsx` exists, but canonical access is capability/session scoped and no evidence of complete member order-history query across all orders. | Durable member list/query UX is incomplete. | Add owner-scoped paginated history read without email authority. | None. |
| G07 | Account order detail | Auth/pages, 152–161, 216–251 | MVP | PARTIAL | ENGINEERING | YES | NO | Order success/detail projection exists; no dedicated `/account/orders/[id]` route in route inventory. | Account navigation/detail surface incomplete. | Add protected detail route reusing canonical projection. | None. |
| G08 | Account coupons display | Auth, 152–161 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No account coupon entitlement/redemption page or durable grant model. | Capability absent. | Decide coupon ownership model and add safe account projection. | None. |
| G09 | Same-email guest Orders automatically associate after verified login | Auth, 152–161 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | `member-order-ownership.test.mjs` and auth spec explicitly reject email claim/merge. | Direct conflict with original requirement. | Owner approves secure claim/migration contract; never use email alone. | Production verified identity may participate. |
| G10 | Google account with same email binds safely | Auth, 152–161 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | No Google provider or reviewed subject-linking contract. | Stable subject/linking/recovery policy absent. | Decide verified-provider subject mapping and conflict policy. | Google/Supabase Auth. |
| G12 | Customer-facing account deletion request entry | Security/privacy, 332–345 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Handoff auth checklist leaves deletion open; no route in inventory. | Authenticated request/confirmation surface is absent. | Define privacy policy and implement the request entry. | Identity provider hooks later. |
| G13 | Exact `/account/profile` route or compatible alias exposes safe customer personal information | Pages, 233–240 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | NO | Baseline route inventory has `/account`, `/account/orders`, `/account/points`, sign-in and sign-up, but no `/account/profile`; Git contains no redirect or alias. | `/account` showing an email does not satisfy the explicit profile route. | Add a session-protected route/redirect and bounded safe profile projection without waiting for production Auth. | None. |
| G14 | Exact `/auth/sign-in` route safely reaches the local customer sign-in surface | Pages, 233–240 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | NO | The implemented page is `/account/sign-in`; no `/auth/sign-in` page, redirect or alias exists in the baseline tree. | The source-required route is incompatible even though local password sign-in exists. | Add an explicit safe route or redirect to the accepted sign-in UI; keep OTP/Google integration in G03/G04. | None. |
| H01 | Single Admin login | Admin, 163–178 | MVP | DONE | — | NO | NO | `/admin/login`, signed Admin session and security tests. | Local password is not production identity. | Preserve; replace via authorized production Admin identity. | Production identity provider. |
| H02 | Admin Product CRUD | Admin, 163–178 | MVP | DONE | — | NO | NO | `/admin/products` and Catalog product resource routes/tests. | Production Catalog cutover not authorized. | Maintain local capability; plan production data migration. | None. |
| H03 | Admin customization-field configuration | Admin, 163–178 | MVP | PARTIAL | ENGINEERING | YES | YES | Admin customization route supports existing three kinds only. | Missing single/multi/number/file and surcharge rules. | Complete C07–C10/C03 first, then editor support. | None. |
| H04 | Admin pricing-rule management | Admin, 163–178 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No public/admin persistent price-rule editor; tests intentionally forbid price mutation endpoints. | Business-safe pricing workflow absent. | Design restricted audited Admin rule commands. | None. |
| H05 | Admin product image and SEO management | Admin, 163–178 | MVP | DONE | — | NO | NO | Product asset route, SEO metadata types and Admin tests. | Production media provider separate. | Maintain. | Storage provider later. |
| H06 | Admin order list/filter/detail | Admin, 163–178 | MVP | PARTIAL | ENGINEERING | YES | NO | `/admin/orders`, read repository and export exist; evidence emphasizes safe reads. | Full filters/detail breadth against canonical persistent Orders is not comprehensively accepted. | Add focused requirements-based Admin UX acceptance. | None. |
| H07 | Admin changes legal order lifecycle statuses | Admin, 163–178 | MVP | PARTIAL | ENGINEERING | YES | YES | Operator Fulfillment/Tracking routes mutate bounded lifecycles, but generic Admin Order status editing is intentionally absent. | Requirement must map to canonical commands, not arbitrary status writes. | Define exact allowed Admin commands and expose them in one console. | None. |
| H08 | Admin photo review | Admin, 163–178 | MVP | DONE | — | NO | NO | Persistent photo-review decisions and Task 7/11 evidence. | Production operator identity separate. | Maintain. | Production Admin identity. |
| H09 | Admin preview upload/status/revision handling | Admin, 163–178 | MVP | DONE | — | NO | NO | Local fulfillment operator page/routes and preview manifest lifecycle. | None locally. | Maintain. | Production Storage/Admin identity. |
| H10 | Admin tracking entry/status | Admin, 163–178 | MVP | DONE | — | NO | NO | Local tracking operator page/route and shipment lifecycle evidence. | Real carrier feed absent. | Maintain manual fallback. | 17TRACK later. |
| H11 | Admin coupon management | Admin, 163–178 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Coupon authority is seeded/configured; no restricted CRUD UI/commands. | Management/audit/redeem limits absent. | Build only after coupon model completion. | None. |
| H12 | Admin digital file upload and delivery controls | Admin, 163–178 | MVP | DONE | — | NO | NO | `/api/admin/digital-delivery`, immutable version/grant/revoke acceptance. | Production Storage/Admin identity pending. | Maintain. | Production Storage/identity. |
| H13 | Admin basic order/sales/conversion analytics | Admin, 163–178 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No dashboard/report route; local analytics sink is not business reporting. | Aggregations, period filters and privacy contract absent. | Define safe local aggregate read model. | Analytics warehouse optional. |
| H14 | Admin upload cleanup | Admin, 163–178 | MVP | DONE | — | NO | NO | `/api/admin/cleanup-uploads`; lease/retry/private Storage cleanup evidence. | Production retention policy pending. | Maintain; configure retention. | Storage provider. |
| H15 | Admin audit log for key operations | Security/model, 163–178, 332–345, 384–407 | MVP | DONE | — | NO | NO | Fulfillment/payment/media action bindings and audit records; Task 11.6 security matrix. | General Catalog/Admin audit breadth may vary. | Preserve and extend with each new mutation. | None. |
| H16 | Admin Category CRUD | Admin, 163–178 | MVP | DONE | — | NO | NO | Generic Catalog resource route and Admin Catalog boundary/tests include categories. | None locally. | Maintain. | None. |
| H17 | Admin Variant/SKU CRUD | Admin, 163–178 | MVP | DONE | — | NO | NO | SKU graph route, repository and focused Admin SKU tests. | None locally. | Maintain. | None. |
| H18 | Admin shipping-rule configuration | Admin/shipping, 137–178 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Shipping rules are fixtures/persistent definitions; no restricted Admin shipping-rule UI/command. | Launch operations cannot safely manage versioned rates. | Add after F03–F06 semantics are approved. | None. |
| H19 | Restricted `/admin/settings` surface manages approved basic non-secret configuration | Pages, 241–251 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Baseline Admin routes contain login, products and orders only; no `/admin/settings` route, redirect or alias exists. Configuration files/domain models are not an Admin surface. | The explicit basic-settings page is absent. | Define a bounded allowlist of locally manageable business settings; keep credentials and provider secrets server-only/external. | None. |
| I01 | Digital products are supported | Digital, 180–188 | MVP | DONE | — | NO | NO | Digital classification, publication, grants, tickets and download stream accepted. | None locally. | Maintain. | Production Storage later. |
| I02 | Admin publishes immutable digital file versions | Digital, 180–188 | MVP | DONE | — | NO | NO | Digital publication HTTP/migration acceptance. | None locally. | Maintain. | Production Storage/Admin identity. |
| I03 | Paid/ready gate before digital access | Digital, 180–188 | MVP | DONE | — | NO | NO | Grant eligibility checks canonical paid state and ready version. | None. | Maintain. | None. |
| I04 | Account/order surface provides digital download entry | Digital/pages, 180–188, 216–251 | MVP | DONE | — | NO | NO | Order success digital delivery UI and Task 10 browser evidence. | Dedicated account order detail is still G07. | Maintain. | None. |
| I05 | Digital access expires | Digital, 180–188 | MVP | DONE | — | NO | NO | Durable grants have activatedAt/expiresAt and restart evidence. | Production policy value owner-controlled. | Configure approved duration. | None. |
| I06 | Digital download count is configurable and enforced | Digital, 180–188 | MVP | DONE | — | NO | NO | Grant/ticket quota tests; accepted default maxDownloads 5. | Launch policy approval needed. | Owner confirms value. | None. |
| I07 | Digital objects remain private | Digital/security, 180–188, 332–345 | MVP | DONE | — | NO | NO | Private bucket, no locator, ticket→claim→stream. | Production Storage choice pending. | Preserve. | Production Storage. |
| I08 | Digital-ready email is sent | Digital/email, 180–188, 409–425 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Email handoff lists trigger; no real delivery evidence. | Outbox/provider integration absent. | Implement transactional email adapter. | Resend/SMTP. |
| J01 | Local safe analytics event intake | Analytics, 190–198 | MVP | DONE | — | NO | NO | `/api/local-analytics`, domain allowlist and client instrumentation. | It is local-only and not production analytics. | Preserve as development sink. | None. |
| J02 | Product view event | Analytics, 190–198 | MVP | DONE | — | NO | NO | Storefront instrumentation emits safe view events. | Provider delivery absent. | Map to production event adapter. | GA4/Meta/TikTok. |
| J03 | Customization-start event | Analytics, 190–198 | MVP | DONE | — | NO | NO | PDP customization instrumentation and local event model. | Provider delivery absent. | Map safely. | GA4/Meta/TikTok. |
| J04 | Server-confirmed upload success event | Analytics, 190–198 | MVP | PARTIAL | ENGINEERING | YES | NO | Client/local events exist, but no evidence that production-shaped event is emitted only after authoritative receipt across all recovery paths. | Semantics need focused contract. | Add server/result-correlated local test before provider mapping. | Provider later. |
| J05 | Add-to-cart event | Analytics, 190–198 | MVP | DONE | — | NO | NO | `AddToCartButton.tsx` emits after accepted Cart action. | Provider delivery absent. | Map safely. | GA4/Meta/TikTok. |
| J06 | Begin-checkout event | Analytics, 190–198 | MVP | DONE | — | NO | NO | `LocalCheckoutExperience.tsx` emits after fresh evaluation. | Provider delivery absent. | Map safely. | GA4/Meta/TikTok. |
| J07 | Canonical purchase event | Analytics, 190–198 | MVP | PARTIAL | ENGINEERING | YES | NO | Local event type supports purchase, but no accepted durable one-per-paid-Order producer evidence. | Deduplicated authoritative producer missing. | Add outbox/event binding to canonical paid transition. | Provider later. |
| J08 | Upload/payment/preview revision error events | Analytics, 190–198 | MVP | PARTIAL | ENGINEERING | YES | NO | Local bounded event model exists; complete authoritative error matrix is not evidenced. | Coverage and privacy classification incomplete. | Add focused event-contract tests. | Provider later. |
| J09 | GA4 integration | Analytics/architecture, 190–198, 347–382 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Handoff states no production analytics evidence. | Property/consent/tag adapter absent. | Integrate after privacy/consent decision. | Google Analytics 4. |
| J10 | Meta Pixel integration | Analytics/architecture, 190–198, 347–382 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | No production integration. | Pixel/CAPI/consent absent. | Integrate after owner decision. | Meta. |
| J11 | TikTok Pixel integration | Analytics/architecture, 190–198, 347–382 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | No production integration. | Pixel/events API/consent absent. | Integrate after owner decision. | TikTok. |
| K01 | Browser cannot author price, discount, payment or ownership facts | Security, 332–345 | MVP | DONE | — | NO | NO | Checkout/Catalog/owner authority contracts and security tests. | None locally. | Maintain. | None. |
| K02 | Private media has no public bucket/object locator disclosure | Security, 332–345 | MVP | DONE | — | NO | NO | RLS/Storage/private projections and leakage tests. | None locally. | Maintain in provider adapter. | Production Storage. |
| K03 | Duplicate requests are idempotent | Security, 332–345 | MVP | DONE | — | NO | NO | Cart/Order/Payment/Fulfillment/Tracking/media action bindings and races. | None locally. | Maintain. | None. |
| K04 | Cross-owner and identifier-enumeration attacks fail closed | Security, 332–345 | MVP | DONE | — | NO | NO | Task 11.6 matrix and non-enumerating HTTP tests. | None locally. | Maintain. | None. |
| K05 | Audit records cover sensitive lifecycle mutations | Security, 332–345 | MVP | DONE | — | NO | NO | Action/decision audit evidence across local persistence. | New future domains must join it. | Preserve extension rule. | None. |
| K06 | Privacy retention and upload deletion policy is configured | Security, 332–345 | MVP | PARTIAL | OWNER_POLICY | YES | YES | Cleanup lifecycle exists; handoff says production retention/residency choice deferred. | Owner-approved durations/exceptions absent. | Approve policy and encode config/evidence. | Storage provider for production execution. |
| K07 | Server-side account erasure/retention executor and audit | Security, 332–345 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | No durable deletion job, retention-exception decision or completion audit is evidenced. | Server-side privacy execution is absent. | Implement idempotent erasure with legally retained facts explicitly separated. | Provider deletion hooks later. |
| K08 | Canonical/config/security values are environment-configured, not hardcoded | Architecture/config, 347–382 | MVP | PARTIAL | ENGINEERING | YES | YES | Local environment doctor and fail-closed composition exist; final domain/provider/business values are open. | Production configuration inventory incomplete. | Complete owner config pack without adding secrets to Git. | Multiple providers. |
| K10 | Durable fine-grained Supplier/SupplierOffer/work-order collaboration | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | Supplier domain and local-memory demo tests exist; the source explicitly defers finer supplier/QC/fulfillment collaboration. | Persistent supplier operations are outside MVP; supplier business facts remain B06/M08. | Plan only under a future supplier-operations scope. | Supplier APIs optional. |
| K11 | Real transactional email outbox/dispatcher groundwork | Email, 409–425 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Only `LocalMemoryNotificationOutbox`; production handoff describes required architecture, not implementation. | Durable intent, lease, retries, suppression and callbacks absent. | Implement provider-neutral durable email core before provider activation. | Provider required only for send/callback. |
| K12 | Order-created email | Email, 409–425 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Required map exists in handoff; no real send evidence. | Delivery absent. | Wire canonical Order event to durable outbox/provider. | Resend/SMTP. |
| K13 | Payment-success email | Email, 409–425 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Planned only. | Delivery absent. | Wire canonical paid event. | Resend/SMTP. |
| K14 | Production/Shipment/Tracking emails | Email, 409–425 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Planned only. | Delivery absent. | Wire committed lifecycle events. | Resend/SMTP. |
| K15 | SEO title/description/canonical metadata | Acceptance, 455–484 | MVP | DONE | — | NO | NO | `app/config/seo-metadata.ts`, Catalog SEO fields and brand tests. | Final domain/content owner input remains. | Configure final domain/content. | None. |
| K16 | OpenGraph/Twitter sharing metadata and image | Acceptance, 455–484 | MVP | PARTIAL | ENGINEERING | YES | YES | Global OpenGraph/Twitter metadata exists; no evidence of approved per-product share image across launch Catalog. | Launch assets/content incomplete. | Add per-product fallback and focused metadata tests. | None. |
| K17 | Meaningful image alt text | Acceptance, 455–484 | MVP | PARTIAL | ENGINEERING | YES | YES | Product gallery uses asset description; decorative logo uses empty alt correctly. Launch Catalog completeness is unproved. | Asset descriptions for full assortment absent. | Enforce non-decorative asset description in Catalog readiness. | Owner content input. |
| K18 | Structured SEO metadata for site and products | Acceptance, 455–484 | MVP | PARTIAL | ENGINEERING | YES | YES | `buildWebSiteStructuredData` and layout JSON-LD provide WebSite schema; no Product/Offer structured-data projection is evidenced. | Product commerce schema is absent. | Add safe Catalog-backed Product/Offer JSON-LD and focused tests. | None. |
| L01 | Product reviews and review invitation | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | `/api/local-reviews` is a local fixture; source explicitly defers the full system. | Not an MVP blocker. | Plan separately. | Email/provider later. |
| L02 | Points ledger and redemption | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | Account points/local simulation exist, but source defers full system. | Not an MVP blocker. | Keep isolated from MVP payment totals. | None. |
| L03 | Referral relationship and rewards | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | No complete referral system; source explicitly defers it. | Deferred. | Future change. | None. |
| L04 | First-order/loyalty/birthday automation system | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | Some local promotion examples exist, but source defers complete automation. | Deferred. | Future change. | Email/provider later. |
| L05 | Abandoned-cart recovery | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | No durable recovery scheduler/send; explicitly deferred. | Deferred. | Future change. | Email/provider. |
| L06 | Marketing email automation | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | Newsletter intake explicitly sends no coupon/email; source defers automation. | Deferred. | Future consent-aware system. | Email provider. |
| L07 | Tracking anomaly proactive notification | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | Manual tracking exists; anomaly notification is deferred. | Deferred. | Future provider/monitoring change. | 17TRACK/email. |
| L08 | Fine-grained supplier/QC collaboration | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | Local supplier/QC demo exists; source defers richer collaboration. | Deferred. | Future change. | Supplier systems. |
| L09 | Fine-grained Admin roles | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | Current local model is one signed Admin; source defers RBAC. | Deferred. | Future identity/RBAC design. | Auth provider. |
| L10 | Recommendations, bundles and cross-sell | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | No authoritative recommendation system; source defers it. | Deferred. | Future merchandising change. | Optional analytics. |
| L11 | Production-video email | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | Not implemented; explicitly deferred. | Deferred. | Future media/email change. | Storage/email. |
| L12 | UGC and incentive system | Phase 2, 200–214 | Phase 2 | PHASE 2 | PHASE_2 | NO | YES | Not implemented; explicitly deferred. | Deferred. | Future moderation/reward design. | Social/email optional. |
| M01 | Quality failures support redo rather than silent shipment | Lifecycle, 290–330 | MVP | PARTIAL | ENGINEERING | YES | YES | Quality-check gate exists, but an explicit redo/remake lifecycle is not evidenced. | Rework state, audit and customer communication absent. | Define redo transitions and immutable history. | Supplier/email later. |
| M04 | Production-like end-to-end test across all external providers | Acceptance/milestones, 455–517 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Local E2E is extensive; handoff says production E2E not run. | Real Auth/payment/email/tracking/storage/hosting path absent. | Execute after integrations with approved test accounts. | All production providers. |
| M05 | Launch-domain HTTPS, redirects and DNS | Acceptance/owner inputs, 455–553 | MVP | PROVIDER-DEPENDENT | PROVIDER | NO | YES | Host policy exists; no deployment/DNS authorization or evidence. | Public endpoint absent. | Configure Cloudflare/domain in deployment phase. | Registrar/Cloudflare. |
| M07 | Support email and return address are final | Owner inputs, 533–553 | MVP | PARTIAL | OWNER_CONFIGURATION | YES | YES | Business configuration checklist is open. | Customer-facing operational facts are not approved. | Owner supplies the exact support email and return address. | Email/helpdesk optional. |
| M08 | Supplier cost, lead time, packaging and QC facts are final | Owner inputs, 533–553 | MVP | PARTIAL | OWNER_CONFIGURATION | YES | YES | Supplier demo has synthetic economics only. | Real commercial/operational facts absent. | Owner/supplier provide signed-off data. | Suppliers. |
| M10 | No fake shipping, tracking or exact ETA is presented as production fact | Explicit exclusions, 555–564 | MVP | DONE | — | NO | NO | Local data is marked development/test; copy uses ranges; provider handoff is explicit. | None locally. | Preserve environment labels/fail-closed behavior. | None. |
| N01 | Home uses approved real finished-product imagery | Visual/UX, 443–453 | MVP | PARTIAL | OWNER_CONFIGURATION | YES | YES | `app/page.tsx` renders Catalog-backed product cards/polaroids and safe media fallbacks. | The retained local Catalog uses synthetic/unavailable media; no approved launch finished-product asset set is evidenced. | Owner supplies approved finished-product assets through the Catalog asset workflow. | Production media storage later. |
| N02 | Home presents a before/after comparison | Visual/UX, 443–453 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | Home source and focused visual tests contain no before/after composition. | The independently testable before/after block is absent. | Add an accessible Catalog/content-backed before/after presentation after owner assets are supplied. | None. |
| N03 | Home presents approved gift-use/occasion scenes | Visual/UX, 443–453 | MVP | PARTIAL | OWNER_CONFIGURATION | YES | YES | Hero polaroids and editorial labels provide a use-case composition, and Catalog assets can carry gallery/detail/example roles. | No approved launch scene-image set is evidenced; current labels/placeholders are not real scene assets. | Owner supplies approved occasion/scene assets through Catalog configuration. | Production media storage later. |
| N04 | Home presents emotional stories | Visual/UX, 443–453 | MVP | DONE | — | NO | NO | `app/page.tsx` contains the workshop story and three “Letters We Kept” narrative cards; Fusion visual tests preserve the composition. | None for the presentation requirement. | Maintain; do not treat static editorial copy as database review authority. | None. |
| N05 | PDP supports main, detail and scene images plus video from Product assets | PDP, 253–273 | MVP | PARTIAL | OWNER_CONFIGURATION | YES | YES | `ProductAssetGallery.tsx` renders image/video assets and thumbnail selection; Catalog roles include gallery/detail/example/thumbnail/SEO. | No approved launch Catalog proves complete main/detail/scene/video coverage for each applicable product. | Supply and validate role-complete launch assets; keep safe fallback for genuinely missing media. | Production media storage later. |
| N06 | PDP displays an authoritative promotion price when applicable | PDP, 253–273 | MVP | PARTIAL | ENGINEERING | YES | YES | PDP displays standard/starting SKU price; Checkout has bounded promotion results. | No PDP promotion-price projection tied to an authoritative applicable promotion exists. | Define a server-owned PDP promotion projection after promotion rules are completed. | None. |
| N07 | PDP displays production ETA and international shipping ETA range | PDP, 253–273 | MVP | PARTIAL | ENGINEERING | YES | YES | PDP displays Catalog production lead time and whether shipping is required. | It does not display the authoritative destination-aware international range or the required default 7–15-business-day/no-exact-date explanation. | Add a safe range projection without promising an exact arrival date. | None for configured rules; carrier tracking remains F09. |
| N08 | PDP displays upload requirements and examples | PDP, 253–273 | MVP | PARTIAL | ENGINEERING | YES | YES | `ProductCustomizationImageField.tsx` exposes authoritative MIME/size/count/dimension constraints and safe errors. | Product-specific visual examples/guidance are not rendered as a complete PDP area. | Render approved Product example assets and field requirements without making browser claims authoritative. | Owner supplies examples. |
| N09 | PDP displays a clear shipping explanation | PDP and Visual/UX, 253–273, 443–453 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | PDP only states `Required`/`Not required`; a separate Shipping & Returns page exists. | Destination/rule-range explanation is hidden from the PDP. | Add an authoritative bounded explanation and link to policy details. | None for configured rules. |
| N10 | PDP states whether production-preview confirmation is required | PDP, 253–273 | MVP | PARTIAL | ENGINEERING | YES | YES | The purchase fact is authoritative (`D01`) and production mode is shown. | The customer-facing PDP does not explicitly project `requiresProductionPreview`. | Add a safe explicit PDP projection from Catalog fulfillment configuration. | None. |
| N11 | PDP explains the approved free-remake policy for quality issues | PDP and lifecycle, 253–273, 290–330 | MVP | PARTIAL | OWNER_POLICY | YES | YES | Shipping/returns content offers replacement or another resolution for damaged/incorrect orders; M01 separately tracks remake lifecycle. | Exact owner-approved free-remake wording/scope is absent from the PDP and current policy copy. | Owner approves bounded policy wording; display it on PDP without inventing a generic returns domain. | Support/email later. |
| N12 | PDP explains that personalized goods do not support no-reason returns | PDP and lifecycle, 253–273, 290–330 | MVP | PARTIAL | OWNER_POLICY | YES | YES | A Shipping & Returns page exists, but does not state this exact rule; Home reference copy also says “30 days, no fuss,” creating a policy conflict. | The source-required policy is not truthfully resolved or displayed on PDP. | Owner resolves the copy conflict and approves exact PDP/policy wording. | None. |
| N13 | PDP contains a product-context FAQ area | PDP, 253–273 | MVP | NOT IMPLEMENTED | ENGINEERING | YES | YES | `/faq`, Contact FAQ and category FAQs exist, but `ProductDetailExperience.tsx` contains no PDP FAQ. | The independent PDP FAQ requirement is absent. | Add a Product/Catalog-backed FAQ area without treating the independent `/faq` route as proof. | Owner supplies approved answers. |
| N14 | PDP contains a review area | PDP, 253–273 | MVP | DONE | — | NO | NO | `ProductDetailExperience.tsx` renders `LocalProductReviews`; the component safely lists reviews and gates delivered-order submission. | The full automated review/invitation system remains Phase 2 (`L01`), but the MVP PDP-area requirement is met locally. | Maintain the area and keep Phase 2 review automation separate. | None locally. |
| N15 | Storefront visual direction is premium, warm, trustworthy and emotionally resonant | Visual/UX, 443–453 | MVP | DONE | — | NO | NO | Owner-accepted Visual V2 tokens, editorial typography, paper/card hierarchy and rendered visual contracts. | Subjective direction is accepted for the local baseline. | Preserve owner-approved V2 system. | None. |
| N16 | Gift-brand colors remain low-saturation rather than discount-site styling | Visual/UX, 443–453 | MVP | DONE | — | NO | NO | `tests/figmemento-visual-v2.test.mjs` enforces the approved semantic palette and removes deprecated saturated colors. | None in accepted local baseline. | Preserve token authority. | None. |
| N17 | Customization experience is mobile-first | Visual/UX, 443–453 | MVP | DONE | — | NO | NO | PDP/customization CSS has 960/720/520 breakpoints, touch targets, no hidden controls and accepted mobile browser evidence. | None locally. | Preserve responsive and touch acceptance. | None. |
| N18 | Upload, crop, preview and payment flows show understandable loading/error states | Visual/UX and acceptance, 443–484 | MVP | DONE | — | NO | NO | Image-slot state labels cover decode/upload/recovery/save/failure; preview/payment pages use bounded status/error projections; rendered/error tests pass. | Real provider errors remain provider acceptance, not a missing local feedback pattern. | Preserve bounded messages and no internal leakage. | Providers later. |
| N19 | Major customer CTAs use natural English | Visual/UX, 443–453 | MVP | DONE | — | NO | NO | English is the default locale; owner-accepted Home/Shop/PDP/Cart/Checkout CTA copy is covered by Fusion/rendered tests. | None locally. | Preserve language review when business copy changes. | Professional copy review optional. |
| N20 | Landing-page image/text structure supports TikTok, Instagram and Pinterest traffic | Visual/UX, 443–453 | MVP | DONE | — | NO | NO | Owner-accepted V2 Home uses focused hero, short editorial hierarchy, product cards, occasion storytelling and mobile composition. This is presentation evidence, not Pixel evidence. | Social account/content execution remains NS04–NS06; analytics providers remain J09–J11. | Preserve landing structure and evaluate with real campaign data. | None for layout. |

## Gate rules

- The local engineering gate counts only `ENGINEERING` rows.
- The owner/business readiness gate counts `OWNER_CONFIGURATION` and `OWNER_POLICY` rows.
- `PROVIDER` and `PHASE_2` rows do not block either local gate.
- `QUALITY_HARDENING` recommendations are retained outside the original atomic MVP count and gates.

## Source coverage index

Coverage rule: each list item below is one normative source bullet (or one indivisible normative sentence). `NS*`, `QH*` and `OP*` are deliberately outside the original software-atomic count; `EXCLUDED` records a source prohibition rather than an implementation requirement. **Unmapped normative bullets: 0.**

Normalization check for the four freeze-sensitive areas: surcharge is `C03`; static required is accepted extra `X06` and is not credited as a conditional rule; conditional required is `C28`; conditional visibility is `C29`; configurable typed validation is covered by `C05–C06` and `C11–C19`; `/auth/sign-in` compatibility is `G14` while provider integrations remain `G03/G04`; `/account/profile` is `G13`; `/admin/settings` is `H19`. **Semantically unmapped sub-requirements in these areas: 0.**

### Baseline context also represented by the matrix (lines 6–45)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 6 | Provisional PhotoGift name; final brand pending | A05 |
| 8 | Initial markets: US, UK, Canada, Australia | A02 |
| 9 | Initial language: English | A03 |
| 10 | Initial currency: USD | A04 |
| 11 | Real overseas commerce site, not a demo | A01 |
| 18–23 | Browse, customize/upload, preview, pay and track/deliver | A01; A06–A14; C01–C26; D01–D13; E01–E10; F08–F09; I01–I08 |
| 25 | Multi-category configurable platform; select lead categories from evidence | B01–B07; B05–B06; NS02 |
| 31–36 | Emotional personalized-gift brand and content direction | N01–N04; N15–N16; N20 |
| 40–45 | Generic data-configured system, 21 test SKUs, research-led focused Home | B01–B07; B05–B06; A06; NS01–NS02 |

### 5.1 MVP (lines 82–198)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 86 | Home | A06; N01–N04 |
| 87 | Category page | A08 |
| 88 | Product detail page | A10; N05–N14 |
| 89 | Search/basic filtering | A09 |
| 90 | Cart | A11; E21–E24; X02 documents extra retained-Cart behavior |
| 91 | Checkout | A12 |
| 92 | Order success | A13 |
| 93 | Order tracking | A14; F08–F09 |
| 94 | FAQ, Terms, Privacy, Shipping & Returns pages | A16; K06–K07; N11–N13 |
| 98 | Person/size/color/base-text specifications | C01; C05; C07 |
| 99 | Dynamic price | C02–C03 |
| 100 | One or multiple customization fields | C04 |
| 101 | One or multiple photo uploads | C11–C12 |
| 102 | Drag upload and drag ordering | C13–C14 |
| 103 | Crop and live preview | C15 |
| 104 | Clarity inspection | C20 |
| 105 | Blur/side-face/occlusion/person-count warnings | C21–C24 |
| 106 | Customization note | C05–C06; C25 |
| 107 | Preserve original, crop, preview and field snapshots in Order | C26; B08 |
| 108 | Physical and digital fulfillment types | B04; I01 |
| 112 | Preview confirmation is Product-configurable MVP core | D01 |
| 114 | Complex/high-value/3D products default to preview-required | D02 |
| 115 | Ordinary flat products may disable preview | D01–D02 |
| 116 | Admin uploads production preview | D03; H09 |
| 117 | Customer views preview in account/email | D04; D11 |
| 118 | Customer approves or requests revision | D05–D06 |
| 119 | Maximum two revisions per Order | D07 |
| 120 | Record time, actor, image and note | D08 |
| 121 | Admin timeout-confirm/contact after deadline | D09; D11 |
| 122 | Unconfirmed Order cannot become shippable | D10; D12–D13 |
| 126 | Guest checkout | E01; G01 |
| 127 | Valid checkout email | E02 |
| 128 | Stripe Checkout | E08 |
| 129 | PayPal | E09 |
| 130 | Payment success/failure/cancel/refund states | E04–E07 |
| 131 | Signed/idempotent webhook, not browser callback authority | E10; E27–E28 |
| 132 | Coupon codes | E11 |
| 133 | Threshold/fixed/percent/free-shipping discounts | E12–E14; E17 |
| 134 | Configurable default $49 free shipping | F06 |
| 135 | Order/payment/shipment email to Order email | K12–K14 |
| 139 | Admin-configured shipping engine; no frontend hardcoding | F01–F06; H18; K01 |
| 141 | Destination-country rule | F01 |
| 142 | Product-type rule | F03 |
| 143 | Weight-band rule | F04 |
| 144 | Quantity rule | F05 |
| 145 | Shipping method | F02 |
| 146 | Shipping amount | F02 |
| 147 | Estimated range | F07; N07 |
| 148 | Free-shipping threshold | F06 |
| 150 | 17TRACK tracks but does not quote; manual fallback without key | F08–F09; OP01 |
| 154 | Guest purchases without registration | G01 |
| 155 | Email-code login | G03 |
| 156 | Google login | G04 |
| 157 | Supabase Auth authority | G03–G04 |
| 158 | Account profile, Order history/detail and coupons | G05–G08 |
| 159 | Verified login associates same-email guest Orders | G09 |
| 160 | Google binding only for matching email | G10 |
| 161 | Future points/referral/tier extension | L02–L04 (PHASE 2) |
| 165 | Single Admin role | H01; L09 (future fine-grained roles) |
| 167 | Admin login | H01 |
| 168 | Product/category/SKU management | H02; H16–H17 |
| 169 | Specification/customization/price-rule management | H03–H04; C03; C28–C29; C05–C06; C11–C19; X06 is static-required evidence only |
| 170 | Product media and SEO management | H05 |
| 171 | Order list/filter/detail/status | H06–H07 |
| 172 | Customer-upload review | H08 |
| 173 | Preview upload/confirmation-state management | H09 |
| 174 | Tracking number/status entry | H10 |
| 175 | Coupon management | H11 |
| 176 | Digital file publication/delivery | H12; I02–I07 |
| 177 | Basic order/sales/conversion reporting | H13 |
| 178 | Upload cleanup | H14 |
| 182 | Digital product examples/support | I01 |
| 183 | Admin uploads/generates delivery file | I02; H12 |
| 184 | Paid+ready digital email | I03; I08 |
| 185 | Account download entry | I04 |
| 186 | Expiring download URL/authority | I05 |
| 187 | Configurable expiry and quota | I05–I06 |
| 188 | No public static digital URL | I07; K02 |
| 194 | GA4 | J09 |
| 195 | Meta Pixel | J10 |
| 196 | TikTok Pixel | J11 |
| 197 | View/customize/upload/cart/checkout/purchase events | J02–J07 |
| 198 | Upload/payment/revision error records | J08 |

### 5.2 explicit Phase 2 (lines 200–214)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 202 | Photo/text reviews and post-delivery invitation | L01 (PHASE 2); N14 is PDP-area-only MVP evidence |
| 203 | Points account/ledger | L02 (PHASE 2) |
| 204 | Referral links/relationships/rewards | L03 (PHASE 2) |
| 205 | Complete welcome/loyalty/birthday member system | L04 (PHASE 2); E16 separately covers the MVP registration coupon |
| 206 | Abandoned-cart recovery | L05 (PHASE 2); E29 separately covers the configured coupon rule |
| 207 | Marketing automation | L06 (PHASE 2) |
| 208 | Spanish localization | A18 (PHASE 2); Chinese is bonus implementation |
| 209 | Proactive tracking-anomaly notification | L07 (PHASE 2) |
| 210 | Rich supplier/QC/fulfillment collaboration | K10; L08 (PHASE 2) |
| 211 | Fine-grained Admin roles | L09 (PHASE 2) |
| 212 | Recommendations/bundles/cross-sell | L10 (PHASE 2) |
| 213 | Production-video upload/email | L11 (PHASE 2) |
| 214 | UGC/social reward | L12 (PHASE 2) |

### 6 Pages and information architecture (lines 216–251)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 220 | `/` | A06; N01–N04 |
| 221 | `/shop` | A07 |
| 222 | `/category/[slug]` | A08 |
| 223 | `/product/[slug]` | A10; N05–N14 |
| 224 | `/cart` | A11 |
| 225 | `/checkout` | A12 |
| 226 | `/order/success` | A13 |
| 227 | `/track-order` | A14 |
| 228 | `/faq` | A16; distinct from N13 PDP FAQ |
| 229 | `/shipping-returns` | A16; N11–N12 |
| 230 | `/terms` | A16 |
| 231 | `/privacy` | A16; K06–K07 |
| 235 | `/auth/sign-in` route compatibility plus email code and Google | G14; G03–G04 |
| 236 | `/account` | G05 |
| 237 | `/account/orders` | G06 |
| 238 | `/account/orders/[id]` with preview/download | G07; D04–D06; I04 |
| 239 | `/account/profile` | G13 |
| 243 | `/admin/login` | H01 |
| 244 | `/admin` | H01; H13 |
| 245 | `/admin/products` | H02–H05; H16–H17 |
| 246 | `/admin/orders` | H06 |
| 247 | `/admin/orders/[id]` | H07–H10; D14 |
| 248 | `/admin/coupons` | H11 |
| 249 | `/admin/digital-delivery` | H12 |
| 250 | `/admin/shipping` | H18 |
| 251 | `/admin/settings` restricted surface for basic configuration | H19; A02; A05; K08; M07–M08 |

### 7 Product detail page (lines 253–273)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 257 | Main/detail/scene images and video | N05 |
| 258a | Product name | A10 |
| 258b | Standard price | A10; C02 |
| 258c | Promotion price | N06 |
| 258d | Starting price | A10; C02 (`starting_at`) |
| 259a | Production ETA | N07 |
| 259b | International shipping ETA | N07 |
| 260 | Specification selection | C01 |
| 261 | Customization fields | C04–C10 |
| 262 | Upload entry | C13 |
| 263 | Upload requirements/examples | N08 |
| 264 | Real-time preview | C15 |
| 265 | Dynamic price | C02–C03 |
| 266 | Shipping explanation | N09 |
| 267 | Preview-required explanation | N10; D01 |
| 268 | Free-remake explanation | N11; M01 tracks actual redo lifecycle |
| 269 | No-reason-return explanation | N12 |
| 270a | PDP FAQ area | N13 |
| 270b | PDP review area | N14; L01 remains full Phase 2 system |
| 271 | Add-on/digital add-on | E20; L10 for later cross-sell |
| 273 | Default 7–15 business-day range; no exact arrival promise | N07; F07; M10 |

### 8 Configurable product data model (lines 275–288)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 279 | Product basics/category/cover/description/SEO | B01–B03; K15–K18 |
| 280 | SKU/Variant options, weight, price, inventory/supply | B01; C01–C02; F04 |
| 281 | Text/single/multi/number/photo/file fields | C05–C12; X06 records the implemented static-required flag without substituting for C28 |
| 282a | CustomizationRule price surcharge | C03 |
| 282b | CustomizationRule conditional required semantics | C28 |
| 282c | CustomizationRule conditional visibility semantics | C29 |
| 282d | Configurable validation rules | C05–C06; C11–C19 |
| 283 | Product image/example/video/SEO assets | B03; N05; N08 |
| 284 | Fulfillment type/cycle/preview/digital | B04; D01; I01 |
| 285 | Shipping profile by type/weight/rules | F01–F06 |
| 286 | Complete immutable Order item snapshot | B08; C26 |
| 288 | Do not hardcode 21 SKUs; manage data through Admin where practical | B05; B07; H02–H05; H16–H18 |

### 9 Order and fulfillment lifecycle (lines 290–330)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 294–308 | Suggested normal lifecycle: pending payment→paid→review→preview→production→QC→shipment→delivery→review request | E03–E06; D03–D13; F08; L01 |
| 312 | Payment failed | E05 |
| 313 | Cancelled | E06 |
| 314 | Refunded | E07 |
| 315 | On hold / needs customer information | D11; K11 (notification groundwork remains missing) |
| 316 | Remake required | M01 |
| 317 | Delivery exception | F08; L07 (proactive notification is Phase 2) |
| 321 | Review photos within 12 hours | M08 (owner/supplier operating target) |
| 322 | Confirm customization within 24 hours | M08 (owner operating target) |
| 323 | Submit to factory within 24 hours of confirmation | M08; K10/L08 for richer supplier flow |
| 324 | 3–5-day production target | M08; D01 |
| 325 | Complete QC within 1–2 days after receipt | M08; D13 |
| 326 | Ship within one day after QC | M08; F08 |
| 327 | Proactively contact on logistics exception | L07 (PHASE 2) |
| 328 | Invite review three days after delivery | L01 (PHASE 2) |
| 330a | Free remake for quality issues | N11; M01 |
| 330b | No no-reason return for personalized goods | N12 |
| 330c | Warn before production for unmakeable/poor image | C20–C24; D10 |

### 10 Authentication, authorization and security (lines 332–345)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 334 | Supabase Auth email code + Google OAuth | G03–G04 |
| 335 | Strict Admin/member separation | H01; K04; L09 |
| 336 | Server validates Order writes, payment, coupons and files | K01–K04; E10–E11; I07 |
| 337 | Never trust client amount/discount/shipping | K01; E10–E11; F02 |
| 338 | Signed, idempotent webhook | E27–E28 |
| 339 | Private originals/previews/digital objects | K02; I07 |
| 340 | Expiring private-file access | I05; K02 |
| 341 | Upload type/size/count/dimension bounds | C11–C12; C16–C19 |
| 342 | Prevent duplicate, unauthorized, enumeration and Admin bypass | K03–K04; H01 |
| 343 | Audit key operations | H15; K05 |
| 344 | Privacy explains use, retention and deletion | K06; QH04 is optional hardening only |
| 345 | Account/personal-data deletion path | G12; K07 |

### 11 Technical architecture baseline (lines 347–382)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 349 | Reuse repository Next.js/vinext, Cloudflare and Supabase shape where practical | K08; M05 |
| 353 | Next-compatible React/TypeScript full-stack | K08 (current repository evidence) |
| 354 | vinext + Cloudflare Pages/Workers runtime | M05 |
| 355 | Supabase PostgreSQL | X04 documents accepted local migration implementation; production activation is M04/M05 handoff |
| 356 | Supabase Auth | G03–G04 |
| 357 | One private Storage choice: Supabase Storage or R2 | K02; K06; production Storage provider row |
| 358 | Stripe + PayPal | E08–E10; E27–E28 |
| 359 | Resend | K11–K14; I08 |
| 360 | 17TRACK | F09 |
| 361 | English first, Spanish reserved | A03; A18 |
| 362 | GA4/Meta/TikTok analytics | J09–J11 |
| 363 | Domain/DNS/CDN via approved Cloudflare setup | A05; M05 |
| 364 | Git version control | Repository baseline; no gap row required |
| 370 | Brand/domain configurable | A05; K08 |
| 371 | Countries configurable | A02; F01; K08 |
| 372 | Payment keys configurable | E08–E09; K08 |
| 373 | Supabase configuration externalized | G03–G04; K08 |
| 374 | Google OAuth configuration externalized | G04; K08 |
| 375 | Resend key externalized | K11–K14; K08 |
| 376 | 17TRACK key externalized | F09; K08 |
| 377 | Shipping rules configurable | F01–F06; H18 |
| 378 | Free-shipping threshold configurable | F06 |
| 379 | Product/SKU data-configured | B01; B05; B07 |
| 380 | Discount rules configurable | E11–E20; E29; H11 |
| 381 | Admin account configurable | H01; K08 |
| 382 | Analytics IDs configurable | J09–J11; K08 |

### 12 Core data tables (lines 384–407)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 386 | Profiles | G02; G05 |
| 387 | Auth identities/provider bindings | G02–G04; G10 |
| 388 | Products | B01; H02 |
| 389 | Categories | B02; H16 |
| 390 | Product variants | B01; H17 |
| 391 | Customization fields | C04–C12; H03 |
| 392 | Customization rules | C03; C28–C29; C05–C06; C11–C19; H04 |
| 393 | Product assets | B03; H05; N05; N08 |
| 394 | Shipping profiles | F03–F06; H18 |
| 395 | Shipping rates | F01–F07; H18 |
| 396 | Carts/items | E21–E24; X02 is extra retained-Cart behavior |
| 397 | Orders/items | E03; B08; C26 |
| 398 | Order customizations | C26 |
| 399 | Order events/timeline | D08; H15; K05 |
| 400 | Production preview versions/customer actions | D03–D09 |
| 401 | Shipments/tracking events | F08–F09 |
| 402 | Payments/webhook events | E04–E10; E27–E28 |
| 403 | Coupons/redemptions | E11–E19; E29; H11 |
| 404 | Digital deliveries/download tokens | I01–I07 |
| 405 | Reviews reserved for Phase 2 | L01; N14 is only the MVP PDP area |
| 406 | Referrals/points ledger reserved for Phase 2 | L02–L03 |
| 407 | Admin audit logs | H15; K05 |

### 13 Transactional email (lines 409–425)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 411 | Resend transactional delivery | K11–K14; I08 |
| 413 | Email login code | G03 |
| 414 | Order-created email | K12 |
| 415 | Payment-success email | K13 |
| 416 | Photo supplement/re-upload email | D11; K11 |
| 417 | Preview-ready email | D11 |
| 418 | Preview-revision result email | D11 |
| 419 | Production-start email | K14 |
| 420 | Shipment email | K14 |
| 421 | Tracking number/link email | K14 |
| 422 | Digital-ready email | I08 |
| 423 | Order exception/manual-contact email | K11; K14 |
| 425 | Marketing, abandoned-cart and review-invite automation deferred | L01; L05–L06 (PHASE 2) |

### 14 Promotions and business rules (lines 427–441)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 431 | Registration welcome coupon: 10% off | E16 |
| 432 | $49 free shipping | F06 |
| 433 | $79 minus $5 | E17 |
| 434 | Second item 20% off; third 30% off | E18 |
| 435 | Holiday discount | E19 |
| 436 | Abandoned-cart coupon | E29; L05 for recovery automation |
| 437 | Digital add-on price | E20 |
| 438 | Points cap 30% in Phase 2 | L02 (PHASE 2) |
| 439 | Referral reward in Phase 2 | L03 (PHASE 2) |
| 441 | Coupon expiry/use/product/country/minimum/user constraints | E15 |

### 15 Visual and experience requirements (lines 443–453)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 445 | Premium/warm/trustworthy/emotional direction | N15 |
| 446 | Gift-appropriate low-saturation color direction | N16 |
| 447a | Home real finished products | N01 |
| 447b | Home before/after | N02 |
| 447c | Home use/occasion scenes | N03 |
| 447d | Home emotional stories | N04 |
| 448a | PDP answers makeability | N08; C20–C24 |
| 448b | PDP answers upload process | C13–C19; N08 |
| 448c | PDP answers timing | N07 |
| 448d | PDP answers poor-quality remedy | N11–N12 |
| 449 | Mobile-first customization | N17; A17 |
| 450 | Loading/error feedback for upload/crop/preview/payment | N18; A20 |
| 451a | Price visible | A10; C02; N06 |
| 451b | Shipping visible | N07; N09 |
| 451c | Production timing visible | N07 |
| 451d | Return/change policy visible | N11–N12 |
| 452 | Natural English major CTAs | N19; A03 |
| 453 | TikTok/Instagram/Pinterest landing-content structure | N20; distinct from J09–J11 analytics |

### 16 Acceptance criteria (lines 455–484)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 459 | Guest completes test Order | E01–E03; G01 |
| 460 | Email-code and Google sessions | G03–G04 |
| 461 | Same-email guest history after login | G09–G10 |
| 462 | Fields, dynamic price, conditional rules and SKU rules work | C01–C10; C28–C29 |
| 463 | Multi-upload/order/crop/preview/clarity | C12–C15; C20 |
| 464 | Upload has no permanent public URL | K02 |
| 465 | Stripe and PayPal test payments | E08–E09 |
| 466 | Webhook updates idempotently/no duplicate Order | E10; E27–E28 |
| 467 | Shipping by country/weight/product type | F01–F05 |
| 468 | Coupon cannot bypass server validation | E11; K01 |
| 469 | Preview/revision count/status traceable | D03–D10 |
| 470 | Admin handles Orders/uploads/previews/tracking/digital | H06–H12 |
| 471 | Order email sent | K12 |
| 472 | Manual logistics works without 17TRACK | F08 |
| 473 | Authorized expiring digital download only | I03–I07 |
| 477 | Desktop/mobile no overflow | A17 |
| 478 | Understandable upload/payment/network/duplicate feedback | A20; N18; K03 |
| 479 | SEO title/description/structured/share content | K15–K18 |
| 480 | Reasonable alt text | K17 |
| 481 | Server calculates Order/payment totals | K01; E03–E04 |
| 482 | Members cannot call Admin API | H01; K04 |
| 483 | Lint/build/key-flow/production checklist | M04; local quality evidence is separate |
| 484 | One real upload→tracking E2E before launch | M04 |

### 17 Milestones (lines 486–517)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 490 | Decide brand/domain/sending domain | A05; M05; K11–K14 |
| 491 | Competitor teardown | NS01 |
| 492 | Select initial test SKUs | B05 |
| 493 | Confirm supplier/cost/lead-time/shipping | B06; M08; F01–F06 |
| 494 | Configure Supabase/payment/email/Storage | G03–G04; E08–E09; K11–K14; K02; M04–M05 |
| 498 | Home/category/PDP/Cart/Checkout | A06–A12; N01–N14 |
| 499 | Generic product model | B01–B08; C01–C26; C28–C29 |
| 500 | Upload/crop/preview/dynamic price | C02–C03; C11–C24 |
| 501 | Guest Order/member authentication | E01–E03; G01–G04 |
| 502 | Stripe/PayPal test integration | E08–E09 |
| 506 | Admin Order/photo/preview workflows | H06–H09 |
| 507 | Shipping engine/manual tracking | F01–F08; H10; H18 |
| 508 | Digital delivery | I01–I08; H12 |
| 509 | Email/analytics/policy pages | K11–K14; J01–J11; A16 |
| 510 | Full-chain test and MVP launch | M04–M05; A01 |
| 514 | Publish TikTok/Instagram/Pinterest content | NS04–NS05 |
| 515 | Collect view/upload/cart/checkout/payment data | J02–J07 |
| 516 | Select lead categories from conversion/margin/content evidence | NS02 |
| 517 | Then implement points/referrals/reviews/abandonment/Spanish | L01–L06; A18 (PHASE 2) |

### 18 Initial KPIs (lines 519–531)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 521 | At least 10 competitor analyses | NS01 |
| 522 | At least 21 SKUs: 18 physical + 3 digital | B05 (OWNER_CONFIGURATION because assortment directly populates the site) |
| 523 | At least three core suppliers | B06 (OWNER_CONFIGURATION because supplier facts determine sellability) |
| 524 | Select 1–2 lead categories after research | NS02 |
| 525 | Website launch in week three | NS03 |
| 526 | TikTok/Instagram/Pinterest accounts | NS04 |
| 527 | At least 30 content items | NS05 |
| 528 | Contact at least 30 influencers | NS06 |
| 529 | At least one full-chain test | M04 |
| 530 | Real user upload/payment/preview/tracking | A01; M04 |
| 531 | First-month ads validate creative/audience/funnel, not profit | NS07 |

### 19 Owner configuration (lines 533–553)

| Source line | Short requirement | Audit mapping |
| ---: | --- | --- |
| 537 | Final brand name | A05 |
| 538 | Domain | A05; M05 |
| 539 | Logo/brand colors/fonts | N15–N16 (local style accepted); production owner configuration remains A05/K08 |
| 540 | Lead products/final SKUs | B05; NS02 |
| 541 | Product images/video/English copy | N01; N03; N05; N08; N19 |
| 542 | Supplier/production quotations | B06; M08 |
| 543 | Country shipping/weight rules | A02; F01–F06; H18 |
| 544 | Stripe account/keys | E08 |
| 545 | PayPal account/keys | E09 |
| 546 | Supabase project | G03–G04; K08; M04–M05; X04 records local migration integrity |
| 547 | Google OAuth configuration | G04; G10 |
| 548 | Resend domain/key | K11–K14; I08 |
| 549 | 17TRACK key | F09 |
| 550 | Final object-storage choice | K02; K06 |
| 551 | Admin account | H01; K08 |
| 552 | GA4/Meta/TikTok IDs | J09–J11 |
| 553 | Support email/return address | M07; N11–N12 |

### 20 Explicit exclusions/prohibitions (lines 555–564)

| Source line | Short requirement | Audit mapping/classification |
| ---: | --- | --- |
| 557 | Requirement-document phase did not modify code | EXCLUDED historical process constraint; this audit does not rewrite that history |
| 558 | Do not lock lead category before research | NS02; EXCLUDED premature category lock |
| 559 | Do not hardcode 21 SKUs | B07; EXCLUDED hardcoded Catalog |
| 560 | Do not fake shipping prices without quotations | M10; EXCLUDED fabricated shipping fact |
| 561 | Do not pretend 17TRACK is connected without key | F09; M10; EXCLUDED fake provider status |
| 562 | AI support/quotation/logistics agents are another business line | EXCLUDED from MVP; no audit implementation row |
| 563 | Do not promise an exact international arrival date | F07; N07; M10 |
| 564 | Frontend parameters cannot bypass payment/coupon/shipping/authorization | K01–K04 |
