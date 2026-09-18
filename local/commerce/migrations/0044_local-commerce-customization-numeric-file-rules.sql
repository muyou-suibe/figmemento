-- Phase 1 forward fix: extend the existing server-owned customization seams
-- for bounded numeric and generic-file values. The ledger wrapper owns the
-- transaction; this migration deliberately has no transaction control.

DO $forward$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef('local_commerce.compute_customization_pricing(text,jsonb)'::regprocedure)
    INTO definition;
  IF definition IS NULL
    OR position($allowed$not in ('image','short_text','long_text','single_select','multi_select')$allowed$ IN definition) = 0
    OR position($multi$v_present := jsonb_array_length(v_value->'choiceIds') > 0;$multi$ IN definition) = 0 THEN
    RAISE EXCEPTION 'Phase 1 customization forward-fix target is not present';
  END IF;
  definition := replace(
    definition,
    $allowed$not in ('image','short_text','long_text','single_select','multi_select')$allowed$,
    $replacement$not in ('image','short_text','long_text','single_select','multi_select','numeric','generic_file')$replacement$
  );
  definition := replace(
    definition,
    $multi$v_present := jsonb_array_length(v_value->'choiceIds') > 0;$multi$,
    $replacement$v_present := jsonb_array_length(v_value->'choiceIds') > 0;
      elsif v_field->>'kind'='numeric' then
        if (select array_agg(key order by key) from jsonb_object_keys(v_value) key)
             is distinct from array['fieldCode','fieldId','kind','value']
          or jsonb_typeof(v_value->'value') is distinct from 'number'
          or v_field->'constraints'->>'min' is null
          or v_field->'constraints'->>'max' is null
          or v_field->'constraints'->>'step' is null
          or (v_value->>'value')::numeric < (v_field->'constraints'->>'min')::numeric
          or (v_value->>'value')::numeric > (v_field->'constraints'->>'max')::numeric
          or abs(mod((v_value->>'value')::numeric - (v_field->'constraints'->>'min')::numeric, (v_field->'constraints'->>'step')::numeric)) > 0.000000001
        then return null; end if;
        v_present := true;
      elsif v_field->>'kind'='generic_file' then
        if (select array_agg(key order by key) from jsonb_object_keys(v_value) key)
             is distinct from array['fieldCode','fieldId','files','kind']
          or jsonb_typeof(v_value->'files') is distinct from 'array'
          or jsonb_array_length(v_value->'files') < greatest(case when v_field->>'required'='true' then 1 else 0 end, coalesce((v_field->'constraints'->>'minFileCount')::integer,0))
          or jsonb_array_length(v_value->'files') > coalesce((v_field->'constraints'->>'maxFileCount')::integer,0)
          or exists (
            select 1 from jsonb_array_elements(v_value->'files') file
            where (select array_agg(key order by key) from jsonb_object_keys(file) key) is distinct from array['receiptId']
              or file->>'receiptId' is null
              or file->>'receiptId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$'
          )
        then return null; end if;
        v_present := jsonb_array_length(v_value->'files') > 0;$replacement$
  );
  EXECUTE definition;
END
$forward$;

REVOKE ALL ON FUNCTION local_commerce.compute_customization_pricing(text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION local_commerce.compute_customization_pricing(text,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
