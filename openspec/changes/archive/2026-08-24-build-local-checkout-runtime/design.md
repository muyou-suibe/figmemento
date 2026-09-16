## Context

The completed pre-checkout baseline already has a server-owned local Cart, configured-item acceptance, Catalog/Variant authority, Customization validation, owner-scoped CustomerUpload receipts, and a read-only `GET /api/checkout-readiness`. The archived readiness contract explicitly remains non-authorizing and does not provide price locking, shipping, tax, discount, payment, or Order capability.

The current repository also contains order-oriented compatibility seams such as `order-catalog-resolution`, `normalized-order-request-boundary`, `configured-item-order-compatibility`, and `legacy-order-compatibility`. They are future handoff boundaries, not permission to create an Order in this change. The active Customization and C1 changes remain deferred; this design relies only on boundaries present in the current code and verified tests.

## Goals / Non-Goals

**Goals:**

- Add a narrow local `/checkout` experience and a server-only checkout evaluation boundary.
- Read the current Cart from the existing Cart cookie/provider and revalidate every usable line against current Catalog, Variant, Customization, and CustomerUpload authority.
- Calculate a deterministic local-only shipping result and minimal local coupon result on the server; invalid, expired, and not-applicable coupon statuses return zero discount and do not block Checkout.
- Return a safe, server-derived summary with `tax.status = not_activated`, `tax.amount = null`, a non-taxed `localDemoTotal`, and a non-order checkout handoff.
- Keep browser input, same-origin protection, safe errors, private receipt ownership, and process-restart behavior fail-closed.
- Keep the implementation offline and deterministic so it can be tested without Supabase or other providers.

**Non-Goals:**

- No Order, OrderItem, order snapshot, payment session, Stripe, PayPal, webhook, inventory reservation, production record, or upload attachment.
- No database schema, migration, remote Supabase access, production Cart/CustomerUpload persistence, or storage-provider decision.
- No production shipping engine, carrier quote, supply-chain price, delivery guarantee, real tax engine, or production discount authority.
- No new Cart, Product, Variant, Customization, or CustomerUpload authority model and no second order DTO.
- No authentication change, email sending, tracking, DNS, Cloudflare deployment, R2, Supabase Storage, or C1 backfill.

## Decisions

### 1. Compose existing authority boundaries

The new server evaluator will read the current server-owned Cart through the existing Cart runtime and use each CartLine's configured-item handoff only as an input claim. It will re-run the existing configured-item acceptance boundary with a server-derived verified owner context for image receipts. Catalog and Variant prices, currency, availability, Product eligibility, selected options, current Customization configuration/revision, values, and receipt lifecycle remain authoritative in their existing repositories.

This is preferred over a new `CheckoutCart`, `CheckoutProduct`, `CheckoutVariant`, `CheckoutCustomization`, or `CheckoutReceipt` model because the repository already has the required acceptance and privacy boundaries. The Cart display projection and the earlier readiness report are comparison/observation data only; neither is a checkout authorization.

### 2. Separate Checkout Readiness from Checkout evaluation

`GET /api/checkout-readiness` remains read-only and unchanged. The new checkout mutation will have its own request parser and server evaluation path, likely exposed as a same-origin `POST /api/checkout`, while `/checkout` provides the local UI. It will read the Cart again and will not reuse a previous readiness response as a cache, lock, or authorization.

The request parser accepts only email, bounded address fields, a local shipping-method selector, and a coupon selector. For Day 1, email, firstName, lastName, country, city, addressLine1, and postalCode are required; stateProvince and phone are optional. This is structural validation only: country can select a local fixture allowlist, but no postal database, address API, autocomplete, external normalization, or phone-number library is introduced. The parser rejects or ignores browser monetary fields before any privileged authority is constructed.

### 3. Use a non-order checkout result

The result will be a new narrow local checkout summary/handoff type rather than an existing normalized order request. The existing normalized order boundary is intentionally order-shaped and future-facing; using it here would blur the no-Order boundary and could imply that Order persistence is ready. The new result contains only the validated local checkout inputs, independently resolved line summary, subtotal, shipping result, coupon status/discount result, `tax.status = not_activated`, `tax.amount = null`, `localDemoTotal = subtotal + shipping - discount`, and currency needed for the local screen. `localDemoTotal` is development/test arithmetic only and is never payable, charged, payment, price-lock, or Order authority.

`AcceptedCheckout` or its equivalent is a server-only, non-durable evaluation result. It is not a database entity, repository record, persisted checkout session, durable checkout ID, browser authorization token, Order authority, or Payment authority; HTTP returns only a safe public projection. A later Local Checkout → Local Order change must fresh-read current server authority and decide how to map the current facts into the existing order compatibility seams rather than trust a browser round-trip of this result.

### 4. Deterministic local commercial fixtures

Shipping and coupon are injected local adapters selected only in development/test. Shipping resolves a bounded destination and method to a fixture amount and display lead-time/range label; it never represents a real carrier or supplier quote. Coupon evaluation supports valid, invalid, expired, and not-applicable fixture outcomes and calculates any discount from server-owned current line facts. A valid coupon may discount and continue; invalid, expired, and not-applicable outcomes return zero discount and continue; only an internal coupon authority failure can produce a bounded unavailable/fail-closed result.

Tax is represented as `tax.status = not_activated` and `tax.amount = null` and does not block a local summary. Mixed currencies or unresolved base-price/currency/shipping authority fail closed; no FX conversion, guessed tax behavior, or payable-total claim is added.

The fixtures are kept behind the local runtime boundary and are not a fallback for a failed authoritative Catalog, Cart, Customization, or CustomerUpload source. Production or absent fixture configuration rejects local checkout rather than silently selecting fixtures.

### 4a. Fixture coverage and verification evidence

The current public development fixtures intentionally do not include a physical, shipping-required, text-only Product. `couple-figure` is physical and shipping-required with image customization; `glass-light-picture` is physical and shipping-required with image plus optional short-text customization; `digital-portrait` is text-only but digital and not shipping-required. This is a fixture coverage limitation, not a change to the Local Checkout contract.

The valid text-only configured-item rule remains required and is verified with a deterministic shipping-required domain/HTTP integration fixture: it must pass fresh checkout validation without CustomerUpload owner or receipt authority. Browser acceptance instead uses the real shipping-eligible `glass-light-picture` fixture for the physical image-plus-text path and its owner-scoped receipt revalidation. This change does not fabricate a physical text-only Product, repurpose `digital-portrait` for shipping checkout, or introduce a digital checkout, delivery, or fulfillment-aware checkout branch.

### 5. Side-effect-free evaluation

The evaluator is read-only with respect to business state. It may read the process-local Cart and receipt repositories, but it does not create or update a Cart, attach receipts, persist a handoff, write an Order, or call a payment/provider API. Rejected requests have the same no-mutation guarantee.

### 6. Security and privacy

The route will apply the existing same-origin convention before mutation evaluation, parse and bound request input before privileged construction, and map failures to a small public vocabulary. The response contains no Cart cookie, owner ID, guest-owner token, receipt ID, storage key, bucket, provider locator, private path, raw configured handoff, provider diagnostic, SQL detail, or secret.

CustomerUpload verification remains independent from checkout email, address, Cart identity, and Customer Auth identity. A process restart may remove local receipt state; a subsequent image checkout must fail closed rather than resurrecting a receipt through localStorage, filesystem state, or a fake fallback.

### 7. Compatibility and future handoff

The implementation will preserve the current Cart line identity and configured-copy semantics. It will use the existing `order-catalog-resolution` and `configured-item-order-compatibility` code only as audited future handoff references, not as an Order write path. The current `normalized-order-request-boundary` requires an order-oriented input/owner contract and therefore is not invoked to claim an Order in this change.

### 8. Alternatives considered

- **Treat Checkout Readiness as authorization:** rejected because the canonical readiness spec explicitly forbids this and the result can become stale.
- **Trust the Cart display snapshot:** rejected because price, currency, SKU, Customization, and upload facts require fresh server validation.
- **Build a second checkout Cart/domain graph:** rejected because it would duplicate authority and risk divergent privacy/validation behavior.
- **Create a local Order to demonstrate completion:** rejected because Order persistence and snapshots belong to a later change and are blocked by deferred C1/customization work.
- **Use remote Supabase or a storage provider:** rejected by the Local-only and production stop gates.

## Risks / Trade-offs

- **[Process-memory restart]** Local Cart and CustomerUpload fixtures are not durable; → document restart behavior and test old image receipts as fail-closed.
- **[Fixture commercial values are not production truth]** A local shipping or coupon result could be misread as a real quote; → label every fixture as DEVELOPMENT / TEST ONLY and keep production fixture activation rejected.
- **[Catalog changes during checkout]** Current Product/SKU facts can differ from Cart display facts; → revalidate immediately before summary and block stale lines without rewriting Cart.
- **[Tax is unresolved]** Tax is not activated; → expose `tax.status = not_activated`, `tax.amount = null`, calculate only `localDemoTotal`, and do not invent a tax rate or claim payment readiness.
- **[Fixture coverage limitation]** No public physical text-only fixture currently exists; → retain deterministic text-only integration evidence, use the real physical image-plus-text fixture for browser acceptance, and do not alter fulfillment semantics merely to manufacture a browser case.
- **[Future Order mapping]** The local handoff is not an Order request; → keep the future Local Checkout → Local Order mapping as a separate change using current order compatibility boundaries.

## Migration Plan

No migration or deployment plan is required for this local-only change. Implementation is limited to application/runtime code, offline fixtures, tests, and local documentation. Rollback is removal/reversion of those local checkout artifacts; there is no remote schema or record state to roll back.

## Open Questions

None that change the approved contract or architecture. The exact deterministic fixture code, local shipping label, and sample development coupon values may be selected during implementation as test data, provided they remain explicitly non-production and do not imply a real rate or tax policy.
