## 1. Canonical data audit and contracts

- [x] 1.1 Trace and document the authoritative configured-item facts from PDP handoff through Cart, Checkout normalization, Local Order creation, and the stored line snapshot.
- [x] 1.2 Define the `LocalConfiguredItemReadPort` input, found projection, unavailable result, and server-only caller boundary from the approved spec.
- [x] 1.3 Define the server-owned per-line `orderItemId` generation/capture authority and prove that it is not a cart line ID or array index.
- [x] 1.4 Determine whether downstream Supplier specification identity is canonical or Supplier-owned; lock the canonical Product/Variant/SKU/selected-options and fulfillment sources, plus the fail-closed mapping boundary.
- [x] 1.5 Record the safe media-reference projection and privacy exclusions, including receipt IDs/crops versus provider locators and browser tokens.

## 2. Minimum canonical Order snapshot repair

- [x] 2.1 Extend the Local Order line snapshot type with an opaque stable `orderItemId` without creating a second Order store.
- [x] 2.2 Extend the validated pre-Order handoff/evaluation seam only as needed to carry canonical Product/Variant/SKU/selected-options facts and fulfillment classification from server-owned authority.
- [x] 2.3 Capture one new `orderItemId` per committed Order line at Local Order creation and preserve it across duplicate Products and repeated line positions.
- [x] 2.4 Capture canonical Product/Variant/SKU/selected-options facts and `fulfillmentType` at Order creation, rejecting incomplete evidence instead of inferring values or creating a Supplier-local specification key.
- [x] 2.5 Preserve the existing immutable Product/Variant/SKU, quantity, pricing/currency, selected-option, configuration, and safe media facts in the augmented snapshot.
- [x] 2.6 Keep existing customer-safe Local Order projections and older in-memory/test fixtures compatible, with no migration or silent backfill.

## 3. Canonical configured-item read port

- [x] 3.1 Implement a server-only adapter over the single canonical Local Order repository and its immutable snapshot read boundary.
- [x] 3.2 Enforce exact internal Order ID, public reference cross-check, and stored `orderItemId` ownership before returning a result.
- [x] 3.3 Return a minimal immutable found projection or bounded unavailable result for missing, malformed, mismatched, or incomplete evidence.
- [x] 3.4 Ensure the adapter never reads browser state, local/session storage, current Catalog, supplier data, or array position to reconstruct history.
- [x] 3.5 Provide a dependency-injection seam that a future SupplierWorkOrder consumer can use without changing Supplier Batch F in this change.

## 4. Regression and integration verification

- [x] 4.1 Test historical immutability after Catalog, Product, pricing, customization-schema, or supplier data changes.
- [x] 4.2 Test wrong Order, wrong item, duplicate Product lines, and cross-Order references fail closed without existence disclosure.
- [x] 4.3 Test missing canonical Product/Variant/SKU/selected-options selection, missing fulfillment classification, and older incomplete snapshots return unavailable without inference.
- [x] 4.4 Test safe media references and server-only authority boundaries do not expose provider locators, browser capabilities, or unrelated Order data.
- [x] 4.5 Test a SupplierWorkOrder-compatible read consumes canonical configured-item history and cannot redefine quantity or configuration.
- [x] 4.6 Run focused domain/integration tests plus the repository-required typecheck, lint, offline verification, OpenSpec validation, and whitespace checks; record that no remote or migration path was used.
