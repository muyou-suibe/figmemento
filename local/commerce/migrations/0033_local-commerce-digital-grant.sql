-- Task 9.2: canonical owner/item digital grant activation for the isolated
-- local development/test project. The ledger wrapper owns the transaction.
-- Policy is owner-approved and server-owned: 30 days, five committed claims.

alter table local_commerce.digital_grants
  drop constraint digital_grants_item_version_key,
  add column order_id uuid,
  add column activated_at timestamptz,
  add column activation_key text,
  add column context_digest text,
  add column activation_result jsonb,
  add column revoked_at timestamptz;

alter table local_commerce.digital_grants
  add constraint digital_grants_order_owner_fk
    foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  add constraint digital_grants_canonical_item_key
    unique (project_id, owner_id, order_id, order_item_id),
  add constraint digital_grants_activation_key unique (project_id, activation_key),
  add constraint digital_grants_activation_key_check
    check (activation_key is null or activation_key ~ '^[0-9a-f]{64}$'),
  add constraint digital_grants_context_digest_check
    check (context_digest is null or context_digest ~ '^[0-9a-f]{64}$'),
  add constraint digital_grants_policy_check check (
    activated_at is not null
    and isfinite(activated_at)
    and isfinite(expires_at)
    and expires_at = activated_at + interval '30 days'
    and max_attempts = 5
  ),
  add constraint digital_grants_revocation_check check (
    (grant_status = 'revoked' and lifecycle = 'revoked' and revoked_at is not null)
    or (grant_status <> 'revoked' and lifecycle <> 'revoked' and revoked_at is null)
  ),
  add constraint digital_grants_activation_shape_check check (
    order_id is not null and activation_key is not null
    and context_digest is not null and activation_result is not null
  );

create function local_commerce.digital_grant_activate(
  p_project_id text,
  p_marker_digest text,
  p_owner_kind text,
  p_owner_selector text,
  p_customer_id uuid,
  p_session_hash text,
  p_authority_expires_at timestamptz,
  p_capability_hash text,
  p_public_reference text,
  p_order_item_id uuid,
  p_operation text,
  p_key_digest text,
  p_context_digest text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, local_commerce
as $grant$
declare
  owner_uuid uuid;
  purchase local_commerce.orders%rowtype;
  header local_commerce.order_purchase_snapshots%rowtype;
  item local_commerce.order_items%rowtype;
  item_snapshot local_commerce.order_item_purchase_snapshots%rowtype;
  ready_version local_commerce.digital_versions%rowtype;
  prior local_commerce.digital_grants%rowtype;
  canonical local_commerce.digital_grants%rowtype;
  stamp timestamptz;
  grant_id uuid;
  result jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id, p_marker_digest)
    or p_owner_kind is null or p_owner_kind not in ('guest','customer')
    or p_owner_selector is null
    or p_authority_expires_at is null or not isfinite(p_authority_expires_at)
    or p_authority_expires_at <= clock_timestamp()
    or p_capability_hash is null or p_capability_hash !~ '^[0-9a-f]{64}$'
    or p_public_reference is null or p_public_reference !~ '^FM-LOCAL-[A-Z0-9]{16}$'
    or p_order_item_id is null
    or p_operation is distinct from 'activate'
    or p_key_digest is null or p_key_digest !~ '^[0-9a-f]{64}$'
    or p_context_digest is null or p_context_digest !~ '^[0-9a-f]{64}$'
  then return jsonb_build_object('status','unavailable'); end if;

  if p_owner_kind = 'guest' then
    if p_customer_id is not null or p_session_hash is not null
      or p_owner_selector !~ '^[0-9a-f]{64}$'
    then return jsonb_build_object('status','unavailable'); end if;
    select id into owner_uuid from local_commerce.commerce_owners
      where project_id=p_project_id and owner_kind='guest'
        and subject_hash=p_owner_selector and lifecycle='active' for share;
  else
    if p_customer_id is null or p_session_hash is null
      or p_owner_selector !~ '^[0-9a-f-]{36}$'
    then return jsonb_build_object('status','unavailable'); end if;
    select o.id into owner_uuid from local_commerce.commerce_owners o
      join local_commerce.customer_accounts a
        on a.project_id=o.project_id and a.owner_id=o.id
      join local_commerce.customer_sessions s
        on s.project_id=o.project_id and s.owner_id=o.id
      where o.project_id=p_project_id and o.id::text=p_owner_selector
        and o.owner_kind='customer' and o.lifecycle='active'
        and a.id=p_customer_id and a.account_status='active' and a.lifecycle='active'
        and s.session_hash=p_session_hash and s.lifecycle='active'
        and s.revoked_at is null and s.expires_at>clock_timestamp()
      for share of o,a,s;
  end if;
  if owner_uuid is null then return jsonb_build_object('status','unavailable'); end if;

  select * into purchase from local_commerce.orders o
    where o.project_id=p_project_id and o.owner_id=owner_uuid
      and o.public_reference=p_public_reference and o.lifecycle='active'
      and exists(select 1 from local_commerce.access_grants g
        where g.project_id=o.project_id and g.owner_id=o.owner_id
          and g.resource_kind='local_order' and g.resource_id=o.id
          and g.capability_hash=p_capability_hash and g.lifecycle='active'
          and g.revoked_at is null and g.expires_at>clock_timestamp())
    for update;
  if not found or purchase.lifecycle_status <> 'paid'
    or not exists(select 1 from local_commerce.payment_attempts p
      where p.project_id=p_project_id and p.order_id=purchase.id
        and p.owner_id=owner_uuid and p.outcome='succeeded' and p.lifecycle='settled')
  then return jsonb_build_object('status','unavailable'); end if;

  select * into header from local_commerce.order_purchase_snapshots
    where project_id=p_project_id and order_id=purchase.id and owner_id=owner_uuid;
  if not found or jsonb_typeof(header.purchase_facts->'contact') <> 'object'
    or coalesce(header.purchase_facts#>>'{contact,email}','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then return jsonb_build_object('status','unavailable'); end if;

  select * into item from local_commerce.order_items
    where project_id=p_project_id and id=p_order_item_id
      and order_id=purchase.id and owner_id=owner_uuid and lifecycle='active' for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into item_snapshot from local_commerce.order_item_purchase_snapshots
    where project_id=p_project_id and order_item_id=item.id and owner_id=owner_uuid;
  if not found or item_snapshot.fulfillment_type <> 'digital'
    or item_snapshot.lifecycle <> 'committed'
  then return jsonb_build_object('status','unavailable'); end if;

  select * into ready_version from local_commerce.digital_versions
    where project_id=p_project_id and order_item_id=item.id and owner_id=owner_uuid
      and status='ready' and lifecycle='active' and is_current for share;
  if not found then return jsonb_build_object('status','unavailable'); end if;

  select * into prior from local_commerce.digital_grants
    where project_id=p_project_id and activation_key=p_key_digest for update;
  if found then
    if prior.owner_id is distinct from owner_uuid or prior.order_id is distinct from purchase.id
      or prior.order_item_id is distinct from item.id
      or prior.context_digest is distinct from p_context_digest
    then return jsonb_build_object('status','conflict'); end if;
    if prior.grant_status<>'active' or prior.lifecycle<>'active'
      or prior.revoked_at is not null or clock_timestamp()>=prior.expires_at
      or prior.used_attempts>=prior.max_attempts
    then return jsonb_build_object('status','unavailable'); end if;
    return jsonb_build_object('status','found','value',prior.activation_result,'replayed',true);
  end if;

  select * into canonical from local_commerce.digital_grants
    where project_id=p_project_id and owner_id=owner_uuid and order_id=purchase.id
      and order_item_id=item.id for update;
  if found then
    if canonical.grant_status<>'active' or canonical.lifecycle<>'active'
      or canonical.revoked_at is not null or clock_timestamp()>=canonical.expires_at
      or canonical.used_attempts>=canonical.max_attempts
    then return jsonb_build_object('status','unavailable'); end if;
    return jsonb_build_object('status','found','value',canonical.activation_result,'replayed',true);
  end if;

  stamp := clock_timestamp();
  grant_id := gen_random_uuid();
  result := jsonb_build_object(
    'grantId',grant_id,
    'publicReference',purchase.public_reference,
    'orderItemId',item.id,
    'activatedAt',stamp,
    'expiresAt',stamp + interval '30 days',
    'maxDownloads',5,
    'consumedAttempts',0,
    'status','active'
  );
  insert into local_commerce.digital_grants(
    project_id,id,order_id,order_item_id,digital_version_id,owner_id,
    activated_at,expires_at,max_attempts,used_attempts,grant_status,lifecycle,
    activation_key,context_digest,activation_result
  ) values(
    p_project_id,grant_id,purchase.id,item.id,ready_version.id,owner_uuid,
    stamp,stamp+interval '30 days',5,0,'active','active',
    p_key_digest,p_context_digest,result
  );
  return jsonb_build_object('status','found','value',result,'replayed',false);
exception
  when unique_violation or deadlock_detected or serialization_failure then
    return jsonb_build_object('status','conflict');
  when others then
    return jsonb_build_object('status','unavailable');
end;
$grant$;

revoke all on function local_commerce.digital_grant_activate(
  text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text
) from public,anon,authenticated;
grant execute on function local_commerce.digital_grant_activate(
  text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text
) to service_role;

notify pgrst, 'reload schema';
