-- PhotoGift Customization Phase A: normalized configuration schema only.
--
-- This local artifact is additive and intentionally creates no Product
-- configuration data. It does not modify products.customization_schema.

begin;

create function public.customization_image_mime_types_are_valid(p_values text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select p_values is not null
    and pg_catalog.cardinality(p_values) > 0
    and pg_catalog.array_position(p_values, null) is null
    and p_values <@ array['image/jpeg', 'image/png', 'image/webp']::text[]
    and pg_catalog.cardinality(p_values) = pg_catalog.cardinality(
      array(
        select distinct mime_type
        from pg_catalog.unnest(p_values) as mime_type
      )
    );
$function$;

revoke all privileges on function public.customization_image_mime_types_are_valid(text[]) from public;
revoke all privileges on function public.customization_image_mime_types_are_valid(text[]) from anon;
revoke all privileges on function public.customization_image_mime_types_are_valid(text[]) from authenticated;
revoke all privileges on function public.customization_image_mime_types_are_valid(text[]) from service_role;
grant execute on function public.customization_image_mime_types_are_valid(text[]) to service_role;

create table public.product_customization_configs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint product_customization_configs_product_fkey
    foreign key (product_id)
    references public.products(id)
    on update no action
    on delete restrict,
  constraint product_customization_configs_id_product_key unique (id, product_id),
  constraint product_customization_configs_current_superseded_check
    check (not is_current or superseded_at is null)
);

create unique index product_customization_configs_one_current_idx
  on public.product_customization_configs (product_id)
  where is_current;

create table public.customization_field_identities (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  code text not null,
  created_at timestamptz not null default now(),
  constraint customization_field_identities_product_fkey
    foreign key (product_id)
    references public.products(id)
    on update no action
    on delete restrict,
  constraint customization_field_identities_id_product_key unique (id, product_id),
  constraint customization_field_identities_product_code_key unique (product_id, code),
  constraint customization_field_identities_code_format_check
    check (
      code ~ '^[a-z0-9]+([-_][a-z0-9]+)*$'
      and length(code) <= 80
    )
);

create table public.customization_fields (
  id uuid primary key default gen_random_uuid(),
  configuration_revision_id uuid not null,
  product_id uuid not null,
  stable_field_id uuid not null,
  label text not null,
  kind text not null,
  required boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  max_length integer,
  help_text text,
  allowed_mime_types text[],
  max_bytes integer,
  min_width integer,
  min_height integer,
  recommended_width integer,
  recommended_height integer,
  min_image_count integer,
  max_image_count integer,
  crop_enabled boolean,
  created_at timestamptz not null default now(),
  constraint customization_fields_revision_product_fkey
    foreign key (configuration_revision_id, product_id)
    references public.product_customization_configs(id, product_id)
    on update no action
    on delete restrict,
  constraint customization_fields_identity_product_fkey
    foreign key (stable_field_id, product_id)
    references public.customization_field_identities(id, product_id)
    on update no action
    on delete restrict,
  constraint customization_fields_revision_stable_field_key
    unique (configuration_revision_id, stable_field_id),
  constraint customization_fields_revision_position_key
    unique (configuration_revision_id, position),
  constraint customization_fields_definition_identity_key
    unique (id, stable_field_id, product_id, configuration_revision_id),
  constraint customization_fields_label_check
    check (btrim(label) <> '' and length(label) <= 200),
  constraint customization_fields_kind_check
    check (kind in ('image', 'short_text', 'long_text')),
  constraint customization_fields_position_check
    check (position >= 0),
  constraint customization_fields_kind_constraints_check
    check (
      (
        kind in ('short_text', 'long_text')
        and max_length is not null
        and max_length > 0
        and (help_text is null or (btrim(help_text) <> '' and length(help_text) <= 1000))
        and allowed_mime_types is null
        and max_bytes is null
        and min_width is null
        and min_height is null
        and recommended_width is null
        and recommended_height is null
        and min_image_count is null
        and max_image_count is null
        and crop_enabled is null
      )
      or (
        kind = 'image'
        and max_length is null
        and help_text is null
        and public.customization_image_mime_types_are_valid(allowed_mime_types)
        and max_bytes is not null
        and max_bytes > 0
        and min_width is not null
        and min_width > 0
        and min_height is not null
        and min_height > 0
        and (
          (recommended_width is null and recommended_height is null)
          or (
            recommended_width is not null
            and recommended_height is not null
            and recommended_width > 0
            and recommended_height > 0
            and recommended_width >= min_width
            and recommended_height >= min_height
          )
        )
        and min_image_count is not null
        and min_image_count >= 0
        and max_image_count is not null
        and max_image_count > 0
        and max_image_count >= min_image_count
        and crop_enabled is not null
      )
    )
);

create index customization_fields_product_revision_active_position_idx
  on public.customization_fields (
    product_id,
    configuration_revision_id,
    is_active,
    position
  );

alter table public.product_customization_configs enable row level security;
alter table public.customization_field_identities enable row level security;
alter table public.customization_fields enable row level security;

create policy "customization server manages product configuration revisions"
  on public.product_customization_configs
  for all to service_role
  using (true)
  with check (true);

create policy "customization server manages field identities"
  on public.customization_field_identities
  for all to service_role
  using (true)
  with check (true);

create policy "customization server manages field definitions"
  on public.customization_fields
  for all to service_role
  using (true)
  with check (true);

revoke all privileges on table public.product_customization_configs from public;
revoke all privileges on table public.product_customization_configs from anon;
revoke all privileges on table public.product_customization_configs from authenticated;
revoke all privileges on table public.customization_field_identities from public;
revoke all privileges on table public.customization_field_identities from anon;
revoke all privileges on table public.customization_field_identities from authenticated;
revoke all privileges on table public.customization_fields from public;
revoke all privileges on table public.customization_fields from anon;
revoke all privileges on table public.customization_fields from authenticated;

grant usage on schema public to service_role;
grant select, insert, update on table public.product_customization_configs to service_role;
grant select, insert on table public.customization_field_identities to service_role;
grant select, insert on table public.customization_fields to service_role;

commit;
