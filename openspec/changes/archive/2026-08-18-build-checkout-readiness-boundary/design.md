## Context

The archived Shopping Cart is a process-local, guest-capable pre-checkout
foundation. It already owns the server-side Cart cookie, configured-copy line
identity, safe projection, and read-time Catalog revalidation, but it does not
own durable production persistence or checkout authority. The current
configured-item acceptance, Catalog/Variant resolution, Customization
acceptance, CustomerUpload ownership ports, normalized order request, and
order stop gates are the existing authority boundaries that this change must
compose.

The current runtime intentionally has unresolved C1 purchase snapshots,
Customization order attachment, production Cart persistence, CustomerUpload
receipt persistence, shipping, tax, discount, Customer Auth activation, and
payment dependencies. The readiness boundary must describe those facts without
turning them into implementation work.

## Goals / Non-Goals

**Goals:**

- Provide one provider-neutral `CheckoutReadinessReport` contract with
  deterministic `ready`, `blocked`, and `unavailable` semantics.
- Revalidate each current CartLine through existing server authority and keep
  Cart snapshots display/identification inputs only.
- Separate line-level issues from overall dependency classification while
  preserving same-SKU configured-copy identity.
- Provide an injectable evaluator and a narrow read-only HTTP boundary that can
  be tested without Supabase, storage, payment, or other live providers.
- Make the future normalized-order handoff and TOCTOU revalidation rule
  explicit in code-facing documentation and tests.
- Preserve the current private-image fail-closed behavior and all frozen change
  boundaries.

**Non-Goals:**

- No Cart persistence, Customer claim/merge, upload provider, order persistence,
  schema, migration, RLS, or provider selection.
- No checkout execution, Order/OrderItem write, payment, shipping, tax,
  discount, inventory, production, or deployment behavior.
- No new Product, Variant, pricing, fulfillment, Customization, upload, or
  normalized-order authority.
- No working Checkout, Buy, Pay, or production-readiness UI affordance.

## Decisions

### 1. Separate application boundary from Cart

`CheckoutReadinessEvaluator` is a read-only application boundary above the
existing Cart server service. Cart owns line storage, current Cart identity, and
display projection; readiness owns the question of whether those lines can be
handed to a later checkout boundary. Keeping the concerns separate prevents a
readiness check from mutating a stale Cart or turning display totals into order
authority.

Alternative considered: adding a `checkoutReady` flag to Cart or CartLine. This
was rejected because the result depends on time-sensitive external authority
and would become stale state inside the Cart model.

### 2. Reuse existing authority through injected ports

The evaluator receives or composes the existing Cart reader, Catalog/Variant
resolution, configured-item acceptance, Customization repository, and
owner-scoped receipt boundary. Production adapters remain explicit and no new
source selector is introduced. Offline tests inject deterministic fakes for
each required authority.

Alternative considered: a second readiness-specific Product resolver or
Customization parser. This was rejected because it would create competing
validation and pricing authority.

### 3. Fresh authority wins over Cart snapshots

Cart snapshots provide the identity and values needed to locate current facts;
the evaluator compares them with fresh Product, Variant/SKU, options, price,
currency, availability, current FulfillmentConfig validity, Customization, and
upload results. The archived Cart line has no historical FulfillmentConfig
snapshot/signature, so the evaluator documents and preserves that evidence
limit instead of claiming historical fulfillment-change detection. A current
authority failure yields a bounded issue and never updates, removes, or
replaces the Cart line during GET readiness.

### 4. Deterministic aggregation

The evaluator processes all lines independently and records a stable order of
line issues. Overall precedence is:

1. `unavailable` when any required authority cannot be evaluated safely;
2. `blocked` when all required authorities were evaluated but any line or
   dependency is not eligible for the future handoff;
3. `ready` only when every required readiness check passes.

An empty Cart is a deterministic `blocked` result with `EMPTY_CART`, not an
authority failure, and the HTTP route captures that Cart result before
constructing Catalog or Customization authorities. Same-SKU lines are never
collapsed while aggregating. Dependency `status` is authoritative during
normalization: an `unavailable` dependency always produces overall
`unavailable`, even if a caller supplies a blocking issue code.

### 5. Bounded public issue mapping

The domain report contains stable provider-neutral codes and safe display text.
Internal repository failures are mapped at the server boundary before reaching
the report. The mapping does not include C1/Customization task numbers,
migration names, SQL, provider diagnostics, receipt IDs, owner IDs, storage
locators, or stack traces.

### 6. Private upload gate remains fail-closed

The evaluator calls an owner-scoped receipt port only when a real verified
owner boundary and approved repository are supplied by the runtime. The Cart
cookie is never converted into upload ownership. If the runtime provider is
absent, image-dependent lines receive a bounded unavailable/blocked result and
the existing private-image limitation remains unchanged.

### 7. Read-only HTTP semantics

The preferred route is `GET /api/checkout-readiness`. It derives Cart identity
from the existing server cookie and accepts no authority fields in query or
body. A safely evaluated `ready` or `blocked` report returns a normal success
response containing only the safe report. An inability to evaluate a required
authority returns the repository's safe unavailable-operation response with a
bounded `unavailable` body; no raw provider status or error is reflected.

No Cart cookie is created for an empty read. The route reads the existing Cart
cookie before resolving the Cart provider, so no-cookie requests do not require
Cart-provider availability; a valid-looking cookie still requires the provider
to distinguish a missing Cart from an unavailable Cart authority. The route
does not call order, payment, upload-claim, reservation, or persistence
mutation paths.

### 8. No `CHECKOUT_SOURCE` selector

Readiness has no external provider of its own, so it does not need a new
`CHECKOUT_SOURCE=local_fake` configuration. Tests inject authorities directly;
production composition remains the existing server boundary. A source selector
would create a misleading implication that checkout execution is locally
available.

### 9. Ready is not a transaction

The report is a point-in-time observation. A future checkout transaction must
repeat authoritative Catalog, Customization, upload, order-persistence,
shipping, discount, and payment checks immediately before durable side effects.
This explicit TOCTOU rule prevents a recent `ready` report from locking price,
currency, availability, inventory, capacity, or payment state.

### 10. Documentation and optional presentation

Task 1.2 will create `docs/checkout-readiness-boundary-audit.md` for the
repository evidence and dependency classifications. Task 5 will create a
handoff document for future checkout implementation. The initial change does
not add a public Cart readiness panel unless the existing UI can present a
read-only, non-checkout status without exposing internal blockers. No working
Checkout CTA is part of this design.

## Risks / Trade-offs

- [Risk] A `ready` report could be mistaken for checkout authorization →
  [Mitigation] Use explicit pre-checkout wording in the contract, HTTP
  response, docs, and tests; require second validation in the future checkout.
- [Risk] Current provider gaps could be hidden behind a generic unavailable
  result → [Mitigation] Keep bounded public codes while recording detailed
  dependency classifications only in internal handoff documentation.
- [Risk] Cart snapshots can drift between evaluation and checkout →
  [Mitigation] Readiness never mutates snapshots and the future transaction
  must revalidate immediately before writes.
- [Risk] Private receipt IDs or owner context could leak through line reports →
  [Mitigation] Define a recursive public projection firewall and test hostile
  serialization paths.
- [Risk] Same-SKU copies could be accidentally merged in aggregation →
  [Mitigation] Preserve opaque line IDs as the only line identity and include
  repeated-copy regression tests.
- [Risk] Offline fakes could be interpreted as production readiness →
  [Mitigation] Keep injected fakes test-only, avoid a checkout source selector,
  and report synthetic `ready` as test evidence only.

## Migration Plan

There is no database migration or production deployment for this change. Apply
work is local and additive: first complete the evidence audit and domain
contracts, then compose the evaluator and read-only route with injected
dependencies, then run offline/rendered verification. Rollback is removal or
disablement of the new readiness route and evaluator; existing Cart, order,
upload, and payment boundaries remain unchanged.

## Open Questions

None that change the approved scope or architecture. The future checkout
change must separately approve production order persistence, shipping/tax/
discount/payment providers, concurrency, idempotency, rollback, and any
CustomerUpload runtime provider before using readiness for real side effects.
