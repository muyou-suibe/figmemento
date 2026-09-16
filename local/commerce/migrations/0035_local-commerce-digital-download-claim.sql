-- Task 9.4: private-object prepare followed by one atomic download claim.
-- The ledger wrapper owns the outer transaction. No browser role may call
-- these functions or mutate ticket, grant, or attempt authority directly.

alter table local_commerce.digital_delivery_attempts
  add column order_id uuid,
  add column digital_version_id uuid,
  add column claim_context_digest text,
  add column claimed_at timestamptz,
  add column quota_before integer,
  add column quota_after integer;

alter table local_commerce.digital_delivery_attempts
  add constraint digital_delivery_attempts_order_owner_fk
    foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  add constraint digital_delivery_attempts_version_owner_fk
    foreign key (project_id, digital_version_id, owner_id)
    references local_commerce.digital_versions (project_id, id, owner_id),
  add constraint digital_delivery_attempts_claim_digest_check
    check (claim_context_digest is null or claim_context_digest ~ '^[0-9a-f]{64}$'),
  add constraint digital_delivery_attempts_quota_check
    check (quota_before is null or (quota_before >= 0 and quota_after = quota_before + 1 and quota_after <= 5)),
  add constraint digital_delivery_attempts_claim_shape_check
    check (attempt_result <> 'unknown' or lifecycle <> 'completed' or
      (order_id is not null and digital_version_id is not null and
       claim_context_digest is not null and claimed_at is not null and
       quota_before is not null and quota_after is not null));

create function local_commerce.digital_download_prepare(
  p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
  p_customer_id uuid,p_session_hash text,p_authority_expires_at timestamptz,
  p_capability_hash text,p_public_reference text,p_ticket_hash text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,local_commerce as $prepare$
declare
  owner_uuid uuid;
  purchase local_commerce.orders%rowtype;
  item local_commerce.order_items%rowtype;
  item_snapshot local_commerce.order_item_purchase_snapshots%rowtype;
  ticket_row local_commerce.digital_tickets%rowtype;
  grant_row local_commerce.digital_grants%rowtype;
  ready_version local_commerce.digital_versions%rowtype;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_owner_kind not in ('guest','customer') or p_owner_selector is null
    or p_authority_expires_at is null or not isfinite(p_authority_expires_at)
    or p_authority_expires_at<=clock_timestamp()
    or p_capability_hash is null or p_capability_hash!~'^[0-9a-f]{64}$'
    or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$'
    or p_ticket_hash is null or p_ticket_hash!~'^[0-9a-f]{64}$'
  then return jsonb_build_object('status','unavailable'); end if;
  if p_owner_kind='guest' then
    if p_customer_id is not null or p_session_hash is not null or p_owner_selector!~'^[0-9a-f]{64}$'
    then return jsonb_build_object('status','unavailable'); end if;
    select id into owner_uuid from local_commerce.commerce_owners
      where project_id=p_project_id and owner_kind='guest' and subject_hash=p_owner_selector
        and lifecycle='active' for share;
  else
    if p_customer_id is null or p_session_hash is null or p_owner_selector!~'^[0-9a-f-]{36}$'
    then return jsonb_build_object('status','unavailable'); end if;
    select o.id into owner_uuid from local_commerce.commerce_owners o
      join local_commerce.customer_accounts a on a.project_id=o.project_id and a.owner_id=o.id
      join local_commerce.customer_sessions s on s.project_id=o.project_id and s.owner_id=o.id
      where o.project_id=p_project_id and o.id::text=p_owner_selector and o.owner_kind='customer'
        and o.lifecycle='active' and a.id=p_customer_id and a.account_status='active' and a.lifecycle='active'
        and s.session_hash=p_session_hash and s.lifecycle='active' and s.revoked_at is null
        and s.expires_at>clock_timestamp() for share of o,a,s;
  end if;
  if owner_uuid is null then return jsonb_build_object('status','unavailable'); end if;
  select * into purchase from local_commerce.orders o
    where o.project_id=p_project_id and o.owner_id=owner_uuid and o.public_reference=p_public_reference
      and o.lifecycle='active' and o.lifecycle_status='paid'
      and exists(select 1 from local_commerce.access_grants g where g.project_id=o.project_id
        and g.owner_id=o.owner_id and g.resource_kind='local_order' and g.resource_id=o.id
        and g.capability_hash=p_capability_hash and g.lifecycle='active' and g.revoked_at is null
        and g.expires_at>clock_timestamp())
      and exists(select 1 from local_commerce.payment_attempts p where p.project_id=o.project_id
        and p.order_id=o.id and p.owner_id=o.owner_id and p.outcome='succeeded' and p.lifecycle='settled')
    for share;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into ticket_row from local_commerce.digital_tickets where project_id=p_project_id
    and ticket_hash=p_ticket_hash and owner_id=owner_uuid and order_id=purchase.id for share;
  if not found or ticket_row.lifecycle<>'active' or ticket_row.consumed_at is not null
    or clock_timestamp()>=ticket_row.expires_at
  then return jsonb_build_object('status','unavailable'); end if;
  select * into grant_row from local_commerce.digital_grants where project_id=p_project_id
    and id=ticket_row.grant_id and owner_id=owner_uuid and order_id=purchase.id for share;
  if not found or grant_row.grant_status<>'active' or grant_row.lifecycle<>'active'
    or grant_row.revoked_at is not null or clock_timestamp()>=grant_row.expires_at
    or grant_row.used_attempts>=grant_row.max_attempts
  then return jsonb_build_object('status','unavailable'); end if;
  select * into item from local_commerce.order_items where project_id=p_project_id
    and id=ticket_row.order_item_id and order_id=purchase.id and owner_id=owner_uuid
    and lifecycle='active' for share;
  if not found or item.id<>grant_row.order_item_id then return jsonb_build_object('status','unavailable'); end if;
  select * into item_snapshot from local_commerce.order_item_purchase_snapshots
    where project_id=p_project_id and order_item_id=item.id and owner_id=owner_uuid;
  if not found or item_snapshot.fulfillment_type<>'digital' or item_snapshot.lifecycle<>'committed'
  then return jsonb_build_object('status','unavailable'); end if;
  select * into ready_version from local_commerce.digital_versions where project_id=p_project_id
    and id=ticket_row.digital_version_id and order_item_id=item.id and owner_id=owner_uuid
    and status='ready' and lifecycle='active' and is_current for share;
  if not found or ready_version.content_reference is null or ready_version.content_digest is null
    or ready_version.byte_size is null or ready_version.content_type is null or ready_version.safe_file_name is null
  then return jsonb_build_object('status','unavailable'); end if;
  return jsonb_build_object('status','found','value',jsonb_build_object(
    'ticketId',ticket_row.id,'grantId',grant_row.id,'orderId',purchase.id,'orderItemId',item.id,
    'digitalVersionId',ready_version.id,'contentReference',ready_version.content_reference,
    'contentDigest',ready_version.content_digest,'byteSize',ready_version.byte_size,
    'contentType',ready_version.content_type,'fileName',ready_version.safe_file_name));
exception when others then return jsonb_build_object('status','unavailable'); end;
$prepare$;

create function local_commerce.digital_download_claim(
  p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
  p_customer_id uuid,p_session_hash text,p_authority_expires_at timestamptz,
  p_capability_hash text,p_public_reference text,p_ticket_hash text,
  p_opened_version_id uuid,p_opened_content_digest text,p_opened_byte_size integer,
  p_claim_key text,p_claim_context_digest text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,local_commerce as $claim$
declare
  owner_uuid uuid;
  purchase local_commerce.orders%rowtype;
  item local_commerce.order_items%rowtype;
  item_snapshot local_commerce.order_item_purchase_snapshots%rowtype;
  ticket_row local_commerce.digital_tickets%rowtype;
  grant_row local_commerce.digital_grants%rowtype;
  ready_version local_commerce.digital_versions%rowtype;
  claim_id uuid;
  stamp timestamptz;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_owner_kind not in ('guest','customer') or p_owner_selector is null
    or p_authority_expires_at is null or not isfinite(p_authority_expires_at)
    or p_authority_expires_at<=clock_timestamp()
    or p_capability_hash is null or p_capability_hash!~'^[0-9a-f]{64}$'
    or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$'
    or p_ticket_hash is null or p_ticket_hash!~'^[0-9a-f]{64}$'
    or p_opened_version_id is null or p_opened_content_digest is null
    or p_opened_content_digest!~'^[0-9a-f]{64}$' or p_opened_byte_size not between 1 and 15728640
    or p_claim_key is null or p_claim_key!~'^[0-9a-f]{64}$'
    or p_claim_context_digest is null or p_claim_context_digest!~'^[0-9a-f]{64}$'
  then return jsonb_build_object('status','unavailable'); end if;
  if p_owner_kind='guest' then
    if p_customer_id is not null or p_session_hash is not null or p_owner_selector!~'^[0-9a-f]{64}$'
    then return jsonb_build_object('status','unavailable'); end if;
    select id into owner_uuid from local_commerce.commerce_owners
      where project_id=p_project_id and owner_kind='guest' and subject_hash=p_owner_selector
        and lifecycle='active' for share;
  else
    if p_customer_id is null or p_session_hash is null or p_owner_selector!~'^[0-9a-f-]{36}$'
    then return jsonb_build_object('status','unavailable'); end if;
    select o.id into owner_uuid from local_commerce.commerce_owners o
      join local_commerce.customer_accounts a on a.project_id=o.project_id and a.owner_id=o.id
      join local_commerce.customer_sessions s on s.project_id=o.project_id and s.owner_id=o.id
      where o.project_id=p_project_id and o.id::text=p_owner_selector and o.owner_kind='customer'
        and o.lifecycle='active' and a.id=p_customer_id and a.account_status='active' and a.lifecycle='active'
        and s.session_hash=p_session_hash and s.lifecycle='active' and s.revoked_at is null
        and s.expires_at>clock_timestamp() for share of o,a,s;
  end if;
  if owner_uuid is null then return jsonb_build_object('status','unavailable'); end if;
  select * into purchase from local_commerce.orders o where o.project_id=p_project_id
    and o.owner_id=owner_uuid and o.public_reference=p_public_reference and o.lifecycle='active'
    and o.lifecycle_status='paid' and exists(select 1 from local_commerce.access_grants g
      where g.project_id=o.project_id and g.owner_id=o.owner_id and g.resource_kind='local_order'
        and g.resource_id=o.id and g.capability_hash=p_capability_hash and g.lifecycle='active'
        and g.revoked_at is null and g.expires_at>clock_timestamp())
    and exists(select 1 from local_commerce.payment_attempts p where p.project_id=o.project_id
      and p.order_id=o.id and p.owner_id=o.owner_id and p.outcome='succeeded' and p.lifecycle='settled')
    for share;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into ticket_row from local_commerce.digital_tickets where project_id=p_project_id
    and ticket_hash=p_ticket_hash and owner_id=owner_uuid and order_id=purchase.id for update;
  if not found or ticket_row.lifecycle<>'active' or ticket_row.consumed_at is not null
    or clock_timestamp()>=ticket_row.expires_at
  then return jsonb_build_object('status','unavailable'); end if;
  select * into grant_row from local_commerce.digital_grants where project_id=p_project_id
    and id=ticket_row.grant_id and owner_id=owner_uuid and order_id=purchase.id for update;
  if not found or grant_row.grant_status<>'active' or grant_row.lifecycle<>'active'
    or grant_row.revoked_at is not null or clock_timestamp()>=grant_row.expires_at
    or grant_row.used_attempts>=grant_row.max_attempts
  then return jsonb_build_object('status','unavailable'); end if;
  select * into item from local_commerce.order_items where project_id=p_project_id
    and id=ticket_row.order_item_id and order_id=purchase.id and owner_id=owner_uuid
    and lifecycle='active' for share;
  if not found or item.id<>grant_row.order_item_id then return jsonb_build_object('status','unavailable'); end if;
  select * into item_snapshot from local_commerce.order_item_purchase_snapshots
    where project_id=p_project_id and order_item_id=item.id and owner_id=owner_uuid;
  if not found or item_snapshot.fulfillment_type<>'digital' or item_snapshot.lifecycle<>'committed'
  then return jsonb_build_object('status','unavailable'); end if;
  select * into ready_version from local_commerce.digital_versions where project_id=p_project_id
    and id=p_opened_version_id and order_item_id=item.id and owner_id=owner_uuid
    and status='ready' and lifecycle='active' and is_current for share;
  if not found or ticket_row.digital_version_id<>ready_version.id
    or ready_version.content_digest<>p_opened_content_digest or ready_version.byte_size<>p_opened_byte_size
  then return jsonb_build_object('status','unavailable'); end if;
  stamp:=clock_timestamp(); claim_id:=gen_random_uuid();
  update local_commerce.digital_tickets set consumed_at=stamp,lifecycle='consumed',version=version+1,updated_at=stamp
    where project_id=p_project_id and id=ticket_row.id;
  update local_commerce.digital_grants set used_attempts=used_attempts+1,version=version+1,updated_at=stamp
    where project_id=p_project_id and id=grant_row.id;
  insert into local_commerce.digital_delivery_attempts(
    project_id,id,grant_id,ticket_id,order_id,order_item_id,digital_version_id,owner_id,
    action_key,claim_context_digest,attempt_result,lifecycle,claimed_at,quota_before,quota_after
  ) values(
    p_project_id,claim_id,grant_row.id,ticket_row.id,purchase.id,item.id,ready_version.id,owner_uuid,
    p_claim_key,p_claim_context_digest,'unknown','completed',stamp,grant_row.used_attempts,grant_row.used_attempts+1
  );
  return jsonb_build_object('status','found','value',jsonb_build_object(
    'attemptId',claim_id,'ticketId',ticket_row.id,'grantId',grant_row.id,
    'orderItemId',item.id,'digitalVersionId',ready_version.id,'claimedAt',stamp,
    'consumedAttempts',grant_row.used_attempts+1));
exception
  when unique_violation or deadlock_detected or serialization_failure then
    return jsonb_build_object('status','conflict');
  when others then return jsonb_build_object('status','unavailable');
end;
$claim$;

revoke all on function local_commerce.digital_download_prepare(text,text,text,text,uuid,text,timestamptz,text,text,text)
  from public,anon,authenticated;
grant execute on function local_commerce.digital_download_prepare(text,text,text,text,uuid,text,timestamptz,text,text,text)
  to service_role;
revoke all on function local_commerce.digital_download_claim(text,text,text,text,uuid,text,timestamptz,text,text,text,uuid,text,integer,text,text)
  from public,anon,authenticated;
grant execute on function local_commerce.digital_download_claim(text,text,text,text,uuid,text,timestamptz,text,text,text,uuid,text,integer,text,text)
  to service_role;

notify pgrst,'reload schema';
