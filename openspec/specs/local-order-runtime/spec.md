# local-order-runtime Specification

## Purpose

Define a development/test-only Local Order boundary that turns freshly verified
local checkout inputs into an immutable pending-payment snapshot without
creating a production order, payment authorization, or fulfillment work.

## Requirements

### Requirement: Local Order creation SHALL use fresh server authority

The Local Order runtime SHALL accept only structurally bounded checkout contact,
address, local-shipping selector, coupon input, and an opaque creation-attempt
selector from the browser. It SHALL fresh-read the current server Cart and
re-evaluate current Catalog/SKU eligibility, configured-item acceptance,
CustomerUpload receipt ownership and active state, local shipping fixture,
coupon, tax, currency, and arithmetic before creating an Order. It MUST NOT
accept an `AcceptedCheckout`, browser price, discount, shipping amount, tax
amount, Catalog/SKU facts, configuration facts, CustomerUpload facts, or
payment state as Order authority.

#### Scenario: Current eligible physical Cart creates a Local Order
- **WHEN** a development/test browser submits structurally valid checkout input and an opaque attempt selector for a current eligible physical Cart
- **THEN** the server re-evaluates the authoritative current facts and creates one Local Order with the evaluated summary

#### Scenario: Empty, invalid, or stale Cart is rejected before creation
- **WHEN** the current server Cart is empty, malformed, changed into an ineligible state, or cannot be safely resolved
- **THEN** the runtime returns a bounded failure and creates no Local Order

#### Scenario: Invalid current configured item is rejected before creation
- **WHEN** a Cart line has a missing, invalid, stale, unauthorized, or inactive required CustomerUpload receipt or otherwise fails configured-item acceptance
- **THEN** the runtime returns a bounded failure without disclosing cross-owner receipt existence and creates no Local Order

#### Scenario: Unsupported local commercial state is rejected before creation
- **WHEN** the current Cart has mixed currency, an unavailable local shipping fixture, or a commercial input that cannot be safely evaluated
- **THEN** the runtime fails closed and creates no Local Order

### Requirement: Local Order snapshots SHALL be immutable and server-derived

On successful creation, the runtime SHALL atomically capture an immutable
server-derived snapshot of the evaluated order facts. The protected snapshot
MUST include an internal local Order identity, a public-safe Order reference,
creation time, `pending_payment` Order status, `pending` payment status, contact
and shipping address, shipping/coupon/tax states, local arithmetic summary, and
one snapshot per configured Cart copy. Each line snapshot MUST preserve Product
and Variant/SKU identity and display facts, selected SKU options, quantity,
unit base price, currency, and accepted customization revision/value facts.
Image customization snapshots MAY retain only controlled server-side receipt
references and accepted crop/configuration facts; they MUST NOT expose owner
identity, storage keys, object URLs, capability material, or other private
upload access details.

#### Scenario: Catalog edits do not rewrite a created Local Order
- **WHEN** a Local Order has been created and its source Cart, Catalog, SKU, or customization configuration subsequently changes in the same runtime
- **THEN** reading the Local Order returns its original immutable snapshot rather than recomputing it from current data

#### Scenario: Multiple configured copies remain separate order lines
- **WHEN** a Cart contains separate configured copies of the same Product/SKU with different accepted customization facts
- **THEN** the Local Order stores and returns separate immutable line snapshots without merging them

#### Scenario: Safe projection excludes protected upload data
- **WHEN** a browser reads a Local Order that includes image customization
- **THEN** the response omits CustomerUpload owner identifiers, storage locations, permanent object URLs, raw receipt capability data, and unneeded private configuration details

### Requirement: Local Order creation SHALL be atomic and safely idempotent

The Local Order runtime SHALL treat each opaque creation-attempt selector as an
idempotency selector only within the same server-authorized local creation
context. A repeated equivalent request with the same selector and the same
freshly evaluated context SHALL return the original safe Local Order result
without creating another Order. Reuse of that selector with a materially
different current context or normalized checkout facts SHALL fail safely. A
different selector SHALL represent a new creation attempt. Creation SHALL not
leave a partially readable snapshot, access capability, or idempotency record
when snapshot persistence fails.

#### Scenario: Network retry returns the original Local Order
- **WHEN** a browser retries an equivalent Local Order creation request using the same attempt selector after a lost response
- **THEN** the runtime returns the original safe Local Order result, no duplicate Local Order is created, and valid same-browser access authorization is reissued or re-established

#### Scenario: Attempt selector reuse with changed facts is rejected
- **WHEN** a selector previously used for an Order is submitted with different normalized contact/address/shipping/coupon facts or a different current Cart context
- **THEN** the runtime returns a bounded conflict-style failure and does not create or reveal another Order

#### Scenario: Snapshot creation failure leaves no readable partial Order
- **WHEN** Local Order creation fails before its protected snapshot, idempotency binding, and same-browser access authorization are all established
- **THEN** no partially created Local Order is readable through the Local Order read boundary

### Requirement: Local Order creation SHALL have one guarded client lifecycle

The client SHALL transition each explicit Local Order creation action from IDLE
to SUBMITTING, generate exactly one opaque creation-attempt selector for that
lifecycle, reuse it for retries while the lifecycle is in flight, and finish in
a terminal accepted or terminal rejected state. While SUBMITTING, the Create
Local Order action SHALL be disabled or otherwise guarded. A new selector SHALL
be generated only after the prior lifecycle has clearly ended and the shopper
explicitly starts a new creation action. This lifecycle rule SHALL prevent
double-submit but SHALL NOT deduplicate different Products, owners, Carts, or
otherwise distinct creation attempts.

#### Scenario: Rapid duplicate submit is guarded
- **WHEN** the shopper triggers the Local Order creation action multiple times while the same creation request is still in flight
- **THEN** the client uses one creationAttemptId, the server creates at most one Local Order, and no second selector is generated until the current lifecycle reaches a terminal state

#### Scenario: A later explicit action may use a new selector
- **WHEN** a previous creation lifecycle has reached a terminal state and the shopper explicitly starts a new Local Order creation action
- **THEN** the client may generate a different creationAttemptId and the server may create a distinct Local Order according to fresh authority

### Requirement: Local Orders SHALL preserve the current Cart and remain pending payment

Successful Local Order creation SHALL leave the current Cart unchanged because
this change does not authorize, collect, reserve, or confirm payment. Each
created Local Order SHALL present `pending_payment` and `pending` payment state
only. The `pending` value is only a snapshot statement that no payment has
occurred; it does not create or imply a Payment entity, payment attempt,
payment session, PaymentIntent, authorization, capture, or webhook state. Its
local total is a development/test arithmetic summary with tax status
`not_activated` and tax amount `null`; it MUST NOT be described as payable,
charged, price-locked, or payment-authorized.

#### Scenario: Successful Local Order creation does not clear the Cart
- **WHEN** a Local Order is successfully created from a current Cart
- **THEN** the Cart remains available with its existing lines and quantities

#### Scenario: Success UI uses pending-payment language
- **WHEN** the browser receives a successful Local Order result
- **THEN** it presents a development/test pending-payment order summary and does not claim payment success, charging, fulfillment, or delivery

### Requirement: Local Order reading SHALL require same-browser authorization

The Local Order runtime SHALL issue one opaque, HttpOnly, same-site
same-browser access capability for the browser and bind that capability to every
Local Order created by that browser while the local runtime remains alive. The
public-safe Local Order reference SHALL be an identifier, not authorization. A
Local Order read SHALL require both that reference and the matching server
verified browser capability. Creating a later Local Order SHALL extend the
existing capability binding and MUST NOT invalidate access to earlier Orders.
The browser response SHALL contain only the safe public projection needed for
the local success page. Authorization failure, unknown reference, unavailable
local runtime, or post-restart loss MUST return a bounded response without
revealing whether another guest's Order exists.

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
- **WHEN** a local runtime restarts after a Local Order was created
- **THEN** the lost process-memory Local Order is not recreated, guessed, or read from another persistence source

### Requirement: Local Order runtime SHALL be explicitly development/test-only

The Local Order runtime SHALL be enabled only by an explicit local runtime
selection in development or test. An absent selector SHALL not create a hidden
fixture or process-memory Order path, and production mode SHALL reject the
local runtime. The runtime SHALL not call or write Supabase, migrations,
Stripe, PayPal, webhooks, email, shipping providers, production storage,
Admin Orders, or existing production/legacy Order lookup interfaces.

#### Scenario: Production rejects local Order runtime selection
- **WHEN** the Local Order runtime is selected while direct runtime mode is production
- **THEN** the server rejects the selection and does not create a Local Order

#### Scenario: Local Order creation has no business side effects
- **WHEN** a Local Order is successfully created in development/test
- **THEN** it creates only the process-memory Local Order and its local access/idempotency state, without creating an OrderItem database record, payment session, payment intent, webhook event, fulfillment job, email, or provider request

### Requirement: Local Order creation SHALL preserve Local Checkout commercial semantics

The Local Order runtime SHALL fresh-evaluate the current local shipping,
coupon, tax, and total semantics defined by the canonical local-checkout-runtime
capability. A valid coupon SHALL produce a server-derived discount. Invalid,
expired, and not-applicable coupons SHALL produce their bounded status with zero
discount and SHALL not by themselves block Local Order creation. Tax SHALL
remain `not_activated` with amount `null`. The resulting local arithmetic total
is development/test-only and SHALL not become payment or production pricing
authority.

#### Scenario: Non-valid coupon status does not alone block a Local Order
- **WHEN** the authoritative coupon evaluation is invalid, expired, or not applicable while all other Local Order facts are valid
- **THEN** the runtime creates the Local Order with zero discount and the corresponding coupon status

#### Scenario: Tax remains intentionally inactive
- **WHEN** a Local Order is created from an otherwise valid local checkout context
- **THEN** its safe summary reports tax status `not_activated` and tax amount `null` without guessing a tax rate

### Requirement: Local Order verification SHALL distinguish real fixture coverage from deterministic integration coverage

The Local Order runtime verification SHALL preserve the current development
fixture limitation: no public physical shipping-required text-only fixture
exists. Browser acceptance SHALL use the real physical `glass-light-picture`
fixture with image plus optional text customization. Shipping-required text-only
behavior SHALL be proven through deterministic domain/HTTP integration. The
digital `digital-portrait` fixture SHALL NOT be forced through shipping
Checkout, and this change SHALL NOT add Digital Checkout, fake physical text-
only Products, or delivery behavior merely to broaden Local Order test
coverage.

#### Scenario: Browser acceptance uses the real physical image-capable fixture
- **WHEN** Local Order browser acceptance is executed for the physical flow
- **THEN** it uses `glass-light-picture` with its required image path and may include optional text, without fabricating a public physical text-only fixture

#### Scenario: Text-only shipping behavior is covered without changing fixture semantics
- **WHEN** Local Order verification needs a shipping-required text-only case
- **THEN** it uses deterministic domain/HTTP integration rather than repurposing `digital-portrait` or adding a fake physical Product
