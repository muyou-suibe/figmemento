-- PhotoGift C1: server-only atomic reconciliation for one Product SKU graph.
-- This additive migration depends on 20260807151745_expand_configurable_product_catalog.sql.

begin;

create function public.save_product_sku_graph(
  p_product_id uuid,
  p_options jsonb,
  p_option_values jsonb,
  p_variants jsonb,
  p_variant_values jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if p_product_id is null then
    raise exception using errcode = '22023', message = 'Product ID is required.';
  end if;
  if p_options is null or pg_catalog.jsonb_typeof(p_options) <> 'array'
    or p_option_values is null or pg_catalog.jsonb_typeof(p_option_values) <> 'array'
    or p_variants is null or pg_catalog.jsonb_typeof(p_variants) <> 'array'
    or p_variant_values is null or pg_catalog.jsonb_typeof(p_variant_values) <> 'array'
  then
    raise exception using errcode = '22023', message = 'SKU graph inputs must be JSON arrays.';
  end if;

  perform 1
  from public.products as product
  where product.id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Target Product was not found.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_options) as desired(
      id uuid, product_id uuid, code text, name text, kind text,
      is_required boolean, position integer
    )
    where desired.id is null or desired.product_id is distinct from p_product_id
  ) then
    raise exception using errcode = '22023', message = 'Every Product Option must belong to the target Product.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_option_values) as desired(
      id uuid, product_id uuid, option_id uuid, code text, label text, position integer
    )
    where desired.id is null
      or desired.option_id is null
      or desired.product_id is distinct from p_product_id
  ) then
    raise exception using errcode = '22023', message = 'Every Product Option Value must belong to the target Product.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_variants) as desired(
      id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
      weight_grams integer, is_active boolean, is_available boolean,
      is_default boolean, supply_method text, combination_signature text
    )
    where desired.id is null or desired.product_id is distinct from p_product_id
  ) then
    raise exception using errcode = '22023', message = 'Every Product Variant must belong to the target Product.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_variant_values) as desired(
      variant_id uuid, product_id uuid, option_id uuid, option_value_id uuid
    )
    where desired.variant_id is null
      or desired.option_id is null
      or desired.option_value_id is null
      or desired.product_id is distinct from p_product_id
  ) then
    raise exception using errcode = '22023', message = 'Every Variant Value must belong to the target Product.';
  end if;

  if exists (
    select desired.id
    from pg_catalog.jsonb_to_recordset(p_options) as desired(
      id uuid, product_id uuid, code text, name text, kind text,
      is_required boolean, position integer
    )
    group by desired.id
    having pg_catalog.count(*) > 1
  ) or exists (
    select desired.id
    from pg_catalog.jsonb_to_recordset(p_option_values) as desired(
      id uuid, product_id uuid, option_id uuid, code text, label text, position integer
    )
    group by desired.id
    having pg_catalog.count(*) > 1
  ) or exists (
    select desired.id
    from pg_catalog.jsonb_to_recordset(p_variants) as desired(
      id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
      weight_grams integer, is_active boolean, is_available boolean,
      is_default boolean, supply_method text, combination_signature text
    )
    group by desired.id
    having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'SKU graph entity IDs must be unique.';
  end if;
  if exists (
    select desired.variant_id, desired.option_id
    from pg_catalog.jsonb_to_recordset(p_variant_values) as desired(
      variant_id uuid, product_id uuid, option_id uuid, option_value_id uuid
    )
    group by desired.variant_id, desired.option_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'A Variant may select only one Value per Option.';
  end if;
  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_to_recordset(p_variants) as desired(
      id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
      weight_grams integer, is_active boolean, is_available boolean,
      is_default boolean, supply_method text, combination_signature text
    )
    where desired.is_default is true
  ) > 1 then
    raise exception using errcode = '22023', message = 'A Product may have at most one default Variant.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_options) as desired(
      id uuid, product_id uuid, code text, name text, kind text,
      is_required boolean, position integer
    )
    join public.product_options as existing on existing.id = desired.id
    where existing.product_id <> p_product_id
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_option_values) as desired(
      id uuid, product_id uuid, option_id uuid, code text, label text, position integer
    )
    join public.product_option_values as existing on existing.id = desired.id
    where existing.product_id <> p_product_id
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_variants) as desired(
      id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
      weight_grams integer, is_active boolean, is_available boolean,
      is_default boolean, supply_method text, combination_signature text
    )
    join public.product_variants as existing on existing.id = desired.id
    where existing.product_id <> p_product_id
  ) then
    raise exception using errcode = '22023', message = 'An existing SKU graph identity belongs to another Product.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_option_values) as desired_value(
      id uuid, product_id uuid, option_id uuid, code text, label text, position integer
    )
    left join pg_catalog.jsonb_to_recordset(p_options) as desired_option(
      id uuid, product_id uuid, code text, name text, kind text,
      is_required boolean, position integer
    ) on desired_option.id = desired_value.option_id
      and desired_option.product_id = desired_value.product_id
    where desired_option.id is null
  ) then
    raise exception using errcode = '22023', message = 'Every Option Value must reference an Option in the desired Product graph.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_variant_values) as desired_link(
      variant_id uuid, product_id uuid, option_id uuid, option_value_id uuid
    )
    left join pg_catalog.jsonb_to_recordset(p_variants) as desired_variant(
      id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
      weight_grams integer, is_active boolean, is_available boolean,
      is_default boolean, supply_method text, combination_signature text
    ) on desired_variant.id = desired_link.variant_id
      and desired_variant.product_id = desired_link.product_id
    left join pg_catalog.jsonb_to_recordset(p_options) as desired_option(
      id uuid, product_id uuid, code text, name text, kind text,
      is_required boolean, position integer
    ) on desired_option.id = desired_link.option_id
      and desired_option.product_id = desired_link.product_id
    left join pg_catalog.jsonb_to_recordset(p_option_values) as desired_value(
      id uuid, product_id uuid, option_id uuid, code text, label text, position integer
    ) on desired_value.id = desired_link.option_value_id
      and desired_value.option_id = desired_link.option_id
      and desired_value.product_id = desired_link.product_id
    where desired_variant.id is null
      or desired_option.id is null
      or desired_value.id is null
  ) then
    raise exception using errcode = '22023', message = 'Variant Values must reference same-Product Variants, Options, and Values.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_variants) as desired_variant(
      id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
      weight_grams integer, is_active boolean, is_available boolean,
      is_default boolean, supply_method text, combination_signature text
    )
    left join (
      select desired_link.variant_id,
        pg_catalog.string_agg(
          desired_link.option_id::text || '=' || desired_link.option_value_id::text,
          '|' order by desired_link.option_id::text
        ) as canonical_signature
      from pg_catalog.jsonb_to_recordset(p_variant_values) as desired_link(
        variant_id uuid, product_id uuid, option_id uuid, option_value_id uuid
      )
      group by desired_link.variant_id
    ) as signatures on signatures.variant_id = desired_variant.id
    where desired_variant.combination_signature
      is distinct from coalesce(signatures.canonical_signature, '')
  ) then
    raise exception using errcode = '22023', message = 'Variant combination signature is not canonical.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_options) as desired(
      id uuid, product_id uuid, code text, name text, kind text,
      is_required boolean, position integer
    )
    where desired.code like 'rpc-temp-%'
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_option_values) as desired(
      id uuid, product_id uuid, option_id uuid, code text, label text, position integer
    )
    where desired.code like 'rpc-temp-%'
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_variants) as desired(
      id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
      weight_grams integer, is_active boolean, is_available boolean,
      is_default boolean, supply_method text, combination_signature text
    )
    where desired.sku_code like 'RPC-TEMP-%'
      or pg_catalog.left(
        desired.combination_signature,
        pg_catalog.length('__rpc_reconcile__:')
      ) = '__rpc_reconcile__:'
  ) then
    raise exception using errcode = '22023', message = 'SKU graph uses a reserved reconciliation value.';
  end if;

  if exists (
    select 1
    from public.product_options as target
    join public.product_options as other
      on other.product_id = p_product_id
      and other.id <> target.id
      and other.code = 'rpc-temp-' || pg_catalog.replace(target.id::text, '-', '')
    where target.product_id = p_product_id
  ) or exists (
    select 1
    from public.product_option_values as target
    join public.product_option_values as other
      on other.option_id = target.option_id
      and other.id <> target.id
      and other.code = 'rpc-temp-' || pg_catalog.replace(target.id::text, '-', '')
    where target.product_id = p_product_id
  ) or exists (
    select 1
    from public.product_variants as target
    join public.product_variants as other
      on other.id <> target.id
      and other.sku_code = 'RPC-TEMP-' || pg_catalog.replace(target.id::text, '-', '')
    where target.product_id = p_product_id
  ) or exists (
    select 1
    from public.product_variants as target
    join public.product_variants as other
      on other.product_id = p_product_id
      and other.id <> target.id
      and other.combination_signature = '__rpc_reconcile__:' || target.id::text
    where target.product_id = p_product_id
  ) then
    raise exception using errcode = '23505', message = 'Existing catalog codes conflict with reserved reconciliation values.';
  end if;

  delete from public.product_variant_values
  where product_id = p_product_id;

  update public.product_options
  set code = 'rpc-temp-' || pg_catalog.replace(id::text, '-', '')
  where product_id = p_product_id;

  update public.product_option_values
  set code = 'rpc-temp-' || pg_catalog.replace(id::text, '-', '')
  where product_id = p_product_id;

  update public.product_variants
  set sku_code = 'RPC-TEMP-' || pg_catalog.replace(id::text, '-', ''),
      combination_signature = '__rpc_reconcile__:' || id::text,
      is_default = false
  where product_id = p_product_id;

  insert into public.product_options as existing (
    id, product_id, code, name, kind, is_required, position
  )
  select desired.id, desired.product_id, desired.code, desired.name,
    desired.kind, desired.is_required, desired.position
  from pg_catalog.jsonb_to_recordset(p_options) as desired(
    id uuid, product_id uuid, code text, name text, kind text,
    is_required boolean, position integer
  )
  on conflict (id) do update
  set code = excluded.code,
      name = excluded.name,
      kind = excluded.kind,
      is_required = excluded.is_required,
      position = excluded.position
  where existing.product_id = excluded.product_id;

  insert into public.product_option_values as existing (
    id, product_id, option_id, code, label, position
  )
  select desired.id, desired.product_id, desired.option_id, desired.code,
    desired.label, desired.position
  from pg_catalog.jsonb_to_recordset(p_option_values) as desired(
    id uuid, product_id uuid, option_id uuid, code text, label text, position integer
  )
  on conflict (id) do update
  set option_id = excluded.option_id,
      code = excluded.code,
      label = excluded.label,
      position = excluded.position
  where existing.product_id = excluded.product_id;

  insert into public.product_variants as existing (
    id, product_id, sku_code, price_cents, currency, weight_grams,
    is_active, is_available, is_default, supply_method, combination_signature
  )
  select desired.id, desired.product_id, desired.sku_code, desired.price_cents,
    desired.currency, desired.weight_grams, desired.is_active,
    desired.is_available, desired.is_default, desired.supply_method,
    desired.combination_signature
  from pg_catalog.jsonb_to_recordset(p_variants) as desired(
    id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
    weight_grams integer, is_active boolean, is_available boolean,
    is_default boolean, supply_method text, combination_signature text
  )
  on conflict (id) do update
  set sku_code = excluded.sku_code,
      price_cents = excluded.price_cents,
      currency = excluded.currency,
      weight_grams = excluded.weight_grams,
      is_active = excluded.is_active,
      is_available = excluded.is_available,
      is_default = excluded.is_default,
      supply_method = excluded.supply_method,
      combination_signature = excluded.combination_signature
  where existing.product_id = excluded.product_id;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_options) as desired(
      id uuid, product_id uuid, code text, name text, kind text,
      is_required boolean, position integer
    )
    left join public.product_options as persisted
      on persisted.id = desired.id
      and persisted.product_id = p_product_id
    where persisted.id is null
  ) then
    raise exception using errcode = '23503', message = 'A desired Product Option was not persisted under the target Product.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_option_values) as desired(
      id uuid, product_id uuid, option_id uuid, code text, label text, position integer
    )
    left join public.product_option_values as persisted
      on persisted.id = desired.id
      and persisted.product_id = p_product_id
    where persisted.id is null
  ) then
    raise exception using errcode = '23503', message = 'A desired Product Option Value was not persisted under the target Product.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_variants) as desired(
      id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
      weight_grams integer, is_active boolean, is_available boolean,
      is_default boolean, supply_method text, combination_signature text
    )
    left join public.product_variants as persisted
      on persisted.id = desired.id
      and persisted.product_id = p_product_id
    where persisted.id is null
  ) then
    raise exception using errcode = '23503', message = 'A desired Product Variant was not persisted under the target Product.';
  end if;

  insert into public.product_variant_values (
    variant_id, product_id, option_id, option_value_id
  )
  select desired.variant_id, desired.product_id, desired.option_id,
    desired.option_value_id
  from pg_catalog.jsonb_to_recordset(p_variant_values) as desired(
    variant_id uuid, product_id uuid, option_id uuid, option_value_id uuid
  );

  delete from public.product_variants as existing
  where existing.product_id = p_product_id
    and not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_variants) as desired(
        id uuid, product_id uuid, sku_code text, price_cents integer, currency text,
        weight_grams integer, is_active boolean, is_available boolean,
        is_default boolean, supply_method text, combination_signature text
      )
      where desired.id = existing.id
    );

  delete from public.product_option_values as existing
  where existing.product_id = p_product_id
    and not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_option_values) as desired(
        id uuid, product_id uuid, option_id uuid, code text, label text, position integer
      )
      where desired.id = existing.id
    );

  delete from public.product_options as existing
  where existing.product_id = p_product_id
    and not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_options) as desired(
        id uuid, product_id uuid, code text, name text, kind text,
        is_required boolean, position integer
      )
      where desired.id = existing.id
    );
end;
$function$;

revoke all privileges on function public.save_product_sku_graph(uuid, jsonb, jsonb, jsonb, jsonb) from public;
revoke all privileges on function public.save_product_sku_graph(uuid, jsonb, jsonb, jsonb, jsonb) from anon;
revoke all privileges on function public.save_product_sku_graph(uuid, jsonb, jsonb, jsonb, jsonb) from authenticated;
revoke all privileges on function public.save_product_sku_graph(uuid, jsonb, jsonb, jsonb, jsonb) from service_role;
grant execute on function public.save_product_sku_graph(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;

commit;
