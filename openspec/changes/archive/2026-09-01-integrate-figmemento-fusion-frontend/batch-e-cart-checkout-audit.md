# Fusion Frontend Batch E — Cart and Local Checkout Audit

## Scope

This batch integrates the Fusion presentation language into the real `/cart`
and `/checkout` routes. It is presentation-only: the existing Cart API,
configured-item handoff, CustomerUpload receipt boundary, Local Checkout
evaluator, local shipping fixture, coupon authority, tax state, Local Order
button, and all upstream lifecycle boundaries remain unchanged.

## Current Cart Map

| Boundary | Existing authority and presentation owner |
| --- | --- |
| Route | `app/cart/page.tsx` renders the real `CartExperience` inside `CatalogShell`. |
| Cart read | `GET /api/cart` returns the server-owned process-local Cart projection. |
| Line identity | Existing `lineId` and configured-item copy identity remain server-owned; no two configured copies are merged by the visual layer. |
| Quantity | `PATCH /api/cart/items/:lineId` receives only the requested quantity; the returned Cart projection replaces browser state. |
| Remove / clear | Existing `DELETE` operations remain the only mutation paths for line removal and clearing. |
| Price / subtotal | Product/Variant-aware Cart response remains authoritative; the UI formats returned `unitPriceCents`, line subtotal, currency, and Cart subtotal. |
| Upload summary | Cart shows only the existing safe personalization summary, such as an image count; it does not render receipt, owner, storage, or private object metadata. |
| Readiness | `GET /api/checkout-readiness` remains a separate read-only observation and is labeled as non-authorization. |

## Current Checkout Map

| Boundary | Existing authority and presentation owner |
| --- | --- |
| Route | `app/checkout/page.tsx` renders the real `LocalCheckoutExperience`. |
| Fresh evaluation | `POST /api/checkout` re-reads the current Cart and server dependencies for every review. |
| Address | Existing bounded local structural parser; no production address provider or postal database is introduced. |
| Shipping | Existing development/test `local_standard` fixture and unsupported-selection failure remain server-derived. |
| Coupon | Existing server coupon authority derives valid discounts and keeps invalid, expired, and not-applicable results non-blocking. |
| Tax | `not_activated` / `null` semantics remain visible. |
| Summary | Existing `localDemoTotal` arithmetic remains development/test-only and explicitly non-payable. |
| Downstream action | The pre-existing Local Order action remains unchanged and is not part of this presentation batch. It was not clicked during acceptance. |

## Cart Visual Parity

- The real Cart now uses a scoped Fusion editorial wrapper, serif headline,
  paper line-item cards, newspaper rule, gold edge, responsive quantity/remove
  action row, and warm summary/readiness cards.
- The two summary surfaces remain distinct: Cart subtotal is display-only;
  pre-checkout readiness remains a read-only observation.
- Empty, unavailable, stale, and mutation-error states retain their existing
  safe copy and receive the same paper/status treatment.
- Quantity controls, Remove, Clear cart, and Review local checkout remain the
  existing native controls and real destinations.

## Checkout Design-System Extension

- The real Local Checkout uses a scoped Fusion editorial heading and a
  responsive form/summary composition.
- Fieldsets use the existing native labels and controls with Fusion rules,
  paper surfaces, focus rings, and minimum touch targets.
- The summary is a dark-ink paper ledger that keeps line items, server-derived
  shipping fixture, coupon status/discount, tax-not-activated state, and local
  demo total legible without changing their meaning.
- Success, blocked, unavailable, and tax-not-activated feedback remain the
  existing safe public projections and are visually separated from the form.

## Cart Authority

The visual integration does not calculate or accept browser authority for
Product, Variant/SKU, currency, price, quantity validity, configured-item
identity, personalization, upload receipts, or readiness. Every successful
Cart mutation renders the returned server Cart projection and then emits the
existing payload-free cart presentation event.

## Checkout Authority

The visual integration does not derive a payable amount, create an Order, take
Payment, or persist a Checkout session. The form submits the existing public
input boundary, and the response is rendered as the existing safe projection.
The pre-existing Local Order button is intentionally not part of Batch E and
was not used in browser acceptance.

## Price / Shipping / Coupon / Tax Boundary

- Cart prices and subtotal are formatted from the server Cart projection.
- Checkout subtotal, shipping, discount, currency, and local demo total are
  formatted from the accepted server projection.
- Shipping is a development/test fixture only.
- Coupon status is server-derived; an invalid coupon displayed `$0.00` and
  did not block the otherwise valid local review.
- Tax displays `Not activated`; the local demo total is explicitly not
  payable, charged, or an Order total.
- No value is labeled Amount Due, Payable Total, or Charged Total.

## CustomerUpload Privacy

Cart displays only the safe configured-item personalization summary already
provided by the Cart projection. It does not expose CustomerUpload receipt
IDs, owners, object keys, storage buckets, signed URLs, filenames, or private
preview data. Checkout similarly consumes only the existing image-line
acceptance boundary and public summary fields.

## Reference Claim Firewall

The reference HTML supplied visual grammar only. No reference-only product,
rating, review, free-shipping, delivery, discount, payment, or production
claim was added to Cart or Checkout. Existing local fixture wording remains
visible and clearly marked as development/test. The current catalog still has
no public physical shipping-required text-only fixture; text-only capability
remains covered by deterministic domain/HTTP evidence. The real physical
browser acceptance uses an existing physical fixture; Digital Checkout was
not implemented.

## Responsive Evidence

- Desktop layout uses a two-column editorial form/summary composition without
  document horizontal overflow.
- At 375px the Cart and Checkout layouts collapse to one column, preserve
  visible form labels, keep the primary action usable, and keep summary
  content within the viewport.
- Quantity, Remove, Clear cart, and form controls retain at least the existing
  44px touch target where applicable.
- Hover lift is disabled for coarse pointers and transitions are disabled for
  reduced-motion users.

## Browser Evidence

The real local development Worker was used at `http://localhost:3001`; no
remote Supabase request was made. The following acceptance steps used the
existing physical `couple-figure` flow and its existing local CustomerUpload
boundary:

- **Cart independent copies:** two explicit Add to cart actions produced two
  separate `DEV-COUPLE-FIGURE-MINI` lines, each quantity 1, with server Cart
  subtotal `$139.80`.
- **Quantity:** the first line changed `1 → 2 → 1`; line subtotal and Cart
  subtotal changed to `$139.80` and back without changing the other line.
- **Remove:** one Remove action left one line, subtotal `$69.90`, and the
  header changed to `Cart, 1 item`.
- **Clear / empty:** a fresh two-line Cart was cleared; the empty Cart copy
  and Explore the shop action appeared, and the header changed to
  `Cart, empty`.
- **Valid Checkout:** the real form accepted the bounded development address,
  `local_standard`, and `WELCOME10`; it displayed `$69.90` subtotal, `$5.00`
  shipping fixture, `$10.00` valid discount, `Not activated` tax, and `$64.90`
  local demo total.
- **Invalid coupon:** `UNKNOWN` produced an accepted review with `Invalid
  coupon`, `$0.00` discount, and `$74.90` local demo total; it did not block
  the review.
- **Server failure state:** `unsupported_method` produced the bounded
  `Checkout needs review` result and safe message `This local shipping
  selection is unavailable.`
- **375px:** Cart and Checkout both measured `scrollWidth === 375`; the
  Checkout primary button measured 299px wide and 44px high, and the summary
  stayed within the viewport. Desktop layout measured 1100px within the
  1280px browser viewport.

## Active Change Isolation

Only Batch E files were changed for this batch. The active
`build-product-customization-workflow` and
`build-configurable-product-catalog` changes were not edited. No Batch F task
was started. The pre-existing dirty/untracked worktree was preserved.

## Validation Evidence

- Focused Batch E plus Cart/Checkout/PDP/Shell regression tests: **69/69
  passed**.
- `npm run verify`: **PASS**; lint 0 errors with the existing
  `@next/next/no-img-element` warning, typecheck PASS, offline **844/844**,
  build PASS, rendered **9/9**.
- `openspec validate --all --strict`: **17/17 passed** after the Batch E task
  state update.
- `git diff --check`: **PASS**.

## Remaining P2/P3 Visual Differences

The supplied reference is a static single-page prototype and does not contain
an equivalent real Cart or Local Checkout workflow. Its language switcher,
static cart quantity, sample commerce claims, payment marks, and reference
products were not transplanted. The application keeps its real safe copy and
route boundaries, so the remaining differences are intentional fidelity
exceptions rather than missing business behavior.
