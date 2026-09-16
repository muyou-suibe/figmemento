## Purpose

Provide a provider-neutral, read-only assessment of whether the current
server-owned Cart can be handed to a separately implemented future checkout
boundary without treating Cart display facts as order or payment authority.

## ADDED Requirements

### Requirement: Bounded readiness states

The readiness capability MUST return exactly one top-level state: `ready`,
`blocked`, or `unavailable`. `ready` means every authority required by this
readiness contract was evaluated and satisfied for a future handoff only. It
MUST NOT mean that checkout, Order creation, payment, production launch, price
locking, stock reservation, shipping finalization, tax finalization, or payment
credentials are available.

#### Scenario: All synthetic authorities pass
- **WHEN** an offline evaluation receives a non-empty Cart and every required
  injected authority passes
- **THEN** the report may be `ready` while remaining explicitly pre-checkout
  and non-authorizing

#### Scenario: A blocking fact prevents handoff
- **WHEN** authorities are available but a Cart line or required dependency is
  stale, invalid, unavailable, or unresolved
- **THEN** the report is `blocked` with bounded issue codes

#### Scenario: An authority cannot be evaluated safely
- **WHEN** Cart, Catalog, Customization, CustomerUpload, or another required
  authority cannot be evaluated without exposing or guessing provider state
- **THEN** the report is `unavailable` and does not downgrade to `ready`

#### Scenario: Unavailable precedence
- **WHEN** one required authority is unavailable and another line has a normal
  blocking issue
- **THEN** the overall report is `unavailable`, preserving the unavailable
  dependency as the highest-level outcome

### Requirement: Server-owned Cart identity and empty Cart behavior

Readiness MUST read the current Cart through the existing server-side Cart
boundary. It MUST NOT accept Cart ID, Customer ID, owner ID, receipt ID, price,
currency, or checkout amount from query parameters, request bodies, or browser
fields as authority. An empty Cart MUST NOT be `ready` and MUST NOT create a
Cart or Cart cookie merely to evaluate readiness.

#### Scenario: Current Cart is selected server-side
- **WHEN** a visitor requests readiness without a client-supplied Cart identity
- **THEN** the evaluator uses the existing `figmemento-local-cart` boundary and
  does not trust an identity supplied by the client

#### Scenario: No Cart identity does not require Cart-provider availability
- **WHEN** a visitor has no `figmemento-local-cart` cookie, including when the
  Cart source is disabled or unavailable
- **THEN** the endpoint returns `blocked` with `EMPTY_CART` without requiring a
  Cart provider, creating Cart state, or issuing a Cart cookie

#### Scenario: Claimed Cart requires provider resolution
- **WHEN** a valid-looking Cart cookie is present
- **THEN** the endpoint uses the Cart provider to distinguish a provider-
  available not-found Cart (`EMPTY_CART`) from an unavailable Cart authority
  (`CART_UNAVAILABLE`)

#### Scenario: Empty Cart
- **WHEN** the current Cart has no lines
- **THEN** the report is `blocked` with `EMPTY_CART`, and no Cart state or cookie
  is created

#### Scenario: Forged Cart authority
- **WHEN** a request supplies a different Cart ID, Customer ID, owner ID, receipt
  ID, price, currency, or amount
- **THEN** those fields are rejected or ignored and cannot change the report

### Requirement: Independent configured-copy line evaluation

Each CartLine MUST be evaluated independently using its opaque line identity.
Same-SKU lines MUST remain separate in the report and MUST NOT be merged or
deduplicated by SKU, Product, selected options, customization hash, or receipt
content. The public line projection MAY contain only a safe line ID, safe Product
display information, safe SKU display information, status, and bounded issue
codes.

#### Scenario: Same SKU configured copies
- **WHEN** two CartLines use the same SKU but have different configured copies
- **THEN** the report contains two independently evaluated line results

#### Scenario: Line-level diagnosis
- **WHEN** one line is stale and another line passes its line checks
- **THEN** the stale line identifies its bounded issue while the other line is
  not hidden or rewritten

#### Scenario: Public line privacy
- **WHEN** a line contains private image customization
- **THEN** the public projection excludes private handoffs, receipt IDs, owner
  IDs, storage metadata, raw paths, and provider details

### Requirement: Fresh Catalog and Variant authority

The evaluator MUST freshly revalidate Product publication and eligibility,
Variant/SKU identity, selected options, availability, authoritative base price,
currency, and the current Product FulfillmentConfig using existing Catalog and
order-resolution boundaries. Cart snapshots MAY identify facts to compare but
MUST NOT be current authority. Readiness MUST NOT silently refresh or mutate
stale Cart snapshots. The archived Cart snapshot has no historical
FulfillmentConfig snapshot or signature, so this change MUST NOT claim to
detect a historical fulfillment change after Cart add.

#### Scenario: Fresh Product and Variant revalidation
- **WHEN** a Cart line references a Product or Variant that is missing,
  unpublished, inactive, unavailable, malformed, or cross-owned
- **THEN** the line is not ready and returns a bounded Product/Variant or item
  unavailable issue

#### Scenario: Price change
- **WHEN** the authoritative Variant price differs from the Cart display
  snapshot
- **THEN** the line is `blocked` with a price-change issue and the Cart is not
  silently updated

#### Scenario: Currency change
- **WHEN** the authoritative currency differs from the Cart display snapshot
- **THEN** the line is `blocked` with a currency-change issue, with no FX
  conversion and no Cart mutation

#### Scenario: Selected options change
- **WHEN** the Cart selected options no longer equal the current eligible
  Variant/SKU option combination
- **THEN** the line is `blocked` with an options-change or catalog-change issue

### Requirement: Fulfillment and stale-data semantics

Fulfillment readiness MUST validate the current Product fulfillment authority
for Product ownership and configuration validity. It MUST NOT derive or invent
shipping prices, carriers, shipping SLAs, tax, production schedules, inventory
reservations, delivery guarantees, or price locks. Because the archived Cart
line has no historical FulfillmentConfig baseline, the evaluator MUST
distinguish current fulfillment invalid/unavailable state from historical
fulfillment change and MUST NOT emit `FULFILLMENT_CHANGED` merely because no
baseline exists. A future approved Cart/order boundary may add a historical
baseline and its own comparison semantics; this change does not add that field.

#### Scenario: Current fulfillment authority is invalid
- **WHEN** the current Product FulfillmentConfig is malformed, mis-owned, or
  cannot be evaluated safely
- **THEN** the line is not ready with a bounded unavailable/internal issue, and
  the Cart line is not rewritten

#### Scenario: Historical fulfillment comparison is unavailable
- **WHEN** current fulfillment is valid but the Cart line has no historical
  FulfillmentConfig baseline
- **THEN** current fulfillment validity is evaluated, historical change is not
  claimed, and no `FULFILLMENT_CHANGED` issue is inferred

#### Scenario: Stale Cart line
- **WHEN** a previously added line is no longer purchasable
- **THEN** readiness reports it as stale or unavailable and does not remove,
  replace, or refresh the line

#### Scenario: No reservation semantics
- **WHEN** readiness evaluates a Cart line or quantity
- **THEN** no stock, production capacity, price, shipping capacity, or other
  inventory state is reserved

### Requirement: Customization and CustomerUpload revalidation

Customization readiness MUST reuse the existing configured-item acceptance and
current configuration/value contracts. It MUST NOT introduce a second
Customization validator. Private CustomerUpload readiness MUST use only an
existing verified owner-scoped authority; Cart identity, Customer Auth identity,
receipt ID alone, or browser owner data MUST NOT prove upload ownership.

#### Scenario: Current Customization authority
- **WHEN** a configured line's current Customization revision, required values,
  selected-option relationship, and accepted values are valid
- **THEN** those facts may pass the Customization portion of readiness without a
  competing validator

#### Scenario: Stale or invalid Customization
- **WHEN** current Customization configuration or values are stale, invalid,
  incomplete, or cannot be validated safely
- **THEN** readiness returns a bounded Customization issue and does not claim
  checkout handoff readiness

#### Scenario: Private upload ownership
- **WHEN** a line requires a private image receipt
- **THEN** the evaluator requires current verified owner-scoped receipt
  validation and excludes receipt and owner identifiers from the public report

#### Scenario: Upload authority unavailable
- **WHEN** the runtime owner-scoped receipt provider is not activated
- **THEN** readiness fails closed and preserves
  `PRIVATE IMAGE CART ADD: FAIL-CLOSED — RUNTIME RECEIPT PROVIDER NOT ACTIVATED`
  rather than inventing a repository or treating Cart identity as ownership

### Requirement: Bounded issue vocabulary and aggregation

Public readiness issues MUST use a smallest coherent provider-neutral vocabulary
and safe messages. The public response MUST NOT expose C1 or Customization task
numbers, migration names, SQL, Supabase/Stripe diagnostics, stack traces,
receipt IDs, owner IDs, bucket names, object keys, storage providers, or internal
runtime details. Aggregation MUST be deterministic: unavailable required
authority first, then any blocking line/dependency issue, otherwise ready.

#### Scenario: Safe issue mapping
- **WHEN** an internal Catalog, upload, order, shipping, tax, discount, or
  payment dependency fails
- **THEN** the report exposes only a bounded public code such as
  `CATALOG_CHANGED`, `CUSTOMIZATION_INVALID`, `UPLOAD_UNAVAILABLE`,
  `ORDER_PERSISTENCE_UNAVAILABLE`, `SHIPPING_UNAVAILABLE`,
  `TAX_UNAVAILABLE`, `DISCOUNT_UNAVAILABLE`, `PAYMENT_UNAVAILABLE`,
  `DEPENDENCY_UNAVAILABLE`, or `INTERNAL_UNAVAILABLE`

#### Scenario: No diagnostic leakage
- **WHEN** a repository or provider throws a hostile or diagnostic error
- **THEN** the readiness result contains no raw error, SQL detail, provider
  name, secret, or internal task reference

#### Scenario: Later success cannot hide earlier unavailability
- **WHEN** one line or dependency is unavailable and later lines evaluate
  successfully
- **THEN** the overall report remains `unavailable`

### Requirement: Order and checkout dependency classification

Readiness MUST distinguish valid current Cart facts from the ability to durably
create required Order and OrderItem snapshots. It MUST classify unresolved order
persistence, shipping, tax, discount, payment, and deployment dependencies
without implementing them. Cart subtotal MUST remain display-only and MUST NOT
become final payment or order authority.

#### Scenario: Order persistence unavailable
- **WHEN** Catalog and configured-item facts are valid but required durable
  order snapshot persistence is not activated
- **THEN** readiness is `blocked` with a bounded order-persistence issue

#### Scenario: Deferred commercial dependencies
- **WHEN** shipping, tax, discount, or payment authority is unresolved
- **THEN** readiness classifies the dependency as blocked or unavailable using
  safe codes and does not calculate or claim a final total

#### Scenario: No payment authority
- **WHEN** readiness is evaluated
- **THEN** it makes no Stripe, PayPal, PaymentIntent, Checkout Session, webhook,
  order-creation, or payment call

### Requirement: Read-only readiness HTTP surface

The system MUST expose a narrow read-only readiness surface equivalent to
`GET /api/checkout-readiness` using the current server-side Cart identity. It
MUST accept no client authority fields, MUST preserve existing same-origin and
safe-error conventions where applicable, and MUST not mutate any business state.

#### Scenario: Safely evaluated blocked response
- **WHEN** the endpoint evaluates the current Cart successfully but finds a
  blocking issue
- **THEN** it returns a safe readiness report, with a normal non-error response
  status, and no checkout action

#### Scenario: Unavailable operation
- **WHEN** the endpoint cannot safely evaluate a required authority
- **THEN** it returns the bounded `unavailable` report using the repository's
  safe unavailable-operation status convention without exposing diagnostics

#### Scenario: Read-only behavior
- **WHEN** the endpoint is called for an empty, available, stale, or unavailable
  Cart
- **THEN** it does not create a Cart, set a Cart cookie, update or remove a
  CartLine, claim an upload, create an Order, reserve inventory, or write a
  database record

### Requirement: Future checkout handoff and TOCTOU boundary

A future checkout change MUST consume readiness only as an informational input,
reuse the existing configured-item and normalized OrderRequest boundaries, and
freshly revalidate all checkout-owned facts immediately before durable Order or
payment side effects. Readiness MUST NOT create a second order DTO, persist Cart
snapshots as immutable OrderItem authority, or lock price, currency, inventory,
production capacity, or shipping capacity.

#### Scenario: Existing normalized order contract reuse
- **WHEN** a later checkout change consumes a readiness report
- **THEN** it reuses the accepted configured-item, order-catalog-resolution,
  configured-item compatibility, and normalized order request boundaries

#### Scenario: Ready does not authorize checkout
- **WHEN** an offline or future evaluator returns `ready`
- **THEN** no Order, checkout session, payment, or production authorization is
  implied and a later checkout transaction must revalidate again

#### Scenario: Time-of-check/time-of-use change
- **WHEN** Product, Variant, price, availability, Customization, upload, or
  other authority changes after readiness and before checkout
- **THEN** the future transactional boundary rejects or re-evaluates the change
  before any durable side effect

### Requirement: Frozen project boundaries

This capability MUST preserve the current Cart, C1, Customization, Customer
Auth, Brand/Domain, Visual, migration, payment, and deployment boundaries. It
MUST NOT activate production Cart persistence, Customer Auth, checkout, payment,
shipping, tax, discount, inventory, production preview, or any remote provider.

#### Scenario: Current project blockers remain external
- **WHEN** readiness planning or implementation is reviewed
- **THEN** C1 remains 41/61 with Task 3.5 blocked and `BACKFILL AUTHORIZED: NO`,
  Customization remains 64/70, production Cart persistence remains unimplemented,
  and checkout/payment remain inactive

#### Scenario: No migration or remote mutation
- **WHEN** the readiness change is planned or implemented locally
- **THEN** it creates no migration, table, RLS policy, trigger, RPC, remote
  Supabase mutation, DNS change, Cloudflare change, or deployment
