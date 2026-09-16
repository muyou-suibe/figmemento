## ADDED Requirements

### Requirement: Persistent purchased preview policy SHALL be explicit and immutable

In `local_persistent`, each newly created stable Order item SHALL capture `requiresProductionPreview` as an immutable boolean inside its purchased fulfillment facts, sourced exclusively from the same-project, server-owned, versioned Product fulfillment authority. The local persistent mapper SHALL separate that extension and validate the remaining configuration through the unchanged strict shared fulfillment parser. Missing or malformed policy on a selected Product SHALL reject new creation; an unrelated Product missing it SHALL NOT poison the entire Catalog. The commit transaction SHALL protect this policy through the Product version and existing authority locks. No production Catalog schema or public mutation contract is introduced.

The policy SHALL be per stable item, not per quantity unit, receipt, or whole Order. False SHALL disable preview only and SHALL NOT satisfy independent payment, review, production, or shipping gates. The policy MUST NOT be inferred from fulfillment type, shipping, production mode, customization/media presence, SKU, Supplier state, or browser input. Historical items lacking it SHALL remain unavailable to preview-dependent canonical readers without backfill or an inferred default. A safe customer summary MAY omit it but MUST NOT claim preview or production authority.

#### Scenario: Explicit mixed policies survive Catalog drift
- **WHEN** a new Order contains selected Products with explicit true and false policies and one item has quantity greater than one
- **THEN** each stable item captures exactly its own boolean, and authorized historical reads preserve those values after Catalog changes or becomes unavailable

#### Scenario: Missing policy and stale versions fail closed
- **WHEN** a selected Product lacks a boolean policy or its version changes during new creation
- **THEN** creation fails without a partial Order or inferred policy; an unselected legacy Product alone does not block creation

#### Scenario: Incomplete historical policy is never reconstructed
- **WHEN** an authorized preview-dependent reader requests an old item lacking the purchased boolean and current Catalog subsequently gains that boolean
- **THEN** the exact-item read remains bounded unavailable and the immutable old snapshot remains unchanged

## MODIFIED Requirements

### Requirement: Local Order snapshots SHALL be immutable and server-derived

On successful creation, the runtime SHALL atomically capture an immutable server-derived snapshot of the evaluated order facts. The protected snapshot MUST include an internal local Order identity, a public-safe Order reference, creation time, `pending_payment` Order status, `pending` payment status, contact and shipping address where applicable, shipping/coupon/tax states, local arithmetic summary, and one snapshot per configured Cart copy. Each line snapshot MUST preserve stable server-owned `orderItemId`, Product and Variant/SKU identity and display facts, selected SKU options, quantity, unit base price, currency, and accepted customization revision/value facts. Persistent snapshots MUST additionally preserve the accepted configuration and fulfillment rules necessary for historical review, preview requirements, physical/digital classification, media ordering, and Order-item media bindings without current Catalog reconstruction. Image customization snapshots MAY retain only controlled server-side receipt/media references and accepted crop/configuration facts; they MUST NOT expose owner identity, storage keys, object URLs, capability material, or other private upload access details. Mutable payment, fulfillment, and delivery state SHALL remain separate from immutable purchased facts.

#### Scenario: Catalog edits do not rewrite a created Local Order
- **WHEN** a Local Order has been created and its source Cart, Catalog, SKU, or customization configuration subsequently changes in the same runtime
- **THEN** reading the Local Order returns its original immutable snapshot rather than recomputing it from current data

#### Scenario: Multiple configured copies remain separate order lines
- **WHEN** a Cart contains separate configured copies of the same Product/SKU with different accepted customization facts
- **THEN** the Local Order stores and returns separate immutable line snapshots without merging them

#### Scenario: Safe projection excludes protected upload data
- **WHEN** a browser reads a Local Order that includes image customization
- **THEN** the response omits CustomerUpload owner identifiers, storage locations, permanent object URLs, raw receipt capability data, and unneeded private configuration details

#### Scenario: Persistent historical fulfillment facts survive restart
- **WHEN** an Order is created in `local_persistent`, the Catalog changes or becomes unavailable, and the application restarts
- **THEN** its item identities, configuration, price, media bindings, and purchased fulfillment/preview rules remain the committed historical facts

### Requirement: Local Order creation SHALL be atomic and safely idempotent

The Local Order runtime SHALL treat each opaque creation-attempt selector as an idempotency selector only within the same server-authorized local creation context. A repeated equivalent request with the same selector and the same authorized Cart/version and normalized checkout context SHALL return the original safe Local Order result without creating another Order. The committed binding SHALL be checked after fresh authorization and context identity resolution but before new-creation receipt eligibility, so an exact retry MUST NOT fail merely because its receipt was consumed by the original commit. Reuse of that selector with a materially different current context or normalized checkout facts SHALL fail safely. A different selector SHALL represent a new creation attempt requiring fresh server authority, not permission to reuse consumed receipts. Creation SHALL not leave a partially readable snapshot, access capability, or idempotency record when snapshot persistence fails. In `local_persistent`, Order/header/item/media snapshots, receipt consumption/attachment, access bindings, creation idempotency, and validation of the Cart version being ordered MUST commit in one database transaction in the same local project.

#### Scenario: Network retry returns the original Local Order
- **WHEN** a browser retries an equivalent Local Order creation request using the same attempt selector after a lost response
- **THEN** the runtime returns the original safe Local Order result without a duplicate; local_fake retains its existing reissue behavior, while local_persistent requires the same valid capability established before commit and neither replaces that bearer nor adds a grant

#### Scenario: Attempt selector reuse with changed facts is rejected
- **WHEN** a selector previously used for an Order is submitted with different normalized contact/address/shipping/coupon facts or a different current Cart context
- **THEN** the runtime returns a bounded conflict-style failure and does not create or reveal another Order

#### Scenario: Snapshot creation failure leaves no readable partial Order
- **WHEN** Local Order creation fails before its protected snapshot, idempotency binding, and same-browser access authorization are all established
- **THEN** no partially created Local Order is readable through the Local Order read boundary

#### Scenario: Concurrent persistent creation across instances
- **WHEN** two application instances submit equivalent creation requests for the same authorized Cart/version and selector
- **THEN** at most one Order with one set of item/media attachments and grants commits and equivalent callers receive the same safe result

#### Scenario: Cart or receipt eligibility changes during commit
- **WHEN** a concurrent Cart mutation, receipt consumption, expiry, or cleanup invalidates a new persistent creation attempt
- **THEN** creation returns a bounded conflict/unavailable result with no partial Order, receipt attachment, grant, or idempotency binding

#### Scenario: Persistent commit succeeded but response was lost
- **WHEN** creation commits, the response is lost, and the authorized equivalent request is retried after application restart
- **THEN** the existing binding returns the same Order without consuming media again or reconstructing facts from browser input

### Requirement: Local Order reading SHALL require same-browser authorization

The Local Order runtime SHALL issue one opaque, HttpOnly, same-site same-browser access capability for the browser and bind that capability to every Local Order created by that browser. In `local_fake` the binding lasts only while the local runtime remains alive; `local_persistent` SHALL retain its authorized bindings across application restarts while the original capability remains valid. Existing guest-owner cookie signature, verification, expiry and issuance rules and local_fake Order issuance MUST remain unchanged; persistent Order capability issuance SHALL follow the authenticated pre-commit establishment requirement below. Durable records MUST NOT make an expired capability valid. The public-safe Local Order reference SHALL be an identifier, not authorization. A Local Order read SHALL require both that reference and matching server-verified browser authorization. Creating a later Local Order SHALL extend the existing capability binding and MUST NOT invalidate access to earlier Orders. For a newly member-owned persistent Order, the stored opaque customer binding MUST additionally match the currently verified unexpired/unrevoked local customer session; email SHALL NOT be ownership authority. The browser response SHALL contain only the safe public projection needed for the local success page. Authorization failure, unknown reference, unavailable local runtime, or `local_fake` post-restart loss MUST return a bounded response without revealing whether another guest's Order exists.

#### Scenario: Same browser refresh reads the Local Order in the running runtime
- **WHEN** the creating browser refreshes its Local Order success page while the same local runtime remains available
- **THEN** it can read the safe Local Order projection using its matching same-browser authorization

#### Scenario: Multiple Local Orders remain readable in one browser
- **WHEN** the same browser creates Local Order A and then creates Local Order B while the same local runtime remains available
- **THEN** the browser can read both A and B with its capability, and creating B does not silently invalidate A

#### Scenario: Public reference alone cannot read a Local Order
- **WHEN** another browser or a request without the matching same-browser authorization submits a public Local Order reference
- **THEN** the runtime returns a non-enumerating bounded failure and exposes no Order details

#### Scenario: Runtime restart fails closed
- **WHEN** a `local_fake` runtime restarts after a Local Order was created
- **THEN** the lost process-memory Local Order is not recreated, guessed, or read from another persistence source

#### Scenario: Guest capability remains valid after persistent restart
- **WHEN** the creating guest presents its original valid signed authorization after restart against the same local project
- **THEN** the durable grant permits only its bound Orders and does not require an email-based lookup or claim

#### Scenario: Member ownership survives restart
- **WHEN** the creating member retains valid Order authorization and an unexpired/unrevoked session for the stored opaque customer after restart
- **THEN** the original member-owned Order remains accessible to that customer, not to another session with a matching contact email

#### Scenario: Persistent Order exists but authority expired
- **WHEN** a capability or required member session is expired, revoked, malformed, or belongs to another customer
- **THEN** the Order read fails without existence disclosure or automatic grant reissuance

### Requirement: Local Order runtime SHALL be explicitly development/test-only

The Local Order runtime SHALL be enabled only by an explicit `local_fake` or `local_persistent` selection in development or test. Disabled/absent selection SHALL not create a hidden fixture or process-memory Order path, and production mode SHALL reject local runtimes; staging SHALL also reject `local_persistent`. In `local_fake`, the runtime SHALL not call or write Supabase, migrations, Stripe, PayPal, webhooks, email, shipping providers, production storage, Admin Orders, or existing production/legacy Order lookup interfaces. Its only persistence exception SHALL be `local_persistent` Order and related commerce state in the independent Docker local Supabase project's PostgreSQL and private Storage, with all required Cart/Catalog/Auth/upload/payment/fulfillment/tracking authorities using that same local project. Failures or mismatches MUST NOT fall back to memory, a remote project, or legacy Orders. Authorized persistent local Admin may read/operate on these same local Orders through shared gates; no production Admin or legacy repository may receive them. New tables MUST remain in an independent local commerce namespace, with legacy `orders/order_items`, C1 backfill, and Phase C production migrations untouched. Normalized requests to `/api/orders` SHALL retain their existing 503 stop gate and old incompatible lookup/write paths SHALL remain stopped for this workflow. No deployment, remote migration, real payment, email, or carrier action is authorized.

#### Scenario: Production rejects local Order runtime selection
- **WHEN** the Local Order runtime is selected while direct runtime mode is production
- **THEN** the server rejects the selection and does not create a Local Order

#### Scenario: Local Order creation has no business side effects
- **WHEN** a Local Order is successfully created in development/test `local_fake`
- **THEN** it creates only the process-memory Local Order and its local access/idempotency state, without creating an OrderItem database record, payment session, payment intent, webhook event, fulfillment job, email, or provider request

#### Scenario: Local persistent source is forbidden or inconsistent
- **WHEN** `local_persistent` is selected in staging/production or required commerce authorities use different projects, remote endpoints, unavailable database/Storage, or memory substitutes
- **THEN** the operation fails closed without creating or reading fallback Orders

#### Scenario: Legacy normalized request stays stopped
- **WHEN** a normalized configured Order request targets the existing `/api/orders` boundary during this local work
- **THEN** the existing normalized-request 503 gate remains in force and no legacy `orders/order_items` write or production migration is inferred

### Requirement: Local Order verification SHALL distinguish real fixture coverage from deterministic integration coverage

`local_fake` verification SHALL preserve the current development fixture limitation: no public physical shipping-required text-only fixture exists. Its browser acceptance SHALL use the real physical `glass-light-picture` fixture with image plus optional text customization. Shipping-required text-only fake behavior SHALL be proven through deterministic domain/HTTP integration. The digital `digital-portrait` fixture SHALL NOT be forced through shipping Checkout, and fake fixture coverage SHALL NOT add Digital Checkout, fake physical text-only Products, or delivery behavior merely to broaden that coverage. Separately selected `local_persistent` acceptance SHALL read explicitly synthetic Catalog data from the isolated local database, not the memory Admin Catalog, and MAY cover genuine physical-only, digital-only, and mixed local Order contracts. Such coverage MUST preserve each item's fulfillment classification, avoid physical shipping/tracking requirements for digital-only items, and independently check both branches for mixed Orders. It MUST NOT mark C1 backfill or Phase C production work complete.

#### Scenario: Browser acceptance uses the real physical image-capable fixture
- **WHEN** `local_fake` Order browser acceptance is executed for the physical flow
- **THEN** it uses `glass-light-picture` with its required image path and may include optional text, without fabricating a public physical text-only fixture

#### Scenario: Text-only shipping behavior is covered without changing fixture semantics
- **WHEN** `local_fake` Order verification needs a shipping-required text-only case
- **THEN** it uses deterministic domain/HTTP integration rather than repurposing `digital-portrait` or adding a fake physical Product

#### Scenario: Persistent synthetic Catalog remains isolated
- **WHEN** persistent browser/concurrency/restart acceptance needs configured Product examples
- **THEN** authoritative selection comes from synthetic records in the same isolated local project without persistent Catalog CRUD, legacy Catalog mutation, or a C1 completion claim

#### Scenario: Digital-only and mixed local Orders retain their classification
- **WHEN** an independently enabled persistent local checkout evaluates a digital-only or mixed Cart
- **THEN** digital-only Orders require no invented physical shipping destination or tracking, while mixed Orders validate physical shipping and digital-delivery eligibility separately from server-owned item facts

## ADDED Requirements

### Requirement: Persistent Order capability is authenticated before commit

In local_persistent, when no valid server-issued same-browser Order capability is already present, the Order HTTP boundary SHALL establish that capability in a no-business-write round trip before any Order transaction may commit. The subsequent creation request SHALL present the same HttpOnly capability; the server persists only its digest in the atomic Order grant. The establishment step creates no Order, receipt attachment, grant or idempotency result. local_fake issuance semantics remain unchanged.

The existing POST `/api/local-orders` SHALL retain same-origin, bounded-input and source/configuration gates. Establishment SHALL return 204 No Content with Set-Cookie and no Order/publicReference projection. A persistent capability SHALL contain server-generated cryptographic randomness, authenticated version/issuedAt/expiresAt under an independent stable local-only signing secret, and no owner/Cart/Order identity or PII. Format matching alone MUST NOT authenticate a token. Raw tokens SHALL remain in the HttpOnly cookie and transient server verification only; persistence SHALL contain only the canonical token digest. The client SHALL resubmit the identical creationAttemptId and serialized input at most once automatically after establishment, then expose retryable state if establishment repeats. Browser JavaScript MUST NOT read the capability or submit it in JSON.

Grant expiry SHALL be greater than server now and no later than the capability and freshly verified applicable owner expiry; member grants SHALL additionally be bounded by the verified durable session expiry. RPC SHALL enforce these bounds without inventing a separate TTL. Fresh owner authorization SHALL precede exact key/owner/Cart/version/context/digest replay. A valid capability SHALL remain stable across multiple Orders; replay MUST NOT extend a grant. Missing, forged, expired or replaced capability MUST NOT permit claim/rebinding of a committed Order through a key, email, membership, Cart ID or publicReference. This explicitly changes only persistent Order capability issuance, not existing guest-owner cookie or local_fake issuance semantics.

#### Scenario: First persistent create establishes capability only
- **WHEN** a valid bounded same-origin persistent creation request has no authenticated capability
- **THEN** only a server-issued HttpOnly capability is established, with zero Order, item, receipt, grant or idempotency writes

#### Scenario: Second request presents the established capability
- **WHEN** the client resubmits the same attempt and normalized input with the established cookie
- **THEN** fresh selected Cart owner verification and atomic Order creation may proceed without reading a token in client JavaScript

#### Scenario: Establishment response is completely lost
- **WHEN** the browser receives neither the first response nor its cookie
- **THEN** no Order exists and same-attempt retry safely establishes a capability again

#### Scenario: Cookie arrives but establishment response is lost
- **WHEN** the browser retained the established cookie before retrying the same attempt
- **THEN** the request proceeds to normal creation without capability rotation

#### Scenario: Commit response lost followed by application restart
- **WHEN** Order commit succeeds under the established cookie but the response is lost and a new application process receives the same authorized context
- **THEN** the same Order is replayed with no duplicate receipt consumption, grant or replacement capability

#### Scenario: Browser-selected or forged cookie
- **WHEN** a syntactically valid arbitrary or MAC-invalid token is supplied
- **THEN** it is never bound directly and only a no-write server-issued establishment response may replace it

#### Scenario: Expired or replaced cookie cannot recover old Orders
- **WHEN** a committed Order is requested with an expired or newly established replacement capability
- **THEN** read/replay rejects without claiming the Order or extending its grant

#### Scenario: Membership does not replace guest Order capability
- **WHEN** a valid member session accompanies a guest Order request without its original capability
- **THEN** the session cannot substitute for that capability or transfer guest ownership

#### Scenario: Existing local fake issuance remains compatible
- **WHEN** local_fake creates or retries an equivalent in-memory Order
- **THEN** its existing generate/store/reissue protocol remains unchanged and no persistent establishment round trip is required

### Requirement: Persistent Order ownership follows the verified purchase Cart owner

Persistent Order ownership SHALL follow the freshly verified owner of the selected purchase Cart, not the presence of a customer session. An exact Cart found under valid guest authority MUST retain guest purchase ownership even when a valid customer session accompanies the request. Only a Cart resolved under the verified customer owner MAY create a member-owned Order. Session presence MUST NOT claim, merge, transfer, relabel or create cross-owner access to guest Cart, draft, upload or receipt state. The selected owner SHALL be carried server-side into Order, item, access and idempotency bindings. The authoritative transaction MUST revalidate project, owner, Cart version and same-owner draft/media/receipt facts before commit; mismatch SHALL reject atomically. Receipt copy SHALL remain same-owner only. Browser owner fields, contact email and public identifiers MUST NOT select ownership.

#### Scenario: Logged-in browser purchases its existing guest Cart
- **WHEN** valid guest authority resolves the exact selected guest Cart and the request also has a valid member session
- **THEN** the server creates a guest-owned Order using only same-owner receipts and normal guest Order authorization without probing membership to replace that owner or creating a member grant

#### Scenario: Guest Order remains guest-authorized after restart
- **WHEN** a browser returns after restart for an Order created from its guest Cart while logged in
- **THEN** original valid guest Order authorization remains required and a member session alone cannot read or claim it

#### Scenario: Exact Cart belongs to the customer
- **WHEN** no guest Cart is selected, or valid guest authority returns not_found for the exact Cart, and the current verified customer owns that exact Cart
- **THEN** the new Order binds to that customer owner and later reads require matching fresh member session and original Order capability without migrating guest resources

#### Scenario: Mixed resource owners are rejected
- **WHEN** Cart, draft, receipt, media or Order binding owner/project differs from the selected purchase owner, including an owner change before transaction revalidation
- **THEN** creation rejects with no partial Order, receipt attachment or cross-owner grant and does not copy or transfer resources to repair the mismatch

#### Scenario: Invalid guest authority cannot be replaced by membership
- **WHEN** an exact guest Cart exists but its guest authorization is missing, expired, invalid, revoked or unverifiable and a valid member session is present
- **THEN** the guest Cart cannot be claimed or used through that member session, email, Cart ID or receipt ID

#### Scenario: Creation replay cannot change owner
- **WHEN** a committed guest creation key and Cart context are replayed under customer ownership after session changes
- **THEN** the owner-bound idempotency check rejects without returning a cross-owner Order or creating a replacement Order

### Requirement: Persistent commercial snapshot preserves exact allocations

Persistent purchase snapshots SHALL preserve header subtotal, discount, shipping, currency and local arithmetic total plus each stable item's base/customization components, quantity, line subtotal, discount allocation, shipping allocation and line arithmetic total in integer minor units. Tax SHALL remain explicitly `not_activated` with `amount = null` both at header and item level, not a guessed zero tax assessment. Discount SHALL be allocated proportionally to eligible nonnegative line subtotals, capped by eligible value, using floor amounts followed by largest fractional remainder with stable item-order ties. Shipping SHALL be allocated by the same deterministic rule only among shipping-required physical items; when all eligible physical weights are zero it SHALL use equal weights. Digital-only shipping SHALL be zero. Header and line allocations MUST conserve the header amounts exactly, and the sum of line arithmetic totals MUST equal `subtotal + shipping - discount`, excluding unactivated tax. Missing commercial authority MUST block creation rather than be reconstructed from browser totals. Existing `local_fake` projections SHALL remain compatible; persistent internal snapshots MUST retain these complete facts even where customer projections omit unnecessary detail.

#### Scenario: Non-divisible discount and mixed shipping allocation
- **WHEN** a persistent mixed-item Order has a discount or shipping amount that cannot divide evenly across eligible item weights
- **THEN** deterministic remainder allocation conserves every minor unit, assigns no shipping to digital-only items and produces a sum of line totals equal to the header local arithmetic total

#### Scenario: Tax is not activated
- **WHEN** the persistent Order is created while the local tax policy is not activated
- **THEN** both header and item tax remain `not_activated/null`, the arithmetic explicitly excludes tax and history does not imply tax-free or tax-paid status

#### Scenario: Restore commercial meaning without live catalog
- **WHEN** the purchased configuration or pricing rules later change or disappear and the application restarts
- **THEN** authorized history reads return the original stored components and allocations without recalculating them using new prices or browser data

### Requirement: Durable Order grants and history share one authority

Persistent Order identity, immutable item/configuration/media snapshots, Cart-version context, access grants, and creation idempotency SHALL survive application restart as one canonical history in the selected local project. Capability material and session secrets MUST NOT be exposed in public results or stored raw in action bindings. Fresh authorization SHALL precede reads and retries; a public Order reference, contact email, Cart ID, or browser-carried snapshot MUST NOT reconstruct authorization. New member association SHALL come only from a verified opaque customer at creation and SHALL NOT claim existing guest Orders. All downstream local payment, fulfillment, tracking, Admin, supplier, and delivery consumers MUST use this same Order authority or fail closed, never a divergent memory copy.

#### Scenario: Persistent history is available without current Catalog
- **WHEN** authorized Order history is read after restart while the current Catalog is unavailable
- **THEN** complete committed snapshots remain readable without guessed Product, price, configuration, media, or ownership facts

#### Scenario: Persistent database cannot be read
- **WHEN** Order history or authorization storage is unavailable
- **THEN** the read returns a safe unavailable result without browser reconstruction, memory fallback, SQL leakage, or cross-Order disclosure

#### Scenario: Supplier entry has not been adapted
- **WHEN** a supplier entry point cannot resolve the persistent canonical Order and shared write gates
- **THEN** it rejects the operation as explicitly unsupported/unavailable and MUST NOT use the old memory Order store or claim supplier workflow restoration
