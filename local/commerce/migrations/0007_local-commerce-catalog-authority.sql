-- Local synthetic read authority only. Forward fixes require a new migration.
begin;

create table local_commerce.catalog_categories (
  project_id text not null references local_commerce.project_identities(project_id),
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text not null,
  publication_status text not null check (publication_status in ('draft','published','retired')),
  version integer not null default 1 check (version > 0),
  lifecycle text not null default 'active' check (lifecycle in ('active','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id,id),
  unique (project_id,slug)
);
alter table local_commerce.catalog_categories enable row level security;
revoke all on local_commerce.catalog_categories from public, anon, authenticated;
grant select, insert, update, delete on local_commerce.catalog_categories to service_role;
create policy local_commerce_service_role_catalog_categories
on local_commerce.catalog_categories for all to service_role using (true) with check (true);

-- No inferred backfill: old incomplete rows remain unreadable for purchase.
alter table local_commerce.catalog_products
  add column category_id uuid,
  add column option_definitions jsonb not null default '[]'::jsonb check (jsonb_typeof(option_definitions) = 'array'),
  add column option_value_definitions jsonb not null default '[]'::jsonb check (jsonb_typeof(option_value_definitions) = 'array'),
  add column asset_definitions jsonb not null default '[]'::jsonb check (jsonb_typeof(asset_definitions) = 'array'),
  add column fulfillment_definition jsonb,
  add constraint catalog_products_category_fk foreign key (project_id,category_id)
    references local_commerce.catalog_categories(project_id,id);
alter table local_commerce.catalog_variants
  add column weight_grams integer check (weight_grams >= 0),
  add column is_default boolean not null default false,
  add column supply_method text check (supply_method in ('made_to_order','digital_delivery'));

create function local_commerce.advance_catalog_version() returns trigger
language plpgsql set search_path = local_commerce, pg_catalog as $$
begin
  if new.project_id is distinct from old.project_id or new.id is distinct from old.id then
    raise exception 'catalog identity is immutable';
  end if;
  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function local_commerce.advance_catalog_version() from public,anon,authenticated;
create trigger advance_catalog_version before update on local_commerce.catalog_categories
for each row execute function local_commerce.advance_catalog_version();
create trigger advance_catalog_version before update on local_commerce.catalog_products
for each row execute function local_commerce.advance_catalog_version();
create trigger advance_catalog_version before update on local_commerce.catalog_variants
for each row execute function local_commerce.advance_catalog_version();
create trigger advance_catalog_version before update on local_commerce.catalog_configuration_snapshots
for each row execute function local_commerce.advance_catalog_version();
create trigger advance_catalog_version before update on local_commerce.catalog_pricing_rules
for each row execute function local_commerce.advance_catalog_version();

-- One SQL statement snapshot; same project and marker are checked on every read.
-- Configuration and bounded shipping/coupon definitions retain their existing
-- versioned rows; malformed/multiple current revisions fail closed in the reader.
create function local_commerce.read_catalog_authority(p_project_id text, p_marker_digest text)
returns jsonb language sql stable security definer
set search_path = local_commerce, pg_catalog
as $$
 select case when local_commerce.verify_project_identity(p_project_id,p_marker_digest) then
 jsonb_build_object(
   'projectId',p_project_id,
   'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from local_commerce.catalog_categories c where c.project_id=p_project_id and c.lifecycle='active'),'[]'::jsonb),
   'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from local_commerce.catalog_products p where p.project_id=p_project_id and p.lifecycle='active'),'[]'::jsonb),
   'variants',coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from local_commerce.catalog_variants v where v.project_id=p_project_id and v.lifecycle='active'),'[]'::jsonb),
   'configurations',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from local_commerce.catalog_configuration_snapshots c where c.project_id=p_project_id and c.lifecycle='active' and c.configuration_status='active'),'[]'::jsonb),
   'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from local_commerce.catalog_pricing_rules r where r.project_id=p_project_id and r.lifecycle='active' and r.rule_status='active'),'[]'::jsonb)
 ) else null end;
$$;
revoke all on function local_commerce.read_catalog_authority(text,text) from public,anon,authenticated;
grant execute on function local_commerce.read_catalog_authority(text,text) to service_role;
commit;
