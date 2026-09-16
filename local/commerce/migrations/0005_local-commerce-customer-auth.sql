-- LOCAL COMMERCE ONLY. This is not a production migration.
-- This migration adds the atomic local customer-account registration boundary.
-- Sessions, guest capabilities, and customer-auth HTTP wiring remain later tasks.

create or replace function local_commerce.register_customer_account(
  p_project_id text,
  p_normalized_email text,
  p_password_hash text,
  p_subject_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = local_commerce, pg_catalog
as $$
declare
  v_owner_id uuid;
  v_customer_id uuid;
begin
  if not exists (
    select 1
    from project_identities
    where project_id = p_project_id
      and lifecycle = 'active'
  ) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  if p_project_id is null
    or p_normalized_email is null
    or p_normalized_email <> lower(btrim(p_normalized_email))
    or p_normalized_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    or p_password_hash is null
    or p_password_hash !~ '^pbkdf2-sha256\$v1\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'
    or length(btrim(p_password_hash)) < 32
    or p_subject_hash is null
    or length(btrim(p_subject_hash)) < 32
  then
    return jsonb_build_object('status', 'unavailable');
  end if;

  -- The nested block makes owner creation and account creation one atomic
  -- statement. A concurrent email uniqueness failure rolls both back.
  begin
    if exists (
      select 1
      from customer_accounts
      where project_id = p_project_id
        and normalized_email = p_normalized_email
    ) then
      return jsonb_build_object('status', 'conflict');
    end if;

    insert into commerce_owners (project_id, owner_kind, subject_hash, version, lifecycle)
    values (p_project_id, 'customer', p_subject_hash, 1, 'active')
    on conflict (project_id, subject_hash) do nothing;

    select id into v_owner_id
    from commerce_owners
    where project_id = p_project_id
      and subject_hash = p_subject_hash
      and owner_kind = 'customer'
      and lifecycle = 'active';

    if v_owner_id is null then
      return jsonb_build_object('status', 'unavailable');
    end if;

    insert into customer_accounts (
      project_id,
      owner_id,
      normalized_email,
      password_hash,
      account_status,
      version,
      lifecycle
    ) values (
      p_project_id,
      v_owner_id,
      p_normalized_email,
      p_password_hash,
      'active',
      1,
      'active'
    ) returning id into v_customer_id;

    return jsonb_build_object(
      'status', 'created',
      'customer_id', v_customer_id,
      'owner_id', v_owner_id,
      'normalized_email', p_normalized_email
    );
  exception
    when unique_violation then
      return jsonb_build_object('status', 'conflict');
  end;
end;
$$;

revoke all on function local_commerce.register_customer_account(text, text, text, text)
  from public, anon, authenticated;
grant execute on function local_commerce.register_customer_account(text, text, text, text)
  to service_role;
