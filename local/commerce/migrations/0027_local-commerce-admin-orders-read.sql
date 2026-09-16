-- LOCAL COMMERCE ONLY. Bounded, read-only Admin projection for the exact
-- isolated project. This does not expose owner/capability/session hashes,
-- private object locators, or any mutation authority.

create function local_commerce.admin_orders_read(
  p_project_id text,
  p_marker_digest text,
  p_actor_kind text,
  p_actor_id text,
  p_search text,
  p_fulfillment text,
  p_payment text,
  p_attention boolean,
  p_page integer,
  p_page_size integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if p_actor_kind <> 'admin' or p_actor_id <> 'configured-admin'
    or p_search is null or length(p_search) > 80
    or p_fulfillment is null or p_fulfillment not in (
      '', 'awaiting_review', 'photo_review', 'preview_pending',
      'preview_revision_requested', 'preview_approved', 'in_production',
      'quality_check', 'ready_for_outbound', 'shipment_created',
      'delivered', 'complete', 'not_applicable', 'issue'
    )
    or p_payment is null or p_payment not in ('', 'paid', 'unpaid', 'failed')
    or p_page is null or p_page < 1 or p_page > 100000
    or p_page_size <> 20
    or not local_commerce.verify_project_identity(p_project_id, p_marker_digest)
  then
    return jsonb_build_object('status', 'unavailable');
  end if;

  with base as (
    select
      o.id,
      o.public_reference,
      o.lifecycle_status,
      o.version as order_version,
      o.created_at,
      s.purchase_facts,
      s.subtotal_cents,
      s.shipping_cents,
      s.discount_cents,
      s.total_cents,
      s.currency,
      f.id as fulfillment_id,
      coalesce(f.fulfillment_state, o.fulfillment_status) as fulfillment_state,
      f.version as fulfillment_version,
      f.revision_requests_used,
      f.current_manifest_id,
      m.manifest_version as current_manifest_version,
      m.approval_deadline_at,
      exists (
        select 1
        from local_commerce.fulfillment_decisions d
        where d.project_id = p_project_id
          and d.order_id = o.id
          and d.fulfillment_id = f.id
          and d.decision_kind = 'operator_timeout'
          and d.actor_kind = 'admin'
          and d.actor_id = p_actor_id
      ) as has_admin_timeout,
      case
        when o.lifecycle_status = 'paid' then 'paid'
        when o.lifecycle_status = 'payment_failed' then 'failed'
        else 'unpaid'
      end as payment_state
    from local_commerce.orders o
    join local_commerce.order_purchase_snapshots s
      on s.project_id = o.project_id and s.order_id = o.id and s.owner_id = o.owner_id
    left join local_commerce.fulfillments f
      on f.project_id = o.project_id and f.order_id = o.id and f.owner_id = o.owner_id
    left join local_commerce.preview_manifests m
      on m.project_id = f.project_id and m.id = f.current_manifest_id
    where o.project_id = p_project_id
  ), filtered as (
    select *
    from base
    where (
      p_search = ''
      or lower(public_reference) like '%' || lower(p_search) || '%'
      or lower(coalesce(purchase_facts #>> '{contact,email}', '')) like '%' || lower(p_search) || '%'
      or lower(trim(concat(
        coalesce(purchase_facts #>> '{contact,firstName}', ''), ' ',
        coalesce(purchase_facts #>> '{contact,lastName}', '')
      ))) like '%' || lower(p_search) || '%'
    )
      and (p_fulfillment = '' or fulfillment_state = p_fulfillment)
      and (p_payment = '' or payment_state = p_payment)
      and (
        not p_attention
        or fulfillment_state in (
          'awaiting_review', 'photo_review', 'preview_pending',
          'preview_revision_requested', 'quality_check', 'issue'
        )
      )
  ), page_rows as (
    select *
    from filtered
    order by created_at desc, id desc
    offset ((p_page - 1) * p_page_size)
    limit p_page_size
  )
  select jsonb_build_object(
    'status', 'found',
    'value', jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'totalCount', (select count(*) from filtered),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'orderId', r.id,
          'publicReference', r.public_reference,
          'orderLifecycle', r.lifecycle_status,
          'orderVersion', r.order_version,
          'paymentStatus', r.payment_state,
          'fulfillmentStatus', r.fulfillment_state,
          'createdAt', r.created_at,
          'customer', jsonb_build_object(
            'displayName', nullif(trim(concat(
              coalesce(r.purchase_facts #>> '{contact,firstName}', ''), ' ',
              coalesce(r.purchase_facts #>> '{contact,lastName}', '')
            )), ''),
            'displayEmail', nullif(r.purchase_facts #>> '{contact,email}', '')
          ),
          'amounts', jsonb_build_object(
            'subtotalCents', r.subtotal_cents,
            'discountCents', r.discount_cents,
            'shippingCents', r.shipping_cents,
            'totalCents', r.total_cents,
            'currency', r.currency,
            'couponCode', nullif(r.purchase_facts ->> 'couponCode', '')
          ),
          'fulfillment', case when r.fulfillment_id is null then null else jsonb_build_object(
            'id', r.fulfillment_id,
            'version', r.fulfillment_version,
            'revisionRequestsUsed', r.revision_requests_used,
            'currentManifestId', r.current_manifest_id,
            'currentManifestVersion', r.current_manifest_version,
            'approvalDeadlineAt', r.approval_deadline_at,
            'hasAdminTimeout', r.has_admin_timeout
          ) end,
          'lineItems', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', oi.id,
              'productName', i.product_name,
              'skuCode', i.sku_code,
              'quantity', i.quantity,
              'fulfillmentType', i.fulfillment_type,
              'configurationRevision', i.configuration_revision
            ) order by oi.item_sequence)
            from local_commerce.order_items oi
            join local_commerce.order_item_purchase_snapshots i
              on i.project_id = oi.project_id and i.order_item_id = oi.id and i.owner_id = oi.owner_id
            where oi.project_id = p_project_id and oi.order_id = r.id
          ), '[]'::jsonb)
        ) order by r.created_at desc, r.id desc)
        from page_rows r
      ), '[]'::jsonb)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function local_commerce.admin_orders_read(
  text, text, text, text, text, text, text, boolean, integer, integer
) from public, anon, authenticated;
grant execute on function local_commerce.admin_orders_read(
  text, text, text, text, text, text, text, boolean, integer, integer
) to service_role;
