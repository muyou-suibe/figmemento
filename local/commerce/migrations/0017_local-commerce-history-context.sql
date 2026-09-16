-- Read representation only: expose already committed context, no writes or new actor authority.
create or replace function local_commerce.read_order_history(
  p_project_id text, p_marker_digest text, p_owner_kind text, p_owner_selector text,
  p_customer_id uuid, p_session_hash text, p_authority_expires_at timestamptz,
  p_capability_hash text, p_order_id uuid, p_public_reference text,
  p_order_item_id uuid, p_projection text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,local_commerce
as $history$
declare
  owner_uuid uuid; purchase local_commerce.orders%rowtype;
  header local_commerce.order_purchase_snapshots%rowtype;
  selected local_commerce.order_items%rowtype;
  snapshot local_commerce.order_item_purchase_snapshots%rowtype;
  item jsonb; items jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_owner_kind is null or p_owner_kind not in ('guest','customer')
    or p_owner_selector is null or p_authority_expires_at is null
    or not isfinite(p_authority_expires_at) or p_authority_expires_at<=clock_timestamp()
    or p_capability_hash is null or p_capability_hash!~'^[0-9a-f]{64}$'
    or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$'
    or p_projection is null or p_projection not in ('canonical_item','customer_summary')
    or (p_projection='canonical_item' and (p_order_id is null or p_order_item_id is null))
    or (p_projection='customer_summary' and p_order_item_id is not null) then
    return jsonb_build_object('status','unavailable'); end if;
  if p_owner_kind='guest' then
    if p_customer_id is not null or p_session_hash is not null or p_owner_selector!~'^[0-9a-f]{64}$' then
      return jsonb_build_object('status','unavailable'); end if;
    select id into owner_uuid from local_commerce.commerce_owners
      where project_id=p_project_id and owner_kind='guest' and subject_hash=p_owner_selector and lifecycle='active' for share;
  else
    select o.id into owner_uuid from local_commerce.commerce_owners o
      join local_commerce.customer_accounts a on a.project_id=o.project_id and a.owner_id=o.id
      join local_commerce.customer_sessions s on s.project_id=o.project_id and s.owner_id=o.id
      where o.project_id=p_project_id and o.id::text=p_owner_selector and o.owner_kind='customer' and o.lifecycle='active'
        and a.id=p_customer_id and a.lifecycle='active' and a.account_status='active'
        and s.session_hash=p_session_hash and s.lifecycle='active' and s.revoked_at is null
        and s.expires_at>clock_timestamp() for share of o,a,s;
  end if;
  if owner_uuid is null then return jsonb_build_object('status','unavailable'); end if;
  select * into purchase from local_commerce.orders o where o.project_id=p_project_id
    and o.owner_id=owner_uuid and o.public_reference=p_public_reference
    and (p_order_id is null or o.id=p_order_id)
    and exists(select 1 from local_commerce.access_grants g where g.project_id=o.project_id
      and g.owner_id=o.owner_id and g.resource_kind='local_order' and g.resource_id=o.id
      and g.capability_hash=p_capability_hash and g.lifecycle='active' and g.revoked_at is null
      and g.expires_at>clock_timestamp()) for share;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into header from local_commerce.order_purchase_snapshots where project_id=p_project_id
    and order_id=purchase.id and owner_id=owner_uuid;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if p_projection='canonical_item' then
    select * into selected from local_commerce.order_items where project_id=p_project_id
      and id=p_order_item_id and order_id=purchase.id and owner_id=owner_uuid;
    if not found then return jsonb_build_object('status','unavailable'); end if;
    select * into snapshot from local_commerce.order_item_purchase_snapshots where project_id=p_project_id
      and order_item_id=selected.id and owner_id=owner_uuid;
    if not found then return jsonb_build_object('status','unavailable'); end if;
    -- item_sequence is a committed association, never an inferred item identity.
    item:=header.purchase_facts->'items'->selected.item_sequence;
    if jsonb_typeof(item#>'{fulfillment,requiresProductionPreview}') is distinct from 'boolean'
      or item->'fulfillment' is distinct from snapshot.customization_facts->'fulfillment'
      or item->'configuration' is distinct from snapshot.customization_facts->'definition'
      or item->'customizationValues' is distinct from snapshot.customization_facts->'values'
      or item->'variant' is distinct from snapshot.variant_facts
      or item->'media' is distinct from snapshot.receipt_references
      or item#>>'{product,id}' is distinct from snapshot.product_id::text
      or item#>>'{product,name}' is distinct from snapshot.product_name
      or item#>>'{product,slug}' is distinct from snapshot.product_slug
      or (item->>'quantity')::integer is distinct from snapshot.quantity then
      return jsonb_build_object('status','unavailable'); end if;
    return jsonb_build_object('status','found','value',jsonb_build_object(
      'orderId',purchase.id,'publicReference',purchase.public_reference,'orderItemId',selected.id,
      'createdAt',purchase.created_at,'orderLifecycle',purchase.lifecycle_status,
      'itemSequence',selected.item_sequence,'contact',header.purchase_facts->'contact','purchasedItem',item));
  end if;
  -- Explicit authorized customer subset: no owner, receipt, token or policy.
  select jsonb_agg(jsonb_build_object('orderItemId',i.id,'productId',s.product_id,'productName',s.product_name,
    'productSlug',s.product_slug,'variantId',s.variant_facts->>'id','skuCode',s.sku_code,'quantity',s.quantity,
    'selectedOptions',s.variant_facts->'selectedOptions',
    'currency',s.currency,'unitBasePriceCents',s.unit_price_cents,'lineSubtotalCents',s.line_subtotal_cents,
    'fulfillmentType',s.fulfillment_type) order by i.item_sequence) into items
    from local_commerce.order_items i join local_commerce.order_item_purchase_snapshots s
      on s.project_id=i.project_id and s.order_item_id=i.id and s.owner_id=i.owner_id
    where i.project_id=p_project_id and i.order_id=purchase.id and i.owner_id=owner_uuid;
  if items is null then return jsonb_build_object('status','unavailable'); end if;
  return jsonb_build_object('status','found','value',jsonb_build_object(
    'publicReference',purchase.public_reference,'createdAt',purchase.created_at,
    'status',purchase.lifecycle_status,
    'paymentStatus',case purchase.lifecycle_status when 'pending_payment' then 'pending' when 'paid' then 'succeeded' when 'payment_failed' then 'failed' else null end,
    'contact',header.purchase_facts->'contact',
    'commercial',jsonb_build_object('currency',header.currency,'subtotalCents',header.subtotal_cents,
      'shipping',jsonb_build_object('amountCents',header.shipping_cents,'currency',header.currency),
      'coupon',jsonb_build_object('status',header.purchase_facts->>'couponStatus','discountCents',header.discount_cents),
      'tax',jsonb_build_object('status',header.tax_status,'amount',header.tax_amount_cents),
      'localArithmeticTotalCents',header.total_cents,'developmentOnly',true),'lines',items));
exception when others then return jsonb_build_object('status','unavailable');
end;
$history$;
revoke all on function local_commerce.read_order_history(text,text,text,text,uuid,text,timestamptz,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function local_commerce.read_order_history(text,text,text,text,uuid,text,timestamptz,text,uuid,text,uuid,text) to service_role;
notify pgrst, 'reload schema';

