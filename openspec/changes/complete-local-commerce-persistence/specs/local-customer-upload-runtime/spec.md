## MODIFIED Requirements

### Requirement: Explicit CustomerUpload source selection

The server MUST recognize `CUSTOMER_UPLOAD_SOURCE=disabled`, `CUSTOMER_UPLOAD_SOURCE=local_fake`, and `CUSTOMER_UPLOAD_SOURCE=local_persistent`. An absent value MUST behave as `disabled`; an invalid value MUST fail closed. `local_fake` MUST be accepted only in development or test runtime modes and MUST be rejected in production. `local_persistent` MUST be accepted only in development/test with the independent Docker local Supabase project's PostgreSQL and private Storage, and MUST be rejected in staging/production. Missing providers, missing storage configuration, database failure, or provider failure MUST NOT fall back to `local_fake`. Persistent upload, receipt, draft, Catalog field resolution, Cart, and Order authorities required by an operation MUST resolve to the same local project; source selection MUST NOT silently activate another capability or mix persistent receipts with memory commerce state.

#### Scenario: Absent source
- **WHEN** `CUSTOMER_UPLOAD_SOURCE` is absent
- **THEN** upload-dependent routes remain safely unavailable and no local object or receipt is created

#### Scenario: Explicit disabled source
- **WHEN** `CUSTOMER_UPLOAD_SOURCE=disabled`
- **THEN** upload-dependent routes fail closed without invoking a storage or receipt provider

#### Scenario: Local fake in development
- **WHEN** `CUSTOMER_UPLOAD_SOURCE=local_fake` and runtime mode is development or test
- **THEN** the process-local runtime may be composed for offline local flow

#### Scenario: Local fake in production
- **WHEN** `CUSTOMER_UPLOAD_SOURCE=local_fake` and runtime mode is production
- **THEN** configuration is rejected or the route fails closed, with no process-memory upload treated as production state

#### Scenario: Provider failure does not select local fake
- **WHEN** an intended non-local provider or required configuration is absent or fails
- **THEN** the result remains a bounded unavailable state and does not activate `local_fake`

#### Scenario: Upload and Product sources remain independent
- **WHEN** `CUSTOMER_UPLOAD_SOURCE=local_fake` is selected without an explicitly available Product/Customization source, or Product source is `fixture` while CustomerUpload source is `disabled`
- **THEN** neither source activates the other and each boundary retains its own fail-closed behavior

#### Scenario: Persistent upload has an invalid environment or project
- **WHEN** `local_persistent` is selected in staging/production, uses a non-local endpoint, or its required database, Storage, and commerce authorities belong to different projects or modes
- **THEN** the operation fails closed before object or receipt mutation without switching providers

### Requirement: Private process-memory object and receipt storage

In `local_fake`, the local object store MUST keep uploaded bytes private in process memory and the local receipt repository MUST implement the existing owner-scoped receipt lifecycle. In `local_persistent`, bytes SHALL instead remain in the selected independent local project's private Storage and receipts SHALL persist in its independent local commerce namespace with the same owner-scoped lifecycle. Browser responses MUST contain only an opaque receipt projection and safe validated metadata; they MUST NOT contain an object key, memory key, provider locator, bucket, path, filesystem path, or permanent URL.

#### Scenario: Private object write
- **WHEN** an accepted image is stored locally
- **THEN** only the server-side authority can read the private bytes through the existing preview/lifecycle ports

#### Scenario: Safe receipt projection
- **WHEN** an upload response is returned to the browser
- **THEN** it contains opaque receipt identity and permitted display metadata but no storage locator or provider detail

#### Scenario: Persistent private object recovery
- **WHEN** the application restarts with the same local project and a valid authorized active receipt
- **THEN** the server can read its private Storage object through the protected preview boundary without exposing a provider URL

### Requirement: Existing upload HTTP route uses the local source boundary

The existing `POST /api/uploads` route MUST be the only browser upload endpoint for this capability unless an approved routing audit proves it cannot support the contract. It MUST activate only for explicitly selected development/test `local_fake` or `local_persistent` and MUST remain safely unavailable for absent, disabled, invalid, production-local_fake, staging/production-local_persistent, or unavailable source states. A disabled route MUST not store bytes, create a receipt, issue guest upload data, or silently fall back. Persistent operation MUST preserve the existing server validation, source/origin/owner/field ordering, private preview authorization, and bounded failure vocabulary.

#### Scenario: Local upload route
- **WHEN** the source is `local_fake` in development/test and all server gates pass
- **THEN** the existing upload route can return the safe accepted receipt projection

#### Scenario: Disabled upload route
- **WHEN** the source is absent or disabled
- **THEN** `POST /api/uploads` returns the approved bounded unavailable response without upload side effects

#### Scenario: Persistent upload route
- **WHEN** `local_persistent` is selected in development/test and current field, signed owner, image inspection, and local-project checks pass
- **THEN** the same route stores the private image and durable receipt and returns only the existing safe accepted projection

### Requirement: Local receipt lifecycle and expiry remain non-production

The local runtime MAY apply an explicitly development/test-only technical expiry policy and MUST preserve existing replacement, removal, attachment, expiration, cleanup, and retry lifecycle contracts. It MUST NOT define production retention, production order-attached media retention, production provider object lifecycle, production cleanup scheduling, or production preview TTL. `local_persistent` SHALL durably distinguish expirable draft receipts from Order-attached media and SHALL permit only explicitly local retention/cleanup behavior; expiry or draft replacement MUST NOT delete or revive committed Order media.

#### Scenario: Local expiry
- **WHEN** a local receipt exceeds the explicitly documented local technical expiry
- **THEN** it is no longer usable for preview or configured-item acceptance

#### Scenario: Production policy remains unresolved
- **WHEN** the local runtime documentation is reviewed for production use
- **THEN** local expiry values are not presented as production retention or cleanup policy

#### Scenario: Attached media outlives its draft eligibility
- **WHEN** a persistent receipt has been transferred to an immutable Order item and its former draft expiry passes
- **THEN** draft preview/acceptance cannot revive that receipt and draft cleanup cannot remove the attached Order media

### Requirement: Cart Add composes the same receipt authority

For a private-image configured item in `local_fake` mode, Cart Add MUST reuse the verified guest owner, the same process-local receipt repository, and the existing configured-item acceptance boundary. In `local_persistent`, Cart Add MUST instead use that same signed guest-owner contract and the shared durable receipt authority from the same independent local project as its Cart and Catalog configuration. Cart identity MUST never become upload ownership authority. Image Cart Add MUST fail closed when source, owner, receipt, or ownership validation is unavailable. Text-only configured items MUST remain independent of CustomerUpload source availability.

#### Scenario: Image configured item succeeds locally
- **WHEN** an accepted image receipt is owned by the verified guest and the configured-item boundary passes
- **THEN** Cart Add may create the existing Cart line using the existing Cart contract and no second upload validator

#### Scenario: Image configured item fails closed
- **WHEN** source is disabled/unavailable, owner verification fails, or the receipt is missing, inactive, expired, or not owned
- **THEN** Cart Add is rejected without treating Cart cookie identity as upload authority or creating rejected-item side effects

#### Scenario: Text-only item
- **WHEN** a configured item contains no CustomerUpload receipt value
- **THEN** existing text-only Cart Add behavior remains available without requiring CustomerUpload runtime activation

#### Scenario: Persistent Cart cannot consume a memory receipt
- **WHEN** persistent Cart Add is given a receipt only known to `local_fake` or another local project
- **THEN** it fails with a bounded unavailable/invalid receipt result and does not copy or recreate the receipt

### Requirement: Checkout Readiness composes the same receipt authority

For a non-empty local Cart containing private-image configured copies, Checkout Readiness MUST use the same verified guest owner and the receipt repository selected for that Cart's mode through its existing owner-scoped authority: the shared process-local repository in `local_fake`, or the same local project's durable repository in `local_persistent`. It MUST preserve the archived readiness states, issue vocabulary, aggregation, read-only behavior, and informational-only handoff semantics. A Cart without upload receipts MUST not require upload runtime merely to evaluate non-upload facts.

#### Scenario: Local private-image readiness
- **WHEN** a local Cart contains a private-image configured copy with a current owner-scoped active receipt
- **THEN** readiness can evaluate the existing upload authority without a readiness-specific receipt model

#### Scenario: Readiness upload authority unavailable
- **WHEN** an image line cannot obtain the required local receipt authority
- **THEN** readiness retains the archived bounded `UPLOAD_UNAVAILABLE` or equivalent unavailable result and does not claim checkout authorization

#### Scenario: Text-only readiness
- **WHEN** the Cart contains no CustomerUpload receipts
- **THEN** readiness evaluates Product, Variant, and text customization facts without unnecessary upload-runtime coupling

### Requirement: Local runtime loss is explicit and safe

In `local_fake`, process restart MUST clear local objects and receipts. Multi-process, multi-Worker, and multi-server sharing in `local_fake` MUST be documented as unsupported, and hot-reload limitations MUST be documented where relevant. A later Cart or readiness evaluation that references a vanished fake receipt MUST fail safely rather than recreate the receipt or claim durable recovery. In `local_persistent`, application instances configured for the same independent local project SHALL use its durable receipts and private objects, but recovery MUST require current valid signed guest authority and the original active lifecycle state; database or Storage unavailability MUST NOT reconstruct state from a browser or fake store.

#### Scenario: Process restart
- **WHEN** the `local_fake` application process restarts after an upload
- **THEN** the prior local object and receipt are unavailable and downstream validation fails closed

#### Scenario: Separate local instance
- **WHEN** `local_fake` preview, Cart Add, or readiness runs in another process or Worker instance
- **THEN** it does not claim to share or recover the first instance's local receipt data

#### Scenario: Persistent receipt with expired guest capability
- **WHEN** durable bytes and receipts exist after restart but the signed guest-owner capability is invalid or expired
- **THEN** private access fails closed without reissuing ownership from email, customer login, Cart identity, or a receipt ID

### Requirement: Production storage and persistence remain deferred

The `local_fake` capability MUST NOT select or implement Supabase Storage, Cloudflare R2, S3, filesystem persistence, database byte storage, a production receipt table, RLS, trigger, RPC, Supabase persistence adapter, bucket, binding, provider SDK, or production cleanup scheduler. For that mode, no migration, remote Supabase action, Order/OrderItem persistence, checkout, Stripe, PayPal, DNS, Cloudflare, or deployment action is part of this capability. The only persistence exception SHALL be explicitly selected development/test `local_persistent` using the independent Docker local Supabase project's PostgreSQL receipt/draft metadata and private Storage for original and derived media. New tables SHALL stay in an independent local commerce namespace; legacy `orders/order_items`, C1 backfill, Phase C production migration, and the normalized `/api/orders` 503 stop gate MUST remain untouched. Supabase Storage and Cloudflare R2 remain unapproved production candidates without ranking; local Storage is a validation adapter only. No remote migration or deployment is authorized.

#### Scenario: Local flow is reviewed for production
- **WHEN** local upload behavior is presented as evidence for deployment
- **THEN** it is explicitly identified as development/test behavior, with `local_fake` process-local and `local_persistent` isolated-local durability distinguished, and production activation remains stopped

#### Scenario: No persistence migration
- **WHEN** `local_fake` is implemented or tested offline
- **THEN** no database migration, remote schema change, receipt table, or remote record mutation is required or performed

#### Scenario: No checkout or payment side effect
- **WHEN** a local upload, Cart Add, or readiness flow succeeds
- **THEN** it does not create an Order, persist an OrderItem, call payment, or authorize checkout

#### Scenario: Local Storage is not production provider approval
- **WHEN** persistent media is validated in the independent Docker local stack
- **THEN** it provides local-only evidence without choosing the final production object store or authorizing any existing migration/backfill

## ADDED Requirements

### Requirement: Persistent receipt attachment and cleanup exclusion

Persistent receipts SHALL preserve their verified guest owner, exact Product/field and configuration context, original private object association, accepted crop parameters, ordered media selection, derived-preview association, lifecycle, and expiry. Transfer to an exact stable Order item SHALL validate ownership and active state and consume the receipt at most once, atomically with Order creation, immutable item/media snapshots, Cart-version validation, access grants, and creation idempotency. A receipt already attached to one item MUST NOT be consumed by a different item or Order, including separate Cart copies; the bounded conflict MUST require an independently accepted receipt rather than infer ownership from equivalent bytes. Cleanup and attachment MUST have mutually exclusive authoritative eligibility so cleanup cannot delete committed Order media. Failed cleanup SHALL remain safely retryable without reviving receipt eligibility.

#### Scenario: Attachment wins a cleanup race
- **WHEN** a valid receipt is attached in an Order transaction while draft cleanup races
- **THEN** the committed item retains its original and derived private media and cleanup cannot delete those objects

#### Scenario: Cleanup wins an attachment race
- **WHEN** cleanup has authoritatively made a draft receipt ineligible before Order attachment
- **THEN** Order creation fails without a partial Order, consumed receipt, or media snapshot referencing deleted bytes

#### Scenario: Receipt is reused or belongs to another owner
- **WHEN** a different item, Order, or guest tries to consume an already attached or cross-owner receipt
- **THEN** attachment fails without disclosing private media or changing the original binding

#### Scenario: One receipt appears in multiple configured copies
- **WHEN** a new Order would bind the same receipt to two distinct items
- **THEN** creation fails atomically instead of merging items, silently duplicating the attachment, or granting either item unproven media ownership

### Requirement: Persistent object and receipt partial failures remain explicit

Private Storage and PostgreSQL SHALL NOT be represented as one distributed atomic commit. Accepted receipt publication MUST require a successfully stored private object and authoritative receipt metadata. Object success followed by receipt failure SHALL return no accepted receipt and attempt bounded compensation or retain a non-accepted cleanup candidate. Database/Storage/network failures SHALL remain coarse and MUST NOT expose locators or select fake state. Explicitly separate uploads SHALL remain independent; filenames, equal bytes, content hashes or arbitrary client operation IDs MUST NOT silently merge them. In `local_persistent`, the server SHALL issue and durably bind an upload operation to the verified owner, stable slot, generation and normalized input digest. An authorized equivalent retry/reconciliation of that exact operation SHALL recover its original receipt or pending derivative state after response loss or restart, rather than create another accepted upload. Changed inputs under that operation SHALL conflict. Client echoes of the operation identity MUST NOT prove ownership or create a new deduplication binding. `local_fake` retains its existing retry behavior. Order attachment retries SHALL instead use the Order's committed creation idempotency and MUST NOT consume or regenerate media twice.

#### Scenario: Storage succeeds and persistent receipt commit fails
- **WHEN** private bytes are written but the database cannot commit the receipt
- **THEN** no usable receipt is returned, compensation/cleanup remains possible, and no distributed rollback is claimed

#### Scenario: Storage becomes unavailable after receipt creation
- **WHEN** an authorized preview cannot read its existing private object
- **THEN** the route returns a bounded unavailable result without a public URL, guessed replacement object, or memory fallback

#### Scenario: Order attachment response is lost
- **WHEN** an Order transaction has consumed a receipt but its response is lost
- **THEN** an authorized equivalent creation retry returns the original committed Order/item binding without consuming the receipt again

#### Scenario: Persistent accepted upload response is lost
- **WHEN** the owner retries the same server-bound slot/generation/upload operation after its receipt committed but the response was lost
- **THEN** the original receipt is recovered without duplicate selected images or receipt creation, while stale generation results cannot overwrite the current slot

#### Scenario: Separate identical uploads are not merged
- **WHEN** an owner explicitly starts another upload with identical bytes under a new authorized operation
- **THEN** it remains an independent receipt; reuse of the old operation with changed owner, slot, generation or payload is rejected rather than silently deduplicated