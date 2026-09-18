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

-- C10 uses a separate receipt aggregate because the immutable image media
-- pipeline is intentionally dimensioned for image bytes. Generic files still
-- use the same private bucket and verified owner boundary, but never enter the
-- image crop/derivative operation model.
create table local_commerce.generic_file_receipts (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  receipt_reference uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  product_id uuid not null,
  field_key text not null,
  configuration_revision integer not null,
  original_filename text,
  content_type text not null,
  byte_size bigint not null,
  content_digest text not null,
  internal_locator text not null,
  receipt_status text not null default 'pending',
  lifecycle text not null default 'active',
  version integer not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint generic_file_receipts_pk primary key (project_id, id),
  constraint generic_file_receipts_owner_identity_key unique (project_id, id, owner_id),
  constraint generic_file_receipts_reference_key unique (project_id, receipt_reference),
  constraint generic_file_receipts_locator_key unique (project_id, internal_locator),
  constraint generic_file_receipts_owner_fk foreign key (project_id, owner_id)
    references local_commerce.commerce_owners (project_id, id),
  constraint generic_file_receipts_product_fk foreign key (project_id, product_id)
    references local_commerce.catalog_products (project_id, id),
  constraint generic_file_receipts_field_check check (length(btrim(field_key)) > 0),
  constraint generic_file_receipts_revision_check check (configuration_revision > 0),
  constraint generic_file_receipts_filename_check check (original_filename is null or (length(original_filename) between 1 and 240 and original_filename !~ '[[:cntrl:]]')),
  constraint generic_file_receipts_mime_check check (content_type in ('application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  constraint generic_file_receipts_size_check check (byte_size > 0 and byte_size <= 52428800),
  constraint generic_file_receipts_digest_check check (content_digest ~ '^[a-f0-9]{64}$'),
  constraint generic_file_receipts_locator_check check (internal_locator ~ '^[A-Za-z0-9._-]+/generic/[a-f0-9-]{36}$'),
  constraint generic_file_receipts_status_check check (receipt_status in ('pending','ready','failed')),
  constraint generic_file_receipts_lifecycle_check check (lifecycle in ('active','removed','expired')),
  constraint generic_file_receipts_version_check check (version >= 1)
);

alter table local_commerce.generic_file_receipts enable row level security;
revoke all on local_commerce.generic_file_receipts from public, anon, authenticated;
grant select, insert, update on local_commerce.generic_file_receipts to service_role;
create policy local_commerce_service_role_generic_file_receipts on local_commerce.generic_file_receipts
  for all to service_role using (true) with check (true);
create trigger generic_file_receipts_updated_at before update on local_commerce.generic_file_receipts
  for each row execute function local_commerce.set_updated_at();

create table local_commerce.order_item_generic_file_receipt_bindings (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  order_item_id uuid not null,
  receipt_id uuid not null,
  owner_id uuid not null,
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_item_generic_file_receipt_bindings_pk primary key (project_id, id),
  constraint order_item_generic_file_receipt_bindings_receipt_key unique (project_id, receipt_id),
  constraint order_item_generic_file_receipt_bindings_item_receipt_key unique (project_id, order_item_id, receipt_id),
  constraint order_item_generic_file_receipt_bindings_item_owner_fk foreign key (project_id, order_item_id, owner_id)
    references local_commerce.order_items (project_id, id, owner_id),
  constraint order_item_generic_file_receipt_bindings_receipt_owner_fk foreign key (project_id, receipt_id, owner_id)
    references local_commerce.generic_file_receipts (project_id, id, owner_id),
  constraint order_item_generic_file_receipt_bindings_version_check check (version >= 1),
  constraint order_item_generic_file_receipt_bindings_lifecycle_check check (lifecycle = 'committed')
);
alter table local_commerce.order_item_generic_file_receipt_bindings enable row level security;
revoke all on local_commerce.order_item_generic_file_receipt_bindings from public, anon, authenticated;
grant select, insert, update on local_commerce.order_item_generic_file_receipt_bindings to service_role;
create policy local_commerce_service_role_order_item_generic_file_receipt_bindings on local_commerce.order_item_generic_file_receipt_bindings
  for all to service_role using (true) with check (true);
create trigger order_item_generic_file_receipt_bindings_updated_at before update on local_commerce.order_item_generic_file_receipt_bindings
  for each row execute function local_commerce.set_updated_at();

-- Extend the existing immutable Order command rather than adding a second
-- order path. Generic receipts are validated against the exact Product,
-- field and configuration revision before their snapshot binding is written.
do $forward_order$
declare
  definition text;
  target text := $target$    item_index:=item_index+1;
  end loop;
  insert into local_commerce.access_grants$target$;
begin
  select pg_get_functiondef('local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb)'::regprocedure)
    into definition;
  if definition is null or position(target in definition) = 0 then
    raise exception 'C10 Order commit forward-fix target is not present';
  end if;
  definition := replace(definition,
    $target$    item_index:=item_index+1;
  end loop;
  insert into local_commerce.access_grants$target$,
    $replacement$    for generic_field in select value from jsonb_array_elements(line.configuration_values)
      where value->>'kind'='generic_file' loop
      for generic_file in select value from jsonb_array_elements(generic_field->'files') loop
        select * into generic_receipt from local_commerce.generic_file_receipts
          where project_id=p_project_id and receipt_reference=(generic_file->>'receiptId')::uuid and owner_id=owner_uuid
            and product_id=line.product_id and field_key=generic_field->>'fieldId'
            and configuration_revision=line.configuration_revision and lifecycle='active'
            and receipt_status='ready' and expires_at>clock_timestamp() for update;
        if not found then return jsonb_build_object('status','unavailable'); end if;
        insert into local_commerce.order_item_generic_file_receipt_bindings(project_id,order_item_id,receipt_id,owner_id)
          select p_project_id,item_uuid,id,owner_uuid from local_commerce.generic_file_receipts
            where project_id=p_project_id and id=generic_receipt.id and owner_id=owner_uuid;
      end loop;
    end loop;
    item_index:=item_index+1;
  end loop;
  insert into local_commerce.access_grants$replacement$);
  definition := replace(definition, 'receipt local_commerce.media_receipts%rowtype; operation local_commerce.media_operations%rowtype;',
    'receipt local_commerce.media_receipts%rowtype; operation local_commerce.media_operations%rowtype; generic_receipt local_commerce.generic_file_receipts%rowtype;');
  definition := replace(definition, 'order_uuid uuid; item_uuid uuid; reference text; item jsonb; media jsonb;',
    'order_uuid uuid; item_uuid uuid; reference text; item jsonb; media jsonb; generic_file jsonb; generic_field jsonb;');
  if position('generic_file jsonb;' in definition) = 0 or position('generic_receipt local_commerce.generic_file_receipts%rowtype;' in definition) = 0 then
    raise exception 'C10 Order commit declaration forward-fix failed';
  end if;
  execute definition;
end
$forward_order$;

revoke all on function local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb) to service_role;

create or replace function local_commerce.generic_file_command(
  p_project_id text,
  p_marker_digest text,
  p_owner_kind text,
  p_owner_selector text,
  p_customer_id uuid,
  p_authority_expires_at timestamptz,
  p_command text,
  p_receipt_reference uuid,
  p_product_id uuid,
  p_field_key text,
  p_configuration_revision integer,
  p_original_filename text,
  p_content_type text,
  p_byte_size bigint,
  p_content_digest text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, local_commerce
as $function$
declare
  v_owner uuid;
  v_config local_commerce.catalog_configuration_snapshots%rowtype;
  v_field jsonb;
  v_receipt local_commerce.generic_file_receipts%rowtype;
begin
  if not local_commerce.verify_project_identity(p_project_id, p_marker_digest)
    or p_authority_expires_at is null or p_authority_expires_at <= clock_timestamp()
    or p_command not in ('begin','publish','read','remove')
    or (p_owner_kind = 'guest' and (p_customer_id is not null or p_owner_selector !~ '^[a-f0-9]{64}$'))
    or (p_owner_kind = 'customer' and (p_customer_id is null or p_owner_selector !~ '^[a-f0-9-]{36}$')) then
    return jsonb_build_object('status','unavailable');
  end if;
  if p_owner_kind = 'guest' then
    select id into v_owner from local_commerce.commerce_owners
      where project_id = p_project_id and owner_kind = 'guest' and subject_hash = p_owner_selector and lifecycle = 'active'
      for share;
  else
    select a.owner_id into v_owner from local_commerce.customer_accounts a
      join local_commerce.commerce_owners w on w.project_id = a.project_id and w.id = a.owner_id
      where a.project_id = p_project_id and a.id = p_customer_id and a.owner_id::text = p_owner_selector
        and a.account_status = 'active' and a.lifecycle = 'active' and w.owner_kind = 'customer' and w.lifecycle = 'active'
      for share of a, w;
  end if;
  if v_owner is null then return jsonb_build_object('status','unavailable'); end if;

  if p_command = 'begin' then
    if p_product_id is null or p_field_key is null or length(btrim(p_field_key)) = 0
      or p_configuration_revision is null or p_configuration_revision < 1
      or p_content_type not in ('application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      or p_byte_size is null or p_byte_size <= 0 or p_byte_size > 52428800
      or p_content_digest is null or p_content_digest !~ '^[a-f0-9]{64}$'
      or (p_original_filename is not null and (length(p_original_filename) < 1 or length(p_original_filename) > 240 or p_original_filename ~ '[[:cntrl:]]')) then
      return jsonb_build_object('status','unavailable');
    end if;
    select * into v_config from local_commerce.catalog_configuration_snapshots
      where project_id = p_project_id and product_id = p_product_id and revision = p_configuration_revision
        and configuration_status = 'active' and lifecycle = 'active'
      for share;
    if not found then return jsonb_build_object('status','conflict'); end if;
    select value into v_field from jsonb_array_elements(v_config.definition->'fields') where value->>'id' = p_field_key;
    if v_field is null or v_field->>'productId' is distinct from p_product_id::text
      or v_field->>'kind' is distinct from 'generic_file' or v_field->>'isActive' is distinct from 'true'
      or not exists(select 1 from jsonb_array_elements_text(v_field#>'{constraints,allowedMimeTypes}') mime where mime = p_content_type)
      or p_byte_size > coalesce((v_field#>>'{constraints,maxBytes}')::bigint,0)
      or coalesce((v_field#>>'{constraints,maxFileCount}')::integer,0) < 1 then
      return jsonb_build_object('status','conflict');
    end if;
    insert into local_commerce.generic_file_receipts(project_id,owner_id,product_id,field_key,configuration_revision,
      original_filename,content_type,byte_size,content_digest,internal_locator,expires_at)
      values(p_project_id,v_owner,p_product_id,p_field_key,p_configuration_revision,p_original_filename,p_content_type,p_byte_size,
        p_content_digest,p_project_id||'/generic/'||gen_random_uuid()::text,
        least(p_authority_expires_at,clock_timestamp()+interval '24 hours'))
      returning * into v_receipt;
  elsif p_receipt_reference is null then
    return jsonb_build_object('status','unavailable');
  else
    select * into v_receipt from local_commerce.generic_file_receipts
      where project_id = p_project_id and owner_id = v_owner and receipt_reference = p_receipt_reference
      for update;
    if not found then return jsonb_build_object('status','not_found'); end if;
    if p_command = 'publish' then
      if v_receipt.receipt_status <> 'pending' or v_receipt.lifecycle <> 'active'
        or p_content_digest is distinct from v_receipt.content_digest
        or p_content_type is distinct from v_receipt.content_type
        or p_byte_size is distinct from v_receipt.byte_size then
        return jsonb_build_object('status','conflict');
      end if;
      update local_commerce.generic_file_receipts set receipt_status = 'ready', version = version + 1, updated_at = timezone('utc', now())
        where project_id = p_project_id and id = v_receipt.id returning * into v_receipt;
    elsif p_command = 'remove' then
      if v_receipt.lifecycle = 'removed' then
        return jsonb_build_object('status','found','receipt',jsonb_build_object('receiptId',v_receipt.receipt_reference,'lifecycle','removed'));
      end if;
      update local_commerce.generic_file_receipts set lifecycle = 'removed', receipt_status = case when receipt_status = 'pending' then 'failed' else receipt_status end,
        version = version + 1, updated_at = timezone('utc', now()) where project_id = p_project_id and id = v_receipt.id returning * into v_receipt;
    elsif p_command = 'read' then
      if v_receipt.receipt_status <> 'ready' or v_receipt.lifecycle <> 'active' or v_receipt.expires_at <= clock_timestamp()
        or v_receipt.product_id is distinct from p_product_id or v_receipt.field_key is distinct from p_field_key
        or v_receipt.configuration_revision is distinct from p_configuration_revision then return jsonb_build_object('status','not_found'); end if;
    end if;
  end if;
  return jsonb_build_object('status','found','receipt',jsonb_strip_nulls(jsonb_build_object('receiptId',v_receipt.receipt_reference,
    'originalFilename',v_receipt.original_filename,'contentType',v_receipt.content_type,'byteSize',v_receipt.byte_size,
    'createdAt',v_receipt.created_at,'expiresAt',v_receipt.expires_at,'lifecycle',case when v_receipt.lifecycle='active' then 'active' else v_receipt.lifecycle end)),
    'internalLocator',case when p_command='begin' then v_receipt.internal_locator else null end);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  return jsonb_build_object('status','unavailable');
end;
$function$;

revoke all on function local_commerce.generic_file_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,text,integer,text,text,bigint,text) from public,anon,authenticated;
grant execute on function local_commerce.generic_file_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,text,integer,text,text,bigint,text) to service_role;

NOTIFY pgrst, 'reload schema';
