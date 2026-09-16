## Context

The repository already contains the provider-neutral CustomerUpload domain,
object-store and receipt-repository ports, acceptance/lifecycle services,
preview authorization, signed guest draft-owner service, configured-item
acceptance, Cart receipt validation, and Checkout Readiness receipt validation.
The current `/api/uploads` route and customer-input preview route intentionally
fail closed because no runtime provider composition is activated. There is no
existing `CUSTOMER_UPLOAD_SOURCE` selector, so this change can introduce the
explicit `disabled | local_fake` boundary without conflicting with another
approved source meaning.

The existing deterministic fakes and local smoke harness are test infrastructure
and evidence, not a public route runtime. The implementation must preserve the
archived Shopping Cart and Checkout Readiness contracts, the frozen Customer
Auth/C1/Customization boundaries, and the unresolved production storage
decision.

## Goals / Non-Goals

**Goals:**

- Compose one server-only local CustomerUpload runtime bundle shared by upload,
  preview, Cart Add, and Checkout Readiness in one process.
- Reuse existing ports and acceptance/ownership boundaries while keeping private
  bytes and receipt data process-local, opaque, and fail closed.
- Make local source selection explicit, development/test-only, and independent
  from production provider availability.
- Provide deterministic offline reset/injection seams and honest local
  development and production-handoff documentation.
- Verify the real application routes and downstream boundaries without remote
  Supabase, migrations, provider SDKs, or durable persistence.

**Non-Goals:**

- Selecting or implementing Supabase Storage, Cloudflare R2, S3, filesystem, or
  database byte storage.
- Adding a receipt table, migration, RLS policy, trigger, RPC, bucket, binding,
  provider SDK, production cleanup scheduler, or production retention policy.
- Completing Customization tasks 3.4, 3.5, 3.6, 8.5, 8.6, or 8.7; changing C1;
  persisting Orders/OrderItems; activating checkout or payment.
- Changing canonical Shopping Cart, Checkout Readiness, Customer Auth,
  Brand/Domain, Visual, or other archived requirements.

## Decisions

### 1. Introduce one explicit server-only source selector

Use `CUSTOMER_UPLOAD_SOURCE` with exactly `disabled` and `local_fake` values.
Read it through the existing server configuration boundary. Absence resolves to
`disabled`; invalid values fail closed. A direct runtime-mode authority, not a
browser field or mutable Worker binding, determines whether `local_fake` is
allowed. Production always rejects or safely disables `local_fake`.

This follows the already-approved Cart and Customer Auth source discipline. It
is preferable to implicit provider detection because a failed production
provider must never become an accidental in-memory upload runtime.

### 2. Resolve a minimal Product/field selector before body parsing

The current upload handler deliberately gives field resolution only request
headers, method, and URL context and does not allow the resolver to materialize
multipart content. The current browser helper sends only the file, so the server
has no safe way to identify which Product-owned image field supplies the
constraints. Add only `productId` and `fieldId` as bounded lookup selectors,
preferably in query/non-body context such as
`POST /api/uploads?productId=<id>&fieldId=<id>`.

These values identify what the server should look up; they do not become field
policy or security authority. The server re-resolves current Product eligibility
through the existing Catalog authority where required, loads the current
configuration through the existing source-aware
`createServerCustomizationFieldRepository` or repository-consistent equivalent,
finds the exact field, verifies Product ownership, current/active state, and
`image` kind, then passes only the authoritative image constraints to the
existing acceptance boundary. A malformed, missing, unknown, cross-Product,
inactive, or non-image selector fails before object/receipt mutation.

Query/non-body context preserves the handler's existing rule that field
resolution must not parse or trust multipart policy fields before authority is
known. Referer, pathname, Product name/slug guessing, ProductAsset, and a
global/default image field are not lookup sources.

The client helper evolves only to accept `{ productId, fieldId, file }` or an
equivalent repository-consistent shape. It sends no constraints, owner,
receipt, Cart, Customer, price, SKU, Variant, or storage data. Existing client
tests that prohibited `productId` and `fieldId` must become selector-vs-authority
tests: selectors are allowed, while all policy and identity claims remain
forbidden. The client `operationId` remains local UI coordination only and is
not an upload idempotency or deduplication key.

Product source and CustomerUpload source remain independent: enabling
`CUSTOMER_UPLOAD_SOURCE=local_fake` does not select fixture Product or
Customization authority, and selecting `PHOTOGIFT_PRODUCT_SOURCE=fixture` does
not activate CustomerUpload. A complete local demo explicitly configures each
approved source while each source retains its own guards.

### 3. Compose a legitimate server/infrastructure runtime adapter

Create a server-only runtime composition layer that implements the existing
provider-neutral ports with process-memory adapters. Public routes depend on
the ports or a runtime bundle accessor, not on `app/testing/customer-upload-fakes`.
The adapter may reuse lower-level implementation ideas only when the test-only
module boundary remains truthful and public imports remain absent.

The bundle contains the private object store, owner-scoped receipt repository,
preview access, receipt ID generator, and explicitly local expiry policy. It is
created once per process/Worker instance and shared by all four consumers.
Tests receive a deterministic injected bundle or reset hook; no public reset
endpoint is added.

### 4. Keep the opaque receipt as the only browser authority

The object store maps opaque receipt identity to private internal bytes without
exposing its locator. The receipt repository stores the server-owned lifecycle,
owner, validated metadata, and object association needed by existing contracts.
Runtime IDs use secure randomness where available; tests may inject deterministic
IDs. Browser payloads cannot choose an object key, owner, bucket, path, URL, or
receipt metadata as authority.

### 5. Preserve guest draft ownership and security ordering

The existing signed `photogift-guest-draft-owner` service remains the sole guest
upload ownership boundary. The route keeps the source gate, exact same-origin
and fetch-site checks before mutation, verifies or issues owner context according
to the current service semantics, parses the lookup selectors, resolves
server-owned Product/CustomizationField constraints, then parses and inspects
the multipart image before private write and receipt creation.

No new owner cookie is introduced. Cart, Customer Auth, and Admin identities are
orthogonal and cannot claim or authorize receipts. Sign-in/sign-out remains
non-claiming until a separately approved guest-transfer change exists.

### 6. Reuse existing routes and preview authority

The existing `POST /api/uploads` route and customer-input preview route remain
the public HTTP surfaces. Source-disabled and production-local-fake states use
the existing safe unavailable mapping. Local preview uses owner-scoped lookup,
active/unexpired checks, private object read, and `private, no-store`; it never
returns provider URLs or turns media into ProductAsset or production preview.

### 7. Compose Cart and Readiness without changing their contracts

Cart Add receives the same local receipt repository through its existing
configured-item acceptance path. Image lines require verified owner and active
receipt authority; text-only lines do not require CustomerUpload runtime. The
Cart cookie remains only Cart identity.

Checkout Readiness receives the same verified owner/repository dependency when a
private image is present. Its archived state, bounded issue codes, precedence,
read-only behavior, and informational-only meaning remain unchanged. A line
without upload receipts does not need the runtime merely to evaluate catalog or
text facts.

### 8. Treat process memory as a deliberate local limitation

Restart, hot reload that replaces the runtime instance, and another Worker or
server instance can lose access to local bytes and receipts. The documentation
must state that upload→preview→Cart→Readiness demonstrations stay in one local
runtime instance. Downstream validation fails closed after loss; the adapter
does not recover or recreate receipts and does not add Redis, filesystem, or
database persistence.

### 9. Keep production provider and retention decisions outside the change

Supabase Storage and Cloudflare R2 remain unapproved candidates and are not
ranked. S3 is not added as a new candidate. Local expiry is a technical
development/test value only; production retention, cleanup, preview TTL,
bucket/binding, scaling, and deployment require a later human/provider change.

## Risks / Trade-offs

- **[Risk]** A process restart loses an upload needed by a Cart line.
  **Mitigation:** document the same-process limitation and make later preview,
  Cart, and readiness checks fail closed rather than recreating receipts.

- **[Risk]** A route accidentally creates a fresh empty store per request.
  **Mitigation:** use one runtime bundle accessor per process and integration
  tests that upload in one request and consume the receipt in later boundaries.

- **[Risk]** Test fakes become an accidental production dependency.
  **Mitigation:** keep public routes dependent on server/infrastructure ports and
  add source-level regression checks against `app/testing/*` imports.

- **[Risk]** Local success is mistaken for production storage approval.
  **Mitigation:** explicit source guard, handoff documentation, no provider SDK,
  and a final stop gate that reports production provider as unresolved.

- **[Risk]** An object write can succeed while receipt persistence fails.
  **Mitigation:** preserve the existing best-effort compensation behavior, fail
  the request without returning an accepted receipt, keep public errors coarse,
  and test failure injection without exposing locators or claiming distributed
  rollback.

- **[Risk]** Receipt persistence can succeed while the HTTP response is lost.
  **Mitigation:** allow the active local receipt to remain owner-scoped and
  subject to local expiry/lifecycle; explicitly document that a later repeated
  POST is a new independent attempt and that production orphan reconciliation
  and retention remain unresolved.

- **[Risk]** A retry may be mistaken for an idempotent replay.
  **Mitigation:** do not add or infer an Idempotency-Key, request fingerprint,
  operation ledger, deduplication map, content-hash deduplication, database
  uniqueness, or new lifecycle state. No equivalence is inferred from filename,
  bytes/hash, Product, field, owner, Cart, or client operation ID.

- **[Risk]** Upload source is made a dependency of text-only Cart or readiness.
  **Mitigation:** test text-only paths independently and resolve the local
  receipt authority only when an image receipt is actually required.

- **[Risk]** Guest Auth changes accidentally claim guest uploads.
  **Mitigation:** preserve cookie separation and add sign-in/sign-out regression
  checks that owner IDs, receipts, and Cart identity remain unchanged.

## Migration Plan

There is no database migration or remote deployment plan for this change. Apply
is local-only: implement the adapter, run offline and local-runtime verification,
and document the handoff. Rollback is removal/disablement of the local source
composition while retaining the existing fail-closed route behavior. No remote
schema, records, migration history, provider account, bucket, binding, DNS,
Cloudflare configuration, or deployment state is changed.
