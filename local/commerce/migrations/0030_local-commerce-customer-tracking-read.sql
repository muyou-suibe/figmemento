-- Task 8.6: customer-authorized, read-only Shipment projection.
-- The migration-ledger wrapper owns the outer transaction.

create function local_commerce.read_customer_tracking(
  p_project_id text,
  p_marker_digest text,
  p_owner_kind text,
  p_owner_selector text,
  p_customer_id uuid,
  p_session_hash text,
  p_authority_expires_at timestamptz,
  p_capability_hash text,
  p_public_reference text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, local_commerce
as $tracking$
declare
  authorized jsonb;
  purchase local_commerce.orders%rowtype;
  shipment local_commerce.shipments%rowtype;
  events jsonb;
begin
  -- Reuse the canonical Order customer authorization. Public references and
  -- Tracking selectors never become authorization by themselves.
  authorized := local_commerce.read_order_history(
    p_project_id, p_marker_digest, p_owner_kind, p_owner_selector,
    p_customer_id, p_session_hash, p_authority_expires_at,
    p_capability_hash, null, p_public_reference, null, 'customer_summary'
  );
  if authorized->>'status' is distinct from 'found' then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select * into purchase
  from local_commerce.orders
  where project_id = p_project_id and public_reference = p_public_reference;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;

  select * into shipment
  from local_commerce.shipments
  where project_id = p_project_id and order_id = purchase.id
    and owner_id = purchase.owner_id;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;

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
  where e.project_id = p_project_id and e.shipment_id = shipment.id
    and e.order_id = purchase.id and e.owner_id = purchase.owner_id;

  return jsonb_build_object(
    'status', 'found',
    'value', jsonb_build_object(
      'publicOrderReference', purchase.public_reference,
      'publicShipmentReference', shipment.public_reference,
      'carrierLabel', shipment.carrier_label,
      'trackingNumber', shipment.tracking_reference,
      'status', shipment.tracking_lifecycle,
      'events', events,
      'createdAt', shipment.created_at,
      'shippedAt', shipment.shipped_at,
      'inTransitAt', shipment.in_transit_at,
      'deliveredAt', shipment.delivered_at,
      'notice', 'DEVELOPMENT / TEST ONLY'
    )
  );
exception when others then
  return jsonb_build_object('status', 'unavailable');
end;
$tracking$;

revoke all on function local_commerce.read_customer_tracking(
  text, text, text, text, uuid, text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function local_commerce.read_customer_tracking(
  text, text, text, text, uuid, text, timestamptz, text, text
) to service_role;

notify pgrst, 'reload schema';
