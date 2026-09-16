## Context

The repository has a legacy `CartItem` type in `app/domain/cart.ts`, but no Shopping Cart application boundary, provider, cookie, HTTP routes, or public Cart page. The reusable configured-item boundary is `ConfiguredItemHandoff`; `acceptConfiguredItemHandoff` re-resolves Product, Variant/SKU, customization configuration, and owned upload receipts. `product-customization-summary.ts` already provides a safe display projection that excludes receipt identity. `order-catalog-resolution.ts`, `normalized-order-request-boundary.ts`, `configured-item-order-compatibility.ts`, and `legacy-order-compatibility.ts` define the existing order-side compatibility edges.

This change is a pre-checkout foundation. It must coexist with the archived provider-neutral Customer Auth foundation, the separate `photogift-guest-draft-owner` upload boundary, C1's incomplete order/migration chain, and the Customization change's remaining work. See `proposal.md` and `specs/shopping-cart/spec.md` for the observable contract.

## Goals / Non-Goals

**Goals:**

- Establish one provider-neutral Cart contract for safe configured-copy lines.
- Reuse the accepted configured-item and authoritative catalog boundaries instead of duplicating them.
- Provide a development/test-only process-memory guest Cart path with explicit source selection and no remote dependency.
- Keep Cart identity, Customer Auth, Admin Auth, and guest upload ownership separate.
- Define safe HTTP and storefront behavior for reading, adding, updating, removing, and optionally clearing Cart lines.
- Keep display subtotal and Cart state distinct from checkout, payment, shipping, tax, coupons, inventory, and order authority.
- Make the future production persistence and Cart → order handoff explicit without selecting a schema or provider.

**Non-Goals:**

- No Product, Category, Variant/SKU, FulfillmentConfig, or customization-field authoring.
- No upload lifecycle, ownership, storage-provider, production-preview, or Customer Auth implementation.
- No automatic Cart merge, authenticated Cart merge, Guest → Customer Cart merge, or customization edit round trip.
- No production Cart tables, migrations, RLS policies, triggers, RPCs, Supabase persistence, R2 selection, or deployment.
- No checkout activation, Stripe, PayPal, payment webhook changes, tax, shipping-rate calculation, coupons, promotions, exact inventory, or reservation semantics.
- No change to C1, Customization, Brand/Domain, Visual, Customer Auth, order snapshot, or payment task status.

## Decisions

### 1. Reuse the accepted configured-item boundary

Cart Add accepts the existing structural `ConfiguredItemHandoff`, then calls the existing server acceptance boundary before any Cart mutation. The Cart layer does not create a second configured-item parser, a second Variant resolver, or a second customization validator. The accepted handoff is treated as a server-verified input to Cart, not as browser proof.

The Cart provider stores only the minimum internal data needed for a later server revalidation. Its public projection uses the existing safe customization summary vocabulary and never serializes private receipt IDs, storage locators, owner bindings, or provider metadata.

**Alternative considered:** Persisting the raw browser handoff or reimplementing field/upload validation in Cart. Rejected because it would bypass the approved ownership boundary and create semantic drift.

### 2. Model CartLine as a configured copy, not a SKU

Each `CartLine` receives a server-generated opaque line ID and represents one accepted configured copy. Its safe display identity includes Product, Variant/SKU, selected options, and safe customization summary. The line's identity is never derived from SKU or a customization hash.

**Alternative considered:** Using `Product ID + Variant ID` as a key. Rejected because the same SKU can carry different photos, text, or other customer input.

### 3. Reject automatic merge in the first foundation

Every successful explicit Add to Cart creates a new line with quantity one. Only a later explicit quantity mutation changes an existing line. No equality or deduplication algorithm is needed, so the foundation cannot accidentally coalesce two personalized copies.

**Alternative considered:** Merging equal configured-item hashes. Rejected because hashing private/customer input would create a new identity policy and still risk false equivalence; deduplication can be separately approved later.

### 4. Separate stored private data from public Cart projection

The provider/application boundary distinguishes internal stored line authority from a safe public Cart projection. Internal state may retain an accepted opaque upload reference needed for later server-side revalidation, but public Cart responses do not expose that reference when it is private. Public image display uses safe summary metadata or an already-approved temporary preview boundary; the Cart itself never manufactures signed URLs.

**Alternative considered:** Returning receipt IDs or storage paths for client rendering. Rejected because identifiers can become an object-access oracle and violate the upload trust model.

### 5. Make Variant/catalog facts authoritative at Add and future checkout

Add revalidates Product eligibility, exact Variant/SKU ownership, selected options, customization revision/receipts, availability, Variant price, currency, and Product fulfillment through existing boundaries. The Cart records a display snapshot for the local workflow, but it is not immutable payment authority. A future checkout/order boundary must resolve the current catalog again before creating order or payment side effects.

**Alternative considered:** Trusting the Cart's original price until checkout. Rejected because catalog edits, publication changes, and availability can occur after addition.

### 6. Use explicit `CART_SOURCE` modes

The server configuration exposes only `disabled` and `local_fake`. `local_fake` is allowed only in development/test and is rejected in production. Missing source defaults to disabled; source failures remain unavailable and never fall back to fixtures. Node/offline tests retain explicit environment injection.

**Alternative considered:** Inferring local Cart mode from missing Supabase credentials. Rejected because a missing production provider must fail closed, not silently change behavior.

### 7. Use a process-memory provider for the first local foundation

The local fake provider owns process-local Cart records, opaque Cart IDs, opaque line IDs, and deterministic dependency injection for tests. It performs no database, filesystem, Supabase, storage, or network access. Restart clears users' local Carts and multi-instance persistence is intentionally unsupported.

**Alternative considered:** Adding a local database or Supabase migration now. Rejected because production persistence schema, retention, concurrency, and RLS need a separate approved decision after the active C1/Customization work is reconciled.

### 8. Create Cart identity lazily and isolate its cookie

Use a dedicated `figmemento-local-cart` cookie with HttpOnly, SameSite=Lax, Path=/, host-only scope, no Domain, and runtime-appropriate Secure. A safe empty Cart read should avoid issuing the cookie or creating state; the first successful mutation creates the Cart identity. The cookie is never reused as Customer Auth, Admin Auth, or guest draft-owner identity.

**Alternative considered:** Reusing `photogift-guest-draft-owner` or `figmemento-local-customer-session`. Rejected because guest upload ownership and authenticated identity have different proofs, lifecycles, and future merge decisions.

### 9. Use narrow, repository-consistent HTTP mutations

The planned routes are `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/[lineId]`, `DELETE /api/cart/items/[lineId]`, and optional `DELETE /api/cart`. POST/PATCH/DELETE use the exact Origin and `Sec-Fetch-Site` convention already established by customer-auth/admin/upload boundaries. The current Cart identity is derived server-side from the cookie; a request-supplied Cart ID is not accepted as ownership authority.

**Alternative considered:** Allowing browser-set Cart IDs or relying on Host/X-Forwarded-Host. Rejected because it permits cross-Cart mutation and host-header authorization confusion.

### 10. Keep mutation semantics line-scoped and non-destructive

Quantity updates, removals, and clear operations target only the current Cart. Cross-Cart or unknown line IDs map to a bounded not-found/unauthorized result. Clear removes Cart lines only and does not delete drafts, upload receipts, guest-owner cookies, auth sessions, orders, or payment state.

**Alternative considered:** Cleaning related uploads during Cart removal. Rejected because upload lifecycle/retention and order attachment belong to the private upload and later order changes.

### 11. Cart UI presents value without claiming checkout readiness

`/cart` uses the completed FigMemento visual/accessibility foundation and presents empty, available, stale/unavailable, and configured-copy states. It shows safe options/customization summaries and display subtotal only. It does not expose a working checkout CTA, tax/shipping/discount estimates, payment status, or edit-customization workflow unless a later approved round trip exists.

**Alternative considered:** Reusing the existing order form or showing a checkout link early. Rejected because that would activate the payment/order boundary and misrepresent the current product readiness.

### 12. Preserve Customer Auth and guest ownership semantics

Customer Auth remains a separate optional identity. Sign-in does not claim or merge the anonymous Cart; sign-out does not destroy it. `photogift-guest-draft-owner` continues to authorize guest customization/upload receipts, and the Cart cookie is never used to authorize private media. A future Guest → Customer Cart merge must be a separate explicit change.

### 13. Defer production persistence and order handoff

The final production provider, tables, columns, RLS, retention, concurrency controls, and deployment values remain open. The design only maps a safe Cart line to the existing normalized order/configured-item contract for a later checkout/order change. That later change must revalidate authoritative catalog/customization/upload facts and coordinate with C1 order snapshots; this change does not create or apply migrations.

### 14. Batch and stop-gate sequencing

Batch 1 covers audit, domain contracts, local provider/cookie boundary, HTTP/security, and Cart UI (tasks 1.1–5.6). Batch 2 covers production/provider handoff and final verification (tasks 6.1–7.3). Apply must stop if the existing configured-item/order contract is incompatible, if a schema decision becomes necessary before an approved migration packet, or if any task would require remote Supabase, payment, deployment, or frozen-change modification.

## Risks / Trade-offs

- **[Risk]** Process-memory Carts disappear on restart and do not work across instances. → Keep `local_fake` development/test-only, show the limitation in local documentation/UI, and fail closed outside allowed runtimes.
- **[Risk]** A CartLine can become stale after catalog or customization changes. → Revalidate on Add and at the future checkout/order boundary; show bounded stale/unavailable state instead of silently purchasing.
- **[Risk]** Public Cart responses could leak private upload topology. → Maintain a separate safe projection, reuse the existing summary, and add static/privacy tests for receipt IDs, keys, buckets, URLs, owner IDs, and provider details.
- **[Risk]** Guest Cart and guest upload ownership can be confused. → Use separate cookies and proof boundaries; never accept one as authority for the other.
- **[Risk]** A future production Cart schema could conflict with C1 order snapshots or Customization Phase C. → Keep production persistence deferred and require a decision packet plus explicit approval before any migration.
- **[Risk]** Quantity limits could be mistaken for inventory. → Document the limit as anti-abuse only and add tests that no reservation or stock semantics exist.
- **[Risk]** Checkout affordances may imply payment readiness. → Do not add a working checkout action and assert absence of Stripe/PayPal/payment mutations in verification.

## Migration Plan

No migration is created or executed by the planning change or by the first local foundation batch.

1. Audit current contracts and record the exact reuse/compatibility findings.
2. Implement and test provider-neutral Cart contracts and the offline local fake without persistence schema changes.
3. Produce a future production Cart persistence/provider decision packet covering tables, RLS, ownership, retention, concurrency, and interaction with C1/Customization order snapshots.
4. Only after a separate human-approved change may an additive migration and production provider be designed or applied.
5. Before checkout/order activation, revalidate each Cart line against current Product/Variant/customization/upload authority and map to the existing normalized order contract.

Rollback of the local foundation is disabling `CART_SOURCE` or removing the local Cart application paths; it does not require or authorize deleting customer drafts, uploads, guest-owner state, orders, or historical records.

## Open Questions

- The production Cart persistence provider, schema, RLS, retention, cleanup, and multi-instance strategy remain future deployment decisions.
- The exact technical quantity anti-abuse bound is an implementation detail constrained by the positive-integer/bounded contract; it must not be presented as inventory.
- The final Cart-to-checkout orchestration and Guest → Customer Cart merge policy require later approved changes.
- A safe Cart customization-edit round trip is not assumed and must be approved separately if desired.
