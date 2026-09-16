## Context

See proposal.md for motivation and the local-order-runtime spec for its behavior
contract. The repository already has safe local authority seams but no Local
Order persistence boundary:

- Local Checkout fresh-reads the server Cart and uses configured-item acceptance,
  Catalog/Variant resolution, owner-scoped active CustomerUpload receipt checks,
  and local shipping/coupon/tax evaluation. Its accepted result is intentionally
  server-only, non-durable, and non-authorizing.
- The Cart runtime keeps its Cart identity in an HttpOnly cookie and the
  CustomerUpload runtime can resolve a signed guest upload-owner context. That
  owner context is only appropriate for image receipt checks; text-only
  customers may not have it.
- Existing API orders, order lookup, Admin Orders, and Supabase Order
  repositories are production-oriented or legacy boundaries and must not be
  repurposed.
- C1 Tasks 3.8 and 7.4 are deferred durable Supabase OrderItem snapshot work.
  The Customization change is also active/deferred. This design uses only code
  that currently exists and passes tests; it changes neither change's planning
  artifacts, migration chain, nor task state.

The runtime needs an isolated server-only Local Order contract that
reconstructs authority from current state at the moment of creation, then
preserves an immutable protected snapshot.

## Goals / Non-Goals

**Goals:**

- Create a development/test-only process-memory Local Order from fresh server
  authority, never from a browser round-trip of an accepted checkout result.
- Preserve a protected immutable snapshot and a minimal safe browser projection.
- Support guest creation and same-browser refresh/read without treating a public
  reference as an access credential.
- Make the local creation side effect atomic and safely retryable through a
  narrow opaque attempt selector.
- Keep the current Cart intact after Local Order creation.
- Prove behavior with deterministic offline, HTTP, rendered, browser, restart,
  privacy, and final engineering-gate tests.

**Non-Goals:**

- Production Order, OrderItem, order status machine, payment, payment session,
  paid transition, webhook, Stripe, PayPal, email, fulfillment, preview,
  shipment, tracking, digital checkout/delivery, or customer order history.
- Supabase/database writes, schema changes, migrations, local Supabase, storage
  provider selection, C1 backfill, or changes to the deferred C1/Customization
  change artifacts.
- Cart clearing, reservation, inventory allocation, checkout-session durability,
  address-provider validation, production shipping, or production tax.
- Reuse of production/legacy Order APIs, lookup APIs, Admin Order repositories,
  or their identifier semantics.

## Decisions

### 1. Isolate a development/test-only Local Order runtime

Add a dedicated runtime selector and configuration boundary, following the
existing Local Checkout/Cart/CustomerUpload convention. The selector will be
explicit, for example LOCAL_ORDER_SOURCE=local_fake; direct runtime mode remains
authoritative. Absent selection is disabled and a development/test selection is
rejected in production.

The local repository is a process-memory adapter that exists only when this
explicit mode is selected. It is not a fallback for Supabase failure and makes
no provider call.

**Why:** this proves the Order boundary without claiming production persistence
or hiding a provider outage.

**Alternatives considered:**

- Use Supabase Order tables: rejected because it breaches scope, collides with
  C1's ordered migration/snapshot work, and creates business data.
- Add a local mode to existing API orders: rejected because it couples local
  behavior to legacy payment/order behavior and risks production side effects.
- Persist in browser storage: rejected because browser data cannot safely be
  authoritative or protect uploads/idempotency state.

### 2. Freshly evaluate again; do not accept Checkout as Order authority

A Local Order application service begins from the current server Cart identity
and structurally parsed browser input. It repeats the authority work already
proven by Local Checkout: load the Cart, accept each configured item against
current Catalog/customization configuration, validate owner-scoped active image
receipts, resolve Product/SKU and price, and evaluate local
shipping/coupon/tax/total.

It uses shared lower-level acceptance/resolution/evaluation seams, or extracts
a shared server-only helper. It never accepts an accepted checkout result, its
public projection, or client-side totals as input.

**Why:** Local Checkout is a read-only observation. A later mutation must defend
against Cart/configuration changes between evaluation and creation.

**Alternatives considered:**

- Round-trip the displayed checkout summary: rejected because prices, totals,
  receipts, and configured fields become browser authority.
- Persist an evaluation first: rejected because it creates durable checkout
  sessions and still leaves stale-state handling.

### 3. Separate protected immutable snapshots from public projection

Define a Local Order domain with a protected snapshot and a safe public
projection.

The protected snapshot contains:
- internal local Order ID, generated public reference with a clearly local-only
  prefix such as FM-LOCAL-, creation time, pending_payment Order state, and
  pending payment state. The pending value is an immutable statement that no
  payment has occurred; it is not a Payment entity, payment attempt, session,
  PaymentIntent, authorization, capture, or webhook state;
- normalized contact and shipping-address snapshot;
- authoritative local commercial snapshot: currency, subtotal, fixture shipping
  state/amount, coupon state/discount, tax status not_activated with null amount,
  and local arithmetic total;
- one snapshot per configured Cart copy: Product/Variant IDs, Product name and
  slug, Variant/SKU identity/code, selected options and available safe labels,
  quantity, unit base price, currency, and line calculation;
- accepted customization field/revision/value facts. For images this includes
  only a controlled server-side receipt reference and accepted crop/configuration
  facts, never owner IDs, storage keys, object URLs, signed URLs, raw capability
  material, or unrelated private upload data.

The projection exposes only the public reference, created time, pending labels,
safe confirmation contact display, local shipping/coupon/tax states,
development-only arithmetic summary, and safe line/product/SKU/options/
customization display. It cannot return the protected snapshot.

Snapshot construction deep-copies and defensively freezes stored values. Reads
do not query current Catalog/Customization to rewrite historical Local Orders.

**Why:** it preserves purchased facts while enforcing the private upload boundary.

**Alternatives considered:**

- Recompute from current Catalog/Cart: rejected because edits would rewrite
  historical facts.
- Return full snapshots and hide fields in UI: rejected because presentation
  cannot prevent data exposure.
- Store private or permanent upload URLs: rejected by the private object
  contract.

### 4. Bind local idempotency to server authority and make it repository-atomic

The Checkout client owns a small creation lifecycle: IDLE, SUBMITTING, and a
terminal accepted or terminal rejected state. When the shopper explicitly starts
an action, the CTA generates one opaque UUID-format creationAttemptId and keeps
it for that in-flight lifecycle and its transport retries. While SUBMITTING the
CTA is disabled or otherwise guarded, so a rapid second click neither generates
another selector nor starts another request. A new selector is allowed only
after the previous lifecycle has ended and the shopper explicitly starts again.
The server parses the selector as a bounded idempotency input, not an Order
fact, payment authorization, or user identity.

After fresh authority evaluation, the service derives a server-internal
canonical fingerprint from normalized checkout input and the authorized current
creation context. The context includes the server-resolved HttpOnly Cart
identity and authoritative evaluated Cart/configuration identity; it includes
the upload-owner context only where accepted image items require it. The local
repository performs a single atomic find-or-create keyed by context and
attempt selector:

- first use stores snapshot, idempotency binding, and the browser capability
  binding together;
- equivalent retry returns the original safe result;
- if the first response or Set-Cookie is lost, an equivalent retry returns the
  original Order and reissues or re-establishes valid browser access;
- a different canonical context/fingerprint returns a bounded conflict result;
- a distinct selector is a distinct new local creation attempt.

The fingerprint and access capability remain server-only. Repository methods
coordinate concurrent same-key requests to prevent duplicate Orders and partial
readable state.

**Why:** duplicate prevention belongs at this change's only side effect without
inventing a general payment/API idempotency platform.

**Alternatives considered:**

- Generic Idempotency-Key header/ledger: rejected as unnecessary scope
  expansion and insufficient server-authority binding.
- Hash/Product/owner deduplication: rejected because distinct configured copies
  and legitimate repeat attempts remain meaningful.
- Every POST is independently successful: rejected because lost responses could
  duplicate the Local Order side effect.

### 5. Issue one multi-Order HttpOnly same-browser read capability

After the first successful create, the server sets one opaque HttpOnly
SameSite=Lax browser-local access cookie, scoped as narrowly as practical to
Local Order read/success. The repository binds that capability to a set of
authorized Local Order references for the current process. Later successful
Orders extend the same server-side binding rather than overwriting it. An
equivalent retry reuses that binding and reissues the cookie when the browser
lost the previous Set-Cookie response. Read requires both reference and
matching capability and returns a uniform bounded unavailable/not-found result
for missing, mismatched, unknown, or restart-lost state.

The capability is not returned in JSON or a URL, is not payment authorization,
and is not a guest login. A public reference alone is never sufficient. A
separate browser without the capability cannot read even when it knows a valid
reference. Creation remains valid for text-only flows without an upload-owner
cookie; image receipt validation still uses owner scope.

**Why:** a public reference is an identifier, not safe guest authorization.

**Alternatives considered:**

- Public reference alone: rejected because references are enumerable.
- One new per-Order cookie: rejected because creating Order B could overwrite
  the browser's ability to read Order A.
- Existing email + reference lookup: rejected because that is a separate
  Supabase/legacy production identity contract.
- Reuse upload-owner cookie for every Order: rejected because text-only
  customers can validly have no upload identity.

### 6. Use dedicated local HTTP/UI surfaces and preserve the Cart

Add a local-only create endpoint and local-only read endpoint rather than
extending production Order routes. The create route enforces same-origin,
bounded JSON parsing, local runtime configuration, Cart-cookie resolution,
fresh authority evaluation, and safe error mapping before setting access
authorization. The read route validates the cookie/reference pair before
projecting safe data.

The Checkout client submits structural fields plus creationAttemptId and then
redirects with only the public reference to the local Order Success page. The
page reads again and shows Pending payment and a development-only notice. It
must not say paid, charged, production-confirmed, fulfillment started, or
delivery scheduled.

Creation does not clear, reserve, or mutate the Cart. Retrying gets the same
result; a new explicit click gets a new selector.

### 7. Preserve fixture reality in test design

Browser acceptance uses the actual physical glass-light-picture fixture and its
image receipt flow, optionally adding text. Deterministic domain/HTTP tests
cover a shipping-required text-only configured item because no public physical
text-only fixture exists. Digital portrait is not forced through shipping
checkout, no fake physical fixture is added, and Digital Checkout remains out
of scope.

### 8. Keep C1 and Customization as one-way dependencies

Implementation may use only currently verified contracts: Cart lines,
configured-item acceptance, Catalog resolution, local commercial evaluators,
and CustomerUpload receipt interfaces. It cannot add Product/SKU schema, change
pricing semantics, write Supabase OrderItems, or update the active changes. A
future production Order change must fresh-read production authority and cannot
trust browser round-trips of local order/checkout results.

## Risks / Trade-offs

- [Process-memory data disappears on Worker/runtime restart] -> Explicitly
  declare local-only behavior and fail closed without recovery or fallback.
- [Access cookie copied within a local browser profile] -> Keep it HttpOnly,
  same-site, narrowly scoped, opaque, server-checked, and local-only.
- [Concurrent retries create duplicates] -> Use one repository-atomic
  context-and-selector find-or-create operation and concurrency tests.
- [Fresh-evaluation refactor drifts from Local Checkout] -> Reuse lower-level
  authority seams and test parity/negative cases rather than browser facts.
- [Snapshot leaks upload internals] -> Enforce protected versus public types and
  assert omissions in unit, HTTP, and rendered tests.
- [UI misleads users about payment] -> Require pending-payment wording and a
  development-only notice; forbid payable/paid/charged claims.
- [Deferred C1/Customization work changes later] -> Depend only on current
  tested code and preserve isolation from unfinished migrations/tasks.

## Migration Plan

No database, Supabase, storage, or infrastructure migration is created or
applied. Local Order behavior is enabled only by explicit local development/test
configuration, remains disabled by default, and is rejected in production.

Rollback removes the explicit local runtime selection or reverts local-only
application code. Process-memory Orders, idempotency bindings, and access
capabilities disappear on restart, leaving no persistent data, production
records, migration history, or remote side effect.

## Open Questions

None. Production Order persistence, payment, durable guest access, and C1
OrderItem snapshots require separately approved changes.
