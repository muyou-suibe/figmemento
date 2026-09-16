-- Ledger owns the outer transaction. Reservations are subordinate to Draft.
-- The reservation UUID is the eventual draft_media_links UUID, not another ID.
create table local_commerce.media_slot_reservations (
  project_id text not null, id uuid not null default gen_random_uuid(), owner_id uuid not null,
  draft_id uuid not null, product_id uuid not null, field_key text not null,
  source_generation integer not null default 1 check(source_generation>0),
  crop_revision integer not null default 1 check(crop_revision>0),
  version integer not null default 1 check(version>0),
  lifecycle text not null default 'active' check(lifecycle in ('active','removed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(project_id,id), unique(project_id,id,owner_id),
  foreign key(project_id,draft_id,owner_id) references local_commerce.configuration_drafts(project_id,id,owner_id),
  foreign key(project_id,product_id) references local_commerce.catalog_products(project_id,id)
);
create table local_commerce.media_operations (
  project_id text not null, id uuid not null default gen_random_uuid(), owner_id uuid not null,
  draft_id uuid not null, slot_id uuid not null, product_id uuid not null, field_key text not null,
  source_generation integer not null check(source_generation>0), crop_revision integer not null check(crop_revision>0),
  configuration_revision integer not null check(configuration_revision>0),
  operation_kind text not null check(operation_kind in ('upload','replace','crop')),
  normalized_input jsonb not null, output_facts jsonb, original_locator text not null, derivative_locator text not null,
  original_object_id uuid, receipt_id uuid,
  version integer not null default 1 check(version>0),
  lifecycle text not null default 'pending' check(lifecycle in ('pending','ready','failed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key(project_id,id), unique(project_id,slot_id,source_generation,crop_revision),
  foreign key(project_id,slot_id,owner_id) references local_commerce.media_slot_reservations(project_id,id,owner_id),
  foreign key(project_id,draft_id,owner_id) references local_commerce.configuration_drafts(project_id,id,owner_id),
  foreign key(project_id,original_object_id,owner_id) references local_commerce.media_objects(project_id,id,owner_id),
  foreign key(project_id,receipt_id,owner_id) references local_commerce.media_receipts(project_id,id,owner_id),
  check(jsonb_typeof(normalized_input)='object' and octet_length(normalized_input::text)<=8192)
);
alter table local_commerce.media_slot_reservations enable row level security;
alter table local_commerce.media_operations enable row level security;
revoke all on local_commerce.media_slot_reservations,local_commerce.media_operations from public,anon,authenticated;
grant select,insert,update on local_commerce.media_slot_reservations,local_commerce.media_operations to service_role;
create policy local_commerce_service_role_media_reservations on local_commerce.media_slot_reservations
  for all to service_role using(true) with check(true);
create policy local_commerce_service_role_media_operations on local_commerce.media_operations
  for all to service_role using(true) with check(true);

-- Private result includes exact locators for server transport only. HTTP must
-- explicitly project receipt metadata, never return this RPC payload verbatim.
create function local_commerce.media_operation_command(
  p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
  p_customer_id uuid,p_authority_expires_at timestamptz,p_command text,
  p_operation_id uuid,p_draft_id uuid,p_slot_id uuid,p_expected_version integer,p_input jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,local_commerce
as $function$
declare
  v_owner uuid; d local_commerce.configuration_drafts%rowtype;
  s local_commerce.media_slot_reservations%rowtype; o local_commerce.media_operations%rowtype;
  previous local_commerce.media_operations%rowtype;
  v_fields jsonb; v_field jsonb; v_revision integer; v_original uuid; v_receipt uuid;
  v_kind text; v_crop jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_authority_expires_at is null or p_authority_expires_at<=clock_timestamp()
    or p_command is null or p_command not in ('begin','lookup','prepare','publish','fail','receipt') then
    return jsonb_build_object('status','unavailable');
  end if;
  if p_owner_kind='guest' and p_owner_selector ~ '^[a-f0-9]{64}$' and p_customer_id is null then
    select id into v_owner from local_commerce.commerce_owners where project_id=p_project_id
      and owner_kind='guest' and subject_hash=p_owner_selector and lifecycle='active' for share;
  elsif p_owner_kind='customer' then
    select a.owner_id into v_owner from local_commerce.customer_accounts a join local_commerce.commerce_owners w
      on w.project_id=a.project_id and w.id=a.owner_id where a.project_id=p_project_id and a.id=p_customer_id
      and a.owner_id::text=p_owner_selector and a.lifecycle='active' and a.account_status='active'
      and w.lifecycle='active' and w.owner_kind='customer' for share of a,w;
  end if;
  if v_owner is null then return jsonb_build_object('status','unavailable'); end if;
  if p_command='receipt' then
    select x.* into o from local_commerce.media_operations x join local_commerce.media_receipts r
      on r.project_id=x.project_id and r.id=x.receipt_id and r.owner_id=x.owner_id
      where x.project_id=p_project_id and x.owner_id=v_owner and r.receipt_reference=p_operation_id
      and x.lifecycle='ready' and r.lifecycle='active' and r.receipt_status='ready'
      and r.expires_at>clock_timestamp() and x.expires_at>clock_timestamp();
    if not found then return jsonb_build_object('status','unavailable'); end if;
  elsif p_command='begin' then
    if p_operation_id is not null or p_expected_version is null or p_expected_version<1
      or p_input is null or jsonb_typeof(p_input)<>'object'
      or p_input-array['kind','fieldId','configurationRevision','digest','contentType','byteSize','dimensions','crop']<>'{}'::jsonb
      or not(p_input ?& array['kind','fieldId','configurationRevision','digest','contentType','byteSize','dimensions'])
      or exists(select 1 from jsonb_each(p_input) where value='null'::jsonb) then
      return jsonb_build_object('status','unavailable');
    end if;
    v_kind:=p_input->>'kind';
    if v_kind not in ('upload','replace','crop') or v_kind is null
      or p_input->>'digest' !~ '^[a-f0-9]{64}$'
      or p_input->>'contentType' not in ('image/jpeg','image/png','image/webp')
      or (p_input->>'byteSize')::bigint not between 1 and 20971520
      or jsonb_typeof(p_input->'dimensions') is distinct from 'object'
      or not(p_input->'dimensions' ?& array['width','height'])
      or (p_input#>>'{dimensions,width}')::integer not between 1 and 16000000
      or (p_input#>>'{dimensions,height}')::integer not between 1 and 16000000
      or (p_input#>>'{dimensions,width}')::bigint*(p_input#>>'{dimensions,height}')::bigint>16000000 then
      return jsonb_build_object('status','unavailable');
    end if;
    select * into d from local_commerce.configuration_drafts where project_id=p_project_id and id=p_draft_id
      and owner_id=v_owner and lifecycle='confirmed' and (expires_at is null or expires_at>clock_timestamp()) for update;
    if not found then return jsonb_build_object('status','unavailable'); end if;
    if d.version<>p_expected_version then return jsonb_build_object('status','conflict'); end if;
    select revision,definition->'fields' into v_revision,v_fields from local_commerce.catalog_configuration_snapshots
      where project_id=p_project_id and product_id=d.product_id and lifecycle='active' and configuration_status='active'
      order by revision desc limit 1 for share;
    if v_revision is null or v_revision<>(p_input->>'configurationRevision')::integer then return jsonb_build_object('status','conflict'); end if;
    select value into v_field from jsonb_array_elements(v_fields) where value->>'id'=p_input->>'fieldId'
      and value->>'productId'=d.product_id::text and value->>'kind'='image' and value->>'isActive'='true';
    if v_field is null then return jsonb_build_object('status','unavailable'); end if;
    v_crop:=p_input->'crop';
    if v_crop is not null then
      if v_field#>>'{constraints,cropEnabled}' is distinct from 'true' or jsonb_typeof(v_crop)<>'object'
        or not(v_crop ?& array['x','y','width','height']) or v_crop-array['x','y','width','height']<>'{}'::jsonb
        or exists(select 1 from jsonb_each(v_crop) where jsonb_typeof(value)<>'number') then return jsonb_build_object('status','unavailable'); end if;
      if (v_crop->>'x')::numeric<0 or (v_crop->>'y')::numeric<0 or (v_crop->>'width')::numeric<=0 or (v_crop->>'height')::numeric<=0
        or (v_crop->>'x')::numeric+(v_crop->>'width')::numeric>1 or (v_crop->>'y')::numeric+(v_crop->>'height')::numeric>1 then return jsonb_build_object('status','unavailable'); end if;
    end if;
    if v_kind='upload' then
      if p_slot_id is not null then return jsonb_build_object('status','unavailable'); end if;
      insert into local_commerce.media_slot_reservations(project_id,owner_id,draft_id,product_id,field_key)
        values(p_project_id,v_owner,d.id,d.product_id,p_input->>'fieldId') returning * into s;
    else
      if not exists(select 1 from local_commerce.draft_media_links where project_id=p_project_id and id=p_slot_id
        and owner_id=v_owner and draft_id=d.id and field_key=p_input->>'fieldId' and lifecycle='active') then
        return jsonb_build_object('status','unavailable');
      end if;
      select * into s from local_commerce.media_slot_reservations where project_id=p_project_id and id=p_slot_id
        and owner_id=v_owner and draft_id=d.id and field_key=p_input->>'fieldId' and lifecycle='active' for update;
      if not found then return jsonb_build_object('status','unavailable'); end if;
      if v_kind='crop' then
        select x.* into previous from local_commerce.media_operations x join local_commerce.draft_media_links l
          on l.project_id=x.project_id and l.receipt_id=x.receipt_id and l.id=x.slot_id
          where x.project_id=p_project_id and x.owner_id=v_owner and x.slot_id=s.id and x.lifecycle='ready'
            and x.source_generation=s.source_generation and x.expires_at>clock_timestamp();
        if not found or previous.normalized_input->>'digest'<>p_input->>'digest' then return jsonb_build_object('status','unavailable'); end if;
      end if;
      update local_commerce.media_slot_reservations set source_generation=source_generation+case when v_kind='replace' then 1 else 0 end,
        crop_revision=case when v_kind='replace' then 1 else crop_revision+1 end,version=version+1,updated_at=now()
        where project_id=p_project_id and id=s.id returning * into s;
    end if;
    o.id:=gen_random_uuid();
    insert into local_commerce.media_operations(project_id,id,owner_id,draft_id,slot_id,product_id,field_key,
      source_generation,crop_revision,configuration_revision,operation_kind,normalized_input,original_locator,derivative_locator,original_object_id,expires_at)
      values(p_project_id,o.id,v_owner,d.id,s.id,d.product_id,s.field_key,s.source_generation,s.crop_revision,v_revision,v_kind,p_input,
        case when v_kind='crop' then previous.original_locator else p_project_id||'/media/'||o.id::text||'/original' end,
        p_project_id||'/media/'||o.id::text||'/derivative',case when v_kind='crop' then previous.original_object_id else null end,
        least(p_authority_expires_at,clock_timestamp()+interval '24 hours')) returning * into o;
  else
    -- All mutators acquire the same Draft -> operation -> reservation order.
    perform 1 from local_commerce.configuration_drafts where project_id=p_project_id
      and owner_id=v_owner and id=(select draft_id from local_commerce.media_operations
        where project_id=p_project_id and id=p_operation_id and owner_id=v_owner) for update;
    select * into o from local_commerce.media_operations where project_id=p_project_id and id=p_operation_id
      and owner_id=v_owner and expires_at>clock_timestamp() for update;
    if not found then return jsonb_build_object('status','unavailable'); end if;
    if p_command<>'prepare' and p_input is not null and o.normalized_input<>p_input then return jsonb_build_object('status','conflict'); end if;
    if p_command in ('prepare','publish','fail') and (p_expected_version is null or p_expected_version<>o.version) then
      return jsonb_build_object('status','conflict'); end if;
    if p_command='prepare' then
      if o.lifecycle<>'pending' or p_input is null or jsonb_typeof(p_input)<>'object'
        or not(p_input ?& array['digest','byteSize','dimensions'])
        or p_input-array['digest','byteSize','dimensions']<>'{}'::jsonb
        or exists(select 1 from jsonb_each(p_input) where value='null'::jsonb)
        or p_input->>'digest' !~ '^[a-f0-9]{64}$'
        or (p_input->>'byteSize')::bigint not between 1 and 90000000 then return jsonb_build_object('status','unavailable'); end if;
      if o.output_facts is not null and o.output_facts<>p_input then return jsonb_build_object('status','conflict'); end if;
      update local_commerce.media_operations set output_facts=p_input,version=version+1,updated_at=now()
        where project_id=p_project_id and id=o.id returning * into o;
    elsif p_command='fail' and o.lifecycle='pending' then
      update local_commerce.media_operations set lifecycle='failed',version=version+1,updated_at=now()
        where project_id=p_project_id and id=o.id returning * into o;
    elsif p_command='publish' and o.lifecycle='pending' then
      if o.output_facts is null then return jsonb_build_object('status','unavailable'); end if;
      select * into s from local_commerce.media_slot_reservations where project_id=p_project_id and id=o.slot_id
        and owner_id=v_owner and lifecycle='active' for update;
      if not found or s.source_generation<>o.source_generation or s.crop_revision<>o.crop_revision then return jsonb_build_object('status','conflict'); end if;
      if not exists(select 1 from local_commerce.configuration_drafts where project_id=p_project_id and id=o.draft_id
        and owner_id=v_owner and lifecycle='confirmed' and (expires_at is null or expires_at>clock_timestamp())) then return jsonb_build_object('status','unavailable'); end if;
      if o.operation_kind<>'upload' and not exists(select 1 from local_commerce.draft_media_links
        where project_id=p_project_id and id=o.slot_id and draft_id=o.draft_id and owner_id=v_owner and lifecycle='active') then
        return jsonb_build_object('status','conflict'); end if;
      select revision into v_revision from local_commerce.catalog_configuration_snapshots
        where project_id=p_project_id and product_id=o.product_id and lifecycle='active' and configuration_status='active'
        order by revision desc limit 1 for share;
      if v_revision is distinct from o.configuration_revision then return jsonb_build_object('status','conflict'); end if;
      v_original:=o.original_object_id;
      if v_original is null then
        insert into local_commerce.media_objects(project_id,owner_id,internal_locator,media_kind,mime_type,byte_size,object_status,expires_at)
          values(p_project_id,v_owner,o.original_locator,'original',o.normalized_input->>'contentType',
            (o.normalized_input->>'byteSize')::bigint,'ready',o.expires_at) returning id into v_original;
      end if;
      insert into local_commerce.media_receipts(project_id,owner_id,media_object_id,product_id,field_key,receipt_status,source_generation,expires_at)
        values(p_project_id,v_owner,v_original,o.product_id,o.field_key,'ready',o.source_generation,o.expires_at) returning id into v_receipt;
      insert into local_commerce.media_derivatives(project_id,owner_id,source_media_object_id,receipt_id,crop_revision,internal_locator,derivative_status,expires_at)
        values(p_project_id,v_owner,v_original,v_receipt,o.crop_revision,o.derivative_locator,'ready',o.expires_at);
      update local_commerce.media_operations set lifecycle='ready',receipt_id=v_receipt,original_object_id=v_original,version=version+1,updated_at=now()
        where project_id=p_project_id and id=o.id returning * into o;
      -- Deliberately NO Draft/link mutation here. Media ready is not confirmation.
    end if;
  end if;
  if p_authority_expires_at<=clock_timestamp() then raise exception 'authority expired' using errcode='42501'; end if;
  return jsonb_build_object('status','found','operation',to_jsonb(o),'receipt',
    (select jsonb_build_object('receiptId',receipt_reference,'createdAt',created_at,'expiresAt',expires_at,'lifecycle',lifecycle)
      from local_commerce.media_receipts where project_id=p_project_id and id=o.receipt_id and owner_id=v_owner));
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
  return jsonb_build_object('status','unavailable');
end;
$function$;
revoke all on function local_commerce.media_operation_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.media_operation_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,uuid,integer,jsonb) to service_role;

-- Extend the existing single Draft command boundary, not an alternate save API.
-- The original implementation remains private and retains its CAS/idempotency.
alter function local_commerce.draft_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb)
  rename to draft_command_before_media;
revoke all on function local_commerce.draft_command_before_media(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb)
  from public,anon,authenticated,service_role;
create function local_commerce.draft_command(
  p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
  p_customer_id uuid,p_authority_expires_at timestamptz,p_operation text,
  p_draft_id uuid,p_product_id uuid,p_expected_version integer,
  p_command_key text,p_fingerprint text,p_slots jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce
as $function$
declare
  result jsonb; d local_commerce.configuration_drafts%rowtype; slot jsonb;
  op local_commerce.media_operations%rowtype; reservation local_commerce.media_slot_reservations%rowtype;
  existing local_commerce.draft_media_links%rowtype; idx integer:=0; old_ids uuid[];
begin
  if p_operation='save' then
    result:=local_commerce.draft_command_before_media(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,
      p_customer_id,p_authority_expires_at,'read',p_draft_id,null,0,null,null,null);
    if result->>'status'<>'found' then return result; end if;
    select * into d from local_commerce.configuration_drafts where project_id=p_project_id and id=p_draft_id for update;
    if exists(select 1 from local_commerce.draft_command_bindings where project_id=p_project_id
      and owner_id=d.owner_id and command_key=p_command_key) then
      return local_commerce.draft_command_before_media(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,
        p_customer_id,p_authority_expires_at,p_operation,p_draft_id,p_product_id,p_expected_version,p_command_key,p_fingerprint,p_slots);
    end if;
    if p_expected_version is null or d.version<>p_expected_version then return jsonb_build_object('status','conflict','reason','version_mismatch'); end if;
    if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots)>100 then
      return jsonb_build_object('status','unavailable','reason','invalid_request'); end if;
    select array_agg(id) into old_ids from local_commerce.draft_media_links where project_id=p_project_id and draft_id=d.id and owner_id=d.owner_id;
    -- The enclosing exception block rolls back provisional materialization if
    -- any subsequent validation or the original save fails. No partial Draft.
    for slot in select value from jsonb_array_elements(p_slots) loop
      select x.* into op from local_commerce.media_operations x join local_commerce.media_receipts r
        on r.project_id=x.project_id and r.id=x.receipt_id and r.owner_id=x.owner_id
        where x.project_id=p_project_id and x.owner_id=d.owner_id and r.receipt_reference::text=slot->>'receiptReference';
      if found then
        if op.draft_id<>d.id or op.slot_id::text is distinct from slot->>'slotId'
          or op.field_key is distinct from slot->>'fieldId' or op.lifecycle<>'ready' or op.expires_at<=clock_timestamp()
          or (op.normalized_input->'crop') is distinct from (slot->'crop') then
          raise exception 'invalid media confirmation' using errcode='P0001'; end if;
        select * into reservation from local_commerce.media_slot_reservations where project_id=p_project_id and id=op.slot_id
          and draft_id=d.id and owner_id=d.owner_id for update;
        if not found or reservation.lifecycle<>'active' then raise exception 'invalid lineage' using errcode='P0001'; end if;
        select * into existing from local_commerce.draft_media_links where project_id=p_project_id and id=op.slot_id and draft_id=d.id and owner_id=d.owner_id;
        -- An unchanged prior confirmed receipt remains valid while replacement
        -- is pending. Selecting a NEW receipt must select the current lineage.
        if (not found or existing.receipt_id<>op.receipt_id) and
          (reservation.source_generation<>op.source_generation or reservation.crop_revision<>op.crop_revision) then
          result:=jsonb_build_object('status','conflict','reason','version_mismatch');
          raise exception 'stale media' using errcode='P0001'; end if;
        if existing.id is null then
          if op.operation_kind<>'upload' then raise exception 'removed slot' using errcode='P0001'; end if;
          insert into local_commerce.draft_media_links(project_id,id,owner_id,draft_id,receipt_id,position,crop,field_key,confirmed_revision)
            values(p_project_id,op.slot_id,d.owner_id,d.id,op.receipt_id,idx,slot->'crop',op.field_key,d.confirmed_revision);
        end if;
      elsif exists(select 1 from local_commerce.media_slot_reservations where project_id=p_project_id and id::text=slot->>'slotId') then
        raise exception 'receipt does not belong to lineage' using errcode='P0001';
      end if;
      idx:=idx+1;
    end loop;
  end if;
  result:=local_commerce.draft_command_before_media(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,
    p_customer_id,p_authority_expires_at,p_operation,p_draft_id,p_product_id,p_expected_version,p_command_key,p_fingerprint,p_slots);
  if result->>'status'<>'found' then raise exception 'save rejected' using errcode='P0001'; end if;
  if p_operation='save' then
    update local_commerce.media_slot_reservations set lifecycle='removed',version=version+1,updated_at=now()
      where project_id=p_project_id and owner_id=d.owner_id and draft_id=d.id and id=any(old_ids)
      and not exists(select 1 from local_commerce.draft_media_links l where l.project_id=p_project_id and l.id=media_slot_reservations.id);
  end if;
  return result;
exception when raise_exception or invalid_text_representation or check_violation then
  return case when result->>'status' in ('unavailable','conflict') then result
    else jsonb_build_object('status','unavailable','reason','rejected') end;
end;
$function$;
revoke all on function local_commerce.draft_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.draft_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb) to service_role;
