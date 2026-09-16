-- Task 9.6: signed-Admin revocation of the one canonical digital grant.
-- The ledger wrapper owns the outer transaction. Claim serializes ticket ->
-- grant; revoke locks no ticket and therefore introduces no inverse lock order.

alter table local_commerce.digital_grants
  add column revocation_action_key text,
  add column revocation_context_digest text,
  add column revoked_by text,
  add column revocation_result jsonb;

alter table local_commerce.digital_grants
  add constraint digital_grants_revocation_action_key unique (project_id, revocation_action_key),
  add constraint digital_grants_revocation_action_check check
    (revocation_action_key is null or revocation_action_key ~ '^[0-9a-f]{64}$'),
  add constraint digital_grants_revocation_context_check check
    (revocation_context_digest is null or revocation_context_digest ~ '^[0-9a-f]{64}$'),
  add constraint digital_grants_revoked_by_check check
    (revoked_by is null or revoked_by ~ '^[A-Za-z0-9_-]{8,200}$');

create function local_commerce.digital_grant_revoke(
  p_project_id text,
  p_marker_digest text,
  p_actor_kind text,
  p_actor_id text,
  p_public_reference text,
  p_order_item_id uuid,
  p_grant_id uuid,
  p_operation text,
  p_key_digest text,
  p_context_digest text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, local_commerce
as $revoke$
declare
  prior local_commerce.digital_grants%rowtype;
  purchase local_commerce.orders%rowtype;
  item local_commerce.order_items%rowtype;
  target local_commerce.digital_grants%rowtype;
  stamp timestamptz;
  result jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id, p_marker_digest)
    or p_actor_kind is distinct from 'admin'
    or p_actor_id is null or p_actor_id !~ '^[A-Za-z0-9_-]{8,200}$'
    or p_public_reference is null or p_public_reference !~ '^FM-LOCAL-[A-Z0-9]{16}$'
    or p_order_item_id is null or p_grant_id is null
    or p_operation is distinct from 'revoke'
    or p_key_digest is null or p_key_digest !~ '^[0-9a-f]{64}$'
    or p_context_digest is null or p_context_digest !~ '^[0-9a-f]{64}$'
  then return jsonb_build_object('status','unavailable'); end if;

  -- Replay is resolved before current lifecycle validation. HTTP has already
  -- freshly verified the signed Admin principal before invoking this RPC.
  select * into prior from local_commerce.digital_grants
   where project_id=p_project_id and revocation_action_key=p_key_digest;
  if found then
    if prior.id is distinct from p_grant_id
      or prior.order_id is distinct from (select id from local_commerce.orders
        where project_id=p_project_id and public_reference=p_public_reference)
      or prior.order_item_id is distinct from p_order_item_id
      or prior.revoked_by is distinct from p_actor_id
      or prior.revocation_context_digest is distinct from p_context_digest
    then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','found','value',prior.revocation_result,'replayed',true);
  end if;

  select * into purchase from local_commerce.orders
   where project_id=p_project_id and public_reference=p_public_reference
     and lifecycle='active' for share;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into item from local_commerce.order_items
   where project_id=p_project_id and id=p_order_item_id and order_id=purchase.id
     and owner_id=purchase.owner_id and lifecycle='active' for share;
  if not found then return jsonb_build_object('status','unavailable'); end if;

  -- No ticket lock/update: claim locks ticket then this grant; revoke only
  -- takes this grant lock after shared Order/Item authority is established.
  select * into target from local_commerce.digital_grants
   where project_id=p_project_id and id=p_grant_id and order_id=purchase.id
     and order_item_id=item.id and owner_id=purchase.owner_id for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if target.grant_status='revoked' or target.lifecycle='revoked' or target.revoked_at is not null
  then return jsonb_build_object('status','conflict'); end if;
  if target.grant_status<>'active' or target.lifecycle<>'active'
  then return jsonb_build_object('status','unavailable'); end if;

  stamp:=clock_timestamp();
  result:=jsonb_build_object(
    'publicReference',purchase.public_reference,'orderItemId',item.id,
    'grantId',target.id,'status','revoked','revokedAt',stamp,
    'activatedAt',target.activated_at,'expiresAt',target.expires_at,
    'maxDownloads',target.max_attempts,'consumedAttempts',target.used_attempts,
    'version',target.version+1);
  update local_commerce.digital_grants set
    grant_status='revoked',lifecycle='revoked',revoked_at=stamp,
    revocation_action_key=p_key_digest,revocation_context_digest=p_context_digest,
    revoked_by=p_actor_id,revocation_result=result,version=version+1,updated_at=stamp
   where project_id=p_project_id and id=target.id;
  return jsonb_build_object('status','found','value',result,'replayed',false);
exception
  when unique_violation or deadlock_detected or serialization_failure then
    return jsonb_build_object('status','conflict');
  when others then return jsonb_build_object('status','unavailable');
end;
$revoke$;

revoke all on function local_commerce.digital_grant_revoke(text,text,text,text,text,uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function local_commerce.digital_grant_revoke(text,text,text,text,text,uuid,uuid,text,text,text)
  to service_role;

notify pgrst,'reload schema';
