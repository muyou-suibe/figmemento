## MODIFIED Requirements

### Requirement: Display totals are not payment authority

Cart unit prices, subtotals, and totals SHALL be explicitly pre-checkout display facts. Checkout or order creation MUST independently revalidate Product, Variant/SKU, availability, price, currency, fulfillment, customization, and every other checkout-owned fact before any payment or order side effect. Cart source selection MUST NOT itself activate checkout or payment. An independently enabled `local_persistent` Order flow MAY consume the Cart through the approved server-authoritative local boundary; it MUST NOT activate real payment or the stopped normalized `/api/orders` path.

#### Scenario: Stale Cart before checkout
- **WHEN** a later checkout/order boundary reads a Cart whose Product, Variant, price, currency, availability, or fulfillment has changed
- **THEN** the later boundary surfaces a stale/unavailable result and does not treat the Cart total as payment authority

#### Scenario: Cart without checkout activation
- **WHEN** a shopper views the Cart in the Cart-only foundation without an independently activated checkout boundary
- **THEN** no working checkout mutation or payment redirect is presented as available

#### Scenario: Persistent Cart display cannot authorize payment
- **WHEN** an independently enabled persistent local Order flow consumes a Cart
- **THEN** fresh server resolution remains mandatory and any subsequent payment is explicitly simulated rather than real-money authority

### Requirement: Explicit local Cart source modes

The foundation SHALL define `disabled`, `local_fake`, and `local_persistent` Cart source modes. `local_fake` SHALL be allowed only in development and test runtimes; selecting it in production MUST fail closed. `local_persistent` SHALL be allowed only in development/test against the independent Docker local Supabase PostgreSQL project and MUST be rejected in staging/production. An absent, disabled, unavailable, or failed authoritative source MUST NOT silently fall back to `local_fake` or fixtures. Persistent Cart, configured-item Catalog resolution, Order, Auth where required, and upload authorities where required MUST use the same selected local project rather than a mixture of persistent and memory commerce state.

#### Scenario: Disabled Cart source
- **WHEN** Cart source is absent or disabled
- **THEN** Cart operations return a safe unavailable state and do not create a local Cart

#### Scenario: Production local-fake rejection
- **WHEN** `local_fake` is selected in production
- **THEN** configuration is rejected and no Cart operation authenticates or persists a local Cart

#### Scenario: Local fake operation
- **WHEN** `local_fake` is selected in development or test
- **THEN** Cart workflow can run offline without Supabase or another remote provider

#### Scenario: Persistent source mismatch or failure
- **WHEN** a persistent Cart request targets staging/production, an unavailable database, a non-local project, or inconsistent related authority sources
- **THEN** it fails closed without mutating Cart state or falling back to a memory Cart or Catalog fixture

### Requirement: Process-local guest Cart persistence boundary

The local fake Cart provider SHALL use process-memory Carts with opaque cryptographically secure Cart IDs and line IDs. It SHALL not use a database, filesystem persistence, remote Supabase, R2, or another production store. Restarting the process SHALL clear `local_fake` Carts, and multi-instance persistence for `local_fake` SHALL be documented as unsupported. This process-loss boundary SHALL NOT apply to the separately selected `local_persistent` provider.

#### Scenario: Process restart
- **WHEN** the `local_fake` Cart process restarts
- **THEN** prior local Cart identities and lines are unavailable rather than being presented as durable production state

#### Scenario: Offline provider boundary
- **WHEN** local fake Cart tests execute
- **THEN** they use deterministic injected fakes and make no external network or database call

### Requirement: Production persistence and checkout handoff remain deferred

This foundation SHALL document future production Cart provider, persistence, RLS, concurrency, retention, and deployment requirements without selecting a production schema or storage provider. It SHALL map Cart lines to the existing normalized order/checkout request boundary without creating a second incompatible order model. The separate `local_persistent` extension MAY persist Cart and immutable Order-item snapshots in an independent local commerce namespace while reusing these contracts; it MUST NOT change legacy Order-item persistence or unblock normalized `/api/orders` requests. Guest → Customer Cart merge remains a later explicit change. Local synthetic Catalog acceptance SHALL use the same isolated local database authority and MUST NOT count as C1 backfill completion.

#### Scenario: Existing order contract reuse
- **WHEN** a later checkout/order change consumes Cart lines
- **THEN** it reuses the existing normalized order/configured-item compatibility contracts and performs fresh authoritative resolution instead of trusting Cart display facts

#### Scenario: Guest/customer coexistence
- **WHEN** Customer Auth is later enabled while an anonymous Cart exists
- **THEN** the Cart remains anonymous and unmerged until a separately approved Guest → Customer Cart merge policy is implemented

#### Scenario: No migration in this foundation
- **WHEN** the `local_fake` Cart foundation is planned or implemented locally
- **THEN** no production Cart table, cart_items table, migration, RLS policy, trigger, RPC, or remote schema mutation is introduced by that foundation

#### Scenario: Isolated persistent schema is not a production migration
- **WHEN** `local_persistent` Cart persistence is specified or separately implemented
- **THEN** any new tables are limited to the independent local commerce namespace, legacy `orders/order_items` remain untouched, and no remote migration or production checkout activation is authorized

### Requirement: Frozen project boundaries remain unchanged

Shopping Cart work MUST preserve C1 at 41/61 with Task 3.5 blocked and `BACKFILL AUTHORIZED: NO`, Customization at 64/70 without Phase C completion, archived Customer Auth at 30/30 with production authentication not activated, Brand/Domain at 41/41 with production cutover unauthorized, and Visual at 15/15. Cart MUST NOT add tax, shipping-rate calculation, coupons, promotions, payment, inventory reservation, production preview, supplier semantics, or deployment behavior. Those independent local workflow boundaries MUST NOT become Cart authority. Only the explicit independent `local_persistent` namespace exception permits local persistence planning; it does not authorize executing migrations during this planning work or alter any production stop gate.

#### Scenario: Frozen change isolation
- **WHEN** Cart planning or local implementation is reviewed
- **THEN** the frozen changes and their task states remain unchanged and no remote, production migration, real payment, DNS, Cloudflare, or deployment action is implied; `local_fake` continues to imply no migration at all

## ADDED Requirements

### Requirement: Persistent configured-copy Cart recovery

`local_persistent` SHALL durably retain server-owned Cart identity, distinct line identities, quantities, accepted configuration revisions/values and media ordering/crop references, ownership bindings, and Cart version in the selected local project's PostgreSQL. Existing safe projection, same-origin, quantity, cross-Cart, and dedicated guest-cookie contracts MUST remain unchanged. Restart recovery SHALL require the original valid Cart authorization; neither email, line identity, nor customer sign-in alone SHALL recover, claim, or merge a guest Cart. Persistent records MUST remain separate from legacy production tables.

#### Scenario: Guest Cart survives application restart
- **WHEN** a guest with the valid dedicated Cart cookie returns after restart against the same local project
- **THEN** the server returns that Cart's separate configured copies, quantities, and safe customization summaries with stable identities

#### Scenario: Other browser cannot recover the Cart
- **WHEN** a different browser supplies an email, line ID, or Cart ID without valid Cart authorization
- **THEN** the persistent Cart read or mutation fails with the existing non-enumerating bounded result

#### Scenario: Duplicate configured copies stay distinct after restart
- **WHEN** two explicit successful additions have identical Product/SKU and customization values
- **THEN** both lines remain distinct after persistence and restart and only an explicit line-scoped quantity mutation changes either copy

### Requirement: Persistent Cart version and Order handoff integrity

Persistent Cart mutations SHALL advance server-owned Cart version atomically with their line changes. The Order creation boundary MUST validate the same Cart version it snapshots and commit Order creation, immutable lines, receipt attachment/consumption, access grants, and creation idempotency against that version as one database transaction. A concurrent Cart mutation MUST NOT produce an Order assembled from different Cart versions or partially consumed media. Order creation SHALL preserve existing Cart lines and quantities without claiming a reservation or payment; attached receipts MUST NOT be silently reusable for a different Order. Equivalent creation retries SHALL use committed idempotency rather than consume receipts again. Clear Cart SHALL retain its existing narrow effects and MUST NOT delete drafts, uploads, Orders, or authorization state.

#### Scenario: Cart changes during Order creation
- **WHEN** a quantity, configuration reference, or line mutation races with Order creation against an older Cart version
- **THEN** either the Order commits a single valid version before that mutation or creation fails with a bounded conflict and no partial Order, receipt consumption, or access grant

#### Scenario: Cart mutation database failure
- **WHEN** the persistent provider cannot commit the Cart mutation and its version together
- **THEN** neither partial line changes nor a misleading new Cart version are observable and no fake fallback is used

#### Scenario: Created Order does not clear the Cart
- **WHEN** persistent Order creation succeeds
- **THEN** Cart lines and quantities remain available, an exact retry returns the existing Order, and a new attempt cannot reuse already consumed receipts as active draft media