-- LOCAL COMMERCE ONLY. This is not a production migration.
-- The file is applied only by the isolated local/commerce Supabase workdir.
-- It creates migration control metadata, not customer or commerce business data.

create schema if not exists local_commerce;

create table if not exists local_commerce.migration_ledger (
  version integer primary key,
  migration_id text not null unique,
  filename text not null unique,
  checksum text not null,
  project_id text not null,
  schema_version integer not null,
  rollback_guidance text not null,
  forward_fix_guidance text not null,
  applied_at timestamptz not null default timezone('utc', now()),
  constraint migration_ledger_version_check check (version > 0),
  constraint migration_ledger_schema_version_check check (schema_version >= version),
  constraint migration_ledger_checksum_check check (checksum ~ '^[0-9a-f]{64}$'),
  constraint migration_ledger_project_check check (length(btrim(project_id)) > 0),
  constraint migration_ledger_rollback_check check (length(btrim(rollback_guidance)) > 0),
  constraint migration_ledger_forward_fix_check check (length(btrim(forward_fix_guidance)) > 0)
);

comment on table local_commerce.migration_ledger is
  'Ordered, checksum-protected ledger for this isolated local commerce project only.';

revoke all on schema local_commerce from public, anon, authenticated;
revoke all on table local_commerce.migration_ledger from public, anon, authenticated;
grant usage on schema local_commerce to service_role;
grant select, insert, update on table local_commerce.migration_ledger to service_role;
