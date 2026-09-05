-- PhotoGift C1 configurable catalog: additive schema expansion only.
--
-- Authoritative starting point: docs/catalog-schema-baseline.md (2026-08-07).
-- This migration intentionally creates no Product, Category, Variant, asset,
-- fulfillment, or audit records. Legacy Product mapping and guarded backfill
-- remain blocked on Tasks 3.5-3.7 and are not part of this migration.

begin;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text not null,
  seo jsonb not null default '{}'::jsonb,
  lifecycle text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_slug_key unique (slug),
  constraint categories_slug_format_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 160),
  constraint categories_name_check
    check (btrim(name) <> '' and length(name) <= 160),
  constraint categories_description_check
    check (btrim(description) <> '' and length(description) <= 10000),
  constraint categories_seo_object_check
    check (jsonb_typeof(seo) = 'object'),
  constraint categories_lifecycle_check
    check (lifecycle in ('draft', 'published', 'retired'))
);

alter table public.products
  add column category_id uuid,
  add column seo jsonb,
  add column lifecycle text,
  add constraint products_category_id_fkey
    foreign key (category_id)
    references public.categories(id)
    on update no action
    on delete restrict,
  add constraint products_seo_object_check
    check (seo is null or jsonb_typeof(seo) = 'object'),
  add constraint products_lifecycle_check
    check (lifecycle is null or lifecycle in ('draft', 'published', 'retired'));

create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  code text not null,
  name text not null,
  kind text not null,
  is_required boolean not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_options_product_fkey
    foreign key (product_id)
    references public.products(id)
    on update no action
    on delete restrict,
  constraint product_options_id_product_key unique (id, product_id),
  constraint product_options_product_code_key unique (product_id, code),
  constraint product_options_code_format_check
    check (code ~ '^[a-z0-9]+([-_][a-z0-9]+)*$' and length(code) <= 80),
  constraint product_options_no_customization_code_check
    check (code not in (
      'photo', 'photos', 'name', 'names', 'text', 'note', 'notes',
      'pose', 'poses', 'style', 'styles', 'upload', 'uploads', 'file',
      'files', 'customization', 'personalization'
    )),
  constraint product_options_name_check
    check (btrim(name) <> '' and length(name) <= 120),
  constraint product_options_kind_check
    check (kind in ('size', 'person_count', 'material', 'color', 'other_sku')),
  constraint product_options_position_check check (position >= 0)
);

create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  option_id uuid not null,
  code text not null,
  label text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_values_option_product_fkey
    foreign key (option_id, product_id)
    references public.product_options(id, product_id)
    on update no action
    on delete restrict,
  constraint product_option_values_identity_key
    unique (id, option_id, product_id),
  constraint product_option_values_option_code_key unique (option_id, code),
  constraint product_option_values_code_format_check
    check (code ~ '^[a-z0-9]+([-_][a-z0-9]+)*$' and length(code) <= 80),
  constraint product_option_values_label_check
    check (btrim(label) <> '' and length(label) <= 120),
  constraint product_option_values_position_check check (position >= 0)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  sku_code text not null,
  price_cents integer not null,
  currency text not null,
  weight_grams integer not null,
  is_active boolean not null default false,
  is_available boolean not null default false,
  is_default boolean not null default false,
  supply_method text not null,
  combination_signature text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_product_fkey
    foreign key (product_id)
    references public.products(id)
    on update no action
    on delete restrict,
  constraint product_variants_id_product_key unique (id, product_id),
  constraint product_variants_sku_code_key unique (sku_code),
  constraint product_variants_product_combination_key
    unique (product_id, combination_signature),
  constraint product_variants_sku_code_format_check
    check (
      sku_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
      and length(sku_code) <= 128
    ),
  constraint product_variants_price_check check (price_cents >= 0),
  constraint product_variants_currency_check check (currency = 'USD'),
  constraint product_variants_weight_check check (weight_grams >= 0),
  constraint product_variants_supply_method_check
    check (supply_method in ('made_to_order', 'digital_delivery')),
  constraint product_variants_combination_signature_check
    check (length(combination_signature) <= 4000)
);

create unique index product_variants_one_default_idx
  on public.product_variants (product_id)
  where is_default = true;

create table public.product_variant_values (
  variant_id uuid not null,
  product_id uuid not null,
  option_id uuid not null,
  option_value_id uuid not null,
  created_at timestamptz not null default now(),
  constraint product_variant_values_pkey primary key (variant_id, option_id),
  constraint product_variant_values_variant_product_fkey
    foreign key (variant_id, product_id)
    references public.product_variants(id, product_id)
    on update no action
    on delete restrict,
  constraint product_variant_values_option_product_fkey
    foreign key (option_id, product_id)
    references public.product_options(id, product_id)
    on update no action
    on delete restrict,
  constraint product_variant_values_value_ownership_fkey
    foreign key (option_value_id, option_id, product_id)
    references public.product_option_values(id, option_id, product_id)
    on update no action
    on delete restrict
);

create table public.product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  variant_id uuid,
  media_type text not null,
  role text not null,
  position integer not null default 0,
  alt_text text,
  title text,
  width integer,
  height integer,
  visibility text not null default 'public',
  source_kind text not null,
  source_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_assets_product_fkey
    foreign key (product_id)
    references public.products(id)
    on update no action
    on delete restrict,
  constraint product_assets_variant_product_fkey
    foreign key (variant_id, product_id)
    references public.product_variants(id, product_id)
    on update no action
    on delete restrict,
  constraint product_assets_media_type_check
    check (media_type in ('image', 'video')),
  constraint product_assets_role_check
    check (role in ('thumbnail', 'gallery', 'detail', 'example', 'seo')),
  constraint product_assets_position_check check (position >= 0),
  constraint product_assets_alt_text_check
    check (alt_text is null or (btrim(alt_text) <> '' and length(alt_text) <= 500)),
  constraint product_assets_title_check
    check (title is null or (btrim(title) <> '' and length(title) <= 200)),
  constraint product_assets_width_check check (width is null or width > 0),
  constraint product_assets_height_check check (height is null or height > 0),
  constraint product_assets_visibility_check check (visibility = 'public'),
  constraint product_assets_source_kind_check
    check (source_kind in ('url', 'public_reference')),
  constraint product_assets_source_value_check
    check (
      btrim(source_value) <> ''
      and length(source_value) <= 2048
      and source_value !~ '[[:space:]]'
      and (
        (source_kind = 'url' and source_value ~* '^https://')
        or (
          source_kind = 'public_reference'
          and source_value !~* '^(private|customer|order|preview|delivery):'
        )
      )
    )
);

create table public.product_fulfillment_configs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  fulfillment_type text not null,
  requires_shipping boolean not null,
  production_mode text not null,
  min_lead_time_business_days integer not null,
  max_lead_time_business_days integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_fulfillment_configs_product_key unique (product_id),
  constraint product_fulfillment_configs_product_fkey
    foreign key (product_id)
    references public.products(id)
    on update no action
    on delete restrict,
  constraint product_fulfillment_configs_type_check
    check (fulfillment_type in ('physical', 'digital')),
  constraint product_fulfillment_configs_mode_check
    check (production_mode in ('custom_manufacturing', 'digital_creation')),
  constraint product_fulfillment_configs_lead_time_check
    check (
      min_lead_time_business_days >= 0
      and max_lead_time_business_days >= min_lead_time_business_days
    ),
  constraint product_fulfillment_configs_shipping_check
    check (fulfillment_type <> 'digital' or requires_shipping = false)
);

create table public.catalog_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  outcome text not null,
  target_type text not null,
  target_identifier text not null,
  actor_boundary text not null,
  actor_identifier text,
  reason_code text,
  occurred_at timestamptz not null default now(),
  constraint catalog_audit_events_action_check
    check (action in (
      'publish',
      'unpublish',
      'retire',
      'destructive_state_mutation_attempt'
    )),
  constraint catalog_audit_events_outcome_check
    check (outcome in ('succeeded', 'rejected', 'failed')),
  constraint catalog_audit_events_target_type_check
    check (
      target_type in (
        'category',
        'product',
        'product_option',
        'product_option_value',
        'product_variant',
        'product_asset',
        'product_fulfillment_config'
      )
    ),
  constraint catalog_audit_events_target_identifier_check
    check (btrim(target_identifier) <> '' and length(target_identifier) <= 160),
  constraint catalog_audit_events_actor_boundary_check
    check (btrim(actor_boundary) <> '' and length(actor_boundary) <= 128),
  constraint catalog_audit_events_actor_identifier_check
    check (
      actor_identifier is null
      or (btrim(actor_identifier) <> '' and length(actor_identifier) <= 160)
    ),
  constraint catalog_audit_events_reason_code_check
    check (
      reason_code is null
      or (
        reason_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
        and length(reason_code) <= 120
      )
    )
);

create index categories_publication_idx
  on public.categories (lifecycle, slug);
create index products_catalog_category_idx
  on public.products (category_id, lifecycle, is_published, slug)
  where category_id is not null;
create index product_options_order_idx
  on public.product_options (product_id, position, id);
create index product_option_values_order_idx
  on public.product_option_values (option_id, position, id);
create index product_variants_eligibility_idx
  on public.product_variants (product_id, is_active, is_available, price_cents);
create index product_variant_values_value_idx
  on public.product_variant_values (option_value_id, variant_id);
create index product_assets_product_order_idx
  on public.product_assets (product_id, role, position, id);
create index product_assets_variant_idx
  on public.product_assets (variant_id, position, id)
  where variant_id is not null;
create index catalog_audit_events_target_idx
  on public.catalog_audit_events (target_type, target_identifier, occurred_at desc);
create index catalog_audit_events_occurred_idx
  on public.catalog_audit_events (occurred_at desc);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger product_options_set_updated_at
before update on public.product_options
for each row execute function public.set_updated_at();

create trigger product_option_values_set_updated_at
before update on public.product_option_values
for each row execute function public.set_updated_at();

create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

create trigger product_assets_set_updated_at
before update on public.product_assets
for each row execute function public.set_updated_at();

create trigger product_fulfillment_configs_set_updated_at
before update on public.product_fulfillment_configs
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.product_options enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_variant_values enable row level security;
alter table public.product_assets enable row level security;
alter table public.product_fulfillment_configs enable row level security;
alter table public.catalog_audit_events enable row level security;

create policy "catalog server manages categories"
  on public.categories
  for all to service_role
  using (true)
  with check (true);

create policy "catalog server manages product options"
  on public.product_options
  for all to service_role
  using (true)
  with check (true);

create policy "catalog server manages product option values"
  on public.product_option_values
  for all to service_role
  using (true)
  with check (true);

create policy "catalog server manages product variants"
  on public.product_variants
  for all to service_role
  using (true)
  with check (true);

create policy "catalog server manages product variant values"
  on public.product_variant_values
  for all to service_role
  using (true)
  with check (true);

create policy "catalog server manages product assets"
  on public.product_assets
  for all to service_role
  using (true)
  with check (true);

create policy "catalog server manages fulfillment configs"
  on public.product_fulfillment_configs
  for all to service_role
  using (true)
  with check (true);

create policy "catalog audit server reads"
  on public.catalog_audit_events
  for select to service_role
  using (true);

create policy "catalog audit server appends"
  on public.catalog_audit_events
  for insert to service_role
  with check (true);

revoke all privileges on table
  public.categories,
  public.product_options,
  public.product_option_values,
  public.product_variants,
  public.product_variant_values,
  public.product_assets,
  public.product_fulfillment_configs,
  public.catalog_audit_events
from public, anon, authenticated, service_role;

grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.categories,
  public.product_options,
  public.product_option_values,
  public.product_variants,
  public.product_variant_values,
  public.product_assets,
  public.product_fulfillment_configs
to service_role;

grant select, insert on table public.catalog_audit_events to service_role;

commit;
