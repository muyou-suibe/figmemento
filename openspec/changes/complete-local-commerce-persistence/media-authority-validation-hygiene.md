# Media authority validation hygiene

2026-09-11. Progress remains **24/85**. This correction is not an implementation
task and grants no media acceptance or additional completed checkbox.

## Corrected static security coverage

`tests/local-commerce-security-boundary.test.mjs` now includes migration 0010's
`draft_command_bindings` in its all-table RLS/service-role policy checks. It also
explicitly verifies the table's browser-role revocation and narrow service-role
grant, and `draft_command`'s fixed search_path, security-definer declaration,
typed signature and PUBLIC/anon/authenticated EXECUTE revocation.

Inspection additionally found migration 0008's `cart_command_bindings` absent
from that same all-table list. Its existing SQL is now included and checked.
A manifest-wide CREATE TABLE discovery assertion requires exact equality with
the reviewed table list, so a later migration cannot silently escape coverage.
Existing security assertions remain intact. No migration or runtime code changed.

Focused command: `node --test tests/local-commerce-security-boundary.test.mjs`.
Result: **7/7 PASS**, exit 0. All ten manifest checksums match the existing SQL.
Direct whitespace inspection of the untracked test file passed; git diff alone
does not cover this untracked file.

Independent lint, typecheck, offline, fresh build, rendered and subsequent full
verify all exited 0. Offline: 913/913; rendered: 11/11. Lint: zero errors and one
existing ProductCustomizationImageField img warning. OpenSpec strict: 23/23 PASS;
git diff --check: PASS. Logs: `/private/tmp/media-authority-{lint,typecheck,offline,build,rendered,verify,openspec}.log`.
These are current verification results, not real media DB/Storage acceptance.

## Explicitly not completed

Tasks 5.4, 5.5, 5.1 and 5.3 remain unchecked. No new media migration, operation
implementation, private Storage write, HTTP upload integration or durable crop
publication was performed in this correction. Prior Task 4.4 and 5.2 acceptance
is unchanged; helper evidence does not establish operation/receipt publication.

The approved futureSlotId bridge remains the next implementation step: reserve
the server-owned UUID on the durable operation, then materialize exactly that UUID
as a confirmed `draft_media_links.id` only on successful CAS publication. Pending
operations must not appear in confirmed Draft reads. This report does not claim
that bridge has been implemented or that a new authority blocker was found.

No old stack reset, remote access, production change, frontend/Catalog/Supplier
change, staging, commit or push. Tasks 4.5/5.6/5.7/6 were not started.
