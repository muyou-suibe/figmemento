-- E07 local simulation refund facts. The migration ledger wrapper owns the transaction.
-- A refund never mutates the original Payment attempt or immutable purchase snapshot.
create table local_commerce.refund_aggregates (
  project_id text not null references local_commerce.project_identities(project_id),
  id uuid not null default gen_random_uuid(),
  payment_attempt_id uuid not null,
  order_id uuid not null,
  owner_id uuid not null,
  version integer not null default 1,
  refunded_cents bigint not null default 0,
  lifecycle text not null default 'active',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (project_id,id),
  unique (project_id,payment_attempt_id),
  foreign key (project_id,payment_attempt_id,owner_id)
    references local_commerce.payment_attempts(project_id,id,owner_id),
  foreign key (project_id,order_id,owner_id)
    references local_commerce.orders(project_id,id,owner_id),
  check (version >= 1 and refunded_cents >= 0 and lifecycle = 'active')
);
create table local_commerce.refund_ledger (
  project_id text not null references local_commerce.project_identities(project_id),
  id uuid not null default gen_random_uuid(),
  aggregate_id uuid not null,
  payment_attempt_id uuid not null,
  order_id uuid not null,
  owner_id uuid not null,
  amount_cents integer not null,
  currency text not null,
  reference text not null,
  aggregate_version integer not null,
  status text not null default 'committed',
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (project_id,id),
  unique (project_id,reference),
  unique (project_id,aggregate_id,aggregate_version),
  foreign key (project_id,aggregate_id) references local_commerce.refund_aggregates(project_id,id),
  foreign key (project_id,payment_attempt_id,owner_id) references local_commerce.payment_attempts(project_id,id,owner_id),
  check (amount_cents > 0 and aggregate_version >= 2),
  check (currency ~ '^[A-Z]{3}$' and reference ~ '^RF-LOCAL-[A-F0-9]{32}$'),
  check (status = 'committed' and version = 1 and lifecycle = 'committed')
);
create table local_commerce.refund_actions (
  project_id text not null references local_commerce.project_identities(project_id),
  id uuid not null default gen_random_uuid(),
  refund_id uuid not null,
  actor_id text not null,
  action_key_digest text not null,
  context_digest text not null,
  expected_version integer not null,
  result jsonb not null,
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (project_id,id),
  unique (project_id,action_key_digest),
  unique (project_id,refund_id),
  foreign key (project_id,refund_id) references local_commerce.refund_ledger(project_id,id),
  check (actor_id = 'configured-admin' and expected_version >= 1),
  check (action_key_digest ~ '^[0-9a-f]{64}$' and context_digest ~ '^[0-9a-f]{64}$'),
  check (version = 1 and lifecycle = 'committed')
);

create function local_commerce.refund_immutable_guard() returns trigger language plpgsql
set search_path = pg_catalog,local_commerce as $$
begin
  raise exception 'committed refund fact is immutable';
end;
$$;
create trigger refund_ledger_immutable before update or delete on local_commerce.refund_ledger
  for each row execute function local_commerce.refund_immutable_guard();
create trigger refund_actions_immutable before update or delete on local_commerce.refund_actions
  for each row execute function local_commerce.refund_immutable_guard();

alter table local_commerce.refund_aggregates enable row level security;
alter table local_commerce.refund_ledger enable row level security;
alter table local_commerce.refund_actions enable row level security;
revoke all on local_commerce.refund_aggregates,local_commerce.refund_ledger,local_commerce.refund_actions
  from public,anon,authenticated;
grant select,insert,update on local_commerce.refund_aggregates to service_role;
grant select,insert on local_commerce.refund_ledger,local_commerce.refund_actions to service_role;
create policy refund_aggregate_service on local_commerce.refund_aggregates for all to service_role
  using (true) with check (true);
create policy refund_ledger_service on local_commerce.refund_ledger for all to service_role
  using (true) with check (true);
create policy refund_actions_service on local_commerce.refund_actions for all to service_role
  using (true) with check (true);

create function local_commerce.admin_refund_command(
  p_project_id text,p_marker_digest text,p_actor_id text,p_payment_reference text,
  p_action_key_digest text,p_amount_cents integer,p_expected_version integer
) returns jsonb language plpgsql security definer
set search_path = pg_catalog,local_commerce as $$
declare
  v_payment local_commerce.payment_attempts%rowtype;
  v_purchase local_commerce.order_purchase_snapshots%rowtype;
  v_order local_commerce.orders%rowtype;
  v_aggregate local_commerce.refund_aggregates%rowtype;
  v_action local_commerce.refund_actions%rowtype;
  v_digest text; v_id uuid; v_reference text; v_at timestamptz;
  v_remaining bigint; v_result jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_actor_id is distinct from 'configured-admin'
    or p_payment_reference is null or p_payment_reference !~ '^LP-LOCAL-[A-Z0-9]{16}$'
    or p_action_key_digest is null or p_action_key_digest !~ '^[0-9a-f]{64}$'
    or p_amount_cents is null or p_amount_cents <= 0
    or p_expected_version is null or p_expected_version < 1 then
    return jsonb_build_object('status','unavailable');
  end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_array(p_project_id,p_actor_id,
    p_payment_reference,p_amount_cents,p_expected_version)::text,'UTF8')),'hex');
  -- The HTTP boundary has freshly verified the signed Admin context. Probe a
  -- committed selector before NEW-action lifecycle/version checks.
  select * into v_action from local_commerce.refund_actions where project_id=p_project_id
    and action_key_digest=p_action_key_digest;
  if found then
    if v_action.context_digest<>v_digest then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','found','replayed',true,'value',v_action.result);
  end if;
  -- Serialized on the immutable Payment identity; this also guards first-use
  -- aggregate creation against a concurrent writer.
  select pa.* into v_payment from local_commerce.payment_attempts pa
    join local_commerce.payment_actions act on act.project_id=pa.project_id and act.attempt_id=pa.id
    where pa.project_id=p_project_id and act.result#>>'{payment,paymentReference}'=p_payment_reference
      and pa.outcome='succeeded' and pa.lifecycle='settled'
    for update of pa;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  -- Fail closed if a malformed historical identity collision exists.
  if (select count(*) from local_commerce.payment_actions act
      where act.project_id=p_project_id and act.result#>>'{payment,paymentReference}'=p_payment_reference) <> 1 then
    return jsonb_build_object('status','unavailable'); end if;
  select * into v_order from local_commerce.orders where project_id=p_project_id
    and id=v_payment.order_id and owner_id=v_payment.owner_id;
  select * into v_purchase from local_commerce.order_purchase_snapshots where project_id=p_project_id
    and order_id=v_payment.order_id and owner_id=v_payment.owner_id;
  if v_order.lifecycle_status is distinct from 'paid' or v_payment.amount_cents is distinct from v_purchase.total_cents
    or v_payment.currency is distinct from v_purchase.currency then
    return jsonb_build_object('status','unavailable'); end if;
  -- A competing same-key writer may have committed while this call waited on
  -- the Payment lock. Repeat the committed-action probe under that lock.
  select * into v_action from local_commerce.refund_actions where project_id=p_project_id
    and action_key_digest=p_action_key_digest;
  if found then
    if v_action.context_digest<>v_digest then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','found','replayed',true,'value',v_action.result);
  end if;
  select * into v_aggregate from local_commerce.refund_aggregates where project_id=p_project_id
    and payment_attempt_id=v_payment.id for update;
  if not found then
    v_aggregate.version:=1;
    v_aggregate.refunded_cents:=0;
  end if;
  v_remaining:=v_payment.amount_cents::bigint-v_aggregate.refunded_cents;
  if v_aggregate.version<>p_expected_version then return jsonb_build_object('status','conflict'); end if;
  if v_remaining<=0 or p_amount_cents::bigint>v_remaining then
    return jsonb_build_object('status','non_refundable'); end if;
  if v_aggregate.id is null then
    insert into local_commerce.refund_aggregates(project_id,payment_attempt_id,order_id,owner_id)
      values(p_project_id,v_payment.id,v_payment.order_id,v_payment.owner_id)
      returning * into v_aggregate;
  end if;
  v_at:=clock_timestamp(); v_id:=gen_random_uuid();
  v_reference:='RF-LOCAL-'||upper(replace(v_id::text,'-',''));
  v_result:=jsonb_build_object('refundReference',v_reference,'paymentReference',p_payment_reference,
    'amountCents',p_amount_cents,'currency',v_payment.currency,
    'remainingRefundableCents',v_remaining-p_amount_cents,'aggregateVersion',v_aggregate.version+1,
    'createdAt',v_at,'status','committed');
  insert into local_commerce.refund_ledger(project_id,id,aggregate_id,payment_attempt_id,order_id,owner_id,
    amount_cents,currency,reference,aggregate_version,created_at,updated_at)
    values(p_project_id,v_id,v_aggregate.id,v_payment.id,v_payment.order_id,v_payment.owner_id,
      p_amount_cents,v_payment.currency,v_reference,v_aggregate.version+1,v_at,v_at);
  insert into local_commerce.refund_actions(project_id,refund_id,actor_id,action_key_digest,context_digest,
    expected_version,result,created_at,updated_at)
    values(p_project_id,v_id,p_actor_id,p_action_key_digest,v_digest,p_expected_version,v_result,v_at,v_at);
  update local_commerce.refund_aggregates set refunded_cents=refunded_cents+p_amount_cents,
    version=version+1,updated_at=v_at where project_id=p_project_id and id=v_aggregate.id;
  return jsonb_build_object('status','found','replayed',false,'value',v_result);
exception when unique_violation then return jsonb_build_object('status','conflict');
  when others then return jsonb_build_object('status','unavailable');
end;
$$;
revoke all on function local_commerce.refund_immutable_guard() from public,anon,authenticated;
revoke all on function local_commerce.admin_refund_command(text,text,text,text,text,integer,integer)
  from public,anon,authenticated;
grant execute on function local_commerce.admin_refund_command(text,text,text,text,text,integer,integer) to service_role;
notify pgrst,'reload schema';
