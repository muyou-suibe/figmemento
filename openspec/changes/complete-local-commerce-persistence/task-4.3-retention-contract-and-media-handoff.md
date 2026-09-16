# Task 4.3 retention contract closure / Task 5.1 authority decision

Date: 2026-09-11. Scope follows the owner's two-phase authorization.

## Phase A — PASS

The owner explicitly accepted absence-of-side-effect contract evidence for the
remaining Task 4.3 item, without implementing persistent Order creation. Task 4.3
is checked with its original wording unchanged. Progress is 22/85. The previous
Cart atomicity report remains historical evidence; no historical result is erased.

New executable: `tests/order-success-cart-retention-contract.test.mjs`.
It audits current local Order create/read routes, Order success page/component,
Checkout success navigation, local Payment application/server/routes, and the
legacy Order/Stripe webhook routes. Legacy provider routes are read as source,
never executed against external services.

- No Cart clear/add/update/remove calls in those success paths.
- No `cart_command`, persistent Cart adapter/DB transport seam, or Cart table
  identifiers in those modules.
- Local Checkout's Cart GET remains legal and read-only; its successful Order
  response only navigates to the success route. The AST check verifies the Cart
  fetch cannot carry an opaque options spread or a mutation method.
- Order evaluation receives `Pick<ShoppingCartProvider, "getCart">` and uses
  only `getCart`.
- Persistent clear remains behind explicit Cart DELETE, same-origin checks and
  the unified command with expectedVersion. No new Order endpoint exists.

Focused execution: new contract tests plus existing local Order creation,
success/client and Payment application tests, 29/29 PASS, exit 0. Existing fake
creation tests prove their Cart remains deep-equal around successful creation.
These are static-contract and local_fake integration results, NOT persistent
Order acceptance and NOT a new DB-backed retention run. A first overly broad
assertion treated a legitimate Cart GET as mutation; it was corrected to check
the request method, not remove the read-only guarantee.

The prior real Cart atomicity evidence is independently recorded in
`task-4.3-cart-atomicity-partial-acceptance.md` (16/16 DB groups). It was not rerun
against any old evidence stack in this turn.

Task 6.2 remains unchecked and MUST later prove that a canonical persistent Order
transaction preserves Cart lines and quantities on actual success. This closure
does not satisfy the future persistent Order scenario in the shopping-cart spec.

## Phase B — STOP at Task 5.1

The current upload contract has no server-owned configured-copy/image-selection
scope in which to enforce the requested field count before upload acceptance:

1. `CustomerUploadFieldSelector` in
   `app/server/customer-upload-field-resolution.server.ts` contains only
   `productId` and `fieldId`.
2. `readSingleUploadFile` in
   `app/server/customer-upload-http-handler.server.ts` accepts exactly one
   multipart `file`; this is a request-file count, not a configured field's
   selected-image count. The application acceptance input has no selection scope.
3. `app/domain/customization-validation.ts` applies min/maxImageCount to the
   particular configured value's `images.length`. It is not an owner-wide upload
   quota. Counting all owner/Product/field receipts would change business meaning
   and couple independently customized copies.
4. Existing draft slot/operation IDs are explicitly client-local in
   `app/domain/product-customization-draft.ts`. They cannot be elevated to durable
   authorization. Durable draft/slot ownership is Task 4.4, excluded this turn.

Decision needed: does 5.1's field-count check mean the existing single-file upload
request bound, with selected-image min/max still checked at configured-item
validation, OR must upload admission enforce a durable configured-copy selection
capacity? For the latter, an explicit minimal server-owned selection-scope seam
and its relationship to Task 4.4 / media operations must be approved. Task 5.4's
server-owned upload operation alone does not define which independent operations
belong to the same configured field selection.

No owner-global quota, browser-authoritative count, guessed grouping, new draft
authority, or premature 4.4 implementation was added. This is an authority/scope
decision, not a claim that decoding or Storage adapters are technically impossible.
Tasks 5.1–5.5 remain unchecked. No later task was implemented or marked complete.

## Changes and validation

Files changed this turn:
- `tests/order-success-cart-retention-contract.test.mjs` (new).
- `openspec/changes/complete-local-commerce-persistence/tasks.md` (4.3 checkbox only).
- This evidence report (new).

Independent lint/typecheck/offline/build/rendered: PASS, exit 0. Offline 913/913;
rendered 11/11 followed the successful fresh build. Lint: zero errors and one
pre-existing ProductCustomizationImageField img warning.
Full verify: PASS, exit 0 (lint, typecheck, offline 913/913, fresh build then
rendered 11/11). OpenSpec strict: 23/23 PASS, exit 0. git diff --check: PASS.
Direct non-index whitespace checks cover all three changed/new files, including
untracked artifacts. Final index contains zero staged paths.

No application implementation, Catalog, Supplier, visual layer, migration,
environment configuration, or external provider was changed. No database/Storage/
helper acceptance was run in this turn; no new disposable stack was created and
no prior evidence run was operated on. 0001–0009 unchanged. No stage/commit/push.
Task 1.1 stays unchecked; 4.4–4.7, 5.1 onward and 6.x stay unchecked.
