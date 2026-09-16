-- The ledger owns the transaction. No object writes occur in this transaction.
alter table local_commerce.media_operations add unique(project_id,id,owner_id);
create table local_commerce.media_upload_command_bindings (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  key_digest text not null check(key_digest ~ '^[a-f0-9]{64}$'),
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  operation_id uuid not null,
  command_context jsonb not null check(jsonb_typeof(command_context)='object' and octet_length(command_context::text)<=12288),
  version integer not null default 1 check(version=1),
  lifecycle text not null default 'bound' check(lifecycle='bound'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(project_id,id),
  unique(project_id,owner_id,key_digest),
  unique(project_id,operation_id),
  foreign key(project_id,operation_id,owner_id) references local_commerce.media_operations(project_id,id,owner_id)
);
alter table local_commerce.media_upload_command_bindings enable row level security;
revoke all on local_commerce.media_upload_command_bindings from public,anon,authenticated;
grant select,insert on local_commerce.media_upload_command_bindings to service_role;
create policy local_commerce_service_role_upload_bindings on local_commerce.media_upload_command_bindings
  for all to service_role using(true) with check(true);

-- Request keys select a binding, never an owner. Existing owner and media
-- authorities are rechecked; shared project lock preserves cleanup lock order.
create function local_commerce.media_upload_command(
  p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
  p_customer_id uuid,p_authority_expires_at timestamptz,p_draft_id uuid,p_product_id uuid,
  p_expected_version integer,p_key_digest text,p_fingerprint text,p_recovery_only boolean,p_input jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce
as $function$
declare
  v_owner uuid; binding local_commerce.media_upload_command_bindings%rowtype;
  context jsonb; result jsonb; op uuid;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_authority_expires_at is null or p_authority_expires_at<=clock_timestamp()
    or p_key_digest is null or p_key_digest !~ '^[a-f0-9]{64}$'
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_recovery_only is null or p_draft_id is null or p_product_id is null
    or p_expected_version is null or p_expected_version<1
    or p_input is null or p_input->>'kind' is distinct from 'upload' then
    return jsonb_build_object('status','unavailable');
  end if;
  perform local_commerce.lock_media_project(p_project_id);
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
  context:=jsonb_build_object('project',p_project_id,'owner',v_owner,'draftId',p_draft_id,
    'productId',p_product_id,'expectedVersion',p_expected_version,'source',p_input);
  select * into binding from local_commerce.media_upload_command_bindings
    where project_id=p_project_id and owner_id=v_owner and key_digest=p_key_digest;
  if found then
    if binding.fingerprint<>p_fingerprint or binding.command_context<>context then
      return jsonb_build_object('status','conflict'); end if;
    result:=local_commerce.media_operation_command(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,
      p_customer_id,p_authority_expires_at,'lookup',binding.operation_id,null,null,null,p_input);
    if result->>'status' is distinct from 'found' then return jsonb_build_object('status','unavailable'); end if;
    if result#>>'{operation,lifecycle}'='failed' then return jsonb_build_object('status','unavailable'); end if;
    if not exists(select 1 from local_commerce.media_operations o join local_commerce.media_slot_reservations s
      on s.project_id=o.project_id and s.id=o.slot_id and s.owner_id=o.owner_id
      where o.project_id=p_project_id and o.id=binding.operation_id and s.lifecycle='active'
        and s.source_generation=o.source_generation and s.crop_revision=o.crop_revision) then
      return jsonb_build_object('status','conflict'); end if;
    if result#>>'{operation,lifecycle}'='ready' then
      return local_commerce.media_operation_command(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,
        p_customer_id,p_authority_expires_at,'receipt',(result#>>'{receipt,receiptId}')::uuid,null,null,null,null);
    end if;
    return result;
  end if;
  if p_recovery_only then return jsonb_build_object('status','unavailable'); end if;
  if not exists(select 1 from local_commerce.configuration_drafts where project_id=p_project_id
    and id=p_draft_id and owner_id=v_owner and product_id=p_product_id) then
    return jsonb_build_object('status','unavailable'); end if;
  result:=local_commerce.media_operation_command(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,
    p_customer_id,p_authority_expires_at,'begin',null,p_draft_id,null,p_expected_version,p_input);
  if result->>'status' is distinct from 'found' then return result; end if;
  op:=(result#>>'{operation,id}')::uuid;
  insert into local_commerce.media_upload_command_bindings(project_id,owner_id,key_digest,fingerprint,operation_id,command_context)
    values(p_project_id,v_owner,p_key_digest,p_fingerprint,op,context);
  if p_authority_expires_at<=clock_timestamp() then raise exception 'authority expired'; end if;
  return result;
exception when others then
  -- PL/pgSQL subtransaction rolls operation AND binding back together.
  return jsonb_build_object('status','unavailable');
end;
$function$;
revoke all on function local_commerce.media_upload_command(text,text,text,text,uuid,timestamptz,uuid,uuid,integer,text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.media_upload_command(text,text,text,text,uuid,timestamptz,uuid,uuid,integer,text,text,boolean,jsonb) to service_role;
notify pgrst, 'reload schema';
