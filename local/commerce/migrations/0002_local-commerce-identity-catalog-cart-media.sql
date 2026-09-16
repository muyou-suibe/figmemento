-- LOCAL COMMERCE ONLY. This is not a production migration.
-- This migration contains identity, catalog, cart/draft, and media metadata
-- foundations only. Orders, payments, suppliers, shipments, and tracking are
-- intentionally deferred to later ordered migrations.

create extension if not exists "pgcrypto";
create schema if not exists local_commerce;

create table if not exists local_commerce.project_identities (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  environment text not null,
  project_kind text not null,
  schema_version integer not null default 2,
  marker_digest text not null,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_identities_pk primary key (project_id, id),
  constraint project_identities_project_key unique (project_id),
  constraint project_identities_project_check check (length(btrim(project_id)) > 0),
  constraint project_identities_environment_check check (environment in ('development', 'test')),
  constraint project_identities_kind_check check (project_kind in ('retained_development', 'disposable_test')),
  constraint project_identities_schema_version_check check (schema_version >= 1),
  constraint project_identities_version_check check (version >= 1),
  constraint project_identities_lifecycle_check check (lifecycle in ('active', 'retired')),
  constraint project_identities_marker_check check (length(btrim(marker_digest)) > 0)
);

create table if not exists local_commerce.commerce_owners (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_kind text not null,
  subject_hash text not null,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint commerce_owners_pk primary key (project_id, id),
  constraint commerce_owners_subject_key unique (project_id, subject_hash),
  constraint commerce_owners_project_check check (length(btrim(project_id)) > 0),
  constraint commerce_owners_kind_check check (owner_kind in ('customer', 'guest')),
  constraint commerce_owners_subject_check check (length(btrim(subject_hash)) >= 32),
  constraint commerce_owners_version_check check (version >= 1),
  constraint commerce_owners_lifecycle_check check (lifecycle in ('active', 'revoked', 'expired'))
);

create table if not exists local_commerce.customer_accounts (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  normalized_email text not null,
  password_hash text not null,
  account_status text not null default 'active',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_accounts_pk primary key (project_id, id),
  constraint customer_accounts_owner_key unique (project_id, owner_id),
  constraint customer_accounts_email_key unique (project_id, normalized_email),
  constraint customer_accounts_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint customer_accounts_email_check check (length(btrim(normalized_email)) > 2),
  constraint customer_accounts_password_hash_check check (length(btrim(password_hash)) >= 32),
  constraint customer_accounts_status_check check (account_status in ('active', 'disabled')),
  constraint customer_accounts_version_check check (version >= 1),
  constraint customer_accounts_lifecycle_check check (lifecycle in ('active', 'disabled', 'deleted'))
);

create table if not exists local_commerce.customer_sessions (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  session_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_sessions_pk primary key (project_id, id),
  constraint customer_sessions_hash_key unique (project_id, session_hash),
  constraint customer_sessions_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint customer_sessions_hash_check check (length(btrim(session_hash)) >= 32),
  constraint customer_sessions_version_check check (version >= 1),
  constraint customer_sessions_lifecycle_check check (lifecycle in ('active', 'revoked', 'expired'))
);

create table if not exists local_commerce.access_grants (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  resource_kind text not null,
  resource_id uuid not null,
  capability_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint access_grants_pk primary key (project_id, id),
  constraint access_grants_capability_key unique (project_id, capability_hash),
  constraint access_grants_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint access_grants_resource_check check (length(btrim(resource_kind)) > 0),
  constraint access_grants_capability_check check (length(btrim(capability_hash)) >= 32),
  constraint access_grants_version_check check (version >= 1),
  constraint access_grants_lifecycle_check check (lifecycle in ('active', 'revoked', 'expired'))
);

create table if not exists local_commerce.catalog_products (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text not null default '',
  publication_status text not null default 'draft',
  availability text not null default 'available',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint catalog_products_pk primary key (project_id, id),
  constraint catalog_products_slug_key unique (project_id, slug),
  constraint catalog_products_slug_check check (length(btrim(slug)) > 0),
  constraint catalog_products_publication_check check (publication_status in ('draft', 'published', 'retired')),
  constraint catalog_products_availability_check check (availability in ('available', 'unavailable')),
  constraint catalog_products_version_check check (version >= 1),
  constraint catalog_products_lifecycle_check check (lifecycle in ('active', 'retired'))
);

create table if not exists local_commerce.catalog_variants (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  sku_code text not null,
  selected_options jsonb not null default '{}'::jsonb,
  price_cents integer not null,
  currency text not null,
  availability text not null default 'available',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint catalog_variants_pk primary key (project_id, id),
  constraint catalog_variants_product_identity_key unique (project_id, product_id, id),
  constraint catalog_variants_sku_key unique (project_id, sku_code),
  constraint catalog_variants_product_fk foreign key (project_id, product_id)
    references local_commerce.catalog_products (project_id, id),
  constraint catalog_variants_sku_check check (length(btrim(sku_code)) > 0),
  constraint catalog_variants_price_check check (price_cents >= 0),
  constraint catalog_variants_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint catalog_variants_availability_check check (availability in ('available', 'unavailable')),
  constraint catalog_variants_version_check check (version >= 1),
  constraint catalog_variants_lifecycle_check check (lifecycle in ('active', 'retired'))
);

create table if not exists local_commerce.catalog_configuration_snapshots (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  revision integer not null,
  definition jsonb not null default '{}'::jsonb,
  configuration_status text not null default 'active',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint catalog_configuration_snapshots_pk primary key (project_id, id),
  constraint catalog_configuration_snapshots_identity_key unique (project_id, product_id, revision),
  constraint catalog_configuration_snapshots_product_fk foreign key (project_id, product_id)
    references local_commerce.catalog_products (project_id, id),
  constraint catalog_configuration_snapshots_revision_check check (revision > 0),
  constraint catalog_configuration_snapshots_status_check check (configuration_status in ('active', 'inactive')),
  constraint catalog_configuration_snapshots_version_check check (version >= 1),
  constraint catalog_configuration_snapshots_lifecycle_check check (lifecycle in ('active', 'retired'))
);

create table if not exists local_commerce.catalog_pricing_rules (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  rule_key text not null,
  revision integer not null,
  definition jsonb not null default '{}'::jsonb,
  rule_status text not null default 'active',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint catalog_pricing_rules_pk primary key (project_id, id),
  constraint catalog_pricing_rules_identity_key unique (project_id, rule_key, revision),
  constraint catalog_pricing_rules_key_check check (length(btrim(rule_key)) > 0),
  constraint catalog_pricing_rules_revision_check check (revision > 0),
  constraint catalog_pricing_rules_status_check check (rule_status in ('active', 'inactive')),
  constraint catalog_pricing_rules_version_check check (version >= 1),
  constraint catalog_pricing_rules_lifecycle_check check (lifecycle in ('active', 'retired'))
);

create table if not exists local_commerce.carts (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  version integer not null default 1,
  lifecycle text not null default 'active',
  expires_at timestamptz,
  cleanup_lease_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint carts_pk primary key (project_id, id),
  constraint carts_owner_identity_key unique (project_id, id, owner_id),
  constraint carts_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint carts_version_check check (version >= 1),
  constraint carts_lifecycle_check check (lifecycle in ('active', 'checked_out', 'abandoned', 'expired'))
);

create table if not exists local_commerce.cart_lines (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  cart_id uuid not null,
  owner_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  configuration_revision integer not null,
  configuration_values jsonb not null default '{}'::jsonb,
  quantity integer not null default 1,
  position integer not null,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint cart_lines_pk primary key (project_id, id),
  constraint cart_lines_cart_owner_fk foreign key (project_id, cart_id, owner_id)
    references local_commerce.carts (project_id, id, owner_id),
  constraint cart_lines_variant_fk foreign key (project_id, product_id, variant_id)
    references local_commerce.catalog_variants (project_id, product_id, id),
  constraint cart_lines_configuration_fk foreign key (project_id, product_id, configuration_revision)
    references local_commerce.catalog_configuration_snapshots (project_id, product_id, revision),
  constraint cart_lines_quantity_check check (quantity > 0),
  constraint cart_lines_position_check check (position >= 0),
  constraint cart_lines_version_check check (version >= 1),
  constraint cart_lines_lifecycle_check check (lifecycle in ('active', 'removed'))
);

create table if not exists local_commerce.configuration_drafts (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  product_id uuid not null,
  cart_id uuid,
  confirmed_revision integer,
  values_snapshot jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  lifecycle text not null default 'active',
  expires_at timestamptz,
  cleanup_lease_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint configuration_drafts_pk primary key (project_id, id),
  constraint configuration_drafts_owner_identity_key unique (project_id, id, owner_id),
  constraint configuration_drafts_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint configuration_drafts_product_fk foreign key (project_id, product_id)
    references local_commerce.catalog_products (project_id, id),
  constraint configuration_drafts_cart_owner_fk foreign key (project_id, cart_id, owner_id)
    references local_commerce.carts (project_id, id, owner_id),
  constraint configuration_drafts_revision_check check (confirmed_revision is null or confirmed_revision > 0),
  constraint configuration_drafts_version_check check (version >= 1),
  constraint configuration_drafts_lifecycle_check check (lifecycle in ('active', 'confirmed', 'expired', 'removed'))
);

create table if not exists local_commerce.media_objects (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  internal_locator text not null,
  media_kind text not null,
  mime_type text not null,
  byte_size bigint not null,
  object_status text not null default 'pending',
  version integer not null default 1,
  lifecycle text not null default 'active',
  expires_at timestamptz,
  cleanup_lease_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint media_objects_pk primary key (project_id, id),
  constraint media_objects_owner_identity_key unique (project_id, id, owner_id),
  constraint media_objects_locator_key unique (project_id, internal_locator),
  constraint media_objects_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint media_objects_kind_check check (media_kind in ('original', 'derivative')),
  constraint media_objects_mime_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint media_objects_size_check check (byte_size > 0),
  constraint media_objects_status_check check (object_status in ('pending', 'ready', 'failed')),
  constraint media_objects_version_check check (version >= 1),
  constraint media_objects_lifecycle_check check (lifecycle in ('active', 'expired', 'removed'))
);

create table if not exists local_commerce.media_receipts (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  receipt_reference uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  media_object_id uuid not null,
  product_id uuid not null,
  field_key text not null,
  receipt_status text not null default 'pending',
  source_generation integer not null default 1,
  expires_at timestamptz not null,
  cleanup_lease_until timestamptz,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint media_receipts_pk primary key (project_id, id),
  constraint media_receipts_owner_identity_key unique (project_id, id, owner_id),
  constraint media_receipts_reference_key unique (project_id, receipt_reference),
  constraint media_receipts_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint media_receipts_object_owner_fk foreign key (project_id, media_object_id, owner_id)
    references local_commerce.media_objects (project_id, id, owner_id),
  constraint media_receipts_product_fk foreign key (project_id, product_id)
    references local_commerce.catalog_products (project_id, id),
  constraint media_receipts_field_check check (length(btrim(field_key)) > 0),
  constraint media_receipts_generation_check check (source_generation > 0),
  constraint media_receipts_status_check check (receipt_status in ('pending', 'ready', 'failed')),
  constraint media_receipts_version_check check (version >= 1),
  constraint media_receipts_lifecycle_check check (lifecycle in ('active', 'expired', 'removed'))
);

create table if not exists local_commerce.media_derivatives (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  source_media_object_id uuid not null,
  receipt_id uuid not null,
  crop_revision integer not null,
  internal_locator text not null,
  derivative_status text not null default 'pending',
  version integer not null default 1,
  lifecycle text not null default 'active',
  expires_at timestamptz,
  cleanup_lease_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint media_derivatives_pk primary key (project_id, id),
  constraint media_derivatives_locator_key unique (project_id, internal_locator),
  constraint media_derivatives_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint media_derivatives_source_owner_fk foreign key (project_id, source_media_object_id, owner_id)
    references local_commerce.media_objects (project_id, id, owner_id),
  constraint media_derivatives_receipt_owner_fk foreign key (project_id, receipt_id, owner_id)
    references local_commerce.media_receipts (project_id, id, owner_id),
  constraint media_derivatives_crop_check check (crop_revision > 0),
  constraint media_derivatives_status_check check (derivative_status in ('pending', 'ready', 'failed')),
  constraint media_derivatives_version_check check (version >= 1),
  constraint media_derivatives_lifecycle_check check (lifecycle in ('active', 'expired', 'removed'))
);

create table if not exists local_commerce.draft_media_links (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  draft_id uuid not null,
  receipt_id uuid not null,
  position integer not null,
  crop jsonb,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint draft_media_links_pk primary key (project_id, id),
  constraint draft_media_links_position_key unique (project_id, draft_id, position),
  constraint draft_media_links_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint draft_media_links_draft_owner_fk foreign key (project_id, draft_id, owner_id)
    references local_commerce.configuration_drafts (project_id, id, owner_id),
  constraint draft_media_links_receipt_owner_fk foreign key (project_id, receipt_id, owner_id)
    references local_commerce.media_receipts (project_id, id, owner_id),
  constraint draft_media_links_position_check check (position >= 0),
  constraint draft_media_links_version_check check (version >= 1),
  constraint draft_media_links_lifecycle_check check (lifecycle in ('active', 'removed'))
);

create table if not exists local_commerce.media_copy_bindings (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  source_receipt_id uuid not null,
  target_draft_id uuid not null,
  action_key text not null,
  source_generation integer not null,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint media_copy_bindings_pk primary key (project_id, id),
  constraint media_copy_bindings_action_key unique (project_id, action_key),
  constraint media_copy_bindings_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint media_copy_bindings_source_owner_fk foreign key (project_id, source_receipt_id, owner_id)
    references local_commerce.media_receipts (project_id, id, owner_id),
  constraint media_copy_bindings_target_owner_fk foreign key (project_id, target_draft_id, owner_id)
    references local_commerce.configuration_drafts (project_id, id, owner_id),
  constraint media_copy_bindings_action_check check (length(btrim(action_key)) > 0),
  constraint media_copy_bindings_generation_check check (source_generation > 0),
  constraint media_copy_bindings_version_check check (version >= 1),
  constraint media_copy_bindings_lifecycle_check check (lifecycle in ('active', 'replayed', 'rejected'))
);

create or replace function local_commerce.set_updated_at()
returns trigger
language plpgsql
set search_path = local_commerce, pg_catalog
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function local_commerce.prevent_receipt_reference_change()
returns trigger
language plpgsql
set search_path = local_commerce, pg_catalog
as $$
begin
  if new.receipt_reference <> old.receipt_reference then
    raise exception 'receipt reference is immutable';
  end if;
  return new;
end;
$$;

create trigger media_receipts_reference_immutable
before update on local_commerce.media_receipts
for each row execute function local_commerce.prevent_receipt_reference_change();

create trigger project_identities_updated_at before update on local_commerce.project_identities for each row execute function local_commerce.set_updated_at();
create trigger commerce_owners_updated_at before update on local_commerce.commerce_owners for each row execute function local_commerce.set_updated_at();
create trigger customer_accounts_updated_at before update on local_commerce.customer_accounts for each row execute function local_commerce.set_updated_at();
create trigger customer_sessions_updated_at before update on local_commerce.customer_sessions for each row execute function local_commerce.set_updated_at();
create trigger access_grants_updated_at before update on local_commerce.access_grants for each row execute function local_commerce.set_updated_at();
create trigger catalog_products_updated_at before update on local_commerce.catalog_products for each row execute function local_commerce.set_updated_at();
create trigger catalog_variants_updated_at before update on local_commerce.catalog_variants for each row execute function local_commerce.set_updated_at();
create trigger catalog_configuration_snapshots_updated_at before update on local_commerce.catalog_configuration_snapshots for each row execute function local_commerce.set_updated_at();
create trigger catalog_pricing_rules_updated_at before update on local_commerce.catalog_pricing_rules for each row execute function local_commerce.set_updated_at();
create trigger carts_updated_at before update on local_commerce.carts for each row execute function local_commerce.set_updated_at();
create trigger cart_lines_updated_at before update on local_commerce.cart_lines for each row execute function local_commerce.set_updated_at();
create trigger configuration_drafts_updated_at before update on local_commerce.configuration_drafts for each row execute function local_commerce.set_updated_at();
create trigger media_objects_updated_at before update on local_commerce.media_objects for each row execute function local_commerce.set_updated_at();
create trigger media_receipts_updated_at before update on local_commerce.media_receipts for each row execute function local_commerce.set_updated_at();
create trigger media_derivatives_updated_at before update on local_commerce.media_derivatives for each row execute function local_commerce.set_updated_at();
create trigger draft_media_links_updated_at before update on local_commerce.draft_media_links for each row execute function local_commerce.set_updated_at();
create trigger media_copy_bindings_updated_at before update on local_commerce.media_copy_bindings for each row execute function local_commerce.set_updated_at();

revoke all on schema local_commerce from public, anon, authenticated;
revoke all on all tables in schema local_commerce from public, anon, authenticated;
grant usage on schema local_commerce to service_role;
grant select, insert, update, delete on all tables in schema local_commerce to service_role;
revoke all on all functions in schema local_commerce from public, anon, authenticated;
grant execute on function local_commerce.set_updated_at() to service_role;
grant execute on function local_commerce.prevent_receipt_reference_change() to service_role;
