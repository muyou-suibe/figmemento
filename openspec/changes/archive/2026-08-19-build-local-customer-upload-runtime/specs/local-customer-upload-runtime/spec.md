## Purpose

Define a development/test-only CustomerUpload runtime composition that lets the
existing private upload, preview, Cart, and Checkout Readiness boundaries share
safe process-local state without selecting a production storage provider.

## ADDED Requirements

### Requirement: Reuse provider-neutral CustomerUpload authority

The local runtime MUST reuse the existing CustomerUpload domain contracts,
object-store port, receipt-repository port, acceptance and lifecycle services,
preview-access authority, guest-owner service, and configured-item acceptance
boundary. It MUST NOT create a second CustomerUpload domain model, duplicate
upload validator, or make `app/testing/*` a public-route dependency.

#### Scenario: Existing contracts are composed
- **WHEN** the local runtime is activated
- **THEN** upload, preview, Cart, and readiness use the existing provider-neutral
  CustomerUpload authority and no competing receipt model is introduced

#### Scenario: Test fakes remain test infrastructure
- **WHEN** a public upload or preview route is loaded
- **THEN** it does not directly import a test-only fake or smoke harness module

### Requirement: Explicit CustomerUpload source selection

The server MUST recognize only `CUSTOMER_UPLOAD_SOURCE=disabled` and
`CUSTOMER_UPLOAD_SOURCE=local_fake` for this capability. An absent value MUST
behave as `disabled`; an invalid value MUST fail closed. `local_fake` MUST be
accepted only in development or test runtime modes and MUST be rejected in
production. Missing providers, missing storage configuration, database failure,
or provider failure MUST NOT fall back to `local_fake`.

#### Scenario: Absent source
- **WHEN** `CUSTOMER_UPLOAD_SOURCE` is absent
- **THEN** upload-dependent routes remain safely unavailable and no local object
  or receipt is created

#### Scenario: Explicit disabled source
- **WHEN** `CUSTOMER_UPLOAD_SOURCE=disabled`
- **THEN** upload-dependent routes fail closed without invoking a storage or
  receipt provider

#### Scenario: Local fake in development
- **WHEN** `CUSTOMER_UPLOAD_SOURCE=local_fake` and runtime mode is development
  or test
- **THEN** the process-local runtime may be composed for offline local flow

#### Scenario: Local fake in production
- **WHEN** `CUSTOMER_UPLOAD_SOURCE=local_fake` and runtime mode is production
- **THEN** configuration is rejected or the route fails closed, with no
  process-memory upload treated as production state

#### Scenario: Provider failure does not select local fake
- **WHEN** an intended non-local provider or required configuration is absent or
  fails
- **THEN** the result remains a bounded unavailable state and does not activate
  `local_fake`

#### Scenario: Upload and Product sources remain independent
- **WHEN** `CUSTOMER_UPLOAD_SOURCE=local_fake` is selected without an explicitly
  available Product/Customization source, or Product source is `fixture` while
  CustomerUpload source is `disabled`
- **THEN** neither source activates the other and each boundary retains its own
  fail-closed behavior

### Requirement: One shared process-local runtime bundle

Development/test `local_fake` MUST expose one shared runtime bundle per
application process or Worker instance for the private object store, owner-scoped
receipt repository, preview access, opaque receipt ID allocation, and local
technical expiry policy. Upload, preview, Cart Add, and Checkout Readiness MUST
observe the same bundle rather than constructing a fresh empty store per request.

#### Scenario: Upload is visible to downstream boundaries
- **WHEN** an upload succeeds in one request and preview, Cart Add, or readiness
  runs in the same process
- **THEN** each boundary can use the same active owner-scoped receipt authority

#### Scenario: Routes do not receive isolated stores
- **WHEN** multiple requests use the same local process
- **THEN** route composition does not silently replace the shared store with a
  new empty repository on every request

### Requirement: Private process-memory object and receipt storage

The local object store MUST keep uploaded bytes private in process memory and
the local receipt repository MUST implement the existing owner-scoped receipt
lifecycle. Browser responses MUST contain only an opaque receipt projection and
safe validated metadata; they MUST NOT contain an object key, memory key,
provider locator, bucket, path, filesystem path, or permanent URL.

#### Scenario: Private object write
- **WHEN** an accepted image is stored locally
- **THEN** only the server-side authority can read the private bytes through the
  existing preview/lifecycle ports

#### Scenario: Safe receipt projection
- **WHEN** an upload response is returned to the browser
- **THEN** it contains opaque receipt identity and permitted display metadata but
  no storage locator or provider detail

### Requirement: Opaque receipt identity

Local runtime receipt IDs MUST be server-generated, opaque, and cryptographically
unpredictable where the existing runtime supports secure randomness. IDs MUST
NOT be derived from email, filename, Product, SKU, owner ID, Cart ID, or file
hash. Offline deterministic tests MAY inject deterministic ID generators.

#### Scenario: Runtime ID allocation
- **WHEN** a local upload is accepted
- **THEN** its receipt ID is allocated by the server runtime and is not derived
  from browser or business data

#### Scenario: Deterministic test allocation
- **WHEN** an offline test supplies an ID generator
- **THEN** deterministic IDs are used only through the injected test boundary
  without weakening runtime ID requirements

### Requirement: Signed guest-owner boundary remains authoritative

CustomerUpload ownership MUST reuse the existing server-verified
`photogift-guest-draft-owner` context, including its current missing, valid,
invalid, expired, and issuance semantics. The runtime MUST NOT create another
upload-owner cookie or use `figmemento-local-cart`,
`figmemento-local-customer-session`, or `photogift-admin-session` as receipt
ownership authority.

#### Scenario: Valid guest owner
- **WHEN** a guest presents a valid existing or explicitly issued owner context
- **THEN** the server may perform the authorized upload or receipt operation for
  that owner

#### Scenario: Invalid or expired owner
- **WHEN** the owner context is invalid or expired
- **THEN** the operation fails closed before private receipt/object access

#### Scenario: Identity separation
- **WHEN** a request contains a Cart, Customer Auth, or Admin cookie
- **THEN** those identities cannot authorize, claim, merge, or transfer a guest
  CustomerUpload receipt

### Requirement: Product and CustomizationField selectors are non-authoritative

An upload request MUST carry only the minimal non-authoritative lookup selectors
needed to identify the current Product-owned image field: `productId` and
`fieldId`. The selectors SHOULD use query or other non-body request context
compatible with the existing field-resolution request and MUST NOT be placed in
multipart policy fields. The server MUST re-resolve current Product eligibility
where required and the current Product CustomizationField configuration before
returning authoritative `ImageCustomizationFieldConstraints` to upload
acceptance. Selectors MUST NOT authorize ownership, receipt identity, Cart,
Customer, price, SKU, Variant, storage, or any upload constraint.

#### Scenario: Valid lookup selectors
- **WHEN** a development/test upload supplies bounded `productId` and `fieldId`
  selectors through the approved non-body request context
- **THEN** the server loads the current Product and CustomizationField authority,
  verifies the exact field belongs to that Product, and only then may return the
  current server-owned image constraints

#### Scenario: Missing or malformed selector
- **WHEN** `productId` or `fieldId` is missing or malformed
- **THEN** the upload fails safely before multipart parsing, private object write,
  or receipt mutation, without guessing a default field

#### Scenario: Cross-Product field selector
- **WHEN** a field belonging to Product A is submitted with Product B's
  `productId`, or the Product/field pair is otherwise unknown
- **THEN** the upload fails closed before private object or receipt mutation

#### Scenario: Inactive or non-image field selector
- **WHEN** the selected field is inactive, not current, not owned by the selected
  Product, or has a non-image kind
- **THEN** the upload fails closed and does not substitute another field

#### Scenario: Browser does not provide field authority
- **WHEN** the browser includes constraints, MIME/size/dimension claims,
  image-count or crop policy, owner data, receipt data, or storage data
- **THEN** those values are ignored or rejected and current server-owned
  configuration remains authoritative

#### Scenario: No unsafe selector inference
- **WHEN** an upload request contains a Referer, page pathname, Product name,
  Product slug, ProductAsset, or no explicit image-field selector
- **THEN** the server does not infer the upload target from those values or use a
  global/default image field

### Requirement: Server-owned upload validation and mutation ordering

The existing upload acceptance MUST enforce the authoritative
CustomizationField constraints and image inspection on the server. Browser MIME,
size, dimensions, image count, field kind, or crop claims MUST NOT become
authority. Request method, source gate, exact same-origin mutation checks,
guest-owner verification/issuance, selector parsing, current Product/field
resolution, multipart parsing, decoded image inspection, acceptance, private
object write, and receipt creation MUST retain the approved security ordering.

#### Scenario: Unsafe mutation request
- **WHEN** Origin is missing where required, malformed, cross-origin, attacker
  controlled, or violates the approved `Sec-Fetch-Site` rule
- **THEN** the request is rejected before object or receipt mutation

#### Scenario: Browser claims conflict with field authority
- **WHEN** browser fields claim a different type, size, dimension, count, kind, or
  crop capability than the Product-owned CustomizationField authority
- **THEN** server-owned constraints decide the result and the browser claims are
  ignored or rejected

#### Scenario: Accepted image
- **WHEN** server inspection confirms an allowed non-empty JPEG, PNG, or WebP
  image within the current field constraints
- **THEN** the existing acceptance boundary may write a private object and
  create its opaque receipt

### Requirement: Upload rejection and partial failure are fail closed

Rejected uploads MUST create no valid receipt and, where a private object write
has already occurred, MUST use the existing provider-neutral compensation or
cleanup behavior. Object-write, receipt-write, source-failure, malformed,
expired, inactive, cross-owner, unsupported-type, size, and dimension failures
MUST use coarse safe responses without revealing object or receipt existence,
storage details, SQL details, secrets, or customer content.

#### Scenario: Validation rejection
- **WHEN** an upload is empty, unsupported, oversized, malformed, or violates
  decoded image constraints
- **THEN** no accepted receipt is returned and no object remains as an accepted
  draft value

#### Scenario: Object write succeeds but receipt write fails
- **WHEN** the private object is written but authoritative receipt creation fails
- **THEN** the request fails without reporting an accepted receipt and the
  existing best-effort compensation path is attempted without exposing its
  locator or claiming distributed rollback

#### Scenario: Receipt write succeeds but the response is lost
- **WHEN** private object and receipt persistence succeed but the HTTP response
  is lost or becomes ambiguous to the browser
- **THEN** the active owner-scoped local receipt may remain, and this capability
  does not promise that a later retry resolves to that original receipt

#### Scenario: Repeated explicit upload attempts
- **WHEN** the browser sends two explicit successful `POST /api/uploads`
  attempts without a separately approved idempotency contract
- **THEN** the attempts are independent and may produce two different opaque
  receipts; equivalence MUST NOT be inferred from filename, bytes or hash,
  Product, field, owner, Cart, or client operation ID

### Requirement: Existing upload HTTP route uses the local source boundary

The existing `POST /api/uploads` route MUST be the only browser upload endpoint
for this capability unless an approved routing audit proves it cannot support
the contract. It MUST activate only for development/test `local_fake` and MUST
remain safely unavailable for absent, disabled, invalid, production-local_fake,
or unavailable source states. A disabled route MUST not store bytes, create a
receipt, issue guest upload data, or silently fall back.

#### Scenario: Local upload route
- **WHEN** the source is `local_fake` in development/test and all server gates
  pass
- **THEN** the existing upload route can return the safe accepted receipt
  projection

#### Scenario: Disabled upload route
- **WHEN** the source is absent or disabled
- **THEN** `POST /api/uploads` returns the approved bounded unavailable response
  without upload side effects

### Requirement: Private customer-input preview

The existing customer-input preview route MUST use verified guest-owner context,
owner-scoped receipt lookup, active/unexpired checks, bounded preview
authorization, and private object read. Preview responses MUST use
`Cache-Control: private, no-store` or a stronger approved equivalent, MUST NOT
return provider URLs or locators, and MUST never convert customer media into a
ProductAsset, public catalog content, sitemap entry, SEO content, or production
preview.

#### Scenario: Owned active preview
- **WHEN** an owner requests an active, unexpired receipt through the local
  source
- **THEN** the route returns private customer-input bytes or the existing safe
  preview response with no-store behavior

#### Scenario: Unknown or cross-owner receipt
- **WHEN** a request presents an unknown receipt or a receipt owned by another
  guest
- **THEN** it fails with coarse safe behavior that does not reveal whether the
  receipt or object exists

#### Scenario: Expired or inactive receipt
- **WHEN** the receipt is expired, removed, replaced, or otherwise inactive
- **THEN** preview is denied without reviving or recreating the receipt

### Requirement: Local receipt lifecycle and expiry remain non-production

The local runtime MAY apply an explicitly development/test-only technical expiry
policy and MUST preserve existing replacement, removal, attachment, expiration,
cleanup, and retry lifecycle contracts. It MUST NOT define production retention,
order-attached media retention, provider object lifecycle, cleanup scheduling,
or production preview TTL.

#### Scenario: Local expiry
- **WHEN** a local receipt exceeds the explicitly documented local technical
  expiry
- **THEN** it is no longer usable for preview or configured-item acceptance

#### Scenario: Production policy remains unresolved
- **WHEN** the local runtime documentation is reviewed for production use
- **THEN** local expiry values are not presented as production retention or
  cleanup policy

### Requirement: Cart Add composes the same receipt authority

For a private-image configured item in local_fake mode, Cart Add MUST reuse the
verified guest owner, the same process-local receipt repository, and the
existing configured-item acceptance boundary. Cart identity MUST never become
upload ownership authority. Image Cart Add MUST fail closed when source, owner,
receipt, or ownership validation is unavailable. Text-only configured items MUST
remain independent of CustomerUpload source availability.

#### Scenario: Image configured item succeeds locally
- **WHEN** an accepted image receipt is owned by the verified guest and the
  configured-item boundary passes
- **THEN** Cart Add may create the existing Cart line using the existing Cart
  contract and no second upload validator

#### Scenario: Image configured item fails closed
- **WHEN** source is disabled/unavailable, owner verification fails, or the
  receipt is missing, inactive, expired, or not owned
- **THEN** Cart Add is rejected without treating Cart cookie identity as upload
  authority or creating rejected-item side effects

#### Scenario: Text-only item
- **WHEN** a configured item contains no CustomerUpload receipt value
- **THEN** existing text-only Cart Add behavior remains available without
  requiring CustomerUpload runtime activation

### Requirement: Checkout Readiness composes the same receipt authority

For a non-empty local Cart containing private-image configured copies, Checkout
Readiness MUST use the same verified guest owner and process-local receipt
repository through its existing owner-scoped authority. It MUST preserve the
archived readiness states, issue vocabulary, aggregation, read-only behavior,
and informational-only handoff semantics. A Cart without upload receipts MUST
not require upload runtime merely to evaluate non-upload facts.

#### Scenario: Local private-image readiness
- **WHEN** a local Cart contains a private-image configured copy with a current
  owner-scoped active receipt
- **THEN** readiness can evaluate the existing upload authority without a
  readiness-specific receipt model

#### Scenario: Readiness upload authority unavailable
- **WHEN** an image line cannot obtain the required local receipt authority
- **THEN** readiness retains the archived bounded `UPLOAD_UNAVAILABLE` or
  equivalent unavailable result and does not claim checkout authorization

#### Scenario: Text-only readiness
- **WHEN** the Cart contains no CustomerUpload receipts
- **THEN** readiness evaluates Product, Variant, and text customization facts
  without unnecessary upload-runtime coupling

### Requirement: Customer Auth does not claim guest uploads

Local sign-in, sign-up, and sign-out MUST NOT rewrite receipt owner IDs, claim
guest receipts, move private objects, delete guest-owner context, or merge Cart
ownership. Guest-to-Customer upload transfer remains outside this capability.

#### Scenario: Customer session changes
- **WHEN** a guest signs in, signs out, or creates a local Customer Auth session
- **THEN** the guest upload owner and receipt lifecycle remain unchanged

### Requirement: Local runtime loss is explicit and safe

Process restart MUST clear local objects and receipts. Multi-process, multi-Worker,
and multi-server sharing MUST be documented as unsupported, and hot-reload
limitations MUST be documented where relevant. A later Cart or readiness
evaluation that references a vanished local receipt MUST fail safely rather than
recreate the receipt or claim durable recovery.

#### Scenario: Process restart
- **WHEN** the local application process restarts after an upload
- **THEN** the prior local object and receipt are unavailable and downstream
  validation fails closed

#### Scenario: Separate local instance
- **WHEN** preview, Cart Add, or readiness runs in another process or Worker
  instance
- **THEN** it does not claim to share or recover the first instance's local
  receipt data

### Requirement: Production storage and persistence remain deferred

This capability MUST NOT select or implement Supabase Storage, Cloudflare R2,
S3, filesystem persistence, database byte storage, a production receipt table,
RLS, trigger, RPC, Supabase persistence adapter, bucket, binding, provider SDK,
or production cleanup scheduler. Supabase Storage and Cloudflare R2 remain
unapproved candidates without ranking. No migration, remote Supabase action,
Order/OrderItem persistence, checkout, Stripe, PayPal, DNS, Cloudflare, or
deployment action is part of this capability.

#### Scenario: Local flow is reviewed for production
- **WHEN** local upload behavior is presented as evidence for deployment
- **THEN** it is explicitly identified as process-local development/test behavior
  and production activation remains stopped

#### Scenario: No persistence migration
- **WHEN** this capability is implemented or tested offline
- **THEN** no database migration, remote schema change, receipt table, or remote
  record mutation is required or performed

#### Scenario: No checkout or payment side effect
- **WHEN** a local upload, Cart Add, or readiness flow succeeds
- **THEN** it does not create an Order, persist an OrderItem, call payment, or
  authorize checkout
