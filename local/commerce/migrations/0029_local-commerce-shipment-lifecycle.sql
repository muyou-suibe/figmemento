-- Task 8.5: exact local/test Shipment lifecycle and durable events.
-- The migration-ledger wrapper owns the outer transaction.

alter function local_commerce.shipment_command(
  text, text, text, text, text, text, text, integer, text, text
) rename to shipment_create_command_0028;

revoke all on function local_commerce.shipment_create_command_0028(
  text, text, text, text, text, text, text, integer, text, text
) from public, anon, authenticated, service_role;

alter table local_commerce.shipments
  add column shipped_at timestamptz,
  add column in_transit_at timestamptz,
  add column delivered_at timestamptz,
  add constraint shipments_lifecycle_timestamps_check check (
    (tracking_lifecycle = 'shipment_created' and shipped_at is null and in_transit_at is null and delivered_at is null)
    or (tracking_lifecycle = 'shipped' and shipped_at is not null and in_transit_at is null and delivered_at is null)
    or (tracking_lifecycle = 'in_transit' and shipped_at is not null and in_transit_at is not null and delivered_at is null)
    or (tracking_lifecycle = 'delivered' and shipped_at is not null and in_transit_at is not null and delivered_at is not null)
  ),
  add constraint shipments_timestamp_order_check check (
    (shipped_at is null or shipped_at >= created_at)
    and (in_transit_at is null or (shipped_at is not null and in_transit_at >= shipped_at))
    and (delivered_at is null or (in_transit_at is not null and delivered_at >= in_transit_at))
  );

alter table local_commerce.shipment_actions
  drop constraint shipment_actions_kind_check,
  drop constraint shipment_actions_expected_version_check,
  add constraint shipment_actions_kind_check check (
    action_kind in ('create_shipment', 'mark_shipped', 'mark_in_transit', 'mark_delivered')
  ),
  add constraint shipment_actions_expected_version_check check (expected_shipment_version >= 0);

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
  shipment local_commerce.shipments%rowtype;
  previous local_commerce.shipment_actions%rowtype;
  request_digest text;
  context_digest text;
  target_status text;
  required_status text;
  stamp timestamptz;
  events jsonb;
  result jsonb;
begin
  -- Creation keeps the exact 0028 gate behind this single canonical command.
  if p_action = 'create_shipment' then
    return local_commerce.shipment_create_command_0028(
      p_project_id, p_marker_digest, p_actor_kind, p_actor_id,
      p_public_reference, p_operation, p_action, p_expected_version,
      p_key_digest, p_context_digest
    );
  end if;

  if not local_commerce.verify_project_identity(p_project_id, p_marker_digest)
    or p_actor_kind is distinct from 'operator'
    or p_actor_id is null or p_actor_id !~ '^[A-Za-z0-9_-]{8,200}$'
    or p_public_reference is null or p_public_reference !~ '^FM-LOCAL-[A-Z0-9]{16}$'
    or p_operation is null or p_operation not in ('prepare', 'commit')
    or p_action is null or p_action not in ('mark_shipped', 'mark_in_transit', 'mark_delivered')
    or p_expected_version is null or p_expected_version < 1
    or p_key_digest is null or p_key_digest !~ '^[0-9a-f]{64}$'
    or (p_operation = 'commit' and (p_context_digest is null or p_context_digest !~ '^[0-9a-f]{64}$'))
  then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select * into purchase
  from local_commerce.orders
  where project_id = p_project_id and public_reference = p_public_reference;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;

  select * into aggregate
  from local_commerce.fulfillments
  where project_id = p_project_id and order_id = purchase.id and owner_id = purchase.owner_id;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;

  if p_operation = 'commit' then
    select * into shipment
    from local_commerce.shipments
    where project_id = p_project_id and fulfillment_id = aggregate.id
      and order_id = purchase.id and owner_id = purchase.owner_id
    for update;
  else
    select * into shipment
    from local_commerce.shipments
    where project_id = p_project_id and fulfillment_id = aggregate.id
      and order_id = purchase.id and owner_id = purchase.owner_id;
  end if;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;

  request_digest := encode(sha256(convert_to(jsonb_build_array(
    p_project_id, purchase.id, purchase.owner_id, aggregate.id, shipment.id,
    p_actor_kind, p_actor_id, p_action, p_expected_version
  )::text, 'UTF8')), 'hex');

  -- Replay wins after fresh authority/resource resolution and before current
  -- lifecycle validation, so a lost response remains recoverable after later moves.
  select * into previous
  from local_commerce.shipment_actions
  where project_id = p_project_id and action_key = p_key_digest;
  if found then
    if previous.shipment_id is distinct from shipment.id
      or previous.order_id is distinct from purchase.id
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

  target_status := case p_action
    when 'mark_shipped' then 'shipped'
    when 'mark_in_transit' then 'in_transit'
    when 'mark_delivered' then 'delivered'
  end;
  required_status := case p_action
    when 'mark_shipped' then 'shipment_created'
    when 'mark_in_transit' then 'shipped'
    when 'mark_delivered' then 'in_transit'
  end;

  if shipment.lifecycle <> 'active'
    or shipment.tracking_lifecycle is distinct from required_status
    or shipment.version is distinct from p_expected_version
  then
    return jsonb_build_object('status', 'conflict');
  end if;

  context_digest := encode(sha256(convert_to(jsonb_build_array(
    request_digest, shipment.tracking_lifecycle, shipment.version,
    shipment.shipped_at, shipment.in_transit_at, shipment.delivered_at,
    (select count(*) from local_commerce.shipment_events e
      where e.project_id = p_project_id and e.shipment_id = shipment.id)
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
  update local_commerce.shipments
  set tracking_lifecycle = target_status,
      shipped_at = case when target_status = 'shipped' then stamp else shipped_at end,
      in_transit_at = case when target_status = 'in_transit' then stamp else in_transit_at end,
      delivered_at = case when target_status = 'delivered' then stamp else delivered_at end,
      version = version + 1,
      lifecycle = case when target_status = 'delivered' then 'delivered' else lifecycle end,
      updated_at = stamp
  where project_id = p_project_id and id = shipment.id and owner_id = purchase.owner_id
  returning * into shipment;

  insert into local_commerce.shipment_events (
    project_id, shipment_id, order_id, owner_id, event_key,
    event_type, occurred_at, version, lifecycle, created_at, updated_at
  ) values (
    p_project_id, shipment.id, purchase.id, purchase.owner_id, p_key_digest,
    target_status, stamp, shipment.version, 'committed', stamp, stamp
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'status', e.event_type,
    'label', case e.event_type
      when 'shipment_created' then 'Local shipment created'
      when 'shipped' then 'Local shipment shipped'
      when 'in_transit' then 'Local shipment marked in transit'
      when 'delivered' then 'Local shipment delivered in local demo'
    end,
    'occurredAt', e.occurred_at
  ) order by e.version), '[]'::jsonb)
  into events
  from local_commerce.shipment_events e
  where e.project_id = p_project_id and e.shipment_id = shipment.id;

  result := jsonb_build_object(
    'shipment', jsonb_build_object(
      'internalShipmentId', shipment.id,
      'internalOrderId', purchase.id,
      'internalFulfillmentId', aggregate.id,
      'publicOrderReference', purchase.public_reference,
      'publicShipmentReference', shipment.public_reference,
      'carrierCode', shipment.carrier_code,
      'carrierLabel', shipment.carrier_label,
      'trackingNumber', shipment.tracking_reference,
      'status', shipment.tracking_lifecycle,
      'version', shipment.version,
      'events', events,
      'createdAt', shipment.created_at,
      'shippedAt', shipment.shipped_at,
      'inTransitAt', shipment.in_transit_at,
      'deliveredAt', shipment.delivered_at,
      'updatedAt', shipment.updated_at
    ),
    'audit', jsonb_build_object(
      'actorKind', p_actor_kind,
      'actorId', p_actor_id,
      'action', p_action,
      'timestamp', stamp,
      'fromStatus', required_status,
      'toStatus', target_status,
      'expectedShipmentVersion', p_expected_version
    )
  );

  insert into local_commerce.shipment_actions (
    project_id, shipment_id, fulfillment_id, order_id, owner_id,
    action_key, action_kind, actor_kind, actor_id,
    request_digest, context_digest, expected_shipment_version,
    result, version, lifecycle, created_at, updated_at
  ) values (
    p_project_id, shipment.id, aggregate.id, purchase.id, purchase.owner_id,
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
