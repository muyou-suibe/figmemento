# Phase 1 / C03 pre-implementation decision review

Status: evidence review only. C03 is not implemented and Task 1.1 remains unchecked.

## Scope and method

This document records the pre-implementation review requested for C03,
“Customization rules can add server-calculated surcharges”. It separates facts
observed in the repository from the owner-proposed policy and from consequences
that still require an owner decision. No application code, migration, Catalog
data, task checkbox, or provider configuration was changed for this review.

The review used the repository requirement source, the OpenSpec planning
artifacts, the frozen Local MVP audit/backlog, current domain/application code,
the local-commerce migrations, and current focused tests. No remote service,
database migration, provider, or production system was accessed.

## Existing fact

### OpenSpec and frozen audit

- `openspec/changes/complete-local-mvp-provider-independent/tasks.md:9` maps
  C03 to Task 1.1 and leaves it unchecked: obtain surcharge semantics and
  implement versioned server-owned surcharge rules/allocation snapshots,
  rejecting browser amounts and stale revisions.
- The change design marks surcharge types, allocation/rounding, and stacking as
  an explicit owner-input gate (D5). The design also requires new purchase facts
  to enter through the existing server-only command boundaries and keeps Order
  purchase facts separate from later lifecycle state (D4).
- `docs/local-mvp-gap-audit.md:124-125` records that C02 covers canonical SKU
  pricing only and that C03 is not implemented: the current model has no
  customization surcharge authority, editor, or per-customization snapshot.
- `docs/local-mvp-gap-audit.md:216-217` records that the current Admin
  customization surface supports only the existing field kinds and that Admin
  pricing-rule management is not implemented.
- `docs/local-mvp-completion-backlog.md:20` describes C03 as server-owned
  customization surcharge rules plus immutable allocation facts.
- The source requirement at `独立站构建项目需求.md:275-286` describes
  `CustomizationRule` as containing price-surcharge, required/display, and
  validation behavior. This is source scope, not an implemented runtime
  contract.

### Product, Variant, and customization authority

- `app/domain/catalog/variant.ts:16-62` defines the current Product option,
  selected-option, Variant, SKU, `priceCents`, and `currency` model. The parser
  accepts non-negative integer Variant prices and currently limits Catalog
  currency to `USD`.
- `app/domain/customization-field.ts` currently supports only `image`,
  `short_text`, and `long_text`. Its configuration contains field identity,
  required/active/order state, configuration revision, and field-specific
  validation constraints; it contains no surcharge amount, pricing rule, or
  pricing revision.
- `app/domain/configured-item.ts` defines the browser handoff as Product,
  Variant, SKU, selected options, `configurationRevision`, and normalized
  customization values. It intentionally contains no price or surcharge claim;
  its own boundary comments say that browser claims are not proof of current
  Catalog/configuration/price authority.

### Current Cart and Checkout facts

- `app/domain/shopping-cart.ts` stores a Catalog snapshot with Product/Variant/
  SKU/selected options, one `unitPriceCents`, currency, and availability. Cart
  subtotal is currently `unitPriceCents * quantity`.
- `app/application/shopping-cart-service.ts:acceptCartItem` re-resolves the
  current Catalog and stores the Variant base price. It does not evaluate a
  customization surcharge. Its Catalog revalidation marks a line stale when
  the authoritative base price, currency, or selected options differ.
- `local/commerce/migrations/0002_local-commerce-identity-catalog-cart-media.sql`
  defines `catalog_configuration_snapshots` as Product-scoped, revisioned
  configuration JSON and `catalog_pricing_rules` as Project-scoped, revisioned
  rule JSON. `cart_lines` currently stores Product/Variant/configuration
  identity, configuration values, quantity, position, and lifecycle/version;
  it has no dedicated price-allocation snapshot.
- `local/commerce/migrations/0008_local-commerce-cart-persistence.sql` adds the
  persisted `accepted_item` and the server-owned Cart command binding. The
  restricted `cart_command` validates Project/marker, owner, expected version,
  idempotency, current Variant/configuration authority, and Cart CAS. It does
  not accept a browser price or surcharge as authority.
- `app/server/local-persistent-checkout-http.server.ts:26-83` reads the exact
  persistent owner Cart, resolves current Catalog/configuration, evaluates
  existing shipping/coupon rules, re-reads the Cart and Catalog, and rejects
  owner/version changes. Its line totals currently use the base Variant price.
  Tax remains `not_activated` with a null amount.
- `app/application/local-checkout-evaluator.ts` compares the Cart snapshot with
  current Catalog/configuration authority and calculates the current subtotal
  from the resolved base price. The current Checkout rule authority supports
  shipping and coupon definitions, not customization surcharges.

### Current immutable Order facts

- `app/application/order-catalog-resolution.ts` resolves Product, Variant,
  selected options, base price, currency, fulfillment, and customization from
  server Catalog/configuration authority. It has no surcharge allocation.
- `app/application/local-order-purchase-facts.server.ts:39-97` verifies the
  current Product/Variant/configuration and creates detached immutable purchase
  facts. It currently emits `customizationPriceComponents: []`,
  `customizationAmountCents: 0`, `unitPriceCents` equal to the Variant base
  price, and the base-price line subtotal.
- `local/commerce/migrations/0003_local-commerce-order-operations-delivery.sql`
  already provides immutable parent and item purchase snapshots. The item
  snapshot has `pricing_snapshot jsonb`, currency, unit price, line subtotal,
  configuration revision, receipt references, and fulfillment facts.
- `local/commerce/migrations/0016_local-commerce-order-history.sql:214-238`
  verifies the existing shipping/discount/tax allocations and writes the
  immutable item snapshot. Its pricing JSON currently carries the empty C03
  placeholders rather than real customization allocations.
- `tests/local-order-purchase-facts.test.mjs` explicitly asserts the empty
  customization component list and zero customization amount. This is current
  evidence of the gap, not evidence that C03 semantics exist.

### Current rule and Admin facts

- `app/infrastructure/local-commerce/local-checkout-rule-authority.server.ts`
  parses versioned `shipping` and `coupon` definitions from
  `catalog_pricing_rules`. It supports the existing coupon terminal states and
  server-calculated amounts; it has no `customization_surcharge` rule kind.
- `app/infrastructure/local-commerce/local-catalog-authority.server.ts` reads
  Product/Variant/configuration/rule snapshots through the restricted,
  Project/marker-verified local-persistent authority. It validates the current
  rule envelope but does not parse a customization surcharge rule.
- `app/api/admin/catalog/products/[id]/customization/route.ts` uses the
  existing signed Admin boundary and the local Admin customization repository.
  `app/infrastructure/catalog/local-admin-catalog-repository.server.ts` stores
  the current customization configuration in process state for the existing
  local Admin path; the field parser has no surcharge type.
- `app/application/admin-catalog-boundary.ts:63-70` exposes Catalog command
  kinds for category, Product, option, option value, Variant, asset, and
  fulfillment configuration. There is no pricing-rule mutation command in the
  current Admin boundary. The frozen audit consequently records H04 as not
  implemented.
- Supplier-side `optionSurchargeCents` exists only in supplier economics/source
  provenance. `app/application/local-supplier-economics.ts` labels it as a
  supplier production fact and does not add it to the customer quote. It is not
  a candidate C03 authority.

### HTTP input and browser-price audit

- The canonical persistent Cart and Order routes receive a configured-item
  handoff, quantity, address/shipping/coupon input, draft/Cart context, and
  expected versions. They re-resolve Product, Variant, configuration, receipt
  ownership, and totals on the server. No persistent C03 branch currently
  accepts `surchargeCents`, `discountAmount`, or browser `unitPriceCents` as
  authority.
- `app/domain/order-catalog-compatibility.ts:102-123` explicitly drops legacy
  browser `price`, `priceCents`, and `currency` fields before Catalog resolution.
  `app/domain/order-request-boundary.ts` also keeps normalized customization
  input separate from Catalog identity.
- `app/api/orders/route.ts` is a legacy, separate root-table/Stripe-shaped
  route. It resolves item prices from the server Catalog before inserting its
  legacy rows, but it is not the local-persistent C03 authority and must not be
  used as evidence for this task. Its configured Stripe branch is outside this
  review and was not called.
- Future C03 inputs must continue to ignore or reject browser price,
  surcharge, currency-conversion, image-count, field-kind, and pricing-rule
  claims. A displayed quote may be browser presentation only.

## Proposed owner policy

The following is the owner-proposed C03 policy supplied for this review. It is
recorded verbatim in substance as a proposal, not as an accepted implementation
decision:

1. Support `fixed_amount` only, represented as integer cents.
2. The surcharge currency must exactly equal the authoritative Variant/SKU
   currency.
3. `surchargeCents` is non-negative; percentage, negative, conversion,
   arbitrary-formula, floating-point, and browser-authored price semantics are
   out of scope.
4. The configured-item unit price is authoritative Variant base price plus
   accepted visible customization surcharge allocations.
5. For a bounded multi-select, each accepted selected value may contribute one
   fixed surcharge and allocations are additive.
6. Text, numeric, and file values default to zero unless an explicit
   authoritative fixed surcharge says otherwise. Quantity, text length, file
   size, and browser image count do not become pricing inputs.
7. Promotions/coupons remain separate and are evaluated after the C03
   surcharge. C03 is not a promotion authority.
8. All amounts are integer cents with no floating-point rounding.
9. Immutable purchase facts retain the Variant base amount, every surcharge
   allocation, total surcharge, final unit price, currency, configuration
   revision, and pricing-rule revision.
10. A stale configuration/pricing revision must fail closed and must not retain
    an old surcharge. Browser quote display is not a price authority.
11. Later Catalog/customization pricing changes must not rewrite historical
    Order snapshots.

## Required owner decision

The following decisions remain open before Task 1.1 can be implemented or
checked:

| Decision | Evidence / consequence |
| --- | --- |
| Approve the fixed-amount integer-cent policy above | Required by the OpenSpec D5 owner gate; no current runtime rule chooses these semantics. |
| Choose the authoritative rule placement | Recommended below: reuse the existing versioned `catalog_pricing_rules` entity with a typed `customization_surcharge` definition. A new aggregate is not justified by current evidence unless the owner rejects that reuse. |
| Define the exact selector shape | The rule must bind exact Project, Product, configuration revision, field identity, and accepted selection value(s), without treating arbitrary field text/file facts as a price formula. The owner must approve whether one rule targets one value or a bounded value set. |
| Define the pricing revision representation | It must be distinct from the configuration revision when rules can change independently, or explicitly state that the two revisions are one atomic snapshot. Existing rule rows already have `revision`; existing configurations have their own revision. |
| Confirm C03 coverage of future C07/C08 values | The current field model lacks single/multi-select types. C03 can define an extensible selector shape now, but C07/C08 must later supply their approved value/cardinality semantics. |
| Confirm the Cart snapshot shape | A durable Cart line must carry server-owned price facts needed for CAS/Checkout reconciliation; the browser handoff cannot supply them. The minimum candidate is listed below. |

Absent these decisions, the correct state is C03 blocked by owner policy, not a
guessed surcharge implementation.

## Compatibility and authority placement

### Recommended placement (pending approval)

1. Keep field existence, field constraints, active/ordered state, and
   `configurationRevision` in `catalog_configuration_snapshots`.
2. Reuse `catalog_pricing_rules` for a new typed definition kind,
   `customization_surcharge`, rather than using Supplier economics or creating
   a second pricing authority. The existing table already has Project scope,
   stable identity, rule key, ordered revision, lifecycle/status, timestamps,
   and is already read by the local Catalog authority.
3. The typed rule parser must require a server-owned definition containing, at
   minimum, exact Product/configuration binding, field/value selector,
   `amountCents`, currency, and rule revision. The exact selector cardinality
   and whether the configuration revision is numeric or opaque must follow the
   owner decision and existing canonical types; this review does not choose a
   new business limit.
4. Keep promotion/coupon definitions as their existing kinds. A C03 surcharge
   is applied before promotion evaluation and is never represented as a coupon
   discount.

This placement reuses the current versioned rule surface but still requires a
typed parser and acceptance contract. The existing generic JSON column alone is
not sufficient evidence of an accepted C03 authority.

## Schema consequence (proposal only; no migration created)

If the owner approves the recommended placement, the minimum additive contract
would be:

### `catalog_pricing_rules`

Extend the accepted rule-definition union with a bounded
`customization_surcharge` kind whose server-validated fields include:

- Product identity;
- exact configuration revision;
- field identity;
- accepted selection value identity or bounded accepted value identities;
- fixed non-negative `amountCents`;
- exact Catalog currency;
- rule revision/lifecycle/status through the existing row envelope.

The database row remains Project-owned and versioned. The RPC/read projection
must reject duplicate active rules, foreign Product/configuration/field
bindings, stale revisions, invalid currencies, negative/non-integer amounts,
and unsupported formula kinds. No Supplier field is copied.

### `cart_lines`

Add the smallest server-owned Cart price snapshot seam needed by the existing
Cart command, preferably a dedicated `pricing_snapshot jsonb` with a strict
validated shape containing:

- `basePriceCents`;
- ordered `surchargeAllocations[]`, each with the authoritative rule/field/
  selection reference and fixed `amountCents`;
- `totalSurchargeCents`;
- `finalUnitPriceCents`;
- exact currency;
- configuration revision;
- pricing-rule revision (or an explicitly approved combined revision).

The existing Cart command remains the only application-facing mutation
boundary and continues to require verified Project/owner context, expected
version, and idempotency. It computes this snapshot server-side from the
accepted handoff and current authorities. `accepted_item` remains the accepted
configured-item fact; it must not become a browser-provided price channel.

### Order snapshots

The existing immutable `order_item_purchase_snapshots.pricing_snapshot` can
carry the same strict C03 shape without a second Order pricing aggregate, if
the owner accepts JSON-backed validation plus the existing immutable trigger.
The typed Order/application projection must expose and verify:

- Variant `basePriceCents`;
- ordered individual surcharge allocations;
- `totalSurchargeCents`;
- final unit price and line subtotal;
- currency;
- configuration revision;
- pricing-rule revision.

The parent `order_purchase_snapshots.pricing_snapshot` must preserve the
aggregate line facts and totals. Existing immutable triggers, detached snapshot
construction, and no-re-resolution history rules remain in force. The exact
typed-column-vs-validated-JSON choice is an owner/schema review decision, not a
reason to modify an already-applied migration in this review.

### RPC/application seam

The smallest affected canonical surfaces would be:

- `read_catalog_authority`: project the accepted typed customization rules and
  their revisions;
- the existing `cart_command`: resolve and persist server-owned C03 pricing
  facts atomically with the accepted line and Cart CAS;
- persistent Checkout evaluation: recompute C03 from the current Catalog,
  configuration, and pricing revisions, then compare against the Cart snapshot;
- `order_commit`: recompute/verify the same facts and write the immutable Order
  pricing snapshot in the existing transaction;
- the typed domain/application projections and focused contracts for stale,
  forged, duplicate, mixed-currency, integer, and immutable facts.

No second application-facing mutation port, public price mutation endpoint,
browser-selected source, or process-memory pricing authority is needed.

## Checkout and Order behavior if approved

1. Cart acceptance resolves the current Product/Variant/configuration and
   active C03 rule revision, validates the normalized customization values, and
   calculates integer-cent allocations. The browser's displayed quote is
   ignored for authority.
2. Checkout reads the owner-scoped Cart and recomputes against the exact current
   rules. If configuration or pricing revision changed, or any allocation no
   longer applies, return the existing bounded stale/unavailable result with
   zero mutation. Do not keep the old surcharge.
3. Checkout then evaluates shipping and promotions using the C03-adjusted
   subtotal. Coupon discount remains an independent server-calculated fact.
4. Order commit repeats the authority checks inside its existing atomic command,
   compares expected Cart/rule versions, and writes the detached immutable
   purchase snapshot. Later Catalog/configuration changes cannot rewrite it.
5. Tax remains exactly `status = not_activated` and `amount = null`.

## Answers A–K

| Item | Review result |
| --- | --- |
| A. Fit with current types | The fixed integer-cent policy fits the existing USD/base-price and immutable-snapshot architecture, but it does not fit the current types as implemented: customization fields have no price rule, Cart has no price allocation snapshot, and the Order path emits only empty C03 placeholders. Future multi-select support also depends on the later C08 field contract. |
| B. Rule authority placement | Configuration revision should remain field/configuration authority. The recommended pricing authority is a typed `customization_surcharge` definition in the existing versioned `catalog_pricing_rules`; final selector/revision semantics require owner approval. Supplier economics is explicitly excluded. |
| C. Cart schema | Current `cart_lines` is insufficient for durable C03 reconciliation. Add the minimal server-owned validated pricing snapshot described above, preserving Cart CAS and accepted-item authority. Do not accept a browser amount. |
| D. Checkout recomputation | Recompute from current server Catalog/configuration/rules, compare exact revisions and allocations with the Cart, fail closed on stale/ambiguous authority, then apply shipping/coupon separately. |
| E. Immutable Order provenance | Store base price, ordered allocations, total surcharge, final unit/line amounts, currency, configuration revision, and pricing-rule revision in the existing immutable item/parent snapshot contract. Never re-resolve historical Orders from current Catalog. |
| F. Exact extension surfaces | Extend the typed rule projection/parser, Cart accepted-price snapshot, Checkout evaluator, Order purchase-facts preparation, `cart_command`, `order_commit`, and their security/fault/replay tests. No new HTTP write endpoint. |
| G. Migration need | No migration is needed for this review. If the approved contract requires a durable Cart pricing field or DB-level rule constraints, the next ordered migration after the current 0038 baseline would be 0039. It must be separately designed, checksum-registered, rollback-validated, and applied only to an authorized local stack. No 0039 was created. |
| H. Minimum implementation delta | Add a typed server-side surcharge rule parser/evaluator, carry its revision through Catalog → Cart → Checkout → Order, add immutable snapshot assertions, and extend the existing restricted RPCs. Keep local-fake/default behavior unchanged. |
| I. Conflicts | No direct conflict with accepted Cart CAS, Checkout, or immutable Order authority. The unresolved conflicts are policy gates: current rule kinds do not include C03; current field types do not include C07/C08; Supplier `optionSurchargeCents` is a different authority; and the legacy root `/api/orders` route is not the local-persistent path. |
| J. Dependencies | Owner C03 policy approval first; then C07/C08 semantics where selectors depend on new field values; H03 Admin customization editing; H04 restricted pricing-rule management; then the Phase 1 gate. C28/C29 must remain separate conditional-rule authorities. Promotions and shipping consume the server-calculated C03-adjusted totals later. |
| K. Security | Existing persistent composition, exact Project/marker checks, owner-scoped Cart CAS, restricted RPCs, idempotency, and immutable Order triggers are compatible. New tests must prove no browser surcharge/price authority, stale-rule rejection, cross-Project/owner rejection, duplicate-rule rejection, atomic rollback, and no private/provider leakage. |

## Security and negative-case checklist

The future C03 acceptance must prove, at minimum:

- server-owned Variant base price and rule allocation only;
- integer non-negative cents and exact currency;
- no percentage, conversion, arbitrary formula, quantity/length/file-size, or
  browser amount semantics;
- exact Product/configuration/field/value binding;
- stale configuration and stale pricing revisions fail closed;
- Cart owner/Project/CAS/idempotency boundaries remain unchanged;
- Checkout and `order_commit` recomputation cannot be bypassed by displayed
  totals or hidden customization values;
- immutable Order before/after facts survive later Catalog/configuration edits;
- promotions remain separate and tax remains `not_activated`/`null`;
- restricted RPC/RLS/security-definer rules remain service-role/server-only;
- no public seed or price-mutation endpoint is introduced;
- Supplier facts, payment logic, fulfillment logic, and provider behavior are
  unchanged.

## Dependency and implementation decision

The repository evidence supports the owner-proposed fixed-amount policy as a
compatible direction, but does not establish it as an accepted business
authority. The current implementation is correctly base-price-only and C03 is
not silently available through a hidden field or Supplier fact.

No migration, code change, test change, Catalog change, task checkbox update,
remote access, or provider call was performed. Task 1.1 remains unchecked.

Recommendation: **READY FOR OWNER C03 POLICY APPROVAL**.

Once the owner approves the policy and exact selector/revision placement, Task
1.1 can be implemented as one server-authoritative pricing slice and accepted
with real local persistence, stale/forgery, Cart/Checkout/Order immutability,
concurrency, replay, and rollback evidence. This document does not claim that
acceptance.
