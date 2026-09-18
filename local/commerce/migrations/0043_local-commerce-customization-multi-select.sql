-- C08 forward fix: extend the existing C03 and immutable choice snapshot seams
-- for validated multi-select values. The ledger wrapper owns the transaction.

DO $forward$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('local_commerce.compute_customization_pricing(text,jsonb)'::regprocedure)
    INTO definition;
  IF definition IS NULL
    OR position($kind$not in ('image','short_text','long_text','single_select')$kind$ IN definition) = 0
    OR position($single$elsif v_field->>'kind'='single_select' then$single$ IN definition) = 0 THEN
    RAISE EXCEPTION 'C08 customization pricing forward-fix target is not present';
  END IF;
  definition := replace(
    definition,
    $kind$not in ('image','short_text','long_text','single_select')$kind$,
    $replacement$not in ('image','short_text','long_text','single_select','multi_select')$replacement$
  );
  definition := replace(
    definition,
    $single$elsif v_field->>'kind'='single_select' then
        if (select array_agg(key order by key) from jsonb_object_keys(v_value) key)
            is distinct from array['choiceId','fieldCode','fieldId','kind']
          or v_value->>'choiceId' is null
          or not exists (
            select 1
            from jsonb_array_elements(v_field->'constraints'->'choices') choice
            where choice->>'id' = v_value->>'choiceId'
              and choice->>'isActive' = 'true'
          ) then return null; end if;
        v_present := true;$single$,
    $replacement$elsif v_field->>'kind'='single_select' then
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
      elsif v_field->>'kind'='multi_select' then
        if (select array_agg(key order by key) from jsonb_object_keys(v_value) key)
            is distinct from array['choiceIds','fieldCode','fieldId','kind']
          or jsonb_typeof(v_value->'choiceIds') is distinct from 'array'
          or exists (select 1 from jsonb_array_elements_text(v_value->'choiceIds') selected where selected !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$')
          or (select count(*) from jsonb_array_elements_text(v_value->'choiceIds'))
             is distinct from (select count(distinct selected) from jsonb_array_elements_text(v_value->'choiceIds') selected)
          or exists (
            select 1 from jsonb_array_elements_text(v_value->'choiceIds') selected
            where not exists (select 1 from jsonb_array_elements(v_field->'constraints'->'choices') choice where choice->>'id'=selected and choice->>'isActive'='true')
          )
          or jsonb_array_length(v_value->'choiceIds') < greatest(case when v_field->>'required'='true' then 1 else 0 end, coalesce((v_field->'constraints'->>'minSelections')::integer,0))
          or jsonb_array_length(v_value->'choiceIds') > coalesce((v_field->'constraints'->>'maxSelections')::integer,0)
          or (select coalesce(jsonb_agg(to_jsonb(choice->>'id') order by (choice->>'position')::integer), '[]'::jsonb)
              from jsonb_array_elements(v_field->'constraints'->'choices') choice
              where choice->>'isActive'='true'
                and choice->>'id' in (select jsonb_array_elements_text(v_value->'choiceIds'))) is distinct from v_value->'choiceIds'
          then return null; end if;
        v_present := jsonb_array_length(v_value->'choiceIds') > 0;$replacement$
  );
  EXECUTE definition;
END
$forward$;

CREATE OR REPLACE FUNCTION local_commerce.snapshot_single_select_facts(
  p_definition jsonb,
  p_values jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,local_commerce
AS $facts$
DECLARE
  v_field jsonb;
  v_choice jsonb;
  v_value jsonb;
  v_result jsonb := '[]'::jsonb;
  v_selected jsonb;
BEGIN
  IF jsonb_typeof(p_definition) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_definition->'fields') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_values) IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;
  FOR v_value IN SELECT value FROM jsonb_array_elements(p_values) LOOP
    IF v_value->>'kind' NOT IN ('single_select','multi_select') THEN
      v_result := v_result || jsonb_build_array(v_value);
      CONTINUE;
    END IF;
    IF v_value->>'kind'='single_select' THEN
      IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_value) key)
          IS DISTINCT FROM array['choiceId','fieldCode','fieldId','kind']
        OR v_value->>'choiceId' IS NULL THEN RETURN NULL; END IF;
      SELECT field INTO v_field FROM jsonb_array_elements(p_definition->'fields') field
        WHERE field->>'id'=v_value->>'fieldId' AND field->>'code'=v_value->>'fieldCode'
          AND field->>'kind'='single_select' AND field->>'isActive'='true' LIMIT 1;
      IF v_field IS NULL THEN RETURN NULL; END IF;
      SELECT choice INTO v_choice FROM jsonb_array_elements(v_field->'constraints'->'choices') choice
        WHERE choice->>'id'=v_value->>'choiceId' AND choice->>'isActive'='true' LIMIT 1;
      IF v_choice IS NULL THEN RETURN NULL; END IF;
      v_result := v_result || jsonb_build_array(v_value || jsonb_build_object(
        'fieldLabel',v_field->>'label','choiceCode',v_choice->>'code','choiceLabel',v_choice->>'label','choicePosition',(v_choice->>'position')::integer));
    ELSE
      IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_value) key)
          IS DISTINCT FROM array['choiceIds','fieldCode','fieldId','kind']
        OR jsonb_typeof(v_value->'choiceIds') IS DISTINCT FROM 'array'
        OR (SELECT count(*) FROM jsonb_array_elements_text(v_value->'choiceIds'))
           IS DISTINCT FROM (SELECT count(DISTINCT selected) FROM jsonb_array_elements_text(v_value->'choiceIds') selected) THEN RETURN NULL; END IF;
      SELECT field INTO v_field FROM jsonb_array_elements(p_definition->'fields') field
        WHERE field->>'id'=v_value->>'fieldId' AND field->>'code'=v_value->>'fieldCode'
          AND field->>'kind'='multi_select' AND field->>'isActive'='true' LIMIT 1;
      IF v_field IS NULL THEN RETURN NULL; END IF;
      IF jsonb_array_length(v_value->'choiceIds') < greatest(case when v_field->>'required'='true' then 1 else 0 end, coalesce((v_field->'constraints'->>'minSelections')::integer,0))
        OR jsonb_array_length(v_value->'choiceIds') > coalesce((v_field->'constraints'->>'maxSelections')::integer,0) THEN RETURN NULL; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_value->'choiceIds') selected WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_field->'constraints'->'choices') choice WHERE choice->>'id'=selected AND choice->>'isActive'='true')) THEN RETURN NULL; END IF;
      SELECT coalesce(jsonb_agg(jsonb_build_object('choiceId',choice->>'id','choiceCode',choice->>'code','choiceLabel',choice->>'label','choicePosition',(choice->>'position')::integer) ORDER BY (choice->>'position')::integer), '[]'::jsonb) INTO v_selected
        FROM jsonb_array_elements(v_field->'constraints'->'choices') choice
        WHERE choice->>'isActive'='true' AND choice->>'id' IN (SELECT jsonb_array_elements_text(v_value->'choiceIds'));
      IF (SELECT coalesce(jsonb_agg(to_jsonb(choice->>'id') ORDER BY (choice->>'position')::integer), '[]'::jsonb) FROM jsonb_array_elements(v_field->'constraints'->'choices') choice WHERE choice->>'isActive'='true' AND choice->>'id' IN (SELECT jsonb_array_elements_text(v_value->'choiceIds'))) IS DISTINCT FROM v_value->'choiceIds' THEN RETURN NULL; END IF;
      v_result := v_result || jsonb_build_array(v_value || jsonb_build_object('fieldLabel',v_field->>'label','selectedChoices',v_selected));
    END IF;
  END LOOP;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END
$facts$;

REVOKE ALL ON FUNCTION local_commerce.snapshot_single_select_facts(jsonb,jsonb) FROM public,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION local_commerce.compute_customization_pricing(text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION local_commerce.compute_customization_pricing(text,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
