# Local commerce migration ledger

This directory is the ordered migration source for the isolated
`local/commerce/` Supabase workspace only. It is not the repository-root
`supabase/` workflow and must never be linked or pushed to a remote project.

`manifest.json` binds every migration version and filename to its exact
SHA-256 checksum and records rollback/forward-fix guidance. The current reviewed
inventory is `0001` through `0037`. Presence here is static evidence only; a
database is accepted only after its exact project marker, PostgreSQL major
version, complete ordered ledger/checksums and zero-pending plan are verified.

## Rules

1. Verify the manifest and source bytes offline before database access:

   ```bash
   node --experimental-strip-types scripts/local-commerce-migrations.mjs verify
   node --experimental-strip-types scripts/local-commerce-migrations.mjs plan
   ```

2. Apply only to an exact, marked, loopback disposable project through the
   ledger-aware wrapper:

   ```bash
   node --experimental-strip-types scripts/local-commerce-migrations.mjs plan-disposable
   node --experimental-strip-types scripts/local-commerce-migrations.mjs apply-disposable
   ```

3. Never edit an applied migration. A committed correction is a new ordered
   forward-fix migration with a new manifest checksum.
4. Use rollback guidance only in an authorized disposable rollback-only
   pre-apply transaction. Do not run destructive rollback against retained or
   production data.
5. Each wrapper transaction must bind the schema change and ledger row. An
   injected failure must leave neither partial schema state nor a ledger claim.
6. Rerun must report no migrations applied when all ledger rows/checksums match.
   Missing versions, changed bytes, project drift or marker mismatch fail closed.
7. Initialization accepts synthetic local test inputs only. Customer exports,
   production accounts, Orders, private media and credentials are forbidden.

The accepted fresh-build, rerun, guarded-reset and interrupted-transaction
evidence is indexed in
`openspec/changes/complete-local-commerce-persistence/task-11.3-acceptance.md`.
Schema or adapter code existing in the repository is never sufficient evidence
that a migration ran or that a feature passed acceptance.
