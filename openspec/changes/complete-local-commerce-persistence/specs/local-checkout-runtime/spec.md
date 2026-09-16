## MODIFIED Requirements

### Requirement: Local Checkout input boundary

Local Checkout SHALL expose a `/checkout` flow that accepts only contact email, bounded shipping-address fields, a selected local shipping method, and a coupon code as browser input. In `local_fake`, the Day 1 contract remains unchanged: `email`, `firstName`, `lastName`, `country`, `city`, `addressLine1`, and `postalCode` are required; `stateProvince` and `phone` are optional. In explicitly selected `local_persistent`, these physical-address and shipping-method requirements SHALL apply when the freshly resolved server-owned Cart contains physical shipping-required items, including mixed physical/digital Carts. A digital-only Cart SHALL still require valid contact email and bounded validation of any supplied contact fields, but MUST NOT require a physical address, physical shipping method, Shipment, or tracking record. The exemption MUST derive from current server-owned item fulfillment classification, not a browser digital-only flag. Validation is structural and bounded only. `country` MAY select an enabled local shipping allowlist, but the system MUST NOT implement a real postal database, country-wide postcode verification, Google Address API, autocomplete, external normalization, libphonenumber, or another production address provider. The implementation MUST reject malformed or unsafe values and MUST NOT accept browser-submitted price, currency, subtotal, shipping amount, discount amount, tax, final total, SKU availability, customization validity, or upload ownership as authority.

#### Scenario: Valid contact and address
- **WHEN** a shopper submits a valid email and all required address fields for the selected local destination
- **THEN** the checkout input is accepted for fresh server evaluation without treating any browser total as authoritative

#### Scenario: Invalid address
- **WHEN** a required address field for a physical shipping-required Cart is missing, malformed, or outside the bounded input contract
- **THEN** checkout is rejected with a safe validation result and no checkout handoff is created

#### Scenario: Browser total tampering
- **WHEN** the browser includes a product price, subtotal, currency, shipping amount, discount amount, tax, or final total
- **THEN** those values are rejected or ignored and cannot affect the server-owned checkout summary

#### Scenario: Persistent digital-only contact without physical address
- **WHEN** `local_persistent` fresh authority confirms a digital-only Cart and the shopper provides valid bounded contact input without a physical address or shipping method
- **THEN** checkout can evaluate its local summary without inventing an address, physical shipping, Shipment, or tracking requirement

#### Scenario: Persistent mixed Cart still requires physical shipping
- **WHEN** a persistent Cart contains physical shipping-required and digital items but the shopper omits a required physical address field or shipping method, or claims the Cart is digital-only
- **THEN** checkout rejects the missing physical input using server-owned classification while digital-item delivery eligibility remains independent

### Requirement: Fresh Cart and configured-item authority

Local Checkout SHALL read the current server-owned Cart and independently revalidate every usable line before producing a successful summary. Revalidation MUST reuse the existing Catalog, Variant/SKU, ConfiguredItemHandoff, Customization, and CustomerUpload authority boundaries, including Product public eligibility, selected options, availability, authoritative price/currency, quantity, current customization configuration/revision, customization values, and receipt ownership/lifecycle where required. Checkout MUST NOT treat a prior Checkout Readiness result or a Cart display snapshot as authorization or a price lock. In `local_persistent`, Cart, Catalog/SKU/configuration, pricing and shipping/coupon rules, and any required receipt or identity authority SHALL be read from the same independently selected local project. Memory Admin Catalog, hardcoded fixture data, browser snapshots, and another project's records MUST NOT substitute for that authority. Fulfillment classification SHALL be freshly resolved server-side for physical, digital-only, and mixed input rules. Text-only validation MUST remain independent of CustomerUpload activation. Local Order creation MUST separately fresh-read and transactionally revalidate its current authority rather than reuse this evaluation as a persisted authorization.

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

#### Scenario: Persistent authority cannot be substituted
- **WHEN** persistent checkout would resolve a Cart, Catalog/configuration, commercial rule, or required receipt from memory, another project, or an unavailable database
- **THEN** it returns a bounded unavailable/configuration result without substitute data, Cart mutation, or checkout authorization

### Requirement: Local shipping fixture authority

In `local_fake`, Local Checkout SHALL calculate shipping only through an explicit deterministic local fixture marked DEVELOPMENT / TEST ONLY, retaining its database-free fixture behavior. The fixture MUST resolve a bounded destination, method, eligibility, amount, currency, and estimated display range from server-controlled data. In explicitly selected development/test `local_persistent`, the sole alternative SHALL be bounded synthetic shipping rules and their versions read from the same isolated local project's database as Cart and Catalog authority, not a process-memory fixture or Admin Catalog edit. Physical shipping-required items, including those in mixed Carts, MUST match an enabled destination/method and rule eligibility; missing or unavailable rules MUST fail closed without a browser amount or fixture fallback. For persistent digital-only Carts, physical shipping SHALL be explicitly inapplicable with zero contribution to local demo arithmetic, without requiring a destination, shipping method, Shipment, or tracking. Shipping charges in mixed Carts MUST apply only to eligible physical items. Both modes MUST remain labeled DEVELOPMENT / TEST ONLY, MUST NOT claim to be a production carrier quote, supply-chain price, or delivery guarantee, and MUST NOT introduce a production shipping engine. This extension MUST NOT broaden the existing `local_fake` physical fixture coverage or turn a digital fixture into a shipping fixture.

#### Scenario: Eligible local shipping selection
- **WHEN** the submitted destination and selected local method match an enabled development/test fixture in `local_fake`
- **THEN** the server calculates the fixture shipping amount and estimated display range for the authoritative summary

#### Scenario: Unsupported shipping destination or method
- **WHEN** the destination or method is not represented by the enabled local fixture in `local_fake`
- **THEN** checkout is blocked with a bounded shipping-unavailable result and no browser amount is used

#### Scenario: Persistent synthetic shipping rule is authoritative
- **WHEN** a persistent physical or mixed Cart and submitted destination/method match an enabled synthetic shipping rule in the same isolated local database
- **THEN** the server derives physical shipping eligibility, amount, currency, estimated display range, and rule version from that authority without claiming a real carrier quote

#### Scenario: Persistent shipping rules cannot resolve
- **WHEN** a physical shipping-required persistent Cart has no eligible database rule or the required rule authority is unavailable
- **THEN** checkout is blocked with bounded shipping-unavailable/unavailable and does not consult memory fixtures, another database, or a carrier

#### Scenario: Digital-only shipping is inapplicable
- **WHEN** current persistent Cart authority proves all items are digital-only
- **THEN** the summary identifies physical shipping as inapplicable with zero shipping arithmetic contribution, not as a purchased or quoted physical shipping service

### Requirement: Local coupon and tax state

In `local_fake`, Local Checkout MAY evaluate a minimal server-controlled coupon fixture with valid, invalid, expired, and not-applicable outcomes. In `local_persistent`, the same bounded coupon semantics SHALL instead use synthetic coupon rules and their versions from the same isolated local database as the authoritative Cart/Catalog and shipping rules, without adding a production coupon/promotion engine or falling back to a memory fixture. A coupon code SHALL be only a selector; any discount SHALL be calculated by the server and browser-supplied discount values SHALL be ignored. `valid` MAY produce a server-derived discount and continue Checkout. `invalid`, `expired`, and `not_applicable` SHALL produce `discount = 0` with the corresponding status and continue Checkout. Only an internal coupon authority failure that cannot be judged safely MAY produce a bounded unavailable/fail-closed Checkout result. Tax SHALL remain explicitly `tax.status = not_activated` with `tax.amount = null` in both modes in this change, with no guessed rate or computed tax amount. Persisting synthetic commercial rules MUST NOT activate tax, interpret null as assessed zero tax, or create a real tax calculation or numeric tax allocation.

#### Scenario: Valid local coupon
- **WHEN** the submitted coupon code matches an eligible development/test fixture in `local_fake` and the authoritative Cart qualifies
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

#### Scenario: Persistent coupon uses database rules
- **WHEN** a persistent checkout evaluates a coupon selector against the same project's current synthetic rules and authoritative Cart
- **THEN** it returns the server-derived valid discount or the existing invalid/expired/not_applicable zero-discount result with rule-version evidence, without using a browser discount or memory fixture

#### Scenario: Persistent rule storage does not activate tax
- **WHEN** persistent shipping and coupon rules resolve successfully
- **THEN** tax still has status `not_activated` and amount `null`, not an assessed zero or calculated tax amount, and no tax allocation or production tax-provider call occurs

### Requirement: Authoritative Local Checkout summary and handoff

After fresh validation succeeds, Local Checkout SHALL return a bounded authoritative summary containing the resolved line items, subtotal, local shipping result, discount result, `tax.status = not_activated`, `tax.amount = null`, `localDemoTotal = subtotal + shipping - discount`, and currency. `localDemoTotal` is development/test arithmetic only, excludes tax, and MUST NOT be labeled or described as Amount Due, Payable Total, Charged Total, payment amount, payable authorization, price lock, or Order authorization. The summary MUST be derived server-side from current authority and MAY produce an `AcceptedCheckout` or equivalent non-order handoff. `AcceptedCheckout` SHALL be a server-only, non-durable evaluation result: it MUST NOT be a database entity, repository record, persisted checkout session, durable checkout ID, browser authorization token, Order authority, or Payment authority. The HTTP response MAY expose only a safe public projection. A future Local Order change MUST fresh-read current server authority rather than trust a browser round-trip of this result. These constraints SHALL apply unchanged to `local_persistent`: durable input authorities MUST NOT make the summary/handoff durable or authorize payment. A persistent digital-only shipping result SHALL contribute zero to this arithmetic as inapplicable, while a mixed Cart SHALL include the applicable physical shipping result. Tax null MUST remain an explicit inactive state, not a numeric tax amount included in the total.

#### Scenario: Successful summary
- **WHEN** every usable Cart line, contact/address input, local shipping selection, coupon outcome, and explicit tax state passes the applicable rules
- **THEN** checkout returns a server-derived summary and non-order handoff with no browser-controlled amount

#### Scenario: Local demo arithmetic summary
- **WHEN** current line authority, local shipping, and the coupon status can be safely evaluated, including an invalid, expired, or not-applicable coupon
- **THEN** checkout continues with `localDemoTotal` and tax still `not_activated`, and the UI identifies the amount as local development/test arithmetic only

#### Scenario: Missing base or commercial authority
- **WHEN** required current line/base-price/currency authority or local shipping authority cannot safely resolve
- **THEN** checkout returns a bounded blocked or unavailable result and does not claim a payable or order-ready total

#### Scenario: Persistent inputs do not persist AcceptedCheckout
- **WHEN** an evaluation succeeds using persistent Cart, Catalog, commercial rules, and required receipt authority
- **THEN** only the bounded evaluation projection is returned; no durable checkout session/ID or `AcceptedCheckout` record is created and a later Order must independently revalidate current authority

### Requirement: Checkout has no business side effects

Successful or rejected Local Checkout evaluation MUST NOT create or update an Order, OrderItem, Payment, payment session, webhook state, inventory reservation, production record, upload attachment, or durable Cart record. This change MUST NOT call Stripe, PayPal, payment webhooks, remote Supabase, or any production provider. In `local_persistent`, read-only access to the selected independent Docker local Supabase project's Cart, Catalog/configuration, synthetic shipping/coupon rules, and required identity/receipt/private-media authority SHALL be the only persistence-access exception for evaluation. Such reads MUST NOT save an `AcceptedCheckout`, rewrite a Cart/draft, consume/attach/renew a receipt, grant new ownership, execute migrations/seeds, or invoke a business write command. Independently enabled Order creation and subsequent simulated payment remain separate boundaries, not side effects of Checkout.

#### Scenario: Successful checkout remains pre-order
- **WHEN** a valid Local Checkout summary is produced
- **THEN** no Order, Payment, inventory, upload-attachment, or production side effect is created

#### Scenario: Rejected checkout remains side-effect free
- **WHEN** checkout fails due to empty Cart, stale catalog, invalid customization, invalid address, shipping failure, coupon authority failure, or another unavailable dependency
- **THEN** no Order, Payment, Cart rewrite, upload attachment, or other business mutation occurs

#### Scenario: Persistent evaluation is read-only
- **WHEN** successful and rejected evaluations run against the selected persistent project
- **THEN** no Cart/version/draft, receipt lifecycle, ownership binding, Order, Payment, or durable checkout state changes and no seed or migration is executed

### Requirement: CustomerUpload ownership and restart fail-closed

Local Checkout SHALL preserve the existing verified owner-scoped CustomerUpload receipt authority. Email, shipping address, Cart identity, Customer Auth identity, receipt ID alone, browser owner data, localStorage, or a restarted runtime MUST NOT prove upload ownership or resurrect an old receipt. When process-local receipt state is lost after restart in `local_fake`, image checkout MUST fail closed. In `local_persistent`, checkout SHALL instead freshly verify the original valid signed guest-owner authority and its active eligible receipt/private-media state from the same independent local project. Persisted state MAY survive restart but MUST NOT extend expiry, undo revocation, revive consumed or cleanup-claimed receipts, or mint ownership from contact or customer identity. Missing database/Storage or invalid owner authority MUST fail closed without memory, filesystem, browser, or alternate-project reconstruction.

#### Scenario: Receipt ownership cannot be replaced by checkout identity
- **WHEN** an image line has an email, address, or Cart identity but no currently verified owner-scoped active receipt
- **THEN** checkout rejects the image line without exposing whether another owner has a matching receipt

#### Scenario: Runtime restart loses image receipt
- **WHEN** an image receipt was created by the `local_fake` process and the process restarts before checkout validation
- **THEN** checkout rejects the image line safely and does not use a fake receipt or filesystem resurrection

#### Scenario: Persistent receipt remains verifiable after restart
- **WHEN** a new application process uses the same persistent project and the browser presents its original valid signed guest-owner authority for an active eligible receipt and ready private media
- **THEN** checkout may revalidate that receipt without a replacement upload or ownership grant, while the checkout result itself remains non-durable

#### Scenario: Persistent bytes do not restore expired or consumed authority
- **WHEN** private bytes exist but the original guest authorization is invalid/expired, the receipt is revoked/consumed/cleanup-claimed, or required persistent authority is unavailable
- **THEN** image checkout fails safely without disclosing another owner's media or reconstructing receipt eligibility

### Requirement: Safe Local Checkout HTTP and privacy boundary

The Local Checkout HTTP surface SHALL enforce the existing same-origin mutation conventions, parse and bound browser input before privileged authority construction, and project only safe checkout results. Responses MUST NOT expose owner IDs, guest-owner tokens, storage keys, bucket names, provider locators, private object paths, receipt internals, configured handoffs, SQL/provider diagnostics, secrets, or cookies. These restrictions SHALL apply equally to `local_fake` and `local_persistent`; browser input MUST NOT select a backend, database project, or rule authority.

#### Scenario: Unauthorized or cross-origin mutation
- **WHEN** a checkout mutation is missing the required same-origin protection or is cross-origin
- **THEN** it is rejected before checkout authority construction or business mutation

#### Scenario: Safe provider failure
- **WHEN** a Cart, Catalog, Customization, CustomerUpload, shipping, or coupon authority fails with internal diagnostics
- **THEN** the response uses a bounded public failure and omits raw errors, provider names, storage metadata, owner data, and secrets

### Requirement: Development-only runtime boundary

Local Checkout SHALL require explicit server-only `LOCAL_CHECKOUT_SOURCE=local_fake` or `LOCAL_CHECKOUT_SOURCE=local_persistent` in recognized development/test runtimes. Absent or `disabled` selection SHALL leave checkout unavailable; invalid values SHALL fail closed. Local Checkout fixtures and process-memory adapters SHALL remain selectable only through `local_fake` in development/test, explicitly labeled non-production and database-free for offline evaluation. Production or an absent local-fixture selection MUST NOT silently activate fixture checkout, and failure of an authoritative source MUST NOT fall back to a fixture. `local_persistent` SHALL be rejected in staging, production, or unknown environments and SHALL require exact configured loopback endpoints, project identity, and database marker for the independent Docker local Supabase project. Its Cart, `PHOTOGIFT_PRODUCT_SOURCE=local_persistent` Catalog/configuration, synthetic shipping/coupon rules, and any required upload/auth authorities MUST share that project and compatible source mode. Missing configuration, project/mode mismatch, or required database/Storage failure MUST return bounded unavailable without fallback to memory, legacy data, hosted Supabase, or another project. Selecting Cart, Catalog, Auth, Upload, or Admin alone MUST NOT activate Checkout, and selecting Checkout MUST NOT silently activate those dependencies, Order, Payment, or other capabilities. Existing `local_fake` fixture coverage and restart-loss semantics MUST remain unchanged; physical browser fixture coverage continues to use the real image-capable fixture, shipping-required text-only coverage remains deterministic integration, and no fake digital Product is repurposed into physical shipping coverage.

#### Scenario: Development fixture activation
- **WHEN** the runtime is development or test and the explicitly configured `local_fake` checkout source is selected
- **THEN** the deterministic local Cart, CustomerUpload, shipping, and coupon fixtures may be used for offline evaluation

#### Scenario: Production fixture rejection
- **WHEN** the runtime is production or no local fixture source is explicitly selected
- **THEN** fixture checkout is rejected or unavailable and an authoritative-source failure never falls back to fixtures

#### Scenario: Explicit same-project persistent checkout
- **WHEN** development/test explicitly selects persistent Checkout, persistent Product/Cart, and all other required persistent authorities with matching loopback project identity and database marker
- **THEN** checkout reads only that project's synthetic authority and returns a non-production read-only evaluation with no production activation

#### Scenario: Persistent source is forbidden or inconsistent
- **WHEN** persistent Checkout is selected in staging/production/unknown runtime, targets a remote or mismatched project, mixes fixture/memory dependencies, or cannot reach required local authority
- **THEN** evaluation fails closed before substitute authority or business mutation and does not fall back to `local_fake`

#### Scenario: Other local sources do not activate Checkout
- **WHEN** Cart, Catalog, Upload, Auth, or Admin is enabled but the Checkout source is absent or disabled
- **THEN** checkout remains unavailable and no fixture or persistent checkout is implicitly constructed