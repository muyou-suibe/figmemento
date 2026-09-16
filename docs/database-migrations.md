# Supabase database migration policy

Supabase PostgreSQL is FigMemento's authoritative MVP business database. D1 and Drizzle are not the business migration system.

## Canonical workflow for later schema changes

1. The first later schema-bearing OpenSpec change must inspect the actual Supabase project state and reconcile it with the repository's legacy SQL before creating a delta.
2. New migrations belong under `supabase/migrations/` and use timestamped, ordered names such as `YYYYMMDDHHMMSS_change_description.sql`.
3. Each migration must be reviewed in Git and applied to a disposable local or test Supabase-compatible database when that environment is available.
4. Verification must cover affected constraints, indexes, row-level security policies, grants, and forward compatibility.
5. Deployment applies the migration before application code that requires the changed schema.
6. Every schema-bearing change documents a safe rollback when possible; otherwise it documents a forward-fix plan.

## Legacy bootstrap inputs

The following files describe historical bootstrap/setup operations and are not ordered migrations:

- `supabase/schema.sql`
- `supabase/seed.sql`
- `supabase/coupons.sql`
- `supabase/operations.sql`

Their presence does not prove that a connected Supabase project exactly matches them. They must not be copied into `supabase/migrations/` as an assumed baseline. C0 creates and applies no business database migration.
