# Phase 1 final acceptance

Status: **PASS — owner accepted**. Scope: provider-independent Local MVP customization tasks 1.1–1.9 only. Implementation checkpoint: `23817be9e42743167b0a2cc08a46367b074fa5ab` (`feat: complete phase 1 local customization runtime`). This record does not accept Phase 2 or production-provider work.

## Final disposable proof

The owner accepted the final disposable run `run-b74c8e21` (`figmemento-local-commerce-test-run-b74c8e21`), PostgreSQL 17, with a fresh ordered migration chain 0001–0046, ledger 46/46, pending 0, checksum mismatches 0, and no 0047. Two consecutive complete final-gate runs passed after the transport probe was ordered independently. The earlier diagnostic in which a large transport probe followed heavy Storage work yielded a Vinext development 500; that diagnostic is **not** classified as a pass.

Accepted domain results: C03, C07, C08, C09, C10, C28, C29, and H03 all PASS. C08 covered canonical multi-select ordering, C03 surcharge, persistent Cart, restart read-back, rejection matrix, Checkout, Variant/SKU isolation, immutable Order customization facts, and cross-project fail-closed behavior. C09/C10/C28/C29 covered exact decimals, conditional required/visibility, hidden-value rejection, private generic-file receipts, Cart → Checkout → Order facts, and private-locator non-disclosure. H03 covered restricted persistent Admin customization, seven field kinds, CAS/two-writer one-win behavior, audit, restore as a new revision, historical immutability, restart read-back, storefront projection, wrong-marker rejection, and restricted RPCs. The acceptance harnesses include `tests/database/local-commerce-c08-acceptance.mjs`, `tests/database/local-commerce-h03-acceptance.mjs`, and `tests/database/local-commerce-phase1-final-acceptance.mjs`.

For C10, the committed transport ceiling is 21 MiB; the business limit is 20,971,520 bytes, with `application/pdf` and `text/plain` only and at most three files. Real HTTP acceptance recorded small PDF/TXT uploads as 201 and invalid binary as 400. An exact 20,971,520-byte file returned 201 with matching receipt byte size and private object; 20,971,521 bytes returned application 400 without a new receipt/object; a multipart request over the 21 MiB transport ceiling returned transport 413 without side effects.

## Retained development preflight and ordered apply

The retained target was `figmemento-local-commerce`, `development`, `retained_development`, `retained-development`. A normal health-checked start succeeded; `--ignore-health-check` was not used. PostgreSQL, Kong/API, Auth, and Storage were healthy. Live read-only preflight proved PostgreSQL 17, exact marker, contiguous ledger 42/42, source/ledger checksum agreement, and only 0043–0046 pending. No ledger state was inferred from a marker or volume alone.

The existing protected retained ledger wrappers applied the four reviewed migrations sequentially, verifying the ledger after each commit:

| Version | SHA-256 source checksum |
| --- | --- |
| 0043 | `73e4b9102061c32dba1e28827d1e38b9f14f001c90a5c0f8ad5dbb8697be0537` |
| 0044 | `9db56fc11721f78c2a37e2451e73c3d8648bb070b798fcc8e58d8cc112bb6803` |
| 0045 | `692879bd499010896f94ff187f3c37b0c88070208ac4ce71216301910b8b7e5e` |
| 0046 | `8ef23981972a0b90a4469c505da7e2baf3d43db7fac551f84f80cb83067b9bec` |

The live retained post-apply result was PostgreSQL 17, marker unchanged, identity schema version 46, ledger 46/46, pending 0, 46/46 source checksum matches, 46/46 ledger checksum matches, and 0047 absent. A non-destructive Catalog read found seven Product rows, eleven Variant rows, and seven configuration snapshots. `admin_customization_read`, `admin_customization_publish`, and `generic_file_command` existed; anon/authenticated lacked EXECUTE and service_role retained EXECUTE. No reset, reseed, remote database, or volume recreation occurred.

## Regression evidence

From the checkpoint tree after retained apply: focused Phase 1 tests 22/22, offline tests 954/954, rendered tests 12/12 after a fresh build, lint 0 errors with one pre-existing `<img>` warning, typecheck PASS, build PASS, `npm run verify` PASS, OpenSpec strict 24/24 PASS, and `git diff --check` PASS before this documentation closeout.

## Accepted limitations and deferred scope

This is local provider-independent engineering acceptance, not production-launch readiness. Real Stripe, PayPal, Resend/email, tracking provider, production Supabase/provider credentials, Supplier persistence, and Phase 2 reviews/points/referrals remain deferred. No provider was activated, no production or remote database was accessed, and no Phase 2 task was credited by this Phase 1 acceptance.
