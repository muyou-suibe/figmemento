-- PhotoGift C1: atomic Category/Product lifecycle transitions and narrow audit events.
-- This additive artifact depends on 20260807151745_expand_configurable_product_catalog.sql.
-- It is intentionally not executed by Task 6.6.

begin;

create function public.transition_catalog_lifecycle(
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_actor_boundary text,
  p_actor_identifier text
)
returns table (
  result_status text,
  target_type text,
  target_id uuid,
  action text,
  previous_lifecycle text,
  current_lifecycle text,
  changed boolean,
  reason_code text
)
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_previous_lifecycle text;
  v_current_lifecycle text;
  v_target_lifecycle text;
  v_reason_code text;
  v_target_found boolean := false;
begin
  if p_target_type not in ('category', 'product') then
    raise exception using errcode = '22023', message = 'Lifecycle target type is invalid.';
  end if;
  if p_target_id is null then
    raise exception using errcode = '22023', message = 'Lifecycle target ID is required.';
  end if;
  if p_action not in (
    'publish', 'unpublish', 'retire', 'destructive_state_mutation_attempt'
  ) then
    raise exception using errcode = '22023', message = 'Lifecycle action is invalid.';
  end if;
  if p_actor_boundary <> 'configured_admin_session'
    or p_actor_identifier is null
    or pg_catalog.btrim(p_actor_identifier) = ''
    or pg_catalog.length(p_actor_identifier) > 160
  then
    raise exception using errcode = '22023', message = 'Lifecycle actor boundary is invalid.';
  end if;

  begin
    if p_target_type = 'category' then
      select category.lifecycle
      into v_previous_lifecycle
      from public.categories as category
      where category.id = p_target_id
      for update;
    else
      select product.lifecycle
      into v_previous_lifecycle
      from public.products as product
      where product.id = p_target_id
      for update;
    end if;
    v_target_found := found;

    if p_action = 'destructive_state_mutation_attempt' then
      insert into public.catalog_audit_events (
        action, outcome, target_type, target_identifier,
        actor_boundary, actor_identifier, reason_code
      ) values (
        p_action, 'rejected', p_target_type, p_target_id::text,
        p_actor_boundary, p_actor_identifier, 'destructive_mutation_forbidden'
      );
      return query select
        'rejected'::text, p_target_type, p_target_id, p_action,
        v_previous_lifecycle, v_previous_lifecycle, false,
        'destructive_mutation_forbidden'::text;
      return;
    end if;

    if not v_target_found then
      return query select
        'not_found'::text, p_target_type, p_target_id, p_action,
        null::text, null::text, false, null::text;
      return;
    end if;

    if v_previous_lifecycle is null
      or v_previous_lifecycle not in ('draft', 'published', 'retired')
    then
      insert into public.catalog_audit_events (
        action, outcome, target_type, target_identifier,
        actor_boundary, actor_identifier, reason_code
      ) values (
        p_action, 'rejected', p_target_type, p_target_id::text,
        p_actor_boundary, p_actor_identifier, 'invalid_current_lifecycle'
      );
      return query select
        'rejected'::text, p_target_type, p_target_id, p_action,
        v_previous_lifecycle, v_previous_lifecycle, false,
        'invalid_current_lifecycle'::text;
      return;
    end if;

    v_target_lifecycle := case p_action
      when 'publish' then 'published'
      when 'unpublish' then 'draft'
      when 'retire' then 'retired'
    end;

    -- Equivalent retries are successful no-ops. They do not create another
    -- state-change audit event because no publication state changed.
    if v_previous_lifecycle = v_target_lifecycle then
      return query select
        'applied'::text, p_target_type, p_target_id, p_action,
        v_previous_lifecycle, v_previous_lifecycle, false, null::text;
      return;
    end if;

    if p_target_type = 'product' and p_action = 'publish' then
      perform 1
      from public.categories as category
      join public.products as product on product.category_id = category.id
      where product.id = p_target_id
        and category.lifecycle = 'published'
      for key share of category;
      if not found then
        v_reason_code := 'category_not_published';
      elsif not exists (
        select 1
        from public.product_fulfillment_configs as config
        where config.product_id = p_target_id
      ) then
        v_reason_code := 'fulfillment_missing';
      elsif exists (
        select 1
        from public.product_fulfillment_configs as config
        where config.product_id = p_target_id
          and (
            config.fulfillment_type not in ('physical', 'digital')
            or config.production_mode not in ('custom_manufacturing', 'digital_creation')
            or config.min_lead_time_business_days < 0
            or config.max_lead_time_business_days < config.min_lead_time_business_days
            or (config.fulfillment_type = 'digital' and config.requires_shipping)
          )
      ) then
        v_reason_code := 'fulfillment_invalid';
      elsif exists (
        select 1
        from public.product_variants as variant
        where variant.product_id = p_target_id
          and (
            (
              not exists (
                select 1 from public.product_options as option
                where option.product_id = p_target_id
              )
              and (
                not variant.is_default
                or exists (
                  select 1 from public.product_variant_values as selected
                  where selected.variant_id = variant.id
                )
              )
            )
            or (
              exists (
                select 1 from public.product_options as option
                where option.product_id = p_target_id
              )
              and not exists (
                select 1 from public.product_variant_values as selected
                where selected.variant_id = variant.id
              )
            )
            or exists (
              select 1
              from public.product_options as required_option
              where required_option.product_id = p_target_id
                and required_option.is_required
                and not exists (
                  select 1
                  from public.product_variant_values as selected
                  where selected.variant_id = variant.id
                    and selected.option_id = required_option.id
                )
            )
            or variant.combination_signature is distinct from coalesce((
              select pg_catalog.string_agg(
                selected.option_id::text || '=' || selected.option_value_id::text,
                '|' order by selected.option_id::text
              )
              from public.product_variant_values as selected
              where selected.variant_id = variant.id
            ), '')
          )
      ) then
        v_reason_code := 'invalid_variant_graph';
      elsif not exists (
        select 1
        from public.product_variants as variant
        where variant.product_id = p_target_id
          and variant.is_active
          and variant.is_available
      ) then
        v_reason_code := 'no_eligible_variant';
      end if;

      if v_reason_code is not null then
        insert into public.catalog_audit_events (
          action, outcome, target_type, target_identifier,
          actor_boundary, actor_identifier, reason_code
        ) values (
          p_action, 'rejected', p_target_type, p_target_id::text,
          p_actor_boundary, p_actor_identifier, v_reason_code
        );
        return query select
          'rejected'::text, p_target_type, p_target_id, p_action,
          v_previous_lifecycle, v_previous_lifecycle, false, v_reason_code;
        return;
      end if;
    end if;

    if p_target_type = 'category' then
      update public.categories
      set lifecycle = v_target_lifecycle
      where id = p_target_id;
    else
      update public.products
      set lifecycle = v_target_lifecycle,
          is_published = (v_target_lifecycle = 'published')
      where id = p_target_id;
    end if;

    insert into public.catalog_audit_events (
      action, outcome, target_type, target_identifier,
      actor_boundary, actor_identifier, reason_code
    ) values (
      p_action, 'succeeded', p_target_type, p_target_id::text,
      p_actor_boundary, p_actor_identifier, null
    );

    v_current_lifecycle := v_target_lifecycle;
    return query select
      'applied'::text, p_target_type, p_target_id, p_action,
      v_previous_lifecycle, v_current_lifecycle, true, null::text;
    return;
  exception when others then
    if v_target_found then
      insert into public.catalog_audit_events (
        action, outcome, target_type, target_identifier,
        actor_boundary, actor_identifier, reason_code
      ) values (
        p_action, 'failed', p_target_type, p_target_id::text,
        p_actor_boundary, p_actor_identifier, 'catalog_lifecycle_failure'
      );
      return query select
        'failed'::text, p_target_type, p_target_id, p_action,
        v_previous_lifecycle, v_previous_lifecycle, false,
        'catalog_lifecycle_failure'::text;
      return;
    end if;
    raise;
  end;
end;
$function$;

revoke all privileges on function public.transition_catalog_lifecycle(text, uuid, text, text, text) from public;
revoke all privileges on function public.transition_catalog_lifecycle(text, uuid, text, text, text) from anon;
revoke all privileges on function public.transition_catalog_lifecycle(text, uuid, text, text, text) from authenticated;
revoke all privileges on function public.transition_catalog_lifecycle(text, uuid, text, text, text) from service_role;
grant execute on function public.transition_catalog_lifecycle(text, uuid, text, text, text) to service_role;

commit;
