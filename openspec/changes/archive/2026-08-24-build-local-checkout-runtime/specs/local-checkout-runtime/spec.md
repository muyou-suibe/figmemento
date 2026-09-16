## Purpose

Provide a development/test-only Local Checkout boundary that revalidates the current server-owned Cart and configured customer inputs, calculates a safe local summary, and stops before Order, Payment, or production side effects.

## ADDED Requirements

### Requirement: Local Checkout input boundary

Local Checkout SHALL expose a `/checkout` flow that accepts only contact email, bounded shipping-address fields, a selected local shipping method, and a coupon code as browser input. For Day 1, `email`, `firstName`, `lastName`, `country`, `city`, `addressLine1`, and `postalCode` are required; `stateProvince` and `phone` are optional. Validation is structural and bounded only. `country` MAY select an enabled local shipping allowlist, but the system MUST NOT implement a real postal database, country-wide postcode verification, Google Address API, autocomplete, external normalization, libphonenumber, or another production address provider. The implementation MUST reject malformed or unsafe values and MUST NOT accept browser-submitted price, currency, subtotal, shipping amount, discount amount, tax, final total, SKU availability, customization validity, or upload ownership as authority.

#### Scenario: Valid contact and address
- **WHEN** a shopper submits a valid email and all required address fields for the selected local destination
- **THEN** the checkout input is accepted for fresh server evaluation without treating any browser total as authoritative

#### Scenario: Invalid address
- **WHEN** a required address field is missing, malformed, or outside the bounded input contract
- **THEN** checkout is rejected with a safe validation result and no checkout handoff is created

#### Scenario: Browser total tampering
- **WHEN** the browser includes a product price, subtotal, currency, shipping amount, discount amount, tax, or final total
- **THEN** those values are rejected or ignored and cannot affect the server-owned checkout summary

### Requirement: Fresh Cart and configured-item authority

Local Checkout SHALL read the current server-owned Cart and independently revalidate every usable line before producing a successful summary. Revalidation MUST reuse the existing Catalog, Variant/SKU, ConfiguredItemHandoff, Customization, and CustomerUpload authority boundaries, including Product public eligibility, selected options, availability, authoritative price/currency, quantity, current customization configuration/revision, customization values, and receipt ownership/lifecycle where required. Checkout MUST NOT treat a prior Checkout Readiness result or a Cart display snapshot as authorization or a price lock.

#### Scenario: Empty Cart
- **WHEN** checkout is requested with no current Cart or with a Cart containing no usable lines
- **THEN** checkout fails safely with an empty-cart result and creates no checkout handoff or side effect

#### Scenario: Valid text-only configured item
- **WHEN** a current Cart contains a valid text-only configured item whose Product, Variant, Customization, quantity, and price authority pass fresh validation
- **THEN** the line is included in the local checkout summary without requiring CustomerUpload receipt authority

#### Scenario: Valid image configured item
- **WHEN** a current Cart contains a valid image configured item
- **THEN** the line is included only after the existing verified owner-scoped CustomerUpload receipt authority confirms each required receipt is active and valid

#### Scenario: Stale Product or SKU
- **WHEN** current Product eligibility, Variant identity, selected options, availability, price, or currency differs from the Cart snapshot or current configured handoff
- **THEN** checkout is blocked with a bounded stale or unavailable result and does not rewrite the Cart

### Requirement: Local shipping fixture authority

Local Checkout SHALL calculate shipping only through an explicit deterministic local fixture marked DEVELOPMENT / TEST ONLY. The fixture MUST resolve a bounded destination, method, eligibility, amount, currency, and estimated display range from server-controlled data. It MUST NOT claim to be a production carrier quote, supply-chain price, or delivery guarantee, and it MUST NOT introduce a production shipping engine.

#### Scenario: Eligible local shipping selection
- **WHEN** the submitted destination and selected local method match an enabled development/test fixture
- **THEN** the server calculates the fixture shipping amount and estimated display range for the authoritative summary

#### Scenario: Unsupported shipping destination or method
- **WHEN** the destination or method is not represented by the enabled local fixture
- **THEN** checkout is blocked with a bounded shipping-unavailable result and no browser amount is used

### Requirement: Local coupon and tax state

Local Checkout MAY evaluate a minimal server-controlled coupon fixture with valid, invalid, expired, and not-applicable outcomes. A coupon code SHALL be only a selector; any discount SHALL be calculated by the server and browser-supplied discount values SHALL be ignored. `valid` MAY produce a server-derived discount and continue Checkout. `invalid`, `expired`, and `not_applicable` SHALL produce `discount = 0` with the corresponding status and continue Checkout. Only an internal coupon authority failure that cannot be judged safely MAY produce a bounded unavailable/fail-closed Checkout result. Tax SHALL remain explicitly `tax.status = not_activated` with `tax.amount = null` in this change, with no guessed rate or computed tax amount.

#### Scenario: Valid local coupon
- **WHEN** the submitted coupon code matches an eligible development/test fixture and the authoritative Cart qualifies
- **THEN** the server derives the bounded fixture discount and includes it in the summary

#### Scenario: Invalid coupon
- **WHEN** the submitted coupon code is invalid
- **THEN** checkout returns `status = invalid` and `discount = 0`, does not trust a browser discount, and continues subject only to other independent Checkout rules

#### Scenario: Expired coupon
- **WHEN** the submitted coupon code is expired
- **THEN** checkout returns `status = expired` and `discount = 0`, does not trust a browser discount, and continues subject only to other independent Checkout rules

#### Scenario: Not-applicable coupon
- **WHEN** the submitted coupon code is not applicable to the authoritative Cart
- **THEN** checkout returns `status = not_applicable` and `discount = 0`, does not trust a browser discount, and continues subject only to other independent Checkout rules

#### Scenario: Coupon authority unavailable
- **WHEN** the coupon authority cannot safely determine a status
- **THEN** checkout returns a bounded unavailable or fail-closed result without inventing a discount

#### Scenario: Tax not activated
- **WHEN** checkout evaluates a summary in this change
- **THEN** tax is represented exactly as `status = not_activated` and `amount = null`, and no tax rate is invented or required for the local arithmetic summary

### Requirement: Authoritative Local Checkout summary and handoff

After fresh validation succeeds, Local Checkout SHALL return a bounded authoritative summary containing the resolved line items, subtotal, local shipping result, discount result, `tax.status = not_activated`, `tax.amount = null`, `localDemoTotal = subtotal + shipping - discount`, and currency. `localDemoTotal` is development/test arithmetic only, excludes tax, and MUST NOT be labeled or described as Amount Due, Payable Total, Charged Total, payment amount, payable authorization, price lock, or Order authorization. The summary MUST be derived server-side from current authority and MAY produce an `AcceptedCheckout` or equivalent non-order handoff. `AcceptedCheckout` SHALL be a server-only, non-durable evaluation result: it MUST NOT be a database entity, repository record, persisted checkout session, durable checkout ID, browser authorization token, Order authority, or Payment authority. The HTTP response MAY expose only a safe public projection. A future Local Order change MUST fresh-read current server authority rather than trust a browser round-trip of this result.

#### Scenario: Successful summary
- **WHEN** every usable Cart line, contact/address input, local shipping selection, coupon outcome, and explicit tax state passes the applicable rules
- **THEN** checkout returns a server-derived summary and non-order handoff with no browser-controlled amount

#### Scenario: Local demo arithmetic summary
- **WHEN** current line authority, local shipping, and the coupon status can be safely evaluated, including an invalid, expired, or not-applicable coupon
- **THEN** checkout continues with `localDemoTotal` and tax still `not_activated`, and the UI identifies the amount as local development/test arithmetic only

#### Scenario: Missing base or commercial authority
- **WHEN** required current line/base-price/currency authority or local shipping authority cannot safely resolve
- **THEN** checkout returns a bounded blocked or unavailable result and does not claim a payable or order-ready total

### Requirement: Checkout has no business side effects

Successful or rejected Local Checkout evaluation MUST NOT create or update an Order, OrderItem, Payment, payment session, webhook state, inventory reservation, production record, upload attachment, or durable Cart record. This change MUST NOT call Stripe, PayPal, payment webhooks, remote Supabase, or any production provider.

#### Scenario: Successful checkout remains pre-order
- **WHEN** a valid Local Checkout summary is produced
- **THEN** no Order, Payment, inventory, upload-attachment, or production side effect is created

#### Scenario: Rejected checkout remains side-effect free
- **WHEN** checkout fails due to empty Cart, stale catalog, invalid customization, invalid address, shipping failure, coupon authority failure, or another unavailable dependency
- **THEN** no Order, Payment, Cart rewrite, upload attachment, or other business mutation occurs

### Requirement: CustomerUpload ownership and restart fail-closed

Local Checkout SHALL preserve the existing verified owner-scoped CustomerUpload receipt authority. Email, shipping address, Cart identity, Customer Auth identity, receipt ID alone, browser owner data, localStorage, or a restarted runtime MUST NOT prove upload ownership or resurrect an old receipt. When process-local receipt state is lost after restart, image checkout MUST fail closed.

#### Scenario: Receipt ownership cannot be replaced by checkout identity
- **WHEN** an image line has an email, address, or Cart identity but no currently verified owner-scoped active receipt
- **THEN** checkout rejects the image line without exposing whether another owner has a matching receipt

#### Scenario: Runtime restart loses image receipt
- **WHEN** an image receipt was created by the local process and the process restarts before checkout validation
- **THEN** checkout rejects the image line safely and does not use a fake receipt or filesystem resurrection

### Requirement: Safe Local Checkout HTTP and privacy boundary

The Local Checkout HTTP surface SHALL enforce the existing same-origin mutation conventions, parse and bound browser input before privileged authority construction, and project only safe checkout results. Responses MUST NOT expose owner IDs, guest-owner tokens, storage keys, bucket names, provider locators, private object paths, receipt internals, configured handoffs, SQL/provider diagnostics, secrets, or cookies.

#### Scenario: Unauthorized or cross-origin mutation
- **WHEN** a checkout mutation is missing the required same-origin protection or is cross-origin
- **THEN** it is rejected before checkout authority construction or business mutation

#### Scenario: Safe provider failure
- **WHEN** a Cart, Catalog, Customization, CustomerUpload, shipping, or coupon authority fails with internal diagnostics
- **THEN** the response uses a bounded public failure and omits raw errors, provider names, storage metadata, owner data, and secrets

### Requirement: Development-only runtime boundary

Local Checkout fixtures and process-memory adapters SHALL be selectable only in development or test runtimes and SHALL be explicitly labeled as non-production. Production or an absent local-fixture selection MUST NOT silently activate fixture checkout, and failure of an authoritative source MUST NOT fall back to a fixture.

#### Scenario: Development fixture activation
- **WHEN** the runtime is development or test and the explicitly configured local checkout source is selected
- **THEN** the deterministic local Cart, CustomerUpload, shipping, and coupon fixtures may be used for offline evaluation

#### Scenario: Production fixture rejection
- **WHEN** the runtime is production or no local fixture source is explicitly selected
- **THEN** fixture checkout is rejected or unavailable and an authoritative-source failure never falls back to fixtures
