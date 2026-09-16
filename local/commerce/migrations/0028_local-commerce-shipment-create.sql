-- Task 8.4: one canonical local/test physical Shipment per Fulfillment.
-- The migration-ledger wrapper owns the outer transaction.

alter table local_commerce.shipments
  add column public_reference text,
  add column carrier_code text not null default 'local_demo_carrier',
  add column carrier_label text not null default 'Local Demo Carrier';

alter table local_commerce.shipments
  alter column public_reference set not null,
  alter column tracking_reference set not null,
  add constraint shipments_public_reference_key unique (project_id, public_reference),
  add constraint shipments_tracking_reference_key unique (project_id, tracking_reference),
  add constraint shipments_public_reference_check
    check (public_reference ~ '^FM-LOCAL-SHP-[A-Z0-9]{12}$'),
  add constraint shipments_tracking_reference_format_check
    check (tracking_reference ~ '^FM-LOCAL-TRK-[A-Z0-9]{12}$'),
  add constraint shipments_local_carrier_check
    check (carrier_code = 'local_demo_carrier' and carrier_label = 'Local Demo Carrier');

create table local_commerce.shipment_actions (
  project_id text not null,
  id uuid not null default gen_random_uuid(),
  shipment_id uuid not null,
  fulfillment_id uuid not null,
  order_id uuid not null,
  owner_id uuid not null,
  action_key text not null,
  action_kind text not null,
  actor_kind text not null,
  actor_id text not null,
  request_digest text not null,
  context_digest text not null,
  expected_shipment_version integer not null,
  result jsonb not null,
  version integer not null default 1,
  lifecycle text not null default 'committed',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint shipment_actions_pk primary key (project_id, id),
  constraint shipment_actions_key unique (project_id, action_key),
  constraint shipment_actions_shipment_owner_fk foreign key (project_id, shipment_id, owner_id)
    references local_commerce.shipments (project_id, id, owner_id),
  constraint shipment_actions_fulfillment_owner_fk foreign key (project_id, fulfillment_id, owner_id)
    references local_commerce.fulfillments (project_id, id, owner_id),
  constraint shipment_actions_order_owner_fk foreign key (project_id, order_id, owner_id)
    references local_commerce.orders (project_id, id, owner_id),
  constraint shipment_actions_key_check check (action_key ~ '^[0-9a-f]{64}$'),
  constraint shipment_actions_kind_check check (action_kind = 'create_shipment'),
  constraint shipment_actions_actor_check check (
    actor_kind = 'operator' and actor_id ~ '^[A-Za-z0-9_-]{8,200}$'
  ),
  constraint shipment_actions_request_digest_check check (request_digest ~ '^[0-9a-f]{64}$'),
  constraint shipment_actions_context_digest_check check (context_digest ~ '^[0-9a-f]{64}$'),
  constraint shipment_actions_expected_version_check check (expected_shipment_version = 0),
  constraint shipment_actions_result_check check (jsonb_typeof(result) = 'object'),
  constraint shipment_actions_version_check check (version >= 1),
  constraint shipment_actions_lifecycle_check check (lifecycle = 'committed')
);

alter table local_commerce.shipment_actions enable row level security;
create policy shipment_actions_service_role_all on local_commerce.shipment_actions
  for all to service_role using (true) with check (true);
revoke all on table local_commerce.shipment_actions from public, anon, authenticated;
grant select, insert, update, delete on table local_commerce.shipment_actions to service_role;

create trigger shipment_actions_updated_at before update on local_commerce.shipment_actions
  for each row execute function local_commerce.set_updated_at();

create function local_commerce.shipment_command(
  p_project_id text,
  p_marker_digest text,
  p_actor_kind text,
  p_actor_id text,
  p_public_reference text,
  p_operation text,
  p_action text,
  p_expected_version integer,
  p_key_digest text,
  p_context_digest text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, local_commerce
as $command$
declare
  purchase local_commerce.orders%rowtype;
  aggregate local_commerce.fulfillments%rowtype;
  previous local_commerce.shipment_actions%rowtype;
  created local_commerce.shipments%rowtype;
  manifest local_commerce.preview_manifests%rowtype;
  facts jsonb;
  applicable jsonb;
  reviewed jsonb;
  required jsonb;
  actual jsonb;
  physical jsonb;
  approved boolean := false;
  request_digest text;
  context_digest text;
  shipment_reference text;
  tracking_reference text;
  stamp timestamptz;
  result jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id, p_marker_digest)
    or p_actor_kind is distinct from 'operator'
    or p_actor_id is null or p_actor_id !~ '^[A-Za-z0-9_-]{8,200}$'
    or p_public_reference is null or p_public_reference !~ '^FM-LOCAL-[A-Z0-9]{16}$'
    or p_operation is null or p_operation not in ('prepare', 'commit')
    or p_action is distinct from 'create_shipment'
    or p_expected_version is distinct from 0
    or p_key_digest is null or p_key_digest !~ '^[0-9a-f]{64}$'
    or (p_operation = 'commit' and (p_context_digest is null or p_context_digest !~ '^[0-9a-f]{64}$'))
  then
    return jsonb_build_object('status', 'unavailable');
  end if;

  if p_operation = 'commit' then
    select * into purchase
    from local_commerce.orders
    where project_id = p_project_id and public_reference = p_public_reference
    for update;
  else
    select * into purchase
    from local_commerce.orders
    where project_id = p_project_id and public_reference = p_public_reference;
  end if;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;

  if p_operation = 'commit' then
    select * into aggregate
    from local_commerce.fulfillments
    where project_id = p_project_id and order_id = purchase.id and owner_id = purchase.owner_id
    for update;
  else
    select * into aggregate
    from local_commerce.fulfillments
    where project_id = p_project_id and order_id = purchase.id and owner_id = purchase.owner_id;
  end if;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;

  request_digest := encode(sha256(convert_to(jsonb_build_array(
    p_project_id, purchase.id, purchase.owner_id, aggregate.id,
    p_actor_kind, p_actor_id, p_action, p_expected_version
  )::text, 'UTF8')), 'hex');

  -- Replay is resolved before current lifecycle checks, but only after the
  -- server has freshly verified the operator and exact project composition.
  select * into previous
  from local_commerce.shipment_actions
  where project_id = p_project_id and action_key = p_key_digest;
  if found then
    if previous.order_id is distinct from purchase.id
      or previous.owner_id is distinct from purchase.owner_id
      or previous.fulfillment_id is distinct from aggregate.id
      or previous.actor_kind is distinct from p_actor_kind
      or previous.actor_id is distinct from p_actor_id
      or previous.action_kind is distinct from p_action
      or previous.expected_shipment_version is distinct from p_expected_version
      or previous.request_digest is distinct from request_digest
      or previous.result is null
    then
      return jsonb_build_object('status', 'conflict');
    end if;
    if p_operation = 'commit' and p_context_digest is distinct from previous.context_digest then
      return jsonb_build_object('status', 'conflict');
    end if;
    return jsonb_build_object(
      'status', 'found',
      'value', jsonb_build_object(
        'orderId', purchase.id,
        'ownerId', purchase.owner_id,
        'fulfillmentId', aggregate.id,
        'contextDigest', previous.context_digest,
        'shipment', previous.result->'shipment'
      ),
      'replayed', true
    );
  end if;

  if purchase.lifecycle_status <> 'paid'
    or purchase.lifecycle <> 'active'
    or aggregate.lifecycle <> 'active'
    or aggregate.fulfillment_state <> 'quality_check'
    or exists (
      select 1 from local_commerce.shipments s
      where s.project_id = p_project_id and s.fulfillment_id = aggregate.id
    )
    or not exists (
      select 1 from local_commerce.payment_attempts p
      where p.project_id = p_project_id and p.order_id = purchase.id
        and p.owner_id = purchase.owner_id and p.outcome = 'succeeded' and p.lifecycle = 'settled'
    )
  then
    return jsonb_build_object('status', 'conflict');
  end if;

  facts := local_commerce.fulfillment_purchased_items(p_project_id, purchase.id, purchase.owner_id);
  if facts is null then return jsonb_build_object('status', 'unavailable'); end if;

  select coalesce(jsonb_agg(x->>'orderItemId' order by x->>'orderItemId'), '[]'::jsonb)
  into physical
  from jsonb_array_elements(facts) x
  where x#>>'{purchasedItem,fulfillment,fulfillmentType}' = 'physical'
    and x#>'{purchasedItem,fulfillment,requiresShipping}' = 'true'::jsonb;
  if jsonb_array_length(physical) = 0 then
    return jsonb_build_object('status', 'conflict');
  end if;

  select coalesce(jsonb_agg(x->>'orderItemId' order by x->>'orderItemId'), '[]'::jsonb)
  into applicable
  from jsonb_array_elements(facts) x
  where jsonb_array_length(x#>'{purchasedItem,media}') > 0;
  select coalesce(jsonb_agg(order_item_id::text order by order_item_id::text), '[]'::jsonb)
  into reviewed
  from local_commerce.photo_reviews
  where project_id = p_project_id and order_id = purchase.id and owner_id = purchase.owner_id
    and fulfillment_id = aggregate.id and lifecycle = 'active' and review_state = 'approved';
  if applicable is distinct from reviewed
    or jsonb_array_length(applicable) <> (
      select count(*) from local_commerce.photo_reviews
      where project_id = p_project_id and order_id = purchase.id and fulfillment_id = aggregate.id
    )
  then
    return jsonb_build_object('status', 'conflict');
  end if;

  select coalesce(jsonb_agg(x->>'orderItemId' order by x->>'orderItemId'), '[]'::jsonb)
  into required
  from jsonb_array_elements(facts) x
  where x#>'{purchasedItem,fulfillment,requiresProductionPreview}' = 'true'::jsonb;
  if jsonb_array_length(required) > 0 then
    select * into manifest
    from local_commerce.preview_manifests
    where project_id = p_project_id and id = aggregate.current_manifest_id
      and owner_id = purchase.owner_id and order_id = purchase.id and fulfillment_id = aggregate.id;
    if not found or manifest.item_ids is distinct from required then
      return jsonb_build_object('status', 'conflict');
    end if;
    select coalesce(jsonb_agg(e.order_item_id::text order by e.order_item_id::text), '[]'::jsonb)
    into actual
    from local_commerce.preview_manifest_entries e
    join local_commerce.fulfillment_preview_media m
      on m.project_id = e.project_id and m.id = e.preview_media_id
      and m.order_id = e.order_id and m.owner_id = e.owner_id
      and m.fulfillment_id = e.fulfillment_id and m.order_item_id = e.order_item_id
      and m.manifest_version = e.manifest_version and m.lifecycle = 'ready'
    where e.project_id = p_project_id and e.manifest_id = manifest.id;
    select exists (
      select 1
      from local_commerce.fulfillment_decisions d
      where d.project_id = p_project_id and d.order_id = purchase.id
        and d.owner_id = purchase.owner_id and d.fulfillment_id = aggregate.id
        and d.expected_manifest_version = manifest.manifest_version
        and d.result#>>'{value,manifestId}' = manifest.id::text
        and (
          d.decision_kind = 'customer_approve'
          or (
            d.decision_kind = 'operator_timeout' and d.actor_kind = 'admin'
            and d.actor_id = 'configured-admin'
            and manifest.approval_deadline_at is not null
            and (d.result#>>'{value,approvalDeadlineAt}')::timestamptz = manifest.approval_deadline_at
            and (d.result#>>'{value,confirmedAt}')::timestamptz >= manifest.approval_deadline_at
          )
        )
    ) into approved;
    if actual is distinct from required or not approved then
      return jsonb_build_object('status', 'conflict');
    end if;
  end if;

  context_digest := encode(sha256(convert_to(jsonb_build_array(
    request_digest,
    purchase.lifecycle_status,
    aggregate.fulfillment_state,
    aggregate.version,
    physical,
    applicable,
    required,
    manifest.id,
    manifest.manifest_version,
    approved
  )::text, 'UTF8')), 'hex');

  if p_operation = 'prepare' then
    return jsonb_build_object(
      'status', 'found',
      'value', jsonb_build_object(
        'orderId', purchase.id,
        'ownerId', purchase.owner_id,
        'fulfillmentId', aggregate.id,
        'contextDigest', context_digest
      ),
      'replayed', false
    );
  end if;

  if p_context_digest is distinct from context_digest then
    return jsonb_build_object('status', 'conflict');
  end if;

  stamp := clock_timestamp();
  shipment_reference := 'FM-LOCAL-SHP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  tracking_reference := 'FM-LOCAL-TRK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into local_commerce.shipments (
    project_id, fulfillment_id, order_id, owner_id,
    public_reference, carrier_code, carrier_label, tracking_reference,
    tracking_lifecycle, version, lifecycle, created_at, updated_at
  ) values (
    p_project_id, aggregate.id, purchase.id, purchase.owner_id,
    shipment_reference, 'local_demo_carrier', 'Local Demo Carrier', tracking_reference,
    'shipment_created', 1, 'active', stamp, stamp
  ) returning * into created;

  result := jsonb_build_object(
    'shipment', jsonb_build_object(
      'internalShipmentId', created.id,
      'internalOrderId', purchase.id,
      'internalFulfillmentId', aggregate.id,
      'publicOrderReference', purchase.public_reference,
      'publicShipmentReference', created.public_reference,
      'carrierCode', created.carrier_code,
      'carrierLabel', created.carrier_label,
      'trackingNumber', created.tracking_reference,
      'status', created.tracking_lifecycle,
      'version', created.version,
      'events', jsonb_build_array(jsonb_build_object(
        'status', 'shipment_created',
        'label', 'Local shipment created',
        'occurredAt', stamp
      )),
      'createdAt', created.created_at,
      'updatedAt', created.updated_at
    ),
    'audit', jsonb_build_object(
      'actorKind', p_actor_kind,
      'actorId', p_actor_id,
      'action', p_action,
      'timestamp', stamp,
      'physicalOrderItemIds', physical,
      'reviewedOrderItemIds', applicable,
      'previewManifestId', manifest.id,
      'previewManifestVersion', manifest.manifest_version
    )
  );

  insert into local_commerce.shipment_events (
    project_id, shipment_id, order_id, owner_id, event_key,
    event_type, occurred_at, version, lifecycle, created_at, updated_at
  ) values (
    p_project_id, created.id, purchase.id, purchase.owner_id, p_key_digest,
    'shipment_created', stamp, 1, 'committed', stamp, stamp
  );

  insert into local_commerce.shipment_actions (
    project_id, shipment_id, fulfillment_id, order_id, owner_id,
    action_key, action_kind, actor_kind, actor_id,
    request_digest, context_digest, expected_shipment_version,
    result, version, lifecycle, created_at, updated_at
  ) values (
    p_project_id, created.id, aggregate.id, purchase.id, purchase.owner_id,
    p_key_digest, p_action, p_actor_kind, p_actor_id,
    request_digest, context_digest, p_expected_version,
    result, 1, 'committed', stamp, stamp
  );

  return jsonb_build_object('status', 'found', 'value', result, 'replayed', false);
exception
  when unique_violation or deadlock_detected or serialization_failure then
    return jsonb_build_object('status', 'conflict');
  when others then
    return jsonb_build_object('status', 'unavailable');
end;
$command$;

revoke all on function local_commerce.shipment_command(
  text, text, text, text, text, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function local_commerce.shipment_command(
  text, text, text, text, text, text, text, integer, text, text
) to service_role;

notify pgrst, 'reload schema';
