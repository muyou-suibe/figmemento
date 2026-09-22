-- H03: one project-scoped, serialized Admin customization publication.
-- The migration ledger wrapper owns the transaction.

create table local_commerce.admin_customization_actions (
  project_id text not null references local_commerce.project_identities(project_id),
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  actor_id text not null,
  operation text not null,
  previous_revision integer,
  new_revision integer not null,
  restored_from_revision integer,
  occurred_at timestamptz not null default clock_timestamp(),
  version integer not null default 1,
  lifecycle text not null default 'committed',
  primary key (project_id,id),
  unique (project_id,product_id,new_revision),
  foreign key (project_id,product_id) references local_commerce.catalog_products(project_id,id),
  check (actor_id = 'configured-admin'),
  check (operation in ('publish','restore')),
  check (new_revision > 0 and (previous_revision is null or previous_revision = new_revision - 1)),
  check (restored_from_revision is null or restored_from_revision > 0),
  check (version = 1 and lifecycle = 'committed')
);
alter table local_commerce.admin_customization_actions enable row level security;
create unique index catalog_configuration_one_active_per_product
  on local_commerce.catalog_configuration_snapshots(project_id,product_id)
  where lifecycle='active' and configuration_status='active';
revoke all on local_commerce.admin_customization_actions from public,anon,authenticated;
grant select,insert on local_commerce.admin_customization_actions to service_role;
create policy local_commerce_service_role_admin_customization_actions
  on local_commerce.admin_customization_actions for all to service_role using (true) with check (true);

-- Historical definition bytes are immutable. Retiring the current pointer
-- changes only status/version/timestamp, never its purchased facts.
create function local_commerce.guard_customization_snapshot_history() returns trigger
language plpgsql set search_path = pg_catalog, local_commerce as $$
begin
  if new.project_id is distinct from old.project_id or new.id is distinct from old.id
    or new.product_id is distinct from old.product_id or new.revision is distinct from old.revision
    or new.definition is distinct from old.definition then
    raise exception 'customization snapshot facts are immutable';
  end if;
  return new;
end;
$$;
revoke all on function local_commerce.guard_customization_snapshot_history() from public,anon,authenticated;
create trigger guard_customization_snapshot_history before update on local_commerce.catalog_configuration_snapshots
  for each row execute function local_commerce.guard_customization_snapshot_history();

create function local_commerce.admin_customization_read(
  p_project_id text, p_marker_digest text, p_product_id uuid
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, local_commerce as $$
declare v_product local_commerce.catalog_products%rowtype; v_current jsonb; v_history jsonb; v_rules jsonb; v_rule_history jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest) then
    return jsonb_build_object('status','unavailable');
  end if;
  select * into v_product from local_commerce.catalog_products
    where project_id=p_project_id and id=p_product_id and lifecycle='active';
  if not found then return jsonb_build_object('status','not_found'); end if;
  select jsonb_agg(to_jsonb(c) order by c.revision) into v_history
    from local_commerce.catalog_configuration_snapshots c
    where c.project_id=p_project_id and c.product_id=p_product_id;
  select to_jsonb(c) into v_current from local_commerce.catalog_configuration_snapshots c
    where c.project_id=p_project_id and c.product_id=p_product_id
      and c.lifecycle='active' and c.configuration_status='active';
  select jsonb_agg(to_jsonb(r) order by r.rule_key) into v_rules
    from local_commerce.catalog_pricing_rules r
    where r.project_id=p_project_id and r.lifecycle='active' and r.rule_status='active'
      and r.definition->>'kind'='customization_surcharge' and r.definition->>'productId'=p_product_id::text;
  select jsonb_agg(to_jsonb(r) order by r.rule_key,r.revision) into v_rule_history
    from local_commerce.catalog_pricing_rules r
    where r.project_id=p_project_id and r.definition->>'kind'='customization_surcharge'
      and r.definition->>'productId'=p_product_id::text;
  return jsonb_build_object('status','found','current',v_current,
    'history',coalesce(v_history,'[]'::jsonb),'surchargeRules',coalesce(v_rules,'[]'::jsonb),
    'surchargeHistory',coalesce(v_rule_history,'[]'::jsonb));
end;
$$;
revoke all on function local_commerce.admin_customization_read(text,text,uuid) from public,anon,authenticated;
grant execute on function local_commerce.admin_customization_read(text,text,uuid) to service_role;

create function local_commerce.admin_customization_publish(
  p_project_id text, p_marker_digest text, p_product_id uuid,
  p_expected_revision integer, p_actor_id text, p_fields jsonb,
  p_surcharges jsonb, p_restored_from_revision integer
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, local_commerce as $$
declare
  v_product local_commerce.catalog_products%rowtype;
  v_current local_commerce.catalog_configuration_snapshots%rowtype;
  v_next integer; v_definition jsonb; v_field jsonb; v_choice jsonb;
  v_old_field jsonb; v_old_choice jsonb; v_history record;
  v_restore_definition jsonb; v_restored_fields jsonb; v_restored_surcharges jsonb; v_requested_surcharges jsonb;
  v_rule jsonb; v_rule_key text; v_rule_revision integer; v_current_rule integer;
  v_seen_rules text[] := array[]::text[]; v_seen_selectors text[] := array[]::text[];
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_actor_id is distinct from 'configured-admin' then
    return jsonb_build_object('status','unavailable');
  end if;
  if p_fields is null or jsonb_typeof(p_fields) is distinct from 'array'
    or jsonb_array_length(p_fields) > 100 then
    return jsonb_build_object('status','invalid_configuration');
  end if;
  if p_surcharges is null or jsonb_typeof(p_surcharges) is distinct from 'array'
    or jsonb_array_length(p_surcharges) > 100 then
    return jsonb_build_object('status','invalid_configuration');
  end if;
  -- Product row is the one serialization lock for all configuration writers.
  select * into v_product from local_commerce.catalog_products
    where project_id=p_project_id and id=p_product_id and lifecycle='active' for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into v_current from local_commerce.catalog_configuration_snapshots
    where project_id=p_project_id and product_id=p_product_id
      and lifecycle='active' and configuration_status='active' for update;
  if (found and (p_expected_revision is null or v_current.revision <> p_expected_revision))
    or (not found and p_expected_revision is not null) then
    return jsonb_build_object('status','stale_revision');
  end if;
  select coalesce(max(revision),0)+1 into v_next from local_commerce.catalog_configuration_snapshots
    where project_id=p_project_id and product_id=p_product_id;
  if p_restored_from_revision is not null then
    select definition into v_restore_definition from local_commerce.catalog_configuration_snapshots
      where project_id=p_project_id and product_id=p_product_id and revision=p_restored_from_revision;
    if not found then return jsonb_build_object('status','invalid_configuration'); end if;
    select jsonb_agg(jsonb_set(f.value,'{configurationRevision}',to_jsonb(v_next::text)) order by f.ordinality)
      into v_restored_fields from jsonb_array_elements(v_restore_definition->'fields') with ordinality f(value,ordinality);
    if coalesce(v_restored_fields,'[]'::jsonb) is distinct from p_fields then
      return jsonb_build_object('status','invalid_configuration');
    end if;
    select jsonb_agg(jsonb_build_object('ruleKey',r.rule_key,'fieldId',r.definition#>>'{selector,fieldId}',
      'amountCents',r.definition->'amountCents','currency',r.definition->>'currency') order by r.rule_key)
      into v_restored_surcharges from local_commerce.catalog_pricing_rules r
      where r.project_id=p_project_id and r.definition->>'kind'='customization_surcharge'
        and r.definition->>'productId'=p_product_id::text
        and r.definition->>'configurationRevision'=p_restored_from_revision::text;
    select jsonb_agg(jsonb_build_object('ruleKey',s.value->>'ruleKey','fieldId',s.value->>'fieldId',
      'amountCents',s.value->'amountCents','currency',s.value->>'currency') order by s.value->>'ruleKey')
      into v_requested_surcharges from jsonb_array_elements(p_surcharges) s(value);
    if coalesce(v_restored_surcharges,'[]'::jsonb) is distinct from coalesce(v_requested_surcharges,'[]'::jsonb) then
      return jsonb_build_object('status','invalid_configuration');
    end if;
  end if;
  -- Stable field and choice identities cannot be rebound even after retirement.
  for v_field in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(v_field) is distinct from 'object'
      or v_field->>'productId' is distinct from p_product_id::text
      or v_field->>'configurationRevision' is distinct from v_next::text
      or v_field->>'id' is null
      or v_field->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
      return jsonb_build_object('status','invalid_configuration');
    end if;
    for v_history in select definition from local_commerce.catalog_configuration_snapshots
      where project_id=p_project_id and product_id=p_product_id loop
      for v_old_field in select value from jsonb_array_elements(v_history.definition->'fields') loop
        if (v_old_field->>'id'=v_field->>'id' and v_old_field->>'code' is distinct from v_field->>'code')
          or (v_old_field->>'code'=v_field->>'code' and v_old_field->>'id' is distinct from v_field->>'id') then
          return jsonb_build_object('status','invalid_configuration');
        end if;
        if v_old_field->>'id'=v_field->>'id'
          and v_field->>'kind' in ('single_select','multi_select')
          and v_old_field->>'kind' in ('single_select','multi_select') then
          for v_choice in select value from jsonb_array_elements(v_field#>'{constraints,choices}') loop
            for v_old_choice in select value from jsonb_array_elements(v_old_field#>'{constraints,choices}') loop
              if (v_choice->>'id'=v_old_choice->>'id' and v_choice->>'code' is distinct from v_old_choice->>'code')
                or (v_choice->>'code'=v_old_choice->>'code' and v_choice->>'id' is distinct from v_old_choice->>'id') then
                return jsonb_build_object('status','invalid_configuration');
              end if;
            end loop;
          end loop;
        end if;
      end loop;
    end loop;
  end loop;
  if jsonb_array_length(p_surcharges) > 0 and (not exists(select 1 from local_commerce.catalog_variants
      where project_id=p_project_id and product_id=p_product_id and lifecycle='active' and currency='USD')
    or exists(select 1 from local_commerce.catalog_variants
      where project_id=p_project_id and product_id=p_product_id and lifecycle='active' and currency<>'USD')) then
    return jsonb_build_object('status','invalid_configuration');
  end if;
  for v_rule in select value from jsonb_array_elements(p_surcharges) loop
    if jsonb_typeof(v_rule) is distinct from 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(v_rule) key)
        is distinct from array['amountCents','currency','expectedRevision','fieldId','ruleKey']
      or v_rule->>'currency' is distinct from 'USD'
      or jsonb_typeof(v_rule->'amountCents') is distinct from 'number'
      or (v_rule->>'amountCents')::numeric < 0
      or (v_rule->>'amountCents')::numeric > 2147483647
      or (v_rule->>'amountCents')::numeric <> floor((v_rule->>'amountCents')::numeric) then
      return jsonb_build_object('status','invalid_configuration');
    end if;
    v_rule_key := v_rule->>'ruleKey';
    if v_rule_key is null or v_rule_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      or v_rule_key = any(v_seen_rules) or v_rule->>'fieldId' = any(v_seen_selectors)
      or not exists(select 1 from jsonb_array_elements(p_fields) f
        where f->>'id'=v_rule->>'fieldId' and f->>'isActive'='true'
          and f->>'kind' in ('image','short_text','long_text')) then
      return jsonb_build_object('status','invalid_configuration');
    end if;
    v_seen_rules := array_append(v_seen_rules,v_rule_key);
    v_seen_selectors := array_append(v_seen_selectors,v_rule->>'fieldId');
    select revision into v_current_rule from local_commerce.catalog_pricing_rules
      where project_id=p_project_id and rule_key=v_rule_key and lifecycle='active' and rule_status='active';
    if (v_current_rule is null and v_rule->'expectedRevision' is distinct from 'null'::jsonb)
      or (v_current_rule is not null and v_rule->>'expectedRevision' is distinct from v_current_rule::text)
      or exists(select 1 from local_commerce.catalog_pricing_rules
        where project_id=p_project_id and rule_key=v_rule_key
          and (definition->>'kind' is distinct from 'customization_surcharge'
            or definition->>'productId' is distinct from p_product_id::text)) then
      return jsonb_build_object('status','stale_revision');
    end if;
  end loop;
  v_definition := jsonb_build_object('productId',p_product_id::text,'configurationRevision',v_next::text,'fields',p_fields);
  if v_current.id is not null then
    update local_commerce.catalog_configuration_snapshots set configuration_status='inactive'
      where project_id=p_project_id and id=v_current.id;
  end if;
  insert into local_commerce.catalog_configuration_snapshots(project_id,product_id,revision,definition)
    values(p_project_id,p_product_id,v_next,v_definition);
  update local_commerce.catalog_pricing_rules set rule_status='inactive'
    where project_id=p_project_id and lifecycle='active' and rule_status='active'
      and definition->>'kind'='customization_surcharge' and definition->>'productId'=p_product_id::text;
  for v_rule in select value from jsonb_array_elements(p_surcharges) loop
    v_rule_key := v_rule->>'ruleKey';
    select coalesce(max(revision),0)+1 into v_rule_revision from local_commerce.catalog_pricing_rules
      where project_id=p_project_id and rule_key=v_rule_key;
    insert into local_commerce.catalog_pricing_rules(project_id,rule_key,revision,definition)
      values(p_project_id,v_rule_key,v_rule_revision,jsonb_build_object(
        'kind','customization_surcharge','ruleRevision',v_rule_revision,
        'productId',p_product_id::text,'configurationRevision',v_next::text,
        'selector',jsonb_build_object('kind','field_present','fieldId',v_rule->>'fieldId'),
        'amountCents',(v_rule->>'amountCents')::integer,'currency','USD'));
  end loop;
  insert into local_commerce.admin_customization_actions
    (project_id,product_id,actor_id,operation,previous_revision,new_revision,restored_from_revision)
    values(p_project_id,p_product_id,p_actor_id,
      case when p_restored_from_revision is null then 'publish' else 'restore' end,
      v_current.revision,v_next,p_restored_from_revision);
  return jsonb_build_object('status','applied','configuration',v_definition);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  return jsonb_build_object('status','invalid_configuration');
end;
$$;
revoke all on function local_commerce.admin_customization_publish(text,text,uuid,integer,text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function local_commerce.admin_customization_publish(text,text,uuid,integer,text,jsonb,jsonb,integer) to service_role;
notify pgrst, 'reload schema';
