# PhotoGift Customization Final Requirements Review

## Review result

**CONFORMING WITH APPROVED BLOCKED AND DEFERRED BOUNDARIES**

This is a conformance review of the implementation completed through
Customization Task 10.8. It is not a deployment approval and does not activate
the production upload provider, Phase C, normalized checkout, or any C1
migration.

Review date: 2026-08-17

Current state:

- Customization: 62/70 before this task; Task 10.9 is the only task reviewed here.
- C1: 41/61.
- C1 Task 3.5: **BLOCKED**.
- `BACKFILL AUTHORIZED: NO`.
- Task 8.5: **BLOCKED / UNCHECKED** by the ordered C1 / Phase C dependency.
- Tasks 8.6 and 8.7: **UNCHECKED**.
- Production Customer Upload Provider: **UNRESOLVED / STOPPED**.
- Production `CustomerUploadReceiptRepository`: **NOT ACTIVATED**.
- `/api/uploads`: **503 FAIL-CLOSED**.
- `/api/customer-uploads/preview`: **503 FAIL-CLOSED**.
- Normalized checkout: **503 FAIL-CLOSED**.

## Sources reviewed

The review used the current repository state, not historical progress summaries:

- Customization proposal, design, both capability specs, and `tasks.md`.
- `openspec/specs/engineering-foundation/spec.md`.
- Active C1 proposal, design, capability specs, and `tasks.md`.
- `docs/customization-workflow.md`.
- `docs/customer-upload-trust-model.md`.
- `docs/customer-upload-production-provider-handoff.md`.
- `docs/customization-migration-handoff.md`.
- Current domain, application, infrastructure, server, route, storefront, and
  test sources.

The progress values in the workflow, trust-model, and migration-handoff
documents are explicitly labeled historical snapshots such as “before Task
10.1 completion”. They are not current-state claims and do not conflict with
the current `tasks.md`.

## Requirement traceability matrix

| Requirement / boundary | Implementation evidence | Test evidence | Status | Notes / blocker |
|---|---|---|---|---|
| Product-owned `CustomizationField` authority | `app/domain/customization-field.ts`; customization repositories and Supabase mapper | `customization-field.test.mjs`, `customization-field-repository.test.mjs`, `customization-server-repository.test.mjs` | **CONFORMING** | Stable Product identity, code, kind, revision, active state, and bounded constraints are parsed and owned by Product. |
| Variant Options vs. Customization separation | `app/application/product-detail-customization-composition.ts`; `app/domain/configured-item.ts` | `customization-domain-regression.test.mjs`, `product-detail-customization-composition.test.mjs`, `customization-deferred-feature-drift.test.mjs` | **CONFORMING** | Customer content does not resolve SKU identity or commercial facts. |
| Allowed field kinds | `app/domain/customization-field.ts` | `customization-field.test.mjs`, `customization-validation.test.mjs` | **CONFORMING** | Limited to `image`, `short_text`, and `long_text`. |
| Deterministic value validation | `app/domain/customization-value.ts`; `app/domain/customization-validation.ts` | `customization-value.test.mjs`, `customization-validation.test.mjs` | **CONFORMING** | Requiredness, length, count, MIME, dimensions, ownership, duplicates, and stale revisions fail closed. |
| Crop behavior | `app/domain/customization-validation.ts`; `app/application/product-customization-crop-editor.ts` | `product-customization-crop.test.mjs`, `customization-validation.test.mjs` | **CONFORMING** | Normalized, bounded, non-destructive metadata only. |
| Local draft lifecycle | `app/domain/product-customization-draft.ts`; draft and slot application modules | `product-customization-draft.test.mjs`, `product-customization-image-slots.test.mjs` | **CONFORMING** | Derived state is not trusted from browser-supplied lifecycle values. |
| Product detail UI composition | `app/storefront/ProductDetailExperience.tsx`; customization field components | `product-customization-product-detail-ux.test.mjs`, `product-detail-customization-composition.test.mjs`, `product-customization-text-fields.test.mjs` | **CONFORMING** | Variant selector and customizer remain sibling concerns. |
| Customer-input preview | `app/client/local-customer-input-preview.ts`; preview UI and safe preview boundary | `customer-upload-preview.test.mjs`, `product-customization-image-fields.test.mjs` | **CONFORMING — SAFE STOP GATE** | Local preview is available; production server preview remains 503 and is not a production preview. |
| Private customer-upload ownership | `app/application/guest-draft-owner-context.ts`; `app/server/customer-upload-ownership.server.ts` | `guest-draft-owner-context.test.mjs`, `customer-upload-ownership-boundary.test.mjs`, `authorization-order-regression.test.mjs` | **CONFORMING** | Server-issued/verifiable guest ownership precedes privileged construction. |
| Receipt authority | `app/domain/customer-upload.ts`; acceptance and handoff services | `customer-upload-contract.test.mjs`, `configured-item-handoff-acceptance.test.mjs` | **CONFORMING** | `receiptId` is opaque identity, not authorization or a storage locator. |
| Server image inspection | `app/domain/customer-image-inspection.ts`; upload acceptance service | `customer-image-inspection.test.mjs`, `customer-upload-acceptance-service.test.mjs` | **CONFORMING** | Browser MIME/size metadata remains non-authoritative. |
| Upload acceptance and partial failure | `app/application/customer-upload-acceptance-service.ts`; failure controls | `customer-upload-acceptance-service.test.mjs`, `customer-upload-failure-controls.test.mjs` | **CONFORMING — LOCAL/PROVIDER-NEUTRAL** | Fakes prove compensation and no false accepted success; production provider is stopped. |
| Lifecycle and cleanup | `app/application/customer-upload-lifecycle-service.ts`; provider-neutral repository ports | `customer-upload-lifecycle-service.test.mjs`, `customer-upload-fakes.test.mjs`, `customer-upload-security-regression.test.mjs` | **PARTIAL / BLOCKED BY APPROVED DEPENDENCY** | Local lifecycle and cleanup semantics exist; durable production receipt persistence and Phase C attachment do not. |
| Storage-provider neutrality | `app/application/customer-upload-object-store.ts`; provider handoff | `customer-upload-provider-stop-gate.test.mjs`, `customization-deferred-feature-drift.test.mjs` | **CONFORMING — SAFE STOP GATE** | Supabase Storage, R2, and S3 are not selected or activated. |
| Fixture isolation | Explicit source selection and development repositories | `customization-development-fixtures.test.mjs`, `production-source-fail-closed-regression.test.mjs`, `customization-configuration-regression.test.mjs` | **CONFORMING** | Production source failure never substitutes fixtures or permissive empty configuration. |
| ProductAsset separation | Catalog asset domain/repository and public serializers | `catalog-privacy-regression.test.mjs`, `catalog-domain.test.mjs`, `admin-product-assets.test.mjs` | **CONFORMING** | ProductAsset remains public marketing metadata; private receipts cannot become assets. |
| Configured-item handoff | `app/application/configured-item-handoff-acceptance.ts`; handoff gate | `configured-item.test.mjs`, `configured-item-handoff-acceptance.test.mjs`, `product-customization-handoff-gate.test.mjs` | **CONFORMING** | Contains Product, Variant/SKU, selected Options, revision, and ordered values without browser commercial/provider authority. |
| Server revalidation | Configured-item acceptance re-resolves catalog, field configuration, and owned receipts | `configured-item-handoff-acceptance.test.mjs`, `order-catalog-resolution.test.mjs` | **CONFORMING** | Candidate browser input remains distinct from canonical server-accepted handoff. |
| Same-SKU customized copies | Copy sequence and compatibility projection modules | `configured-item-copy-sequence.test.mjs`, `configured-item-order-compatibility.test.mjs` | **CONFORMING** | Distinct payloads are preserved; no merge key or cart identity is invented. |
| Compatibility projection | `app/application/configured-item-order-compatibility.ts` | `configured-item-order-compatibility.test.mjs`, `legacy-order-compatibility.test.mjs` | **CONFORMING — NO DURABLE PERSISTENCE** | Existing legacy boundary is preserved without claiming normalized order storage. |
| Normalized order boundary | `app/application/normalized-order-request-boundary.ts`; `/api/orders` | `normalized-order-request-boundary.test.mjs`, `order-request-contract.test.mjs` | **CONFORMING — SAFE STOP GATE** | Valid normalized checkout remains explicitly 503 until Task 8.5 / Phase C. |
| C1 purchase snapshot ownership | C1 catalog/order contracts remain separate from Customization | `order-catalog-resolution.test.mjs`, `order-request-contract.test.mjs` | **DEFERRED BY APPROVED SCOPE** | Product/SKU immutable name/slug, option, price, and currency snapshot remains C1 Task 7.4. |
| Task 8.5 durable attachment | No Phase C migration or OrderItem attachment implementation | `customer-upload-provider-stop-gate.test.mjs`, `configured-item-handoff-acceptance.test.mjs` | **PARTIAL / BLOCKED BY APPROVED DEPENDENCY** | Provider-neutral attach-once ports/fakes do not claim durable OrderItem attachment. |
| Legacy preservation | Legacy JSON/path/order/admin boundaries remain compatibility code | `legacy-order-compatibility.test.mjs`, `catalog-privacy-regression.test.mjs` | **CONFORMING** | `products.customization_schema`, `order_items.customization`, `order_uploads`, and legacy path semantics are not destructively rewritten. |
| Migration/deployment gate | Local Phase A/B/RPC artifacts and handoff docs | `customization-publication-rpc-migration.test.mjs`, `customization-migration-handoff.md` | **CONFORMING — SAFE STOP GATE** | Local artifacts do not prove remote application; no migration is applied or authorized here. |
| Security and privacy | Safe error, authorization order, public catalog, and response boundaries | `authorization-order-regression.test.mjs`, `response-leakage-regression.test.mjs`, `catalog-privacy-regression.test.mjs` | **CONFORMING** | No provider diagnostics, owner credentials, private locators, or customer data cross public boundaries. |
| Offline verification | Deterministic fakes and explicit offline scripts | `package.json`; 69-file `test:offline` gate | **CONFORMING** | Task 10.8 verified `npm run verify` and 668/668 offline tests without live services. |
| Server/client secret separation | vinext client/server build outputs and runtime adapter | Task 10.7 build-boundary inspection; `rendered-html.test.mjs` | **CONFORMING** | Client artifacts contain no actual server secret values or privileged provider modules. |
| Deferred-feature boundaries | Domain parsers, admin boundaries, and drift regression tests | `customization-deferred-feature-drift.test.mjs` | **CONFORMING — DEFERRED BY APPROVED SCOPE** | Pricing, conditional rules, supplier routing, AI analysis, production preview, and complete cart identity remain inactive. |

## Locked authority decisions

The review confirms the following remain unchanged:

- Product Options define SKU identity only.
- Customer photos, text, names, notes, and style/pose input remain
  Customization values.
- Field kinds are exactly `image | short_text | long_text`.
- Production Product-specific field configuration must come from authoritative
  approved catalog data; fixtures, names, slugs, legacy JSON, and seed examples
  are not production authority.
- Variant/SKU owns base price, currency, weight, availability, and
  `supplyMethod`.
- Customer-input preview is not production preview.
- The final production customer-upload provider and retention policy remain
  unresolved.
- Complete cart identity, hashing, merge behavior, and durable cart persistence
  remain deferred.

## Configured-empty distinction

The implementation preserves the distinction between:

- `not_configured`: no authoritative current field configuration exists;
- configured with `fields=[]`: an authoritative current configuration exists and
  contains no fields.

Configured-empty may produce an empty customization value collection when the
  Product/SKU/Option authority is otherwise valid. Source failure and invalid
  configuration do not become configured-empty. This is covered by
  `customization-server-repository.test.mjs`,
  `customization-product-detail.test.mjs`, and
  `configured-item-handoff-acceptance.test.mjs`.

## Private upload and runtime stop gates

The following are approved safe boundaries, not missing implementation defects:

| Boundary | Current behavior | Classification |
|---|---|---|
| `/api/uploads` | 503 fail-closed when production field/provider prerequisites are unavailable | **CONFORMING — SAFE STOP GATE** |
| `/api/customer-uploads/preview` | 503 fail-closed | **CONFORMING — SAFE STOP GATE** |
| normalized checkout | 503 fail-closed before order/payment mutation | **CONFORMING — SAFE STOP GATE** |
| local fake object store/receipt repository | deterministic and offline | **CONFORMING — LOCAL/TEST ONLY** |
| production receipt repository | not activated | **DEFERRED / BLOCKED** |
| provider adapter/bucket/binding | unresolved and stopped | **DEFERRED / BLOCKED** |
| Phase C OrderItem attachment | not implemented | **BLOCKED BY C1 / PHASE C** |

The provider-neutral attach-once capability and local fake behavior do not claim
durable OrderItem attachment, immutable normalized order snapshots, or a
completed Phase C race/transaction design.

## Active C1 boundary review

The current C1 change remains authoritative for:

- Category/Product catalog authority;
- Variant/SKU and Product Options;
- Variant eligibility, SKU code, price, currency, weight, availability, and
  `supplyMethod`;
- ProductAsset and FulfillmentConfig;
- eventual immutable Product/SKU purchase snapshots.

Current C1 status is unchanged:

| C1 item | Status |
|---|---|
| Progress | **41/61** |
| Task 3.5 | **BLOCKED** awaiting approved business mapping |
| Tasks 3.6–3.8 | **UNCHECKED / NOT BYPASSED** |
| Task 7.4 | **UNCHECKED / NOT BYPASSED** |
| Backfill | **BACKFILL AUTHORIZED: NO** |

Customization did not complete or bypass the C1 chain `3.5 → 3.6 → 3.7 → 3.8
→ 7.4`, did not persist the final Product/SKU purchase snapshot, and did not
activate Task 8.5.

## Current incomplete Customization tasks

The following remain intentionally incomplete and are not changed by this
review:

- Customization 3.4, 3.5, and 3.6: additive migration creation/verification
  and connected-database approval gates;
- Customization 8.5, 8.6, and 8.7: durable attachment, historical normalized
  adapter work, and the full guest handoff/order matrix;
- Task 10.10: deferred-work and final deployability handoff.

Local Phase A/B/RPC SQL artifacts and static checks are evidence of repository
artifacts only. They are not evidence of remote Supabase application,
production migration authorization, provider activation, or deployment.

## Deferred and out-of-scope behavior confirmed inactive

The review found no activation of:

- customization pricing or surcharge formulas;
- arbitrary conditional field rules;
- supplier, factory, procurement, warehouse, or routing semantics;
- AI image/text processing, face processing, background removal, or automated
  moderation;
- production preview/mockup generation or approval;
- complete cart identity, durable cart persistence, or merge hashing;
- a final Supabase Storage, Cloudflare R2, or S3 production choice;
- authentication, payment, shipping-rule, or unrelated C1 business changes.

## Conformance conclusion

No material requirement drift was found. The implementation conforms to the
approved Customization workflow, private-upload, engineering-foundation, and
active C1 boundaries. The incomplete capabilities are explicitly classified as
approved dependency blocks or deferred scope, not silently treated as
implemented.

This conclusion does not declare the change deployable. Provider approval,
schema/migration gates, C1 purchase snapshots, Phase C attachment, and the
remaining deferred-work record are still required under their own approved
tasks.
