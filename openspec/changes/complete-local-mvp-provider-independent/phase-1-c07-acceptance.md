# Phase 1 C07 acceptance

Status: PASS — implementation, disposable acceptance, and retained-development
database acceptance all passed.

## Exact environment

- Run: `run-c07c8d53`
- Project: `figmemento-local-commerce-test-run-c07c8d53`
- PostgreSQL major: 17
- Endpoint class: loopback local Supabase only
- Remote access: none
- Database reset/reseed: none
- Migration ledger: 42/42 applied, pending 0
- Applied migration 0042 checksum: `816fb8ab39352176c8c9a27010cb593af955b5726189d8097c6c32e99e3db3c2`
- Migrations 0001–0042 were not edited; no 0043 was created.

## Final correction gate

- Public configuration projection: PASS; inactive choices are omitted.
- Admin read-back: PASS in focused boundary tests; inactive choices remain
  available to Admin.
- Retired choice identity non-rebinding: PASS in focused Admin tests.
- Disposable rerun: PASS on `run-c07c8d53`, including Cart, Checkout, Order,
  inactive-choice rejection, browser-fact rejection, and stale-revision
  rejection.
- Retained development final state: exact project `figmemento-local-commerce`,
  `development` environment, `retained_development` project kind,
  `retained-development` run identity, PostgreSQL 17, and schema version 42.
- Retained migration ledger: `42/42`, pending `0`; source and ledger checksum
  mismatches are both zero.
- Retained marker identity: verified true with the canonical marker digest
  `111be9eaf847cf677e06d9f162bf810848414e7de7af5b80856f2e48fc4d9f6d`.
- Retained 0042 application and final read-back: PASS. Migration 0042 remains
  byte-identical to the accepted checksum; no 0043 was created.

## Real database and HTTP evidence

The acceptance harness `tests/database/local-commerce-c07-acceptance.mjs`
used the ordinary local persistent composition and real loopback HTTP Worker.
Synthetic Catalog rows were uniquely generated for this disposable project
through the test-only service-role setup boundary. No browser or public seed
write endpoint was used.

- `local_commerce.verify_project_identity(project, marker_digest)` returned true.
- PostgreSQL reported major version 17.
- The ledger matched all 42 manifest versions and SHA-256 checksums.
- The C07 snapshot helper and patched `order_commit` function were present.
- The authoritative public Catalog read returned one active `single_select`
  field with only the active ordered choice (`azure`); the inactive (`ruby`)
  choice was not exposed to the public configuration projection.
- Real `POST /api/cart` accepted the exact browser value
  `{fieldId,fieldCode,kind:"single_select",choiceId}`.
- The persisted Cart `configuration_values` contained only the minimal
  server-accepted value and did not contain browser choice label/code facts.
- Real `POST /api/checkout` returned `status: "accepted"`, with tax
  remaining `status: "not_activated"` and `amountCents: null`.
- Real `POST /api/local-orders` completed the existing capability handshake
  and created a local Order with a valid `FM-LOCAL-[A-Z0-9]{16}` reference.
- The immutable Order item snapshot contained server-resolved
  `fieldId`, `fieldCode`, `fieldLabel`, `choiceId`, `choiceCode`,
  `choiceLabel`, and `choicePosition` facts. The SKU remained the Catalog
  variant SKU and no `selectedSpecificationKey` was introduced.

## Rejection evidence

The same real Cart HTTP boundary rejected each with HTTP 400 and no accepted
Cart mutation:

- inactive choice ID;
- browser-supplied `choiceCode` fact;
- stale configuration revision.

The focused Admin read-back contract separately proved that Admin receives
both active and inactive choices. The focused identity-lifecycle contract
proved that after `blue` was retired, a new stable identity for `blue`, an
old identity with a new code, and an old code with a new identity were all
rejected; the same identity/code remained valid when label, position, and
activity changed.

## Offline contract evidence

The focused C07 contract covers field bounds/order/lifecycle, exact browser
value shape, unknown/inactive choice rejection, draft/PDP summary, configured
item and Cart acceptance, Admin stable choice IDs/code rebinding, immutable
Order projections, migration ordering, and forbidden canonical fields.
