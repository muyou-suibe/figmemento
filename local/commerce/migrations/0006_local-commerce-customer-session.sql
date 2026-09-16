-- LOCAL COMMERCE ONLY. This is not a production migration.
-- This migration adds the durable customer-session authority. Raw browser
-- tokens never cross this RPC boundary; only their SHA-256 hex hashes do.

create or replace function local_commerce.create_customer_session(
  p_project_id text,
  p_owner_id uuid,
  p_customer_id uuid,
  p_subject_hash text,
  p_session_hash text,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = local_commerce, pg_catalog
as $$
declare
  v_session_id uuid;
  v_customer_id uuid;
  v_subject_hash text;
begin
  if p_project_id is null
    or not exists (
      select 1
      from project_identities
      where project_id = p_project_id
        and lifecycle = 'active'
    )
    or p_owner_id is null
    or p_customer_id is null
    or p_subject_hash is null
    or length(btrim(p_subject_hash)) < 32
    or p_session_hash is null
    or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_created_at is null
    or p_expires_at is null
    or p_expires_at <= p_created_at
  then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select ca.id, owner.subject_hash
    into v_customer_id, v_subject_hash
  from customer_accounts ca
  join commerce_owners owner
    on owner.project_id = ca.project_id
   and owner.id = ca.owner_id
  where ca.project_id = p_project_id
    and ca.id = p_customer_id
    and ca.owner_id = p_owner_id
    and ca.account_status = 'active'
    and ca.lifecycle = 'active'
    and owner.owner_kind = 'customer'
    and owner.lifecycle = 'active';

  if v_customer_id is null or v_subject_hash <> p_subject_hash then
    return jsonb_build_object('status', 'unavailable');
  end if;

  begin
    insert into customer_sessions (
      project_id,
      owner_id,
      session_hash,
      expires_at,
      revoked_at,
      version,
      lifecycle,
      created_at,
      updated_at
    ) values (
      p_project_id,
      p_owner_id,
      p_session_hash,
      p_expires_at,
      null,
      1,
      'active',
      p_created_at,
      p_created_at
    ) returning id into v_session_id;
  exception
    when unique_violation then
      return jsonb_build_object('status', 'unavailable');
  end;

  return jsonb_build_object(
    'status', 'created',
    'project_id', p_project_id,
    'session_id', v_session_id,
    'customer_id', v_customer_id,
    'owner_id', p_owner_id,
    'subject_hash', v_subject_hash,
    'created_at', p_created_at,
    'expires_at', p_expires_at,
    'revoked_at', null
  );
end;
$$;

create or replace function local_commerce.lookup_customer_session(
  p_project_id text,
  p_session_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = local_commerce, pg_catalog
as $$
declare
  v_session record;
begin
  if p_project_id is null
    or p_session_hash is null
    or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_now is null
  then
    return jsonb_build_object('status', 'not_found');
  end if;

  select
    sessions.project_id,
    sessions.id as session_id,
    accounts.id as customer_id,
    sessions.owner_id,
    owners.subject_hash,
    sessions.created_at,
    sessions.expires_at,
    sessions.revoked_at,
    sessions.lifecycle,
    accounts.account_status,
    accounts.lifecycle as account_lifecycle,
    owners.owner_kind,
    owners.lifecycle as owner_lifecycle
    into v_session
  from customer_sessions sessions
  join commerce_owners owners
    on owners.project_id = sessions.project_id
   and owners.id = sessions.owner_id
  join customer_accounts accounts
    on accounts.project_id = owners.project_id
   and accounts.owner_id = owners.id
  where sessions.project_id = p_project_id
    and sessions.session_hash = p_session_hash;

  if not found
    or v_session.account_status <> 'active'
    or v_session.account_lifecycle <> 'active'
    or v_session.owner_kind <> 'customer'
    or v_session.owner_lifecycle <> 'active'
  then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_session.revoked_at is not null or v_session.lifecycle = 'revoked' then
    return jsonb_build_object('status', 'revoked');
  end if;

  if v_session.expires_at <= p_now or v_session.lifecycle = 'expired' then
    return jsonb_build_object('status', 'expired');
  end if;

  return jsonb_build_object(
    'status', 'found',
    'project_id', v_session.project_id,
    'session_id', v_session.session_id,
    'customer_id', v_session.customer_id,
    'owner_id', v_session.owner_id,
    'subject_hash', v_session.subject_hash,
    'created_at', v_session.created_at,
    'expires_at', v_session.expires_at,
    'revoked_at', v_session.revoked_at
  );
end;
$$;

create or replace function local_commerce.revoke_customer_session(
  p_project_id text,
  p_session_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = local_commerce, pg_catalog
as $$
declare
  v_session record;
begin
  if p_project_id is null
    or p_session_hash is null
    or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_now is null
  then
    return jsonb_build_object('status', 'not_found');
  end if;

  select
    sessions.project_id,
    sessions.id as session_id,
    accounts.id as customer_id,
    sessions.owner_id,
    owners.subject_hash,
    sessions.created_at,
    sessions.expires_at,
    sessions.revoked_at,
    sessions.lifecycle,
    accounts.account_status,
    accounts.lifecycle as account_lifecycle,
    owners.owner_kind,
    owners.lifecycle as owner_lifecycle
    into v_session
  from customer_sessions sessions
  join commerce_owners owners
    on owners.project_id = sessions.project_id
   and owners.id = sessions.owner_id
  join customer_accounts accounts
    on accounts.project_id = owners.project_id
   and accounts.owner_id = owners.id
  where sessions.project_id = p_project_id
    and sessions.session_hash = p_session_hash
  for update of sessions;

  if not found
    or v_session.account_status <> 'active'
    or v_session.account_lifecycle <> 'active'
    or v_session.owner_kind <> 'customer'
    or v_session.owner_lifecycle <> 'active'
  then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_session.revoked_at is not null or v_session.lifecycle = 'revoked' then
    return jsonb_build_object('status', 'revoked');
  end if;

  if v_session.expires_at <= p_now or v_session.lifecycle = 'expired' then
    return jsonb_build_object('status', 'expired');
  end if;

  update customer_sessions
  set revoked_at = p_now,
      lifecycle = 'revoked',
      version = version + 1,
      updated_at = p_now
  where project_id = v_session.project_id
    and id = v_session.session_id;

  return jsonb_build_object(
    'status', 'found',
    'project_id', v_session.project_id,
    'session_id', v_session.session_id,
    'customer_id', v_session.customer_id,
    'owner_id', v_session.owner_id,
    'subject_hash', v_session.subject_hash,
    'created_at', v_session.created_at,
    'expires_at', v_session.expires_at,
    'revoked_at', p_now
  );
end;
$$;

revoke all on function local_commerce.create_customer_session(text, uuid, uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function local_commerce.lookup_customer_session(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function local_commerce.revoke_customer_session(text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function local_commerce.create_customer_session(text, uuid, uuid, text, text, timestamptz, timestamptz)
  to service_role;
grant execute on function local_commerce.lookup_customer_session(text, text, timestamptz)
  to service_role;
grant execute on function local_commerce.revoke_customer_session(text, text, timestamptz)
  to service_role;
