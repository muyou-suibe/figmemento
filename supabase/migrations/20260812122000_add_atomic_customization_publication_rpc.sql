-- PhotoGift Customization: server-only atomic publication of one Product's
-- normalized CustomizationField configuration. This local artifact depends on
-- Phase A (20260812120000) and intentionally does not apply itself.

begin;

create function public.publish_product_customization_configuration(
  p_product_id uuid,
  p_expected_current_revision_id uuid,
  p_fields jsonb
)
returns table (
  result_status text,
  product_id uuid,
  configuration_revision_id uuid,
  configuration jsonb,
  new_field_id_mappings jsonb,
  safe_issues jsonb
)
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_current_revision_id uuid;
  v_new_revision_id uuid;
  v_field jsonb;
  v_identity jsonb;
  v_constraints jsonb;
  v_input_ordinal bigint;
  v_identity_kind text;
  v_existing_id uuid;
  v_stable_field_id uuid;
  v_stored_code text;
  v_draft_id text;
  v_code text;
  v_label text;
  v_kind text;
  v_required boolean;
  v_is_active boolean;
  v_position integer;
  v_max_length integer;
  v_help_text text;
  v_allowed_mime_types text[];
  v_max_bytes integer;
  v_min_width integer;
  v_min_height integer;
  v_recommended_width integer;
  v_recommended_height integer;
  v_min_image_count integer;
  v_max_image_count integer;
  v_crop_enabled boolean;
  v_position_text text;
  v_max_length_text text;
  v_max_bytes_text text;
  v_min_width_text text;
  v_min_height_text text;
  v_recommended_width_text text;
  v_recommended_height_text text;
  v_min_image_count_text text;
  v_max_image_count_text text;
  v_existing_ids uuid[] := array[]::uuid[];
  v_seen_codes text[] := array[]::text[];
  v_seen_positions integer[] := array[]::integer[];
  v_seen_draft_ids text[] := array[]::text[];
  v_new_field_id_mappings jsonb := '[]'::jsonb;
  v_configuration jsonb;
begin
  if p_product_id is null then
    return query select
      'invalid_configuration'::text, null::uuid, null::uuid, null::jsonb,
      null::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'path', '$.productId', 'code', 'invalid_format',
        'message', 'Product ID is invalid.'
      ));
    return;
  end if;

  if p_fields is null or pg_catalog.jsonb_typeof(p_fields) is distinct from 'array' then
    return query select
      'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
      null::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'path', '$.fields', 'code', 'invalid_type',
        'message', 'Replacement fields must be an array.'
      ));
    return;
  end if;

  -- This Product lock serializes both revision replacement and the no-current
  -- first-configuration case. A pre-RPC application read is not authoritative.
  perform 1
  from public.products as product
  where product.id = p_product_id
  for update;
  if not found then
    return query select
      'not_found'::text, p_product_id, null::uuid, null::jsonb, null::jsonb,
      null::jsonb;
    return;
  end if;

  select config.id
  into v_current_revision_id
  from public.product_customization_configs as config
  where config.product_id = p_product_id
    and config.is_current
  for update;

  if (v_current_revision_id is null and p_expected_current_revision_id is not null)
    or (v_current_revision_id is not null
      and p_expected_current_revision_id is distinct from v_current_revision_id)
  then
    return query select
      'stale_revision'::text, p_product_id, null::uuid, null::jsonb,
      null::jsonb, null::jsonb;
    return;
  end if;

  -- An explicit empty first revision is valid. Empty replacement of any
  -- existing current revision is not a synonym for unconfiguration.
  if pg_catalog.jsonb_array_length(p_fields) = 0
    and v_current_revision_id is not null
  then
    return query select
      'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
      null::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'path', '$.fields', 'code', 'incomplete',
        'message', 'Existing fields must be represented and explicitly deactivated when needed.'
      ));
    return;
  end if;

  -- First pass: validate the fixed input shape and all stable-identity
  -- invariants before allocating IDs or changing publication state. Detailed
  -- kind-specific constraints remain the Task 4.4 parser's responsibility and
  -- are enforced again by Phase A row constraints on insertion.
  for v_field, v_input_ordinal in
    select item.value, item.ordinality
    from pg_catalog.jsonb_array_elements(p_fields) with ordinality as item(value, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_field) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_field -> 'identity') is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_field -> 'constraints') is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_field -> 'required') is distinct from 'boolean'
      or pg_catalog.jsonb_typeof(v_field -> 'isActive') is distinct from 'boolean'
      or pg_catalog.jsonb_typeof(v_field -> 'position') is distinct from 'number'
    then
      return query select
        'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
        null::jsonb,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'path', '$.fields[' || (v_input_ordinal - 1)::text || ']',
          'code', 'invalid_type', 'message', 'Field input has an invalid shape.'
        ));
      return;
    end if;

    v_identity := v_field -> 'identity';
    v_constraints := v_field -> 'constraints';
    v_identity_kind := v_identity ->> 'kind';
    v_code := v_identity ->> 'code';
    v_label := v_field ->> 'label';
    v_kind := v_field ->> 'kind';

    if v_identity_kind is null
      or v_identity_kind not in ('existing', 'new')
      or v_code is null
      or v_code !~ '^[a-z0-9]+([-_][a-z0-9]+)*$'
      or pg_catalog.length(v_code) > 80
      or v_label is null
      or pg_catalog.btrim(v_label) = ''
      or pg_catalog.length(v_label) > 200
      or v_kind is null
      or v_kind not in ('image', 'short_text', 'long_text')
    then
      return query select
        'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
        null::jsonb,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'path', '$.fields[' || (v_input_ordinal - 1)::text || ']',
          'code', 'invalid_value', 'message', 'Field input is invalid.'
        ));
      return;
    end if;

    v_position_text := v_field ->> 'position';
    if v_position_text is null
      or v_position_text !~ '^[0-9]+$'
      or pg_catalog.length(v_position_text) > 10
      or (
        pg_catalog.length(v_position_text) = 10
        and v_position_text > '2147483647'
      )
    then
      return query select
        'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
        null::jsonb,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'path', '$.fields[' || (v_input_ordinal - 1)::text || '].position',
          'code', 'invalid_value', 'message', 'Field position is outside the supported database integer range.'
        ));
      return;
    end if;
    v_position := v_position_text::integer;

    if v_kind in ('short_text', 'long_text') then
      if pg_catalog.jsonb_typeof(v_constraints -> 'maxLength') is distinct from 'number' then
        return query select
          'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
          null::jsonb,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'path', '$.fields[' || (v_input_ordinal - 1)::text || '].constraints.maxLength',
            'code', 'invalid_type', 'message', 'Text maximum length is invalid.'
          ));
        return;
      end if;
      v_max_length_text := v_constraints ->> 'maxLength';
      if v_max_length_text is null
        or v_max_length_text !~ '^[0-9]+$'
        or v_max_length_text = '0'
        or pg_catalog.length(v_max_length_text) > 10
        or (
          pg_catalog.length(v_max_length_text) = 10
          and v_max_length_text > '2147483647'
        )
      then
        return query select
          'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
          null::jsonb,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'path', '$.fields[' || (v_input_ordinal - 1)::text || '].constraints.maxLength',
            'code', 'invalid_value', 'message', 'Text maximum length is outside the supported database integer range.'
          ));
        return;
      end if;
    else
      if pg_catalog.jsonb_typeof(v_constraints -> 'allowedMimeTypes') is distinct from 'array'
        or pg_catalog.jsonb_typeof(v_constraints -> 'maxBytes') is distinct from 'number'
        or pg_catalog.jsonb_typeof(v_constraints -> 'minDimensions') is distinct from 'object'
        or pg_catalog.jsonb_typeof(v_constraints -> 'minDimensions' -> 'width') is distinct from 'number'
        or pg_catalog.jsonb_typeof(v_constraints -> 'minDimensions' -> 'height') is distinct from 'number'
        or pg_catalog.jsonb_typeof(v_constraints -> 'minImageCount') is distinct from 'number'
        or pg_catalog.jsonb_typeof(v_constraints -> 'maxImageCount') is distinct from 'number'
        or pg_catalog.jsonb_typeof(v_constraints -> 'cropEnabled') is distinct from 'boolean'
        or (
          v_constraints ? 'recommendedDimensions'
          and pg_catalog.jsonb_typeof(v_constraints -> 'recommendedDimensions') is distinct from 'object'
        )
        or (
          v_constraints ? 'recommendedDimensions'
          and (
            pg_catalog.jsonb_typeof(v_constraints -> 'recommendedDimensions' -> 'width') is distinct from 'number'
            or pg_catalog.jsonb_typeof(v_constraints -> 'recommendedDimensions' -> 'height') is distinct from 'number'
          )
        )
      then
        return query select
          'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
          null::jsonb,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'path', '$.fields[' || (v_input_ordinal - 1)::text || '].constraints',
            'code', 'invalid_type', 'message', 'Image constraint shape is invalid.'
          ));
        return;
      end if;

      v_max_bytes_text := v_constraints ->> 'maxBytes';
      v_min_width_text := v_constraints -> 'minDimensions' ->> 'width';
      v_min_height_text := v_constraints -> 'minDimensions' ->> 'height';
      v_min_image_count_text := v_constraints ->> 'minImageCount';
      v_max_image_count_text := v_constraints ->> 'maxImageCount';
      if v_constraints ? 'recommendedDimensions' then
        v_recommended_width_text := v_constraints -> 'recommendedDimensions' ->> 'width';
        v_recommended_height_text := v_constraints -> 'recommendedDimensions' ->> 'height';
      else
        v_recommended_width_text := null;
        v_recommended_height_text := null;
      end if;

      if v_max_bytes_text is null
        or v_max_bytes_text !~ '^[0-9]+$'
        or v_max_bytes_text = '0'
        or pg_catalog.length(v_max_bytes_text) > 10
        or (pg_catalog.length(v_max_bytes_text) = 10 and v_max_bytes_text > '2147483647')
        or v_min_width_text is null
        or v_min_width_text !~ '^[0-9]+$'
        or v_min_width_text = '0'
        or pg_catalog.length(v_min_width_text) > 10
        or (pg_catalog.length(v_min_width_text) = 10 and v_min_width_text > '2147483647')
        or v_min_height_text is null
        or v_min_height_text !~ '^[0-9]+$'
        or v_min_height_text = '0'
        or pg_catalog.length(v_min_height_text) > 10
        or (pg_catalog.length(v_min_height_text) = 10 and v_min_height_text > '2147483647')
        or v_min_image_count_text is null
        or v_min_image_count_text !~ '^[0-9]+$'
        or pg_catalog.length(v_min_image_count_text) > 10
        or (pg_catalog.length(v_min_image_count_text) = 10 and v_min_image_count_text > '2147483647')
        or v_max_image_count_text is null
        or v_max_image_count_text !~ '^[0-9]+$'
        or v_max_image_count_text = '0'
        or pg_catalog.length(v_max_image_count_text) > 10
        or (pg_catalog.length(v_max_image_count_text) = 10 and v_max_image_count_text > '2147483647')
        or (
          v_recommended_width_text is not null
          and (
            v_recommended_width_text !~ '^[0-9]+$'
            or v_recommended_width_text = '0'
            or pg_catalog.length(v_recommended_width_text) > 10
            or (
              pg_catalog.length(v_recommended_width_text) = 10
              and v_recommended_width_text > '2147483647'
            )
          )
        )
        or (
          v_recommended_height_text is not null
          and (
            v_recommended_height_text !~ '^[0-9]+$'
            or v_recommended_height_text = '0'
            or pg_catalog.length(v_recommended_height_text) > 10
            or (
              pg_catalog.length(v_recommended_height_text) = 10
              and v_recommended_height_text > '2147483647'
            )
          )
        )
      then
        return query select
          'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
          null::jsonb,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'path', '$.fields[' || (v_input_ordinal - 1)::text || '].constraints',
            'code', 'invalid_value', 'message', 'Image numeric constraint is outside the supported database integer range.'
          ));
        return;
      end if;
    end if;
    if v_code = any(v_seen_codes) then
      return query select
        'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
        null::jsonb,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'path', '$.fields[' || (v_input_ordinal - 1)::text || '].identity.code',
          'code', 'duplicate', 'message', 'Field codes must be unique within a Product.'
        ));
      return;
    end if;
    if v_position = any(v_seen_positions) then
      return query select
        'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
        null::jsonb,
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'path', '$.fields[' || (v_input_ordinal - 1)::text || '].position',
          'code', 'duplicate', 'message', 'Field positions must be unique within a configuration.'
        ));
      return;
    end if;
    v_seen_codes := pg_catalog.array_append(v_seen_codes, v_code);
    v_seen_positions := pg_catalog.array_append(v_seen_positions, v_position);

    if v_identity_kind = 'existing' then
      if (v_identity ->> 'id') is null
        or (v_identity ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then
        return query select
          'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
          null::jsonb,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'path', '$.fields[' || (v_input_ordinal - 1)::text || '].identity.id',
            'code', 'invalid_format', 'message', 'Existing stable field ID is invalid.'
          ));
        return;
      end if;
      v_existing_id := (v_identity ->> 'id')::uuid;
      if v_existing_id = any(v_existing_ids) then
        return query select
          'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
          null::jsonb,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'path', '$.fields[' || (v_input_ordinal - 1)::text || '].identity.id',
            'code', 'duplicate', 'message', 'Existing stable field IDs may appear only once.'
          ));
        return;
      end if;
      select identity.code
      into v_stored_code
      from public.customization_field_identities as identity
      where identity.id = v_existing_id
        and identity.product_id = p_product_id;
      if not found or v_stored_code is distinct from v_code then
        return query select
          'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
          null::jsonb,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'path', '$.fields[' || (v_input_ordinal - 1)::text || '].identity',
            'code', 'ownership', 'message', 'Stable field identity is unavailable for this Product.'
          ));
        return;
      end if;
      v_existing_ids := pg_catalog.array_append(v_existing_ids, v_existing_id);
    else
      v_draft_id := v_identity ->> 'draftId';
      if v_draft_id is null
        or v_draft_id !~ '^new:[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$'
        or v_draft_id = any(v_seen_draft_ids)
      then
        return query select
          'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
          null::jsonb,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'path', '$.fields[' || (v_input_ordinal - 1)::text || '].identity.draftId',
            'code', 'invalid_value', 'message', 'New field draft identity is invalid or duplicated.'
          ));
        return;
      end if;
      if exists (
        select 1
        from public.customization_field_identities as historical_identity
        where historical_identity.product_id = p_product_id
          and historical_identity.code = v_code
      ) then
        return query select
          'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
          null::jsonb,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'path', '$.fields[' || (v_input_ordinal - 1)::text || '].identity.code',
            'code', 'duplicate', 'message', 'A historical stable field already owns this Product code.'
          ));
        return;
      end if;
      v_seen_draft_ids := pg_catalog.array_append(v_seen_draft_ids, v_draft_id);
    end if;
  end loop;

  if v_current_revision_id is not null and exists (
    select 1
    from public.customization_fields as previous_definition
    where previous_definition.configuration_revision_id = v_current_revision_id
      and not (previous_definition.stable_field_id = any(v_existing_ids))
  ) then
    return query select
      'invalid_configuration'::text, p_product_id, null::uuid, null::jsonb,
      null::jsonb,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'path', '$.fields', 'code', 'incomplete',
        'message', 'Existing fields must be retained and explicitly deactivated when needed.'
      ));
    return;
  end if;

  insert into public.product_customization_configs (product_id, is_current)
  values (p_product_id, false)
  returning id into v_new_revision_id;

  -- Second pass: allocate only server-side stable identities for new fields
  -- and write a complete immutable definition set for the new revision.
  for v_field, v_input_ordinal in
    select item.value, item.ordinality
    from pg_catalog.jsonb_array_elements(p_fields) with ordinality as item(value, ordinality)
    order by (item.value ->> 'position')::integer asc
  loop
    v_identity := v_field -> 'identity';
    v_constraints := v_field -> 'constraints';
    v_identity_kind := v_identity ->> 'kind';
    v_code := v_identity ->> 'code';
    v_label := v_field ->> 'label';
    v_kind := v_field ->> 'kind';
    v_required := (v_field ->> 'required')::boolean;
    v_is_active := (v_field ->> 'isActive')::boolean;
    v_position := (v_field ->> 'position')::integer;

    if v_identity_kind = 'existing' then
      v_stable_field_id := (v_identity ->> 'id')::uuid;
    else
      v_draft_id := v_identity ->> 'draftId';
      insert into public.customization_field_identities (product_id, code)
      values (p_product_id, v_code)
      returning id into v_stable_field_id;
      v_new_field_id_mappings := v_new_field_id_mappings ||
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'draftId', v_draft_id,
          'stableFieldId', v_stable_field_id::text
        ));
    end if;

    if v_kind in ('short_text', 'long_text') then
      v_max_length := (v_constraints ->> 'maxLength')::integer;
      v_help_text := v_constraints ->> 'helpText';
      insert into public.customization_fields (
        configuration_revision_id, product_id, stable_field_id, label, kind,
        required, is_active, position, max_length, help_text
      ) values (
        v_new_revision_id, p_product_id, v_stable_field_id, v_label, v_kind,
        v_required, v_is_active, v_position, v_max_length, v_help_text
      );
    else
      select pg_catalog.array_agg(mime_type)
      into v_allowed_mime_types
      from pg_catalog.jsonb_array_elements_text(v_constraints -> 'allowedMimeTypes') as mime_type;
      v_max_bytes := (v_constraints ->> 'maxBytes')::integer;
      v_min_width := (v_constraints -> 'minDimensions' ->> 'width')::integer;
      v_min_height := (v_constraints -> 'minDimensions' ->> 'height')::integer;
      if v_constraints ? 'recommendedDimensions' then
        v_recommended_width := (v_constraints -> 'recommendedDimensions' ->> 'width')::integer;
        v_recommended_height := (v_constraints -> 'recommendedDimensions' ->> 'height')::integer;
      else
        v_recommended_width := null;
        v_recommended_height := null;
      end if;
      v_min_image_count := (v_constraints ->> 'minImageCount')::integer;
      v_max_image_count := (v_constraints ->> 'maxImageCount')::integer;
      v_crop_enabled := (v_constraints ->> 'cropEnabled')::boolean;
      insert into public.customization_fields (
        configuration_revision_id, product_id, stable_field_id, label, kind,
        required, is_active, position, allowed_mime_types, max_bytes,
        min_width, min_height, recommended_width, recommended_height,
        min_image_count, max_image_count, crop_enabled
      ) values (
        v_new_revision_id, p_product_id, v_stable_field_id, v_label, v_kind,
        v_required, v_is_active, v_position, v_allowed_mime_types, v_max_bytes,
        v_min_width, v_min_height, v_recommended_width, v_recommended_height,
        v_min_image_count, v_max_image_count, v_crop_enabled
      );
    end if;
  end loop;

  if v_current_revision_id is not null then
    update public.product_customization_configs as current_config
    set is_current = false,
        superseded_at = pg_catalog.now()
    where current_config.id = v_current_revision_id
      and current_config.product_id = p_product_id
      and current_config.is_current;
  end if;

  update public.product_customization_configs as new_config
  set is_current = true,
      superseded_at = null
  where new_config.id = v_new_revision_id
    and new_config.product_id = p_product_id;

  select pg_catalog.jsonb_build_object(
    'productId', p_product_id::text,
    'configurationRevision', v_new_revision_id::text,
    'fields', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', definition.stable_field_id::text,
          'productId', definition.product_id::text,
          'code', identity.code,
          'label', definition.label,
          'kind', definition.kind,
          'required', definition.required,
          'isActive', definition.is_active,
          'position', definition.position,
          'configurationRevision', definition.configuration_revision_id::text,
          'constraints', case
            when definition.kind = 'image' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'allowedMimeTypes', pg_catalog.to_jsonb(definition.allowed_mime_types),
              'maxBytes', definition.max_bytes,
              'minDimensions', pg_catalog.jsonb_build_object(
                'width', definition.min_width, 'height', definition.min_height
              ),
              'recommendedDimensions', case
                when definition.recommended_width is null then null
                else pg_catalog.jsonb_build_object(
                  'width', definition.recommended_width,
                  'height', definition.recommended_height
                )
              end,
              'minImageCount', definition.min_image_count,
              'maxImageCount', definition.max_image_count,
              'cropEnabled', definition.crop_enabled
            ))
            else pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'maxLength', definition.max_length, 'helpText', definition.help_text
            ))
          end
        ) order by definition.position
      ),
      '[]'::jsonb
    )
  )
  into v_configuration
  from public.customization_fields as definition
  join public.customization_field_identities as identity
    on identity.id = definition.stable_field_id
    and identity.product_id = definition.product_id
  where definition.configuration_revision_id = v_new_revision_id
    and definition.product_id = p_product_id;

  return query select
    'applied'::text, p_product_id, v_new_revision_id, v_configuration,
    v_new_field_id_mappings, null::jsonb;
end;
$function$;

revoke all privileges on function public.publish_product_customization_configuration(uuid, uuid, jsonb) from public;
revoke all privileges on function public.publish_product_customization_configuration(uuid, uuid, jsonb) from anon;
revoke all privileges on function public.publish_product_customization_configuration(uuid, uuid, jsonb) from authenticated;
revoke all privileges on function public.publish_product_customization_configuration(uuid, uuid, jsonb) from service_role;
grant execute on function public.publish_product_customization_configuration(uuid, uuid, jsonb) to service_role;

commit;
