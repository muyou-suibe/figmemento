-- LOCAL COMMERCE ONLY. This migration adds purchase facts and local lifecycle
-- records. It does not create a production checkout, payment, or delivery
-- integration and does not alter the repository-root Supabase project.

create extension if not exists "pgcrypto";
create schema if not exists local_commerce;

-- Order lifecycle is deliberately separate from the immutable purchase facts.
create table if not exists local_commerce.orders (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  public_reference text not null,
  lifecycle_status text not null default 'pending_payment',
  fulfillment_status text not null default 'awaiting_review',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint orders_pk primary key (project_id, id),
  constraint orders_owner_identity_key unique (project_id, id, owner_id),
  constraint orders_reference_key unique (project_id, public_reference),
  constraint orders_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint orders_reference_check check (public_reference ~ '^FM-[A-Z0-9-]+$'),
  constraint orders_lifecycle_status_check check (lifecycle_status in ('pending_payment', 'paid', 'payment_failed', 'cancelled', 'closed')),
  constraint orders_fulfillment_status_check check (fulfillment_status in ('awaiting_review', 'photo_review', 'preview_pending', 'preview_approved', 'quality_check', 'ready_for_outbound', 'shipment_created', 'delivered', 'not_applicable')),
  constraint orders_version_check check (version >= 1),
  constraint orders_lifecycle_check check (lifecycle in ('active', 'cancelled', 'closed'))
);

create table if not exists local_commerce.order_purchase_snapshots (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  owner_id uuid not null,
  snapshot_version integer not null default 1,
  purchase_facts jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  currency text not null,
  subtotal_cents integer not null,
  shipping_cents integer not null default 0,
  discount_cents integer not null default 0,
  tax_status text not null default 'not_activated',
  tax_amount_cents integer,
  total_cents integer not null,
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_purchase_snapshots_pk primary key (project_id, id),
  constraint order_purchase_snapshots_order_key unique (project_id, order_id, owner_id),
  constraint order_purchase_snapshots_owner_identity_key unique (project_id, id, owner_id),
  constraint order_purchase_snapshots_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint order_purchase_snapshots_version_check check (snapshot_version > 0 and version >= 1),
  constraint order_purchase_snapshots_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint order_purchase_snapshots_amounts_check check (subtotal_cents >= 0 and shipping_cents >= 0 and discount_cents >= 0 and total_cents >= 0),
  constraint order_purchase_snapshots_tax_check check (tax_status = 'not_activated' and tax_amount_cents is null),
  constraint order_purchase_snapshots_lifecycle_check check (lifecycle = 'committed')
);

create table if not exists local_commerce.order_items (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  owner_id uuid not null,
  item_sequence integer not null,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_items_pk primary key (project_id, id),
  constraint order_items_owner_identity_key unique (project_id, id, owner_id),
  constraint order_items_sequence_key unique (project_id, order_id, item_sequence),
  constraint order_items_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint order_items_sequence_check check (item_sequence >= 0),
  constraint order_items_version_check check (version >= 1),
  constraint order_items_lifecycle_check check (lifecycle in ('active', 'cancelled', 'fulfilled'))
);

create table if not exists local_commerce.order_item_purchase_snapshots (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_item_id uuid not null,
  owner_id uuid not null,
  product_id uuid not null,
  product_slug text not null,
  product_name text not null,
  sku_code text not null,
  variant_facts jsonb not null default '{}'::jsonb,
  customization_facts jsonb not null default '{}'::jsonb,
  configuration_revision integer not null,
  receipt_references jsonb not null default '[]'::jsonb,
  quantity integer not null,
  unit_price_cents integer not null,
  line_subtotal_cents integer not null,
  currency text not null,
  fulfillment_type text not null,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_item_purchase_snapshots_pk primary key (project_id, id),
  constraint order_item_purchase_snapshots_item_key unique (project_id, order_item_id, owner_id),
  constraint order_item_purchase_snapshots_owner_identity_key unique (project_id, id, owner_id),
  constraint order_item_purchase_snapshots_item_owner_fk foreign key (project_id, order_item_id, owner_id)
    references local_commerce.order_items (project_id, id, owner_id),
  constraint order_item_purchase_snapshots_product_check check (length(btrim(product_slug)) > 0 and length(btrim(product_name)) > 0 and length(btrim(sku_code)) > 0),
  constraint order_item_purchase_snapshots_revision_check check (configuration_revision > 0),
  constraint order_item_purchase_snapshots_receipts_check check (jsonb_typeof(receipt_references) in ('array', 'object')),
  constraint order_item_purchase_snapshots_quantity_check check (quantity > 0),
  constraint order_item_purchase_snapshots_amounts_check check (unit_price_cents >= 0 and line_subtotal_cents >= 0),
  constraint order_item_purchase_snapshots_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint order_item_purchase_snapshots_fulfillment_check check (fulfillment_type in ('physical', 'digital')),
  constraint order_item_purchase_snapshots_version_check check (version >= 1),
  constraint order_item_purchase_snapshots_lifecycle_check check (lifecycle = 'committed')
);

-- A receipt can be attached to at most one purchased item in this project.
create table if not exists local_commerce.order_item_receipt_bindings (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_item_id uuid not null,
  receipt_id uuid not null,
  owner_id uuid not null,
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_item_receipt_bindings_pk primary key (project_id, id),
  constraint order_item_receipt_bindings_receipt_key unique (project_id, receipt_id),
  constraint order_item_receipt_bindings_item_receipt_key unique (project_id, order_item_id, receipt_id),
  constraint order_item_receipt_bindings_item_owner_fk foreign key (project_id, order_item_id, owner_id)
    references local_commerce.order_items (project_id, id, owner_id),
  constraint order_item_receipt_bindings_receipt_owner_fk foreign key (project_id, receipt_id, owner_id)
    references local_commerce.media_receipts (project_id, id, owner_id),
  constraint order_item_receipt_bindings_version_check check (version >= 1),
  constraint order_item_receipt_bindings_lifecycle_check check (lifecycle = 'committed')
);

-- Payment records are local simulation records only.
create table if not exists local_commerce.payment_attempts (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  owner_id uuid not null,
  action_key text not null,
  amount_cents integer not null,
  currency text not null,
  outcome text not null default 'pending',
  simulation_label text not null default 'local_simulation',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payment_attempts_pk primary key (project_id, id),
  constraint payment_attempts_owner_identity_key unique (project_id, id, owner_id),
  constraint payment_attempts_action_key unique (project_id, action_key),
  constraint payment_attempts_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint payment_attempts_action_check check (length(btrim(action_key)) > 0),
  constraint payment_attempts_amount_check check (amount_cents >= 0),
  constraint payment_attempts_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payment_attempts_outcome_check check (outcome in ('pending', 'succeeded', 'failed', 'cancelled')),
  constraint payment_attempts_simulation_check check (simulation_label = 'local_simulation'),
  constraint payment_attempts_version_check check (version >= 1),
  constraint payment_attempts_lifecycle_check check (lifecycle in ('active', 'settled', 'rejected'))
);

create table if not exists local_commerce.payment_actions (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  attempt_id uuid not null,
  owner_id uuid not null,
  action_key text not null,
  request_digest text not null,
  result jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payment_actions_pk primary key (project_id, id),
  constraint payment_actions_action_key unique (project_id, action_key),
  constraint payment_actions_attempt_key unique (project_id, attempt_id),
  constraint payment_actions_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint payment_actions_attempt_owner_fk foreign key (project_id, attempt_id, owner_id)
    references local_commerce.payment_attempts (project_id, id, owner_id),
  constraint payment_actions_action_check check (length(btrim(action_key)) > 0),
  constraint payment_actions_digest_check check (length(btrim(request_digest)) >= 16),
  constraint payment_actions_version_check check (version >= 1),
  constraint payment_actions_lifecycle_check check (lifecycle in ('committed', 'rejected'))
);

create table if not exists local_commerce.fulfillments (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  owner_id uuid not null,
  fulfillment_state text not null default 'awaiting_review',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fulfillments_pk primary key (project_id, id),
  constraint fulfillments_order_key unique (project_id, order_id),
  constraint fulfillments_owner_identity_key unique (project_id, id, owner_id),
  constraint fulfillments_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint fulfillments_state_check check (fulfillment_state in ('awaiting_review', 'photo_review', 'preview_pending', 'preview_approved', 'quality_check', 'ready_for_outbound', 'shipment_created', 'complete', 'not_applicable')),
  constraint fulfillments_version_check check (version >= 1),
  constraint fulfillments_lifecycle_check check (lifecycle in ('active', 'complete', 'cancelled'))
);

create table if not exists local_commerce.photo_reviews (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  fulfillment_id uuid not null,
  order_item_id uuid not null,
  order_id uuid not null,
  owner_id uuid not null,
  review_state text not null default 'pending',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint photo_reviews_pk primary key (project_id, id),
  constraint photo_reviews_item_key unique (project_id, fulfillment_id, order_item_id),
  constraint photo_reviews_fulfillment_owner_fk foreign key (project_id, fulfillment_id, owner_id)
    references local_commerce.fulfillments (project_id, id, owner_id),
  constraint photo_reviews_item_owner_fk foreign key (project_id, order_item_id, owner_id)
    references local_commerce.order_items (project_id, id, owner_id),
  constraint photo_reviews_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint photo_reviews_state_check check (review_state in ('pending', 'approved', 'rejected')),
  constraint photo_reviews_version_check check (version >= 1),
  constraint photo_reviews_lifecycle_check check (lifecycle in ('active', 'superseded'))
);

create table if not exists local_commerce.preview_manifests (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  fulfillment_id uuid not null,
  order_id uuid not null,
  owner_id uuid not null,
  manifest_version integer not null,
  item_ids jsonb not null default '[]'::jsonb,
  manifest_state text not null default 'pending',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint preview_manifests_pk primary key (project_id, id),
  constraint preview_manifests_version_key unique (project_id, fulfillment_id, manifest_version),
  constraint preview_manifests_owner_identity_key unique (project_id, id, owner_id),
  constraint preview_manifests_fulfillment_owner_fk foreign key (project_id, fulfillment_id, owner_id)
    references local_commerce.fulfillments (project_id, id, owner_id),
  constraint preview_manifests_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint preview_manifests_manifest_version_check check (manifest_version > 0),
  constraint preview_manifests_items_check check (jsonb_typeof(item_ids) = 'array'),
  constraint preview_manifests_state_check check (manifest_state in ('pending', 'approved', 'superseded')),
  constraint preview_manifests_version_check check (version >= 1),
  constraint preview_manifests_lifecycle_check check (lifecycle in ('active', 'superseded'))
);

create table if not exists local_commerce.fulfillment_decisions (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  fulfillment_id uuid not null,
  order_id uuid not null,
  owner_id uuid not null,
  decision_kind text not null,
  expected_manifest_version integer,
  action_key text not null,
  note text not null default '',
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fulfillment_decisions_pk primary key (project_id, id),
  constraint fulfillment_decisions_action_key unique (project_id, action_key),
  constraint fulfillment_decisions_fulfillment_owner_fk foreign key (project_id, fulfillment_id, owner_id)
    references local_commerce.fulfillments (project_id, id, owner_id),
  constraint fulfillment_decisions_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint fulfillment_decisions_kind_check check (decision_kind in ('customer_approve', 'customer_revision', 'operator_timeout')),
  constraint fulfillment_decisions_manifest_check check (expected_manifest_version is null or expected_manifest_version > 0),
  constraint fulfillment_decisions_action_check check (length(btrim(action_key)) > 0),
  constraint fulfillment_decisions_version_check check (version >= 1),
  constraint fulfillment_decisions_lifecycle_check check (lifecycle = 'committed')
);

create table if not exists local_commerce.shipments (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  fulfillment_id uuid not null,
  order_id uuid not null,
  owner_id uuid not null,
  tracking_lifecycle text not null default 'shipment_created',
  tracking_reference text,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint shipments_pk primary key (project_id, id),
  constraint shipments_fulfillment_key unique (project_id, fulfillment_id),
  constraint shipments_owner_identity_key unique (project_id, id, owner_id),
  constraint shipments_fulfillment_owner_fk foreign key (project_id, fulfillment_id, owner_id)
    references local_commerce.fulfillments (project_id, id, owner_id),
  constraint shipments_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint shipments_tracking_lifecycle_check check (tracking_lifecycle in ('shipment_created', 'shipped', 'in_transit', 'delivered', 'cancelled')),
  constraint shipments_tracking_reference_check check (tracking_reference is null or length(btrim(tracking_reference)) > 0),
  constraint shipments_version_check check (version >= 1),
  constraint shipments_lifecycle_check check (lifecycle in ('active', 'delivered', 'cancelled'))
);

create table if not exists local_commerce.shipment_events (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  shipment_id uuid not null,
  order_id uuid not null,
  owner_id uuid not null,
  event_key text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint shipment_events_pk primary key (project_id, id),
  constraint shipment_events_key unique (project_id, event_key),
  constraint shipment_events_type_key unique (project_id, shipment_id, event_type),
  constraint shipment_events_shipment_owner_fk foreign key (project_id, shipment_id, owner_id)
    references local_commerce.shipments (project_id, id, owner_id),
  constraint shipment_events_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint shipment_events_key_check check (length(btrim(event_key)) > 0),
  constraint shipment_events_type_check check (event_type in ('shipment_created', 'shipped', 'in_transit', 'delivered', 'cancelled')),
  constraint shipment_events_version_check check (version >= 1),
  constraint shipment_events_lifecycle_check check (lifecycle = 'committed')
);

create table if not exists local_commerce.digital_versions (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_item_id uuid not null,
  owner_id uuid not null,
  version_number integer not null,
  content_reference text not null,
  status text not null default 'draft',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint digital_versions_pk primary key (project_id, id),
  constraint digital_versions_item_version_key unique (project_id, order_item_id, version_number),
  constraint digital_versions_owner_identity_key unique (project_id, id, owner_id),
  constraint digital_versions_item_owner_fk foreign key (project_id, order_item_id, owner_id)
    references local_commerce.order_items (project_id, id, owner_id),
  constraint digital_versions_number_check check (version_number > 0),
  constraint digital_versions_reference_check check (length(btrim(content_reference)) > 0),
  constraint digital_versions_status_check check (status in ('draft', 'published', 'revoked')),
  constraint digital_versions_version_check check (version >= 1),
  constraint digital_versions_lifecycle_check check (lifecycle in ('active', 'revoked'))
);

create table if not exists local_commerce.digital_grants (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_item_id uuid not null,
  digital_version_id uuid not null,
  owner_id uuid not null,
  expires_at timestamptz not null,
  max_attempts integer not null,
  used_attempts integer not null default 0,
  grant_status text not null default 'active',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint digital_grants_pk primary key (project_id, id),
  constraint digital_grants_item_version_key unique (project_id, order_item_id, digital_version_id),
  constraint digital_grants_owner_identity_key unique (project_id, id, owner_id),
  constraint digital_grants_item_owner_fk foreign key (project_id, order_item_id, owner_id)
    references local_commerce.order_items (project_id, id, owner_id),
  constraint digital_grants_version_owner_fk foreign key (project_id, digital_version_id, owner_id)
    references local_commerce.digital_versions (project_id, id, owner_id),
  constraint digital_grants_attempts_check check (max_attempts > 0 and used_attempts >= 0 and used_attempts <= max_attempts),
  constraint digital_grants_status_check check (grant_status in ('active', 'expired', 'revoked')),
  constraint digital_grants_version_check check (version >= 1),
  constraint digital_grants_lifecycle_check check (lifecycle in ('active', 'expired', 'revoked'))
);

create table if not exists local_commerce.digital_tickets (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  grant_id uuid not null,
  owner_id uuid not null,
  ticket_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint digital_tickets_pk primary key (project_id, id),
  constraint digital_tickets_owner_identity_key unique (project_id, id, owner_id),
  constraint digital_tickets_hash_key unique (project_id, ticket_hash),
  constraint digital_tickets_grant_owner_fk foreign key (project_id, grant_id, owner_id)
    references local_commerce.digital_grants (project_id, id, owner_id),
  constraint digital_tickets_hash_check check (length(btrim(ticket_hash)) >= 32),
  constraint digital_tickets_version_check check (version >= 1),
  constraint digital_tickets_lifecycle_check check (lifecycle in ('active', 'consumed', 'expired', 'revoked'))
);

create table if not exists local_commerce.digital_delivery_attempts (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  grant_id uuid not null,
  ticket_id uuid not null,
  order_item_id uuid not null,
  owner_id uuid not null,
  action_key text not null,
  attempt_result text not null default 'pending',
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint digital_delivery_attempts_pk primary key (project_id, id),
  constraint digital_delivery_attempts_action_key unique (project_id, action_key),
  constraint digital_delivery_attempts_grant_owner_fk foreign key (project_id, grant_id, owner_id)
    references local_commerce.digital_grants (project_id, id, owner_id),
  constraint digital_delivery_attempts_ticket_owner_fk foreign key (project_id, ticket_id, owner_id)
    references local_commerce.digital_tickets (project_id, id, owner_id),
  constraint digital_delivery_attempts_item_owner_fk foreign key (project_id, order_item_id, owner_id)
    references local_commerce.order_items (project_id, id, owner_id),
  constraint digital_delivery_attempts_action_check check (length(btrim(action_key)) > 0),
  constraint digital_delivery_attempts_result_check check (attempt_result in ('pending', 'streamed', 'failed', 'unknown')),
  constraint digital_delivery_attempts_version_check check (version >= 1),
  constraint digital_delivery_attempts_lifecycle_check check (lifecycle in ('active', 'completed', 'failed'))
);

create or replace function local_commerce.prevent_purchase_fact_change()
returns trigger
language plpgsql
set search_path = local_commerce, pg_catalog
as $$
begin
  raise exception 'committed purchase facts are immutable';
end;
$$;

create trigger order_purchase_snapshots_immutable
before update or delete on local_commerce.order_purchase_snapshots
for each row execute function local_commerce.prevent_purchase_fact_change();

create trigger order_item_purchase_snapshots_immutable
before update or delete on local_commerce.order_item_purchase_snapshots
for each row execute function local_commerce.prevent_purchase_fact_change();

create trigger order_item_receipt_bindings_immutable
before update or delete on local_commerce.order_item_receipt_bindings
for each row execute function local_commerce.prevent_purchase_fact_change();

create trigger orders_updated_at before update on local_commerce.orders for each row execute function local_commerce.set_updated_at();
create trigger order_purchase_snapshots_updated_at before update on local_commerce.order_purchase_snapshots for each row execute function local_commerce.set_updated_at();
create trigger order_items_updated_at before update on local_commerce.order_items for each row execute function local_commerce.set_updated_at();
create trigger order_item_purchase_snapshots_updated_at before update on local_commerce.order_item_purchase_snapshots for each row execute function local_commerce.set_updated_at();
create trigger order_item_receipt_bindings_updated_at before update on local_commerce.order_item_receipt_bindings for each row execute function local_commerce.set_updated_at();
create trigger payment_attempts_updated_at before update on local_commerce.payment_attempts for each row execute function local_commerce.set_updated_at();
create trigger payment_actions_updated_at before update on local_commerce.payment_actions for each row execute function local_commerce.set_updated_at();
create trigger fulfillments_updated_at before update on local_commerce.fulfillments for each row execute function local_commerce.set_updated_at();
create trigger photo_reviews_updated_at before update on local_commerce.photo_reviews for each row execute function local_commerce.set_updated_at();
create trigger preview_manifests_updated_at before update on local_commerce.preview_manifests for each row execute function local_commerce.set_updated_at();
create trigger fulfillment_decisions_updated_at before update on local_commerce.fulfillment_decisions for each row execute function local_commerce.set_updated_at();
create trigger shipments_updated_at before update on local_commerce.shipments for each row execute function local_commerce.set_updated_at();
create trigger shipment_events_updated_at before update on local_commerce.shipment_events for each row execute function local_commerce.set_updated_at();
create trigger digital_versions_updated_at before update on local_commerce.digital_versions for each row execute function local_commerce.set_updated_at();
create trigger digital_grants_updated_at before update on local_commerce.digital_grants for each row execute function local_commerce.set_updated_at();
create trigger digital_tickets_updated_at before update on local_commerce.digital_tickets for each row execute function local_commerce.set_updated_at();
create trigger digital_delivery_attempts_updated_at before update on local_commerce.digital_delivery_attempts for each row execute function local_commerce.set_updated_at();

revoke all on schema local_commerce from public, anon, authenticated;
revoke all on all tables in schema local_commerce from public, anon, authenticated;
grant usage on schema local_commerce to service_role;
grant select, insert, update, delete on all tables in schema local_commerce to service_role;
revoke all on all functions in schema local_commerce from public, anon, authenticated;
grant execute on function local_commerce.prevent_purchase_fact_change() to service_role;
