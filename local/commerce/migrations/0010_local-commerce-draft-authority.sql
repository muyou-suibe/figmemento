-- Local-only Draft command boundary. The ledger wrapper owns the transaction.
alter table local_commerce.draft_media_links add column field_key text;
alter table local_commerce.draft_media_links add column confirmed_revision integer;
alter table local_commerce.draft_media_links add constraint draft_slot_revision_check
  check (confirmed_revision is null or confirmed_revision > 0);
-- Defer position uniqueness so one transaction can reorder stable link IDs.
alter table local_commerce.draft_media_links drop constraint draft_media_links_position_key;
alter table local_commerce.draft_media_links add constraint draft_media_links_position_key
  unique(project_id,draft_id,position) deferrable initially deferred;

create table local_commerce.draft_command_bindings (
  project_id text not null, id uuid not null default gen_random_uuid(), owner_id uuid not null,
  command_key text not null, input_digest jsonb not null, result jsonb not null,
  version integer not null default 1 check(version >= 1),
  lifecycle text not null default 'committed' check(lifecycle='committed'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(project_id,id), unique(project_id,owner_id,command_key),
  foreign key(project_id,owner_id) references local_commerce.commerce_owners(project_id,id)
);
alter table local_commerce.draft_command_bindings enable row level security;
revoke all on local_commerce.draft_command_bindings from public,anon,authenticated;
grant select,insert on local_commerce.draft_command_bindings to service_role;
create policy local_commerce_service_role_draft_bindings on local_commerce.draft_command_bindings
  for all to service_role using(true) with check(true);

create function local_commerce.draft_command(
  p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
  p_customer_id uuid,p_authority_expires_at timestamptz,p_operation text,
  p_draft_id uuid,p_product_id uuid,p_expected_version integer,
  p_command_key text,p_fingerprint text,p_slots jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,local_commerce
as $function$
declare
  v_owner uuid; v_draft local_commerce.configuration_drafts%rowtype;
  v_binding local_commerce.draft_command_bindings%rowtype;
  v_input jsonb; v_result jsonb; v_slot jsonb; v_crop jsonb;
  v_field jsonb; v_fields jsonb; v_receipt local_commerce.media_receipts%rowtype;
  v_id uuid; v_ids uuid[] := '{}'; v_receipts uuid[] := '{}'; v_index integer:=0;
  v_normalized jsonb := '[]'; v_revision integer;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_authority_expires_at is null or p_authority_expires_at <= clock_timestamp()
    or p_owner_kind is null or p_owner_kind not in ('guest','customer')
    or p_owner_selector is null or p_operation is null or p_operation not in ('create','read','save') then
    return jsonb_build_object('status','unavailable','reason','invalid_authority');
  end if;
  if p_owner_kind='guest' then
    if p_owner_selector !~ '^[a-f0-9]{64}$' or p_customer_id is not null then
      return jsonb_build_object('status','unavailable','reason','invalid_authority');
    end if;
    if p_operation='create' then
      insert into local_commerce.commerce_owners(project_id,owner_kind,subject_hash)
        values(p_project_id,'guest',p_owner_selector) on conflict(project_id,subject_hash) do nothing;
    end if;
    select id into v_owner from local_commerce.commerce_owners where project_id=p_project_id
      and owner_kind='guest' and subject_hash=p_owner_selector and lifecycle='active' for share;
  else
    select o.id into v_owner from local_commerce.commerce_owners o
      join local_commerce.customer_accounts a on a.project_id=o.project_id and a.owner_id=o.id
      where o.project_id=p_project_id and o.id::text=p_owner_selector and o.owner_kind='customer'
        and o.lifecycle='active' and a.id=p_customer_id and a.lifecycle='active' and a.account_status='active' for share of o,a;
  end if;
  if v_owner is null then return jsonb_build_object('status','unavailable','reason','not_found'); end if;
  if p_operation <> 'read' then
    if p_expected_version is null or p_expected_version<0 or length(coalesce(p_command_key,'')) not between 1 and 200
      or length(coalesce(p_fingerprint,'')) not between 1 and 200 then
      return jsonb_build_object('status','unavailable','reason','invalid_request');
    end if;
    perform pg_advisory_xact_lock(hashtextextended('draft:'||p_project_id||v_owner::text||p_command_key,0));
    v_input:=jsonb_build_object('operation',p_operation,'draft',p_draft_id,'product',p_product_id,
      'version',p_expected_version,'fingerprint',p_fingerprint,'slots',p_slots);
    select * into v_binding from local_commerce.draft_command_bindings
      where project_id=p_project_id and owner_id=v_owner and command_key=p_command_key;
    if found then
      if p_authority_expires_at <= clock_timestamp() then return jsonb_build_object('status','unavailable','reason','invalid_authority'); end if;
      if v_binding.input_digest <> v_input then return jsonb_build_object('status','conflict','reason','idempotency_mismatch'); end if;
      return v_binding.result;
    end if;
  end if;
  if p_operation='create' then
    if p_expected_version<>0 or p_draft_id is not null or p_slots is not null
      or not exists(select 1 from local_commerce.catalog_products where project_id=p_project_id and id=p_product_id
        and lifecycle='active' and publication_status='published' and availability='available') then
      return jsonb_build_object('status','unavailable','reason','rejected');
    end if;
    insert into local_commerce.configuration_drafts(project_id,owner_id,product_id,confirmed_revision,lifecycle)
      values(p_project_id,v_owner,p_product_id,1,'confirmed') returning * into v_draft;
  else
    select * into v_draft from local_commerce.configuration_drafts where project_id=p_project_id
      and id=p_draft_id and owner_id=v_owner and lifecycle='confirmed'
      and confirmed_revision is not null and (expires_at is null or expires_at>clock_timestamp()) for update;
    if not found then return jsonb_build_object('status','unavailable','reason','not_found'); end if;
    if p_operation='save' and v_draft.version<>p_expected_version then
      return jsonb_build_object('status','conflict','reason','version_mismatch');
    end if;
  end if;
  if p_authority_expires_at <= clock_timestamp() then return jsonb_build_object('status','unavailable','reason','invalid_authority'); end if;
  if p_operation='save' then
    if p_slots is null or jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots)>100
      or octet_length(p_slots::text)>65536 then return jsonb_build_object('status','unavailable','reason','invalid_request'); end if;
    select definition->'fields' into v_fields from local_commerce.catalog_configuration_snapshots
      where project_id=p_project_id and product_id=v_draft.product_id and lifecycle='active' and configuration_status='active'
      order by revision desc limit 1 for share;
    if v_fields is null then return jsonb_build_object('status','unavailable','reason','rejected'); end if;
    v_revision:=v_draft.confirmed_revision+1;
    for v_slot in select value from jsonb_array_elements(p_slots) loop
      if jsonb_typeof(v_slot)<>'object' or v_slot - array['slotId','receiptReference','fieldId','crop'] <> '{}'::jsonb
        or jsonb_typeof(v_slot->'receiptReference')<>'string' or jsonb_typeof(v_slot->'fieldId')<>'string' then
        return jsonb_build_object('status','unavailable','reason','invalid_request');
      end if;
      select value into v_field from jsonb_array_elements(v_fields)
        where value->>'id'=v_slot->>'fieldId' and value->>'productId'=v_draft.product_id::text
          and value->>'kind'='image' and value->>'isActive'='true';
      if v_field is null then return jsonb_build_object('status','unavailable','reason','rejected'); end if;
      select * into v_receipt from local_commerce.media_receipts where project_id=p_project_id
        and owner_id=v_owner and receipt_reference::text=v_slot->>'receiptReference'
        and product_id=v_draft.product_id and field_key=v_slot->>'fieldId'
        and lifecycle='active' and receipt_status='ready' and expires_at>clock_timestamp() for share;
      if not found or v_receipt.id=any(v_receipts) then return jsonb_build_object('status','unavailable','reason','rejected'); end if;
      v_receipts:=array_append(v_receipts,v_receipt.id);
      if v_slot ? 'slotId' then
        select id into v_id from local_commerce.draft_media_links where project_id=p_project_id
          and draft_id=v_draft.id and owner_id=v_owner and id::text=v_slot->>'slotId'
          and lifecycle='active' and field_key=v_slot->>'fieldId';
        if not found or v_id=any(v_ids) then return jsonb_build_object('status','unavailable','reason','rejected'); end if;
      else v_id:=gen_random_uuid(); end if;
      v_crop:=v_slot->'crop';
      if v_slot ? 'crop' then
        if v_field#>>'{constraints,cropEnabled}'<>'true' or jsonb_typeof(v_crop)<>'object'
          or v_crop - array['x','y','width','height'] <> '{}'::jsonb
          or not (v_crop ?& array['x','y','width','height']) then return jsonb_build_object('status','unavailable','reason','rejected'); end if;
        if exists(select 1 from jsonb_each(v_crop) where jsonb_typeof(value)<>'number') then
          return jsonb_build_object('status','unavailable','reason','rejected'); end if;
        if (v_crop->>'x')::numeric<0 or (v_crop->>'y')::numeric<0 or (v_crop->>'width')::numeric<=0
          or (v_crop->>'height')::numeric<=0 or (v_crop->>'x')::numeric+(v_crop->>'width')::numeric>1
          or (v_crop->>'y')::numeric+(v_crop->>'height')::numeric>1 then return jsonb_build_object('status','unavailable','reason','rejected'); end if;
      end if;
      v_ids:=array_append(v_ids,v_id);
      v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object('id',v_id,'receipt',v_receipt.id,
        'field',v_slot->>'fieldId','crop',v_crop,'position',v_index));
      v_index:=v_index+1;
    end loop;
    -- Validation precedes mutations. Deleted associations never delete media.
    delete from local_commerce.draft_media_links where project_id=p_project_id and draft_id=v_draft.id
      and owner_id=v_owner and not(id=any(v_ids));
    for v_slot in select value from jsonb_array_elements(v_normalized) loop
      insert into local_commerce.draft_media_links(project_id,id,owner_id,draft_id,receipt_id,position,crop,field_key,confirmed_revision)
        values(p_project_id,(v_slot->>'id')::uuid,v_owner,v_draft.id,(v_slot->>'receipt')::uuid,
          (v_slot->>'position')::integer,nullif(v_slot->'crop','null'::jsonb),v_slot->>'field',v_revision)
        on conflict(project_id,id) do update set receipt_id=excluded.receipt_id,position=excluded.position,crop=excluded.crop,
          confirmed_revision=excluded.confirmed_revision,version=local_commerce.draft_media_links.version+1,updated_at=now();
    end loop;
    update local_commerce.configuration_drafts set version=version+1,confirmed_revision=v_revision,updated_at=now()
      where project_id=p_project_id and id=v_draft.id returning * into v_draft;
  end if;
  select jsonb_build_object('status','found','value',jsonb_build_object('draftId',v_draft.id,'productId',v_draft.product_id,
    'version',v_draft.version,'confirmedRevision',v_draft.confirmed_revision,'slots',coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object('slotId',l.id,'fieldId',l.field_key,'receiptReference',r.receipt_reference,
        'position',l.position,'crop',l.crop,'confirmedRevision',l.confirmed_revision)) order by l.position),'[]'::jsonb)))
    into v_result from local_commerce.draft_media_links l join local_commerce.media_receipts r
      on r.project_id=l.project_id and r.id=l.receipt_id and r.owner_id=l.owner_id
    where l.project_id=p_project_id and l.draft_id=v_draft.id and l.owner_id=v_owner and l.lifecycle='active';
  if p_operation<>'read' then
    insert into local_commerce.draft_command_bindings(project_id,owner_id,command_key,input_digest,result)
      values(p_project_id,v_owner,p_command_key,v_input,v_result);
  end if;
  return v_result;
end;
$function$;
revoke all on function local_commerce.draft_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.draft_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb) to service_role;
