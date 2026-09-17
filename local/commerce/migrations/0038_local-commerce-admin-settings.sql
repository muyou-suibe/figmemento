-- LOCAL COMMERCE ONLY. H19 is a typed, project-scoped Admin settings
-- boundary. It does not add provider configuration or expose secrets.

create table if not exists local_commerce.admin_settings (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  support_email text,
  version integer not null default 1,
  lifecycle text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint admin_settings_pkey primary key (project_id, id),
  constraint admin_settings_project_key unique (project_id),
  constraint admin_settings_project_fkey foreign key (project_id)
    references local_commerce.project_identities(project_id),
  constraint admin_settings_version_check check (version >= 1),
  constraint admin_settings_lifecycle_check check (lifecycle = 'active'),
  constraint admin_settings_support_email_check check (
    support_email is null
    or (
      support_email = btrim(support_email)
      and length(support_email) between 3 and 254
      and support_email !~ '[[:cntrl:][:space:]]'
      and support_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and lower(support_email) <> 'hello@photogift.example'
    )
  )
);

create table if not exists local_commerce.admin_settings_actions (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  settings_id uuid not null,
  action_key_digest text not null,
  context_digest text not null,
  actor_kind text not null,
  actor_id text not null,
  action_kind text not null,
  expected_version integer not null,
  old_version integer not null,
  new_version integer not null,
  new_support_email text,
  committed_at timestamptz not null default timezone('utc', now()),
  constraint admin_settings_actions_pkey primary key (project_id, id),
  constraint admin_settings_actions_settings_fkey foreign key (project_id, settings_id)
    references local_commerce.admin_settings(project_id, id),
  constraint admin_settings_actions_key unique (project_id, action_key_digest),
  constraint admin_settings_actions_key_check check (action_key_digest ~ '^[0-9a-f]{64}$'),
  constraint admin_settings_actions_context_check check (context_digest ~ '^[0-9a-f]{64}$'),
  constraint admin_settings_actions_actor_kind_check check (actor_kind = 'admin'),
  constraint admin_settings_actions_actor_id_check check (actor_id = 'configured-admin'),
  constraint admin_settings_actions_kind_check check (action_kind = 'set_support_email'),
  constraint admin_settings_actions_expected_version_check check (expected_version >= 0),
  constraint admin_settings_actions_old_version_check check (old_version >= 0),
  constraint admin_settings_actions_new_version_check check (new_version = old_version + 1),
  constraint admin_settings_actions_support_email_check check (
    new_support_email is null
    or (
      new_support_email = btrim(new_support_email)
      and length(new_support_email) between 3 and 254
      and new_support_email !~ '[[:cntrl:][:space:]]'
      and new_support_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and lower(new_support_email) <> 'hello@photogift.example'
    )
  )
);

alter table local_commerce.admin_settings enable row level security;
alter table local_commerce.admin_settings_actions enable row level security;

revoke all on table local_commerce.admin_settings from public, anon, authenticated;
revoke all on table local_commerce.admin_settings_actions from public, anon, authenticated;
grant select, insert, update, delete on table local_commerce.admin_settings to service_role;
grant select, insert, update, delete on table local_commerce.admin_settings_actions to service_role;

create policy local_commerce_service_role_admin_settings
on local_commerce.admin_settings for all to service_role using (true) with check (true);
create policy local_commerce_service_role_admin_settings_actions
on local_commerce.admin_settings_actions for all to service_role using (true) with check (true);

create or replace function local_commerce.admin_settings_read(
  p_project_id text,
  p_marker_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = local_commerce, pg_catalog
as $$
declare
  v_settings record;
begin
  if not local_commerce.verify_project_identity(p_project_id, p_marker_digest) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select support_email, version, updated_at
    into v_settings
    from local_commerce.admin_settings
   where project_id = p_project_id and lifecycle = 'active';

  if not found then
    return jsonb_build_object(
      'status', 'found',
      'value', jsonb_build_object(
        'supportEmail', null,
        'version', 0,
        'updatedAt', null
      )
    );
  end if;

  return jsonb_build_object(
    'status', 'found',
    'value', jsonb_build_object(
      'supportEmail', v_settings.support_email,
      'version', v_settings.version,
      'updatedAt', v_settings.updated_at
    )
  );
end;
$$;

create or replace function local_commerce.admin_settings_command(
  p_project_id text,
  p_marker_digest text,
  p_actor_kind text,
  p_actor_id text,
  p_action_key_digest text,
  p_context_digest text,
  p_expected_version integer,
  p_support_email text
)
returns jsonb
language plpgsql
security definer
set search_path = local_commerce, pg_catalog
as $$
declare
  v_settings record;
  v_action record;
  v_committed_at timestamptz := timezone('utc', now());
  v_new_version integer;
  v_settings_id uuid;
begin
  if not local_commerce.verify_project_identity(p_project_id, p_marker_digest) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if p_actor_kind <> 'admin' or p_actor_id <> 'configured-admin' then
    return jsonb_build_object('status', 'invalid_request', 'reason', 'actor');
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    return jsonb_build_object('status', 'invalid_request', 'reason', 'expected_version');
  end if;
  if p_action_key_digest is null or p_action_key_digest !~ '^[0-9a-f]{64}$'
    or p_context_digest is null or p_context_digest !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid_request', 'reason', 'digest');
  end if;
  if p_support_email is not null and (
    p_support_email <> btrim(p_support_email)
    or length(p_support_email) not between 3 and 254
    or p_support_email ~ '[[:cntrl:][:space:]]'
    or p_support_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or lower(p_support_email) = 'hello@photogift.example'
  ) then
    return jsonb_build_object('status', 'invalid_request', 'reason', 'support_email');
  end if;

  -- The project identity row is the single serialization point for the
  -- project-scoped settings aggregate. It also prevents a concurrent first
  -- write from creating two settings rows.
  perform 1
    from local_commerce.project_identities
   where project_id = p_project_id and marker_digest = p_marker_digest and lifecycle = 'active'
   for update;
  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select * into v_action
    from local_commerce.admin_settings_actions
   where project_id = p_project_id and action_key_digest = p_action_key_digest
   for update;

  if found then
    if v_action.context_digest <> p_context_digest
      or v_action.actor_kind <> p_actor_kind
      or v_action.actor_id <> p_actor_id
      or v_action.action_kind <> 'set_support_email' then
      return jsonb_build_object('status', 'conflict', 'reason', 'idempotency_mismatch');
    end if;
    return jsonb_build_object(
      'status', 'found',
      'replayed', true,
      'value', jsonb_build_object(
        'supportEmail', v_action.new_support_email,
        'version', v_action.new_version,
        'updatedAt', v_action.committed_at
      )
    );
  end if;

  select * into v_settings
    from local_commerce.admin_settings
   where project_id = p_project_id and lifecycle = 'active'
   for update;

  if found then
    v_settings_id := v_settings.id;
    if v_settings.version <> p_expected_version then
      return jsonb_build_object('status', 'conflict', 'reason', 'version_mismatch');
    end if;
    v_new_version := v_settings.version + 1;
    update local_commerce.admin_settings
       set support_email = p_support_email,
           version = v_new_version,
           updated_at = v_committed_at
     where project_id = p_project_id and id = v_settings_id;
  else
    if p_expected_version <> 0 then
      return jsonb_build_object('status', 'conflict', 'reason', 'version_mismatch');
    end if;
    v_new_version := 1;
    insert into local_commerce.admin_settings(project_id, support_email, version, created_at, updated_at)
    values (p_project_id, p_support_email, v_new_version, v_committed_at, v_committed_at)
    returning id into v_settings_id;
  end if;

  insert into local_commerce.admin_settings_actions(
    project_id, settings_id, action_key_digest, context_digest, actor_kind, actor_id,
    action_kind, expected_version, old_version, new_version, new_support_email, committed_at
  ) values (
    p_project_id, v_settings_id, p_action_key_digest, p_context_digest, p_actor_kind, p_actor_id,
    'set_support_email', p_expected_version, v_new_version - 1, v_new_version, p_support_email, v_committed_at
  );

  return jsonb_build_object(
    'status', 'found',
    'replayed', false,
    'value', jsonb_build_object(
      'supportEmail', p_support_email,
      'version', v_new_version,
      'updatedAt', v_committed_at
    )
  );
end;
$$;

revoke all on function local_commerce.admin_settings_read(text, text) from public, anon, authenticated;
revoke all on function local_commerce.admin_settings_command(text, text, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function local_commerce.admin_settings_read(text, text) to service_role;
grant execute on function local_commerce.admin_settings_command(text, text, text, text, text, text, integer, text) to service_role;

notify pgrst, 'reload schema';
