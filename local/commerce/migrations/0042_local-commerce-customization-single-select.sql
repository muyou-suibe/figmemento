-- C07 forward fix: allow the existing server-owned customization surcharge
-- authority to validate single-select values without adding per-choice pricing.
-- The ledger wrapper owns the outer transaction; do not add transaction control.

do $forward$
declare
  definition text;
begin
  select pg_get_functiondef(
    'local_commerce.compute_customization_pricing(text,jsonb)'::regprocedure
  ) into definition;

  if definition is null
    or position($kind$not in ('image','short_text','long_text')$kind$ in definition) = 0
    or position($text$if jsonb_typeof(v_value->'value') is distinct from 'string' then return null; end if;$text$ in definition) = 0 then
    raise exception 'C07 customization pricing forward-fix target is not present';
  end if;

  definition := replace(
    definition,
    $kind$not in ('image','short_text','long_text')$kind$,
    $replacement$not in ('image','short_text','long_text','single_select')$replacement$
  );
  definition := replace(
    definition,
    $old$      else
        if jsonb_typeof(v_value->'value') is distinct from 'string' then return null; end if;
        v_present := length(btrim(v_value->>'value')) > 0;
      end if;$old$,
    $new$      elsif v_field->>'kind'='single_select' then
        if (select array_agg(key order by key) from jsonb_object_keys(v_value) key)
            is distinct from array['choiceId','fieldCode','fieldId','kind']
          or v_value->>'choiceId' is null
          or not exists (
            select 1
            from jsonb_array_elements(v_field->'constraints'->'choices') choice
            where choice->>'id' = v_value->>'choiceId'
              and choice->>'isActive' = 'true'
          ) then return null; end if;
        v_present := true;
      else
        if jsonb_typeof(v_value->'value') is distinct from 'string' then return null; end if;
        v_present := length(btrim(v_value->>'value')) > 0;
      end if;$new$
  );
  execute definition;
end
$forward$;

-- Order commit must detach C07 choice facts from the submitted value and the
-- mutable current Catalog in the same transaction as the purchase snapshot.
create or replace function local_commerce.snapshot_single_select_facts(
  p_definition jsonb,
  p_values jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,local_commerce
as $facts$
declare
  v_field jsonb;
  v_choice jsonb;
  v_value jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_definition) is distinct from 'object'
    or jsonb_typeof(p_definition->'fields') is distinct from 'array'
    or jsonb_typeof(p_values) is distinct from 'array' then
    return null;
  end if;
  for v_value in select value from jsonb_array_elements(p_values) loop
    if v_value->>'kind' <> 'single_select' then
      v_result := v_result || jsonb_build_array(v_value);
      continue;
    end if;
    if (select array_agg(key order by key) from jsonb_object_keys(v_value) key)
        is distinct from array['choiceId','fieldCode','fieldId','kind'] then
      return null;
    end if;
    select field into v_field
      from jsonb_array_elements(p_definition->'fields') field
      where field->>'id'=v_value->>'fieldId'
        and field->>'code'=v_value->>'fieldCode'
        and field->>'kind'='single_select'
        and field->>'isActive'='true'
      limit 1;
    if v_field is null then return null; end if;
    select choice into v_choice
      from jsonb_array_elements(v_field->'constraints'->'choices') choice
      where choice->>'id'=v_value->>'choiceId'
        and choice->>'isActive'='true'
      limit 1;
    if v_choice is null then return null; end if;
    v_result := v_result || jsonb_build_array(
      v_value || jsonb_build_object(
        'fieldLabel',v_field->>'label',
        'choiceCode',v_choice->>'code',
        'choiceLabel',v_choice->>'label',
        'choicePosition',(v_choice->>'position')::integer
      )
    );
  end loop;
  return v_result;
exception when others then
  return null;
end
$facts$;
revoke all on function local_commerce.snapshot_single_select_facts(jsonb,jsonb) from public,anon,authenticated,service_role;

do $order_fix$
declare
  definition text;
begin
  select pg_get_functiondef(
    'local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb)'::regprocedure
  ) into definition;
  if definition is null
    or position($decl$expected_pricing jsonb;$decl$ in definition)=0
    or position($increment$item_index:=item_index+1;$increment$ in definition)=0
    or position($insert$'values',item->'customizationValues','fulfillment'$insert$ in definition)=0 then
    raise exception 'C07 order snapshot forward-fix target is not present';
  end if;
  definition := replace(
    definition,
    $decl$expected_pricing jsonb;$decl$,
    $replacement$expected_pricing jsonb; expected_customization jsonb;$replacement$
  );
  definition := replace(
    definition,
    $increment$item_index:=item_index+1;$increment$,
    $replacement$expected_customization:=local_commerce.snapshot_single_select_facts(item->'configuration',item->'customizationValues');
    if expected_customization is null then return jsonb_build_object('status','conflict'); end if;
    item_index:=item_index+1;$replacement$
  );
  definition := replace(
    definition,
    $insert$'values',item->'customizationValues','fulfillment'$insert$,
    $replacement$'values',expected_customization,'fulfillment'$replacement$
  );
  execute definition;
end
$order_fix$;

revoke all on function local_commerce.compute_customization_pricing(text,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.compute_customization_pricing(text,jsonb) to service_role;

notify pgrst, 'reload schema';
