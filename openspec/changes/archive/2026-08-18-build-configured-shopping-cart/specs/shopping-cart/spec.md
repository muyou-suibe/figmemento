## Purpose

Provide a provider-neutral, guest-capable Shopping Cart foundation that preserves each personalized Product configuration as a distinct pre-checkout copy while keeping private upload data, payment authority, and production persistence outside this change.

## ADDED Requirements

### Requirement: Configured-copy Cart lines

The system SHALL represent each CartLine as an opaque server-owned configured copy containing the validated Product identity, Variant/SKU identity, safe SKU display identifier, selected-option projection, safe customization summary, quantity, display unit price, and currency. A CartLine MUST NOT be identified or merged solely by Product, Variant/SKU, selected options, customization hash, photo, text, or configured-item hash.

#### Scenario: Same SKU with different customization
- **WHEN** two valid configured items use the same Variant/SKU but have different customer customization values
- **THEN** the Cart contains two distinct CartLines with different opaque line identities

#### Scenario: Opaque CartLine identity
- **WHEN** a CartLine is created
- **THEN** its identity is server-owned, non-predictable, and not derived from Product ID, SKU, email, upload receipt, or customer content

### Requirement: Explicit add creates a new line

Every explicit successful Add to Cart operation SHALL create a new CartLine with its own initial quantity. The system MUST NOT automatically coalesce a new addition into an existing line, even when all Product, Variant, option, customization, photo, text, and configured-item values appear equivalent.

#### Scenario: Repeated equivalent addition
- **WHEN** a shopper explicitly adds the same configured item twice
- **THEN** the Cart contains two lines, each initially with quantity one

#### Scenario: Explicit quantity change
- **WHEN** the shopper changes the quantity of an existing line
- **THEN** only that exact CartLine quantity changes and no other line is merged or changed

### Requirement: Safe public Cart projection

Public Cart reads SHALL expose only safe Cart state, lines, quantities, display totals, and configured-item summaries needed to distinguish copies. They MUST NOT expose customer-upload receipt IDs when private, object or storage keys, bucket names, signed URLs, owner bindings, provider metadata, raw storage paths, internal upload lifecycle data, Cart cookie values, session tokens, passwords, or provider diagnostics.

#### Scenario: Image customization summary
- **WHEN** a CartLine contains an accepted image customization
- **THEN** the Cart may show a safe indication or approved display metadata, but never a private upload locator or ownership identifier

#### Scenario: Provider failure response
- **WHEN** a Cart provider fails
- **THEN** the public response uses a bounded safe failure and does not reveal SQL, storage, provider, or customer details

### Requirement: Configured-item and catalog authority

Add to Cart SHALL accept only the minimum structural configured-item handoff required to identify the configured copy. The server MUST reuse the approved configured-item acceptance boundary and authoritative Catalog resolution to validate Product, Variant/SKU, selected options, customization configuration, owned active upload receipts where applicable, availability, base price, currency, and fulfillment facts. Browser-supplied price, currency, availability, fulfillment, totals, or private storage data MUST NOT become Cart authority.

#### Scenario: Valid configured item
- **WHEN** a shopper submits an already valid configured-item handoff
- **THEN** the server revalidates it and stores a safe CartLine projection using authoritative Variant/SKU price and currency

#### Scenario: Invalid configured item
- **WHEN** Product, Variant, selected options, customization configuration, ownership, or required receipts are invalid or stale
- **THEN** Add to Cart is rejected before Cart mutation

#### Scenario: Browser price tampering
- **WHEN** the browser submits a price or currency different from the authoritative Variant/SKU
- **THEN** the request is rejected or the browser values are ignored, and the stored CartLine uses authoritative values only

### Requirement: Display totals are not payment authority

Cart unit prices, subtotals, and totals SHALL be explicitly pre-checkout display facts. Checkout or order creation MUST independently revalidate Product, Variant/SKU, availability, price, currency, fulfillment, customization, and every other checkout-owned fact before any payment or order side effect. This change MUST NOT activate checkout or payment.

#### Scenario: Stale Cart before checkout
- **WHEN** a later checkout/order boundary reads a Cart whose Product, Variant, price, currency, availability, or fulfillment has changed
- **THEN** the later boundary surfaces a stale/unavailable result and does not treat the Cart total as payment authority

#### Scenario: Cart without checkout activation
- **WHEN** a shopper views the Cart in this foundation
- **THEN** no working checkout mutation or payment redirect is presented as available

### Requirement: Currency and availability fail closed

The Cart SHALL reject incompatible currency totals rather than adding different currencies as one numeric amount. An unavailable or inactive Variant MUST NOT be newly added. A previously added line whose catalog facts become unavailable SHALL be represented as stale/unavailable for later Cart read or handoff, without silently treating it as purchasable.

#### Scenario: Incompatible currencies
- **WHEN** Cart lines resolve to incompatible currencies
- **THEN** subtotal derivation fails closed with a bounded incompatible-currency state

#### Scenario: Unavailable Variant
- **WHEN** a shopper attempts to add an unavailable Variant
- **THEN** the Cart remains unchanged and returns a safe unavailable result

### Requirement: Quantity is bounded and line-scoped

Cart quantity SHALL be a positive integer within a documented technical anti-abuse bound. Fractional, zero, negative, non-integer, and over-bound quantities MUST be rejected. Quantity acceptance MUST NOT imply exact inventory, reservation, production-slot reservation, price locking, shipping-capacity reservation, or any other inventory promise.

#### Scenario: Invalid quantity update
- **WHEN** a quantity mutation supplies a fractional, non-positive, non-integer, or over-bound value
- **THEN** the exact CartLine remains unchanged and the request returns a bounded validation failure

#### Scenario: No reservation semantics
- **WHEN** a CartLine is added or its quantity changes
- **THEN** no stock, production slot, price, or shipping capacity is reserved

### Requirement: Explicit local Cart source modes

The foundation SHALL define only `disabled` and `local_fake` Cart source modes. `local_fake` SHALL be allowed only in development and test runtimes; selecting it in production MUST fail closed. An absent, disabled, unavailable, or failed authoritative source MUST NOT silently fall back to `local_fake` or fixtures.

#### Scenario: Disabled Cart source
- **WHEN** Cart source is absent or disabled
- **THEN** Cart operations return a safe unavailable state and do not create a local Cart

#### Scenario: Production local-fake rejection
- **WHEN** `local_fake` is selected in production
- **THEN** configuration is rejected and no Cart operation authenticates or persists a local Cart

#### Scenario: Local fake operation
- **WHEN** `local_fake` is selected in development or test
- **THEN** Cart workflow can run offline without Supabase or another remote provider

### Requirement: Process-local guest Cart persistence boundary

The local fake Cart provider SHALL use process-memory Carts with opaque cryptographically secure Cart IDs and line IDs. It SHALL not use a database, filesystem persistence, remote Supabase, R2, or another production store. Restarting the process SHALL clear local Carts, and multi-instance persistence SHALL be documented as unsupported.

#### Scenario: Process restart
- **WHEN** the local Cart process restarts
- **THEN** prior local Cart identities and lines are unavailable rather than being presented as durable production state

#### Scenario: Offline provider boundary
- **WHEN** local Cart tests execute
- **THEN** they use deterministic injected fakes and make no external network or database call

### Requirement: Dedicated guest Cart identity cookie

The anonymous Cart identity SHALL use a dedicated server-owned `figmemento-local-cart` cookie, or an explicitly documented equivalent, with an opaque value, HttpOnly, SameSite=Lax, Path=/, host-only scope, no Domain attribute, and runtime-appropriate Secure behavior. It MUST remain separate from `figmemento-local-customer-session`, `photogift-admin-session`, and `photogift-guest-draft-owner`.

#### Scenario: Lazy Cart creation
- **WHEN** a visitor reads an empty Cart
- **THEN** the server avoids creating persistent Cart state or a Cart cookie unless required by the read contract; identity is created lazily on the first successful mutation where practical

#### Scenario: Identity separation
- **WHEN** a visitor signs in, signs out, uploads customization media, or uses Admin Auth
- **THEN** the Cart cookie is not renamed, interpreted as, merged with, or used to mutate Customer Auth, Admin Auth, or guest draft/upload ownership

#### Scenario: Guest Cart survives sign-out
- **WHEN** a local customer signs out
- **THEN** the anonymous Cart is not automatically destroyed, claimed, or merged

### Requirement: Safe Cart HTTP surface

The Cart HTTP surface SHALL provide safe read behavior and explicit mutations equivalent to `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/[lineId]`, `DELETE /api/cart/items/[lineId]`, and optional `DELETE /api/cart`. Exact route naming may follow repository conventions but MUST preserve these semantics. Cart POST/PATCH/DELETE mutations SHALL use the established exact-Origin and `Sec-Fetch-Site` same-origin protection.

#### Scenario: Safe Cart read
- **WHEN** a visitor requests the current Cart
- **THEN** the response contains only the safe Cart projection and does not mutate unrelated guest, upload, order, auth, or payment state

#### Scenario: Cross-origin mutation
- **WHEN** a Cart mutation has missing, malformed, cross-origin, attacker-controlled Origin, or cross-site `Sec-Fetch-Site`
- **THEN** it is rejected before Cart state mutation and Host or X-Forwarded-Host alone is not used as authorization

#### Scenario: Exact line update
- **WHEN** a valid mutation names a CartLine belonging to the current Cart
- **THEN** only that exact line is updated or removed

### Requirement: Cross-Cart ownership protection

A CartLine ID from another Cart, an unknown Cart, or a malformed Cart identity MUST NOT be usable to read, update, remove, or infer another CartLine. Such requests SHALL return a bounded not-found/unauthorized result without revealing whether another Cart or line exists.

#### Scenario: Cross-Cart line mutation
- **WHEN** a visitor submits a line ID belonging to a different Cart
- **THEN** the target line remains unchanged and the response does not disclose its existence or owner

### Requirement: Clear Cart has narrow effects

If clear Cart is implemented, it SHALL clear only the current Cart's lines. It MUST NOT delete customization drafts, CustomerUpload objects or receipts, guest-owner identity, Customer Auth sessions, Admin sessions, orders, or payment state.

#### Scenario: Clear guest Cart
- **WHEN** a visitor clears their Cart
- **THEN** only that Cart's lines are removed and all guest ownership, upload, order, auth, and payment boundaries remain unchanged

### Requirement: Cart storefront presentation

The public Cart surface SHALL provide an empty state, safe configured-copy line presentation, explicit quantity controls, remove behavior, optional clear behavior, display-only subtotal, and navigation back to Product/shop. It SHALL use the completed FigMemento visual/accessibility system with semantic headings, keyboard/focus access, touch-sized controls, responsive layout, and reduced-motion behavior.

#### Scenario: Empty Cart UI
- **WHEN** a visitor opens an empty Cart
- **THEN** the page explains that the Cart is empty and provides a safe path back to Product/shop without claiming checkout readiness

#### Scenario: Configured-copy distinction in UI
- **WHEN** two lines share a SKU but have different safe customization summaries
- **THEN** the Cart UI presents them as separate lines with independent quantities and actions

#### Scenario: Deferred checkout affordance
- **WHEN** checkout/payment is not activated
- **THEN** the UI shows no working checkout action, or clearly labels any future handoff affordance as unavailable/deferred

### Requirement: No unsafe customization editing in Cart

The Cart MUST NOT claim to edit an existing customization unless an approved safe draft round trip exists. Without that capability, the Cart MAY link to the Product for a new configuration but MUST NOT silently mutate the original configured copy or expose private upload access.

#### Scenario: Cart edit unavailable
- **WHEN** a shopper wants to change an existing configured line and no approved edit round trip exists
- **THEN** the Cart offers only a safe new-configuration path or a clearly unavailable edit state

### Requirement: Production persistence and checkout handoff remain deferred

This foundation SHALL document future production Cart provider, persistence, RLS, concurrency, retention, and deployment requirements without selecting a production schema or storage provider. It SHALL map Cart lines to the existing normalized order/checkout request boundary without creating a second incompatible order model or changing order-item snapshot persistence. Guest → Customer Cart merge remains a later explicit change.

#### Scenario: Existing order contract reuse
- **WHEN** a later checkout/order change consumes Cart lines
- **THEN** it reuses the existing normalized order/configured-item compatibility contracts and performs fresh authoritative resolution instead of trusting Cart display facts

#### Scenario: Guest/customer coexistence
- **WHEN** Customer Auth is later enabled while an anonymous Cart exists
- **THEN** the Cart remains anonymous and unmerged until a separately approved Guest → Customer Cart merge policy is implemented

#### Scenario: No migration in this foundation
- **WHEN** this change is planned or implemented locally
- **THEN** no production Cart table, cart_items table, migration, RLS policy, trigger, RPC, or remote schema mutation is introduced by this foundation

### Requirement: Frozen project boundaries remain unchanged

Shopping Cart work MUST preserve C1 at 41/61 with Task 3.5 blocked and `BACKFILL AUTHORIZED: NO`, Customization at 64/70 without Phase C completion, archived Customer Auth at 30/30 with production authentication not activated, Brand/Domain at 41/41 with production cutover unauthorized, and Visual at 15/15. Cart MUST NOT add tax, shipping-rate calculation, coupons, promotions, payment, inventory reservation, production preview, supplier semantics, or deployment behavior.

#### Scenario: Frozen change isolation
- **WHEN** Cart planning or local implementation is reviewed
- **THEN** the frozen changes and their task states remain unchanged and no remote, migration, payment, DNS, Cloudflare, or deployment action is implied
