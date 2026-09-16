-- LOCAL COMMERCE ONLY. This migration closes the local database and private
-- Storage boundary. It does not alter root Supabase policies or production
-- configuration.

create schema if not exists local_commerce;

-- Every local commerce relation is deny-by-default for browser roles. The
-- trusted local service role remains the only direct table actor.
alter table local_commerce.migration_ledger enable row level security;
alter table local_commerce.project_identities enable row level security;
alter table local_commerce.commerce_owners enable row level security;
alter table local_commerce.customer_accounts enable row level security;
alter table local_commerce.customer_sessions enable row level security;
alter table local_commerce.access_grants enable row level security;
alter table local_commerce.catalog_products enable row level security;
alter table local_commerce.catalog_variants enable row level security;
alter table local_commerce.catalog_configuration_snapshots enable row level security;
alter table local_commerce.catalog_pricing_rules enable row level security;
alter table local_commerce.carts enable row level security;
alter table local_commerce.cart_lines enable row level security;
alter table local_commerce.configuration_drafts enable row level security;
alter table local_commerce.media_objects enable row level security;
alter table local_commerce.media_receipts enable row level security;
alter table local_commerce.media_derivatives enable row level security;
alter table local_commerce.draft_media_links enable row level security;
alter table local_commerce.media_copy_bindings enable row level security;
alter table local_commerce.orders enable row level security;
alter table local_commerce.order_purchase_snapshots enable row level security;
alter table local_commerce.order_items enable row level security;
alter table local_commerce.order_item_purchase_snapshots enable row level security;
alter table local_commerce.order_item_receipt_bindings enable row level security;
alter table local_commerce.payment_attempts enable row level security;
alter table local_commerce.payment_actions enable row level security;
alter table local_commerce.fulfillments enable row level security;
alter table local_commerce.photo_reviews enable row level security;
alter table local_commerce.preview_manifests enable row level security;
alter table local_commerce.fulfillment_decisions enable row level security;
alter table local_commerce.shipments enable row level security;
alter table local_commerce.shipment_events enable row level security;
alter table local_commerce.digital_versions enable row level security;
alter table local_commerce.digital_grants enable row level security;
alter table local_commerce.digital_tickets enable row level security;
alter table local_commerce.digital_delivery_attempts enable row level security;

create policy local_commerce_service_role_migration_ledger
on local_commerce.migration_ledger for all to service_role using (true) with check (true);
create policy local_commerce_service_role_project_identities
on local_commerce.project_identities for all to service_role using (true) with check (true);
create policy local_commerce_service_role_commerce_owners
on local_commerce.commerce_owners for all to service_role using (true) with check (true);
create policy local_commerce_service_role_customer_accounts
on local_commerce.customer_accounts for all to service_role using (true) with check (true);
create policy local_commerce_service_role_customer_sessions
on local_commerce.customer_sessions for all to service_role using (true) with check (true);
create policy local_commerce_service_role_access_grants
on local_commerce.access_grants for all to service_role using (true) with check (true);
create policy local_commerce_service_role_catalog_products
on local_commerce.catalog_products for all to service_role using (true) with check (true);
create policy local_commerce_service_role_catalog_variants
on local_commerce.catalog_variants for all to service_role using (true) with check (true);
create policy local_commerce_service_role_catalog_configuration_snapshots
on local_commerce.catalog_configuration_snapshots for all to service_role using (true) with check (true);
create policy local_commerce_service_role_catalog_pricing_rules
on local_commerce.catalog_pricing_rules for all to service_role using (true) with check (true);
create policy local_commerce_service_role_carts
on local_commerce.carts for all to service_role using (true) with check (true);
create policy local_commerce_service_role_cart_lines
on local_commerce.cart_lines for all to service_role using (true) with check (true);
create policy local_commerce_service_role_configuration_drafts
on local_commerce.configuration_drafts for all to service_role using (true) with check (true);
create policy local_commerce_service_role_media_objects
on local_commerce.media_objects for all to service_role using (true) with check (true);
create policy local_commerce_service_role_media_receipts
on local_commerce.media_receipts for all to service_role using (true) with check (true);
create policy local_commerce_service_role_media_derivatives
on local_commerce.media_derivatives for all to service_role using (true) with check (true);
create policy local_commerce_service_role_draft_media_links
on local_commerce.draft_media_links for all to service_role using (true) with check (true);
create policy local_commerce_service_role_media_copy_bindings
on local_commerce.media_copy_bindings for all to service_role using (true) with check (true);
create policy local_commerce_service_role_orders
on local_commerce.orders for all to service_role using (true) with check (true);
create policy local_commerce_service_role_order_purchase_snapshots
on local_commerce.order_purchase_snapshots for all to service_role using (true) with check (true);
create policy local_commerce_service_role_order_items
on local_commerce.order_items for all to service_role using (true) with check (true);
create policy local_commerce_service_role_order_item_purchase_snapshots
on local_commerce.order_item_purchase_snapshots for all to service_role using (true) with check (true);
create policy local_commerce_service_role_order_item_receipt_bindings
on local_commerce.order_item_receipt_bindings for all to service_role using (true) with check (true);
create policy local_commerce_service_role_payment_attempts
on local_commerce.payment_attempts for all to service_role using (true) with check (true);
create policy local_commerce_service_role_payment_actions
on local_commerce.payment_actions for all to service_role using (true) with check (true);
create policy local_commerce_service_role_fulfillments
on local_commerce.fulfillments for all to service_role using (true) with check (true);
create policy local_commerce_service_role_photo_reviews
on local_commerce.photo_reviews for all to service_role using (true) with check (true);
create policy local_commerce_service_role_preview_manifests
on local_commerce.preview_manifests for all to service_role using (true) with check (true);
create policy local_commerce_service_role_fulfillment_decisions
on local_commerce.fulfillment_decisions for all to service_role using (true) with check (true);
create policy local_commerce_service_role_shipments
on local_commerce.shipments for all to service_role using (true) with check (true);
create policy local_commerce_service_role_shipment_events
on local_commerce.shipment_events for all to service_role using (true) with check (true);
create policy local_commerce_service_role_digital_versions
on local_commerce.digital_versions for all to service_role using (true) with check (true);
create policy local_commerce_service_role_digital_grants
on local_commerce.digital_grants for all to service_role using (true) with check (true);
create policy local_commerce_service_role_digital_tickets
on local_commerce.digital_tickets for all to service_role using (true) with check (true);
create policy local_commerce_service_role_digital_delivery_attempts
on local_commerce.digital_delivery_attempts for all to service_role using (true) with check (true);

revoke all on schema local_commerce from public, anon, authenticated;
revoke all on all tables in schema local_commerce from public, anon, authenticated;
grant usage on schema local_commerce to service_role;
grant select, insert, update, delete on all tables in schema local_commerce to service_role;
revoke all on all functions in schema local_commerce from public, anon, authenticated;

-- The local bucket is private. Browser roles have no bucket/object grants or
-- policies, so bytes can only be handled by the trusted server boundary.
insert into storage.buckets (id, name, public)
values ('local-commerce-private', 'local-commerce-private', false)
on conflict (id) do update set public = false;

-- Supabase owns these system tables. They are RLS-protected by the Storage
-- service already; verify that invariant without requiring this migration to
-- become the system-table owner.
do $$
begin
  execute 'alter table storage.buckets enable row level security';
exception when insufficient_privilege then
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'buckets' and c.relrowsecurity
  ) then
    raise;
  end if;
end
$$;

do $$
begin
  execute 'alter table storage.objects enable row level security';
exception when insufficient_privilege then
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity
  ) then
    raise;
  end if;
end
$$;
revoke all on table storage.buckets from public, anon, authenticated;
revoke all on table storage.objects from public, anon, authenticated;
grant select, insert, update, delete on table storage.buckets to service_role;
grant select, insert, update, delete on table storage.objects to service_role;

create policy local_commerce_private_bucket_service_role
on storage.buckets for all to service_role
using (id = 'local-commerce-private')
with check (id = 'local-commerce-private' and public = false);

create policy local_commerce_private_objects_service_role
on storage.objects for all to service_role
using (bucket_id = 'local-commerce-private')
with check (bucket_id = 'local-commerce-private');

-- This is a bounded read check used by trusted local composition. It accepts
-- only explicitly typed values and never builds SQL from caller input.
create or replace function local_commerce.verify_project_identity(
  p_project_id text,
  p_marker_digest text
)
returns boolean
language sql
security definer
set search_path = local_commerce, pg_catalog
as $$
  select length(btrim(p_project_id)) > 0
    and length(btrim(p_marker_digest)) > 0
    and exists (
      select 1
      from project_identities
      where project_id = p_project_id
        and marker_digest = p_marker_digest
        and lifecycle = 'active'
    );
$$;

revoke all on function local_commerce.verify_project_identity(text, text) from public, anon, authenticated;
grant execute on function local_commerce.verify_project_identity(text, text) to service_role;
