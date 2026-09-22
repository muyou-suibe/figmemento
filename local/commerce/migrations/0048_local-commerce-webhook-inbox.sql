-- E28 provider-neutral LOCAL evidence inbox. Ledger wrapper owns the transaction.
-- No raw payload, credential, signature, cookie, or provider locator is stored.
create table local_commerce.webhook_inbox (
  project_id text not null references local_commerce.project_identities(project_id),
  id uuid not null default gen_random_uuid(),
  source text not null,
  external_event_id text not null,
  payload_digest text not null,
  body_byte_size integer not null,
  event_type text not null,
  occurred_at timestamptz,
  received_at timestamptz not null default clock_timestamp(),
  subject_kind text not null,
  subject_reference text,
  normalized_facts jsonb not null default '{}'::jsonb,
  state text not null default 'received',
  version integer not null default 1,
  attempt_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  reconciled_at timestamptz,
  lifecycle text not null default 'active',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(project_id,id),
  unique(project_id,source,external_event_id),
  check (source ~ '^[a-z][a-z0-9._-]{0,39}$'),
  check (external_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  check (payload_digest ~ '^[0-9a-f]{64}$' and body_byte_size between 1 and 16384),
  check (event_type ~ '^[a-z][a-z0-9._-]{0,63}$'),
  check (subject_kind in ('payment','refund','unknown')),
  check (subject_reference is null or length(subject_reference) between 1 and 96),
  check (jsonb_typeof(normalized_facts)='object' and pg_column_size(normalized_facts)<=1024),
  check (state in ('received','processing','reconciled','unmatched','unknown','stale','failed')),
  check (version>=1 and attempt_count>=0 and lifecycle='active'),
  check ((state='processing')=(lease_token is not null and lease_expires_at is not null))
);
create index webhook_inbox_state_received on local_commerce.webhook_inbox(project_id,state,received_at);
alter table local_commerce.webhook_inbox enable row level security;
revoke all on local_commerce.webhook_inbox from public,anon,authenticated;
grant select,insert,update on local_commerce.webhook_inbox to service_role;
create policy webhook_inbox_service on local_commerce.webhook_inbox for all to service_role
  using (true) with check (true);

create function local_commerce.webhook_inbox_projection(p_row local_commerce.webhook_inbox)
returns jsonb language sql stable set search_path=pg_catalog,local_commerce as $$
  select jsonb_build_object('source',p_row.source,'externalEventId',p_row.external_event_id,
    'eventType',p_row.event_type,'occurredAt',p_row.occurred_at,'receivedAt',p_row.received_at,
    'bodyByteSize',p_row.body_byte_size,'payloadDigest',p_row.payload_digest,
    'subjectKind',p_row.subject_kind,'subjectReference',p_row.subject_reference,
    'facts',p_row.normalized_facts,'state',p_row.state,'version',p_row.version,
    'attemptCount',p_row.attempt_count,'reconciledAt',p_row.reconciled_at);
$$;
revoke all on function local_commerce.webhook_inbox_projection(local_commerce.webhook_inbox)
  from public,anon,authenticated;

-- Ingest and processing are service-only. The caller's bytes are hashed
-- BEFORE parsing by the server-only facade. The DB never accepts raw evidence.
create function local_commerce.webhook_inbox_ingest(
  p_project_id text,p_marker_digest text,p_source text,p_external_event_id text,
  p_payload_digest text,p_body_byte_size integer,p_event_type text,
  p_occurred_at timestamptz,p_subject_kind text,p_subject_reference text,p_facts jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $$
declare v_row local_commerce.webhook_inbox%rowtype;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_source is null or p_source !~ '^[a-z][a-z0-9._-]{0,39}$'
    or p_external_event_id is null or p_external_event_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_payload_digest is null or p_payload_digest !~ '^[0-9a-f]{64}$'
    or p_body_byte_size is null or p_body_byte_size not between 1 and 16384
    or p_event_type is null or p_event_type !~ '^[a-z][a-z0-9._-]{0,63}$'
    or p_subject_kind is null or p_subject_kind not in ('payment','refund','unknown')
    or (p_subject_reference is not null and length(p_subject_reference) not between 1 and 96)
    or p_facts is null or jsonb_typeof(p_facts) is distinct from 'object'
    or pg_column_size(p_facts)>1024
    or exists (select 1 from jsonb_object_keys(p_facts) as k(key)
      where k.key not in ('amountCents','currency')) then
    return jsonb_build_object('status','unavailable');
  end if;
  insert into local_commerce.webhook_inbox(project_id,source,external_event_id,payload_digest,
    body_byte_size,event_type,occurred_at,subject_kind,subject_reference,normalized_facts)
    values(p_project_id,p_source,p_external_event_id,p_payload_digest,p_body_byte_size,
      p_event_type,p_occurred_at,p_subject_kind,p_subject_reference,p_facts)
    on conflict (project_id,source,external_event_id) do nothing
    returning * into v_row;
  if found then return jsonb_build_object('status','found','replayed',false,
    'value',local_commerce.webhook_inbox_projection(v_row)); end if;
  select * into v_row from local_commerce.webhook_inbox where project_id=p_project_id
    and source=p_source and external_event_id=p_external_event_id;
  if v_row.payload_digest is distinct from p_payload_digest then
    return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','found','replayed',true,
    'value',local_commerce.webhook_inbox_projection(v_row));
exception when others then return jsonb_build_object('status','unavailable');
end;
$$;

create function local_commerce.webhook_inbox_claim(
  p_project_id text,p_marker_digest text,p_source text,p_external_event_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $$
declare v_row local_commerce.webhook_inbox%rowtype;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest) then
    return jsonb_build_object('status','unavailable'); end if;
  select * into v_row from local_commerce.webhook_inbox where project_id=p_project_id
    and source=p_source and external_event_id=p_external_event_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_row.state not in ('received','unmatched','failed')
    and not (v_row.state='processing' and v_row.lease_expires_at<=clock_timestamp()) then
    return jsonb_build_object('status','conflict','state',v_row.state); end if;
  update local_commerce.webhook_inbox set state='processing',version=version+1,
    attempt_count=attempt_count+1,lease_token=gen_random_uuid(),
    lease_expires_at=clock_timestamp()+interval '5 seconds',updated_at=clock_timestamp()
    where project_id=p_project_id and id=v_row.id returning * into v_row;
  return jsonb_build_object('status','claimed','leaseToken',v_row.lease_token,
    'version',v_row.version,'value',local_commerce.webhook_inbox_projection(v_row));
exception when others then return jsonb_build_object('status','unavailable');
end;
$$;

create function local_commerce.webhook_inbox_finalize(
  p_project_id text,p_marker_digest text,p_source text,p_external_event_id text,
  p_lease_token uuid,p_expected_version integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $$
declare v_row local_commerce.webhook_inbox%rowtype; v_payment local_commerce.payment_attempts%rowtype;
  v_refund local_commerce.refund_ledger%rowtype; v_state text; v_facts jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_lease_token is null or p_expected_version is null or p_expected_version<1 then
    return jsonb_build_object('status','unavailable'); end if;
  select * into v_row from local_commerce.webhook_inbox where project_id=p_project_id
    and source=p_source and external_event_id=p_external_event_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_row.state<>'processing' or v_row.lease_token<>p_lease_token
    or v_row.version<>p_expected_version or v_row.lease_expires_at<=clock_timestamp() then
    return jsonb_build_object('status','conflict'); end if;
  v_facts:=v_row.normalized_facts;
  if v_row.event_type not in ('payment.succeeded','payment.failed','payment.cancelled','refund.succeeded') then
    v_state:='unknown';
  elsif (v_facts->>'amountCents') is null or (v_facts->>'amountCents') !~ '^[0-9]{1,10}$'
    or (v_facts->>'currency') is null or (v_facts->>'currency') !~ '^[A-Z]{3}$' then
    v_state:='failed';
  elsif v_row.event_type='refund.succeeded' then
    select * into v_refund from local_commerce.refund_ledger where project_id=p_project_id
      and reference=v_row.subject_reference;
    if not found then v_state:='unmatched';
    elsif v_row.subject_kind<>'refund' or v_refund.amount_cents::text<>v_facts->>'amountCents'
      or v_refund.currency<>v_facts->>'currency' then v_state:='stale';
    else v_state:='reconciled'; end if;
  else
    select pa.* into v_payment from local_commerce.payment_attempts pa
      join local_commerce.payment_actions act on act.project_id=pa.project_id and act.attempt_id=pa.id
      where pa.project_id=p_project_id and act.result#>>'{payment,paymentReference}'=v_row.subject_reference;
    if not found then v_state:='unmatched';
    elsif v_row.subject_kind<>'payment' or v_payment.amount_cents::text<>v_facts->>'amountCents'
      or v_payment.currency<>v_facts->>'currency'
      or v_payment.outcome<>substr(v_row.event_type,length('payment.')+1) then v_state:='stale';
    else v_state:='reconciled'; end if;
  end if;
  update local_commerce.webhook_inbox set state=v_state,version=version+1,
    lease_token=null,lease_expires_at=null,reconciled_at=clock_timestamp(),updated_at=clock_timestamp()
    where project_id=p_project_id and id=v_row.id returning * into v_row;
  return jsonb_build_object('status','found','value',local_commerce.webhook_inbox_projection(v_row));
exception when others then return jsonb_build_object('status','unavailable');
end;
$$;

create function local_commerce.admin_webhook_inbox_read(
  p_project_id text,p_marker_digest text,p_actor_id text,p_source text,
  p_external_event_id text,p_state text,p_limit integer
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,local_commerce as $$
declare v_row local_commerce.webhook_inbox%rowtype; v_list jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_actor_id is distinct from 'configured-admin'
    or p_limit is null or p_limit not between 1 and 50
    or (p_state is not null and p_state not in ('received','processing','reconciled','unmatched','unknown','stale','failed'))
    or (p_source is not null and p_source !~ '^[a-z][a-z0-9._-]{0,39}$') then
    return jsonb_build_object('status','unavailable'); end if;
  if p_external_event_id is not null then
    select * into v_row from local_commerce.webhook_inbox where project_id=p_project_id
      and source=p_source and external_event_id=p_external_event_id;
    if not found then return jsonb_build_object('status','not_found'); end if;
    return jsonb_build_object('status','found','value',local_commerce.webhook_inbox_projection(v_row));
  end if;
  with limited as (select id from local_commerce.webhook_inbox
      where project_id=p_project_id and (p_source is null or source=p_source)
        and (p_state is null or state=p_state)
      order by received_at desc,id desc limit p_limit)
  select coalesce(jsonb_agg(local_commerce.webhook_inbox_projection(w) order by w.received_at desc,w.id desc),'[]'::jsonb)
    into v_list from local_commerce.webhook_inbox w join limited l on l.id=w.id
    where w.project_id=p_project_id;
  return jsonb_build_object('status','found','value',v_list);
exception when others then return jsonb_build_object('status','unavailable');
end;
$$;

revoke all on function local_commerce.webhook_inbox_ingest(text,text,text,text,text,integer,text,timestamptz,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function local_commerce.webhook_inbox_claim(text,text,text,text)
  from public,anon,authenticated;
revoke all on function local_commerce.webhook_inbox_finalize(text,text,text,text,uuid,integer)
  from public,anon,authenticated;
revoke all on function local_commerce.admin_webhook_inbox_read(text,text,text,text,text,text,integer)
  from public,anon,authenticated;
grant execute on function local_commerce.webhook_inbox_ingest(text,text,text,text,text,integer,text,timestamptz,text,text,jsonb)
  to service_role;
grant execute on function local_commerce.webhook_inbox_claim(text,text,text,text) to service_role;
grant execute on function local_commerce.webhook_inbox_finalize(text,text,text,text,uuid,integer) to service_role;
grant execute on function local_commerce.admin_webhook_inbox_read(text,text,text,text,text,text,integer)
  to service_role;
notify pgrst,'reload schema';
