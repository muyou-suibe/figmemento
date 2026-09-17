-- C03 forward fix: server-owned customization surcharge pricing.
-- The ledger wrapper owns the outer transaction. Do not add transaction control.

alter table local_commerce.cart_lines add column pricing_snapshot jsonb;
alter table local_commerce.cart_lines add constraint cart_lines_pricing_snapshot_object_check
  check (pricing_snapshot is null or jsonb_typeof(pricing_snapshot) = 'object');

-- Recompute the exact C03 snapshot from the current persistent Catalog and the
-- already accepted handoff. Browser price fields are never read as authority.
create or replace function local_commerce.compute_customization_pricing(
  p_project_id text, p_item jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, local_commerce
as $pricing$
declare
  v_variant local_commerce.catalog_variants%rowtype;
  v_config local_commerce.catalog_configuration_snapshots%rowtype;
  v_rule record;
  v_field jsonb;
  v_value jsonb;
  v_allocations jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
  v_total bigint := 0;
  v_present boolean;
  v_expected jsonb;
begin
  if p_item is null or jsonb_typeof(p_item) is distinct from 'object'
    or jsonb_typeof(p_item->'handoff') is distinct from 'object'
    or jsonb_typeof(p_item->'snapshot') is distinct from 'object'
    or jsonb_typeof(p_item->'pricingSnapshot') is distinct from 'object'
    or jsonb_typeof(p_item#>'{handoff,customizationValues}') is distinct from 'array' then
    return null;
  end if;
  select * into v_variant from local_commerce.catalog_variants
    where project_id=p_project_id and id=(p_item#>>'{handoff,variantId}')::uuid
      and product_id=(p_item#>>'{handoff,productId}')::uuid and lifecycle='active' and availability='available';
  if not found or v_variant.currency <> 'USD' or v_variant.sku_code is distinct from p_item#>>'{handoff,skuCode}'
    or v_variant.selected_options is distinct from p_item#>'{handoff,selectedOptions}' then return null; end if;
  select * into v_config from local_commerce.catalog_configuration_snapshots
    where project_id=p_project_id and product_id=v_variant.product_id
      and revision=(p_item#>>'{handoff,configurationRevision}')::integer
      and lifecycle='active' and configuration_status='active';
  if not found or v_config.definition->>'configurationRevision' is distinct from p_item#>>'{handoff,configurationRevision}' then return null; end if;

  for v_rule in select rule_key, revision, definition
    from local_commerce.catalog_pricing_rules
    where project_id=p_project_id and lifecycle='active' and rule_status='active'
      and definition->>'kind'='customization_surcharge'
      and definition->>'productId'=v_variant.product_id::text
    order by rule_key, definition#>>'{selector,fieldId}'
  loop
    if v_rule.definition ?| array['unsupported','formula']
      or (select array_agg(key order by key) from jsonb_object_keys(v_rule.definition) key)
        is distinct from array['amountCents','configurationRevision','currency','kind','productId','ruleRevision','selector']
      or v_rule.definition->>'ruleRevision' is distinct from v_rule.revision::text
      or v_rule.definition->>'configurationRevision' is distinct from p_item#>>'{handoff,configurationRevision}'
      or v_rule.definition->>'currency' is distinct from 'USD'
      or v_rule.definition#>'{selector,kind}' is distinct from '"field_present"'::jsonb
      or v_rule.definition#>>'{selector,fieldId}' is null
      or v_rule.definition#>>'{selector,fieldId}' = any(v_seen)
      or jsonb_typeof(v_rule.definition->'amountCents') is distinct from 'number'
      or (v_rule.definition->>'amountCents')::numeric < 0
      or (v_rule.definition->>'amountCents')::numeric <> floor((v_rule.definition->>'amountCents')::numeric)
      or (v_rule.definition->>'amountCents')::numeric > 2147483647 then return null; end if;
    v_seen := array_append(v_seen, v_rule.definition#>>'{selector,fieldId}');
    select field into v_field from jsonb_array_elements(v_config.definition->'fields') field
      where field->>'id'=v_rule.definition#>>'{selector,fieldId}';
    if v_field is null or v_field->>'productId' is distinct from v_variant.product_id::text
      or v_field->>'isActive' is distinct from 'true'
      or v_field->>'kind' not in ('image','short_text','long_text') then return null; end if;
    select value into v_value from jsonb_array_elements(p_item#>'{handoff,customizationValues}') value
      where value->>'fieldId'=v_field->>'id';
    v_present := false;
    if v_value is not null then
      if v_value->>'fieldCode' is distinct from v_field->>'code' or v_value->>'kind' is distinct from v_field->>'kind' then return null; end if;
      if v_field->>'kind'='image' then
        if jsonb_typeof(v_value->'images') is distinct from 'array' then return null; end if;
        v_present := jsonb_array_length(v_value->'images') > 0;
      else
        if jsonb_typeof(v_value->'value') is distinct from 'string' then return null; end if;
        v_present := length(btrim(v_value->>'value')) > 0;
      end if;
    end if;
    if v_present then
      v_total := v_total + (v_rule.definition->>'amountCents')::bigint;
      if v_total > 2147483647 then return null; end if;
      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
        'ruleKey',v_rule.rule_key,'ruleRevision',v_rule.revision,
        'fieldId',v_field->>'id','selectorKind','field_present',
        'amountCents',(v_rule.definition->>'amountCents')::integer,'currency','USD'));
    end if;
  end loop;
  if v_variant.price_cents::bigint + v_total > 2147483647 then return null; end if;
  v_expected := jsonb_build_object('basePriceCents',v_variant.price_cents,
    'currency','USD','configurationRevision',p_item#>>'{handoff,configurationRevision}',
    'surchargeAllocations',v_allocations,'totalSurchargeCents',v_total,
    'finalUnitPriceCents',v_variant.price_cents::bigint+v_total);
  return v_expected;
exception when others then return null;
end;
$pricing$;

revoke all on function local_commerce.compute_customization_pricing(text,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.compute_customization_pricing(text,jsonb) to service_role;

-- Keep the one existing application-facing Cart command and its CAS and
-- idempotency boundary. The only addition is the server-owned C03 snapshot.
create or replace function local_commerce.cart_command(
  p_project_id text, p_marker_digest text, p_owner_kind text, p_owner_selector text,
  p_customer_id uuid, p_authority_expires_at timestamptz, p_operation text,
  p_cart_id uuid, p_line_id uuid, p_expected_version integer,
  p_command_key text, p_fingerprint text, p_item jsonb, p_quantity integer
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, local_commerce
as $function$
declare
  v_owner uuid; v_cart local_commerce.carts%rowtype; v_binding local_commerce.cart_command_bindings%rowtype;
  v_operation text := case when p_operation='replay_add' then 'add' else p_operation end;
  v_input jsonb; v_result jsonb; v_line uuid; v_position integer; v_pricing jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_authority_expires_at is null or p_authority_expires_at <= statement_timestamp()
    or p_owner_kind is null or p_owner_kind not in ('guest','customer') or p_owner_selector is null
    or p_operation is null or p_operation not in ('read','create','add','update','remove','clear','replay_add') then
    return jsonb_build_object('status','unavailable','reason','invalid_authority');
  end if;
  if p_owner_kind = 'guest' then
    if p_owner_selector !~ '^[0-9a-f]{64}$' or p_customer_id is not null then
      return jsonb_build_object('status','unavailable','reason','invalid_authority');
    end if;
    if p_operation = 'create' then
      insert into local_commerce.commerce_owners(project_id,owner_kind,subject_hash)
        values(p_project_id,'guest',p_owner_selector) on conflict(project_id,subject_hash) do nothing;
    end if;
    select id into v_owner from local_commerce.commerce_owners
      where project_id=p_project_id and subject_hash=p_owner_selector and owner_kind='guest' and lifecycle='active' for share;
  else
    select o.id into v_owner from local_commerce.commerce_owners o
      join local_commerce.customer_accounts a on a.project_id=o.project_id and a.owner_id=o.id
      where o.project_id=p_project_id and o.id::text=p_owner_selector and o.owner_kind='customer'
        and o.lifecycle='active' and a.id=p_customer_id and a.lifecycle='active' and a.account_status='active' for share of o,a;
  end if;
  if v_owner is null then return jsonb_build_object('status','unavailable','reason','not_found'); end if;
  if p_operation <> 'create' then
    select * into v_cart from local_commerce.carts where project_id=p_project_id and id=p_cart_id
      and owner_id=v_owner and lifecycle='active' and (expires_at is null or expires_at > clock_timestamp()) for update;
    if not found then return jsonb_build_object('status','unavailable','reason','not_found'); end if;
  end if;
  if p_operation <> 'read' then
    if p_command_key is null or length(p_command_key) not between 1 and 200
      or p_fingerprint is null or length(p_fingerprint) not between 1 and 200
      or p_expected_version is null or p_expected_version < 0 then
      return jsonb_build_object('status','unavailable','reason','invalid_request');
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_project_id||v_owner::text||p_command_key,0));
    v_input := jsonb_build_object('operation',v_operation,'cart',p_cart_id,'line',p_line_id,
      'expectedVersion',p_expected_version,'fingerprint',p_fingerprint,'item',case when v_operation='add' then p_item->'handoff' else null end,'quantity',p_quantity);
    select * into v_binding from local_commerce.cart_command_bindings
      where project_id=p_project_id and owner_id=v_owner and command_key=p_command_key;
    if p_authority_expires_at <= clock_timestamp() or (v_cart.expires_at is not null and v_cart.expires_at <= clock_timestamp()) then
      return jsonb_build_object('status','unavailable','reason','invalid_authority');
    end if;
    if found then
      if (v_binding.input_digest || jsonb_build_object('item',case when v_binding.input_digest->>'operation'='add'
          then coalesce(v_binding.input_digest#>'{item,handoff}',v_binding.input_digest->'item') else null end)) <> v_input then return jsonb_build_object('status','conflict','reason','idempotency_mismatch'); end if;
      return v_binding.result;
    end if;
  end if;
  if p_operation='replay_add' then return jsonb_build_object('status','unavailable','reason','not_found'); end if;
  if p_operation='create' then
    insert into local_commerce.carts(project_id,owner_id) values(p_project_id,v_owner) returning * into v_cart;
  elsif p_operation <> 'read' and v_cart.version <> p_expected_version then
    return jsonb_build_object('status','conflict','reason','version_mismatch');
  end if;
  if exists(select 1 from local_commerce.cart_lines where project_id=p_project_id and cart_id=v_cart.id and lifecycle='active' and accepted_item is null) then
    return jsonb_build_object('status','unavailable','reason','rejected');
  end if;
  if p_operation='clear' then
    delete from local_commerce.cart_lines where project_id=p_project_id and cart_id=v_cart.id and owner_id=v_owner;
  elsif p_operation='add' then
    if p_item is null or jsonb_typeof(p_item) <> 'object'
      or not exists(select 1 from local_commerce.catalog_variants v
        join local_commerce.catalog_products p on p.project_id=v.project_id and p.id=v.product_id
        join local_commerce.catalog_configuration_snapshots c on c.project_id=p.project_id and c.product_id=p.id
        where v.project_id=p_project_id and v.id::text=p_item#>>'{handoff,variantId}'
        and p.id::text=p_item#>>'{handoff,productId}' and v.sku_code=p_item#>>'{handoff,skuCode}'
        and v.selected_options=p_item#>'{handoff,selectedOptions}' and c.revision::text=p_item#>>'{handoff,configurationRevision}'
        and p.publication_status='published' and p.availability='available' and p.lifecycle='active'
        and v.lifecycle='active' and v.availability='available' and c.configuration_status='active' and c.lifecycle='active') then
      return jsonb_build_object('status','unavailable','reason','rejected');
    end if;
    v_pricing := local_commerce.compute_customization_pricing(p_project_id,p_item);
    if v_pricing is null or p_item->'pricingSnapshot' is distinct from v_pricing
      or p_item#>>'{snapshot,unitPriceCents}' is distinct from v_pricing->>'finalUnitPriceCents' then
      return jsonb_build_object('status','unavailable','reason','rejected');
    end if;
    select coalesce(max(position)+1,0) into v_position from local_commerce.cart_lines where project_id=p_project_id and cart_id=v_cart.id;
    insert into local_commerce.cart_lines(project_id,cart_id,owner_id,product_id,variant_id,configuration_revision,configuration_values,quantity,position,accepted_item,pricing_snapshot)
      values(p_project_id,v_cart.id,v_owner,(p_item#>>'{handoff,productId}')::uuid,(p_item#>>'{handoff,variantId}')::uuid,
        (p_item#>>'{handoff,configurationRevision}')::integer,p_item#>'{handoff,customizationValues}',1,v_position,p_item,v_pricing) returning id into v_line;
  elsif p_operation in ('update','remove') then
    if p_operation='update' and (p_quantity is null or p_quantity not between 1 and 20) then return jsonb_build_object('status','unavailable','reason','invalid_request'); end if;
    update local_commerce.cart_lines set quantity=case when p_operation='update' then p_quantity else quantity end,
      lifecycle=case when p_operation='remove' then 'removed' else lifecycle end,version=version+1,updated_at=now()
      where project_id=p_project_id and cart_id=v_cart.id and owner_id=v_owner and id=p_line_id and lifecycle='active';
    if not found then return jsonb_build_object('status','unavailable','reason','not_found'); end if;
  end if;
  if p_operation in ('add','update','remove','clear') then
    update local_commerce.carts set version=version+1,updated_at=now() where project_id=p_project_id and id=v_cart.id returning * into v_cart;
  end if;
  select jsonb_build_object('status','found','value',jsonb_build_object('cartId',v_cart.id,'version',v_cart.version,
    'record',jsonb_build_object('cartId',v_cart.id,'lines',coalesce(jsonb_agg(jsonb_build_object(
      'lineId',l.id,'quantity',l.quantity,'handoff',l.accepted_item->'handoff','snapshot',l.accepted_item->'snapshot',
      'customization',l.accepted_item->'customization','pricingSnapshot',l.pricing_snapshot) order by l.position) filter(where l.id is not null),'[]'::jsonb))))
    into v_result from local_commerce.cart_lines l where l.project_id=p_project_id and l.cart_id=v_cart.id and l.lifecycle='active';
  if p_operation <> 'read' then
    insert into local_commerce.cart_command_bindings(project_id,owner_id,command_key,input_digest,result) values(p_project_id,v_owner,p_command_key,v_input,v_result);
  end if;
  return v_result;
end;
$function$;
revoke all on function local_commerce.cart_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function local_commerce.cart_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb,integer) to service_role;

notify pgrst, 'reload schema';

-- Forward replacement of the existing immutable Order commit authority. The
-- signature and application-facing RPC remain unchanged; only the C03
-- purchase-fact checks and stored item pricing snapshot are extended.
create or replace function local_commerce.order_commit(
  p_project_id text, p_marker_digest text, p_owner_kind text, p_owner_selector text,
  p_customer_id uuid, p_session_hash text, p_authority_expires_at timestamptz,
  p_operation text, p_cart_id uuid, p_expected_version integer,
  p_key_digest text, p_context_digest text, p_capability_hash text, p_grant_expires_at timestamptz,
  p_capability_expires_at timestamptz, p_facts jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,local_commerce
as $function$
declare
  owner_uuid uuid; cart local_commerce.carts%rowtype;
  binding local_commerce.order_creation_bindings%rowtype;
  line local_commerce.cart_lines%rowtype; product local_commerce.catalog_products%rowtype;
  variant local_commerce.catalog_variants%rowtype; config local_commerce.catalog_configuration_snapshots%rowtype;
  receipt local_commerce.media_receipts%rowtype; operation local_commerce.media_operations%rowtype;
  order_uuid uuid; item_uuid uuid; reference text; item jsonb; media jsonb;
  versions jsonb; catalog jsonb; amounts jsonb; subtotal bigint:=0; discount bigint:=0; shipping bigint:=0; total bigint:=0;
  item_index integer:=0; item_count integer; t timestamptz; session_expiry timestamptz;
  physical boolean:=false; rule jsonb; matching_rules integer; computed_shipping bigint:=0; computed_discount bigint:=0;
  coupon_status text; code text; contact jsonb; field_name text;
  expected_media jsonb; expected_options jsonb; expected_allocations jsonb; expected_pricing jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_owner_kind is null or p_owner_kind not in ('guest','customer')
    or p_owner_selector is null or p_authority_expires_at is null or p_authority_expires_at<=clock_timestamp()
    or p_operation is null or p_operation not in ('probe','commit') or p_cart_id is null
    or p_expected_version is null or p_expected_version<1
    or p_key_digest is null or p_key_digest!~'^[0-9a-f]{64}$'
    or p_context_digest is null or p_context_digest!~'^[0-9a-f]{64}$'
    or p_grant_expires_at is null or not isfinite(p_grant_expires_at) or p_grant_expires_at<=clock_timestamp()
    or p_grant_expires_at>p_authority_expires_at or p_capability_expires_at is null
    or not isfinite(p_capability_expires_at) or p_capability_expires_at<=clock_timestamp()
    or p_grant_expires_at>p_capability_expires_at or p_capability_hash is null
    or p_capability_hash!~'^[0-9a-f]{64}$' then return jsonb_build_object('status','unavailable'); end if;
  perform local_commerce.lock_media_project(p_project_id);
  if p_owner_kind='guest' then
    if p_customer_id is not null or p_session_hash is not null or p_owner_selector!~'^[0-9a-f]{64}$' then return jsonb_build_object('status','unavailable'); end if;
    select id into owner_uuid from local_commerce.commerce_owners where project_id=p_project_id and owner_kind='guest' and subject_hash=p_owner_selector and lifecycle='active' for share;
  else
    select o.id,s.expires_at into owner_uuid,session_expiry from local_commerce.commerce_owners o
      join local_commerce.customer_accounts a on a.project_id=o.project_id and a.owner_id=o.id
      join local_commerce.customer_sessions s on s.project_id=o.project_id and s.owner_id=o.id
      where o.project_id=p_project_id and o.id::text=p_owner_selector and o.owner_kind='customer' and o.lifecycle='active'
        and a.id=p_customer_id and a.lifecycle='active' and a.account_status='active'
        and s.session_hash=p_session_hash and s.lifecycle='active' and s.revoked_at is null and s.expires_at>clock_timestamp() for share of o,a,s;
  end if;
  if p_owner_kind='customer' and (session_expiry is null or p_grant_expires_at>session_expiry) then return jsonb_build_object('status','unavailable'); end if;
  if owner_uuid is null or p_authority_expires_at<=clock_timestamp() then return jsonb_build_object('status','unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended('local-order:'||p_project_id||p_key_digest,0));
  select * into cart from local_commerce.carts where project_id=p_project_id and id=p_cart_id and owner_id=owner_uuid
    and lifecycle='active' and (expires_at is null or expires_at>clock_timestamp()) for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into binding from local_commerce.order_creation_bindings where project_id=p_project_id and key_digest=p_key_digest;
  if found then
    if binding.owner_id<>owner_uuid or binding.cart_id<>p_cart_id or binding.cart_version<>p_expected_version or binding.context_digest<>p_context_digest then return jsonb_build_object('status','conflict'); end if;
    if not exists(select 1 from local_commerce.access_grants where project_id=p_project_id and owner_id=owner_uuid and resource_kind='local_order' and resource_id=binding.order_id and capability_hash=p_capability_hash and lifecycle='active' and revoked_at is null and expires_at>clock_timestamp()) then return jsonb_build_object('status','unavailable'); end if;
    select public_reference into reference from local_commerce.orders where project_id=p_project_id and id=binding.order_id and owner_id=owner_uuid;
    return jsonb_build_object('status','found','value',jsonb_build_object('orderId',binding.order_id,'publicReference',reference,'replayed',true));
  end if;
  if p_operation='probe' then return jsonb_build_object('status','not_found'); end if;
  if cart.version<>p_expected_version or exists(select 1 from local_commerce.order_creation_bindings where project_id=p_project_id and cart_id=p_cart_id and cart_version=p_expected_version) then return jsonb_build_object('status','conflict'); end if;
  if p_facts is null or jsonb_typeof(p_facts) is distinct from 'object' or jsonb_typeof(p_facts->'items') is distinct from 'array' or octet_length(p_facts::text)>1048576 then return jsonb_build_object('status','unavailable'); end if;
  lock table local_commerce.catalog_categories,local_commerce.catalog_products,local_commerce.catalog_variants,local_commerce.catalog_configuration_snapshots,local_commerce.catalog_pricing_rules in share mode;
  catalog:=local_commerce.read_catalog_authority(p_project_id,p_marker_digest);
  select coalesce(jsonb_object_agg(k||':'||(v->>'id'),v->'version'),'{}'::jsonb) into versions
    from jsonb_each(catalog) e(k,a) cross join lateral jsonb_array_elements(case when jsonb_typeof(a)='array' then a else '[]'::jsonb end) x(v)
    where (k='products' and exists(select 1 from local_commerce.cart_lines l where l.project_id=p_project_id and l.cart_id=p_cart_id and l.lifecycle='active' and l.product_id::text=v->>'id'))
      or (k='variants' and exists(select 1 from local_commerce.cart_lines l where l.project_id=p_project_id and l.cart_id=p_cart_id and l.lifecycle='active' and l.variant_id::text=v->>'id'))
      or (k='configurations' and exists(select 1 from local_commerce.cart_lines l where l.project_id=p_project_id and l.cart_id=p_cart_id and l.lifecycle='active' and l.product_id::text=v->>'product_id'))
      or (k='categories' and exists(select 1 from local_commerce.cart_lines l join local_commerce.catalog_products p on p.project_id=l.project_id and p.id=l.product_id where l.project_id=p_project_id and l.cart_id=p_cart_id and l.lifecycle='active' and p.category_id::text=v->>'id'))
      or (k='rules' and ((v#>>'{definition,kind}'='coupon' and v#>>'{definition,code}'=nullif(btrim(p_facts->>'couponCode'),'') )
        or (v#>>'{definition,kind}'='shipping' and v#>>'{definition,country}'=upper(p_facts#>>'{contact,country}') and v#>>'{definition,method}'=p_facts->>'shippingMethod')
        or (v#>>'{definition,kind}'='customization_surcharge' and exists(select 1 from local_commerce.cart_lines l where l.project_id=p_project_id and l.cart_id=p_cart_id and l.lifecycle='active' and l.product_id::text=v#>>'{definition,productId}'))));
  if versions is distinct from p_facts->'versions' then return jsonb_build_object('status','conflict'); end if;
  item_count:=jsonb_array_length(p_facts->'items');
  if item_count<1 or item_count>1000 or item_count<>(select count(*) from local_commerce.cart_lines where project_id=p_project_id and cart_id=p_cart_id and owner_id=owner_uuid and lifecycle='active') then return jsonb_build_object('status','unavailable'); end if;
  for item in select value from jsonb_array_elements(p_facts->'items') loop
    select * into line from local_commerce.cart_lines where project_id=p_project_id and cart_id=p_cart_id and owner_id=owner_uuid and lifecycle='active' order by position,id offset item_index limit 1 for share;
    if line.id::text is distinct from item->>'cartLineId' or line.quantity is distinct from (item->>'quantity')::integer or line.configuration_values is distinct from item->'customizationValues' then return jsonb_build_object('status','conflict'); end if;
    select * into product from local_commerce.catalog_products where project_id=p_project_id and id=line.product_id and lifecycle='active' and publication_status='published' and availability='available';
    select * into variant from local_commerce.catalog_variants where project_id=p_project_id and id=line.variant_id and product_id=line.product_id and lifecycle='active' and availability='available';
    select * into config from local_commerce.catalog_configuration_snapshots where project_id=p_project_id and product_id=line.product_id and lifecycle='active' and configuration_status='active';
    if product.id is null or variant.id is null or config.id is null
      or product.id::text is distinct from item#>>'{product,id}' or product.name is distinct from item#>>'{product,name}' or product.slug is distinct from item#>>'{product,slug}' or product.description is distinct from item#>>'{product,description}'
      or variant.id::text is distinct from item#>>'{variant,id}' or variant.sku_code is distinct from item#>>'{variant,skuCode}' or variant.sku_code is distinct from line.accepted_item#>>'{handoff,skuCode}'
      or variant.selected_options is distinct from line.accepted_item#>'{handoff,selectedOptions}' or variant.selected_options is distinct from item#>'{variant,selectedOptions}'
      or config.revision is distinct from line.configuration_revision or config.definition is distinct from item->'configuration'
      or not exists(select 1 from local_commerce.catalog_categories where project_id=p_project_id and id=product.category_id and lifecycle='active' and publication_status='published')
      or jsonb_typeof(product.fulfillment_definition->'requiresProductionPreview') is distinct from 'boolean' or product.fulfillment_definition is distinct from item->'fulfillment'
      or variant.currency<>'USD' or item->>'currency' is distinct from 'USD' then return jsonb_build_object('status','conflict'); end if;
    expected_pricing:=local_commerce.compute_customization_pricing(p_project_id,line.accepted_item);
    if expected_pricing is null or line.pricing_snapshot is distinct from expected_pricing or item->'pricingSnapshot' is distinct from expected_pricing
      or item#>>'{pricingSnapshot,basePriceCents}' is distinct from variant.price_cents::text
      or item#>>'{pricingSnapshot,configurationRevision}' is distinct from line.configuration_revision::text
      or item#>>'{pricingSnapshot,currency}' is distinct from 'USD'
      or item->'customizationPriceComponents' is distinct from expected_pricing->'surchargeAllocations'
      or item#>>'{customizationAmountCents}' is distinct from expected_pricing->>'totalSurchargeCents'
      or item#>>'{unitBasePriceCents}' is distinct from expected_pricing->>'basePriceCents'
      or item#>>'{unitPriceCents}' is distinct from expected_pricing->>'finalUnitPriceCents'
      or item#>>'{subtotalCents}' is distinct from ((expected_pricing->>'finalUnitPriceCents')::bigint*line.quantity)::text then return jsonb_build_object('status','conflict'); end if;
    select coalesce(jsonb_agg(jsonb_build_object('optionId',s->>'optionId','valueId',s->>'valueId','option',o,'value',v) order by n),'[]'::jsonb) into expected_options
      from jsonb_array_elements(variant.selected_options) with ordinality as selections(s,n)
      join lateral jsonb_array_elements(product.option_definitions) o on o->>'id'=s->>'optionId'
      join lateral jsonb_array_elements(product.option_value_definitions) v on v->>'id'=s->>'valueId' and v->>'optionId'=s->>'optionId';
    if expected_options is distinct from item->'selectedOptions' or jsonb_array_length(expected_options)<>jsonb_array_length(variant.selected_options) then return jsonb_build_object('status','conflict'); end if;
    select coalesce(jsonb_agg(jsonb_build_object('fieldId',f->>'fieldId','fieldCode',f->>'fieldCode','position',i-1,'receiptId',m->>'receiptId') || case when m ? 'crop' then jsonb_build_object('crop',m->'crop') else '{}'::jsonb end order by fpos,i),'[]'::jsonb) into expected_media
      from jsonb_array_elements(line.configuration_values) with ordinality as fields(f,fpos)
      cross join lateral jsonb_array_elements(case when f->>'kind'='image' then f->'images' else '[]'::jsonb end) with ordinality as images(m,i);
    if expected_media is distinct from item->'media' then return jsonb_build_object('status','conflict'); end if;
    physical:=physical or item#>>'{fulfillment,fulfillmentType}'='physical'; amounts:=item->'amounts';
    if amounts->'tax' is distinct from '{"status":"not_activated","amount":null}'::jsonb or (amounts->>'discountCents')::bigint<0 or (amounts->>'discountCents')::bigint>(item->>'subtotalCents')::bigint
      or (amounts->>'shippingCents')::bigint<0 or (item#>>'{fulfillment,fulfillmentType}'='digital' and (amounts->>'shippingCents')::bigint<>0)
      or (amounts->>'localArithmeticTotalCents')::bigint is distinct from (item->>'subtotalCents')::bigint+(amounts->>'shippingCents')::bigint-(amounts->>'discountCents')::bigint then return jsonb_build_object('status','unavailable'); end if;
    subtotal:=subtotal+(item->>'subtotalCents')::bigint; discount:=discount+(amounts->>'discountCents')::bigint; shipping:=shipping+(amounts->>'shippingCents')::bigint; total:=total+(amounts->>'localArithmeticTotalCents')::bigint;
    for media in select value from jsonb_array_elements(item->'media') loop
      select * into receipt from local_commerce.media_receipts where project_id=p_project_id and receipt_reference=(media->>'receiptId')::uuid and owner_id=owner_uuid and product_id=line.product_id and field_key=media->>'fieldId' and lifecycle='active' and receipt_status='ready' and expires_at>clock_timestamp() for update;
      if not found or exists(select 1 from local_commerce.order_item_receipt_bindings where project_id=p_project_id and receipt_id=receipt.id) then return jsonb_build_object('status','unavailable'); end if;
      select * into operation from local_commerce.media_operations where project_id=p_project_id and receipt_id=receipt.id and owner_id=owner_uuid and lifecycle='ready' and expires_at>clock_timestamp() for update;
      if not found or operation.configuration_revision<>line.configuration_revision or operation.product_id<>line.product_id or operation.field_key<>media->>'fieldId' or receipt.source_generation<>operation.source_generation
        or (operation.normalized_input->'crop') is distinct from (media->'crop')
        or not exists(select 1 from local_commerce.configuration_drafts d join local_commerce.draft_media_links l on l.project_id=d.project_id and l.draft_id=d.id and l.owner_id=d.owner_id join local_commerce.media_slot_reservations s on s.project_id=l.project_id and s.id=l.id and s.owner_id=l.owner_id
          where d.project_id=p_project_id and d.id=operation.draft_id and d.owner_id=owner_uuid and d.product_id=line.product_id and d.lifecycle='confirmed' and (d.expires_at is null or d.expires_at>clock_timestamp())
          and l.id=operation.slot_id and l.receipt_id=receipt.id and l.lifecycle='active' and l.confirmed_revision=d.confirmed_revision and s.lifecycle='active' and s.draft_id=d.id and s.product_id=line.product_id and s.field_key=l.field_key
          and l.field_key=media->>'fieldId' and l.crop is not distinct from media->'crop' and (select count(*) from local_commerce.draft_media_links preceding where preceding.project_id=l.project_id and preceding.draft_id=l.draft_id and preceding.field_key=l.field_key and preceding.lifecycle='active' and preceding.position<l.position)=(media->>'position')::integer
          and s.source_generation=operation.source_generation and s.crop_revision=operation.crop_revision)
        or exists(select 1 from local_commerce.media_cleanup_leases where project_id=p_project_id and internal_locator in (operation.original_locator,operation.derivative_locator)) then return jsonb_build_object('status','unavailable'); end if;
    end loop;
    item_index:=item_index+1;
  end loop;
  contact:=p_facts->'contact';
  if jsonb_typeof(contact) is distinct from 'object' or contact->>'email' is null or length(contact->>'email')>254 or (contact->>'email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or exists(select 1 from jsonb_each(contact) where jsonb_typeof(value)<>'string' or length(value#>>'{}')>254) or contact-array['email','firstName','lastName','country','stateProvince','city','addressLine1','postalCode','phone']<>'{}'::jsonb then return jsonb_build_object('status','unavailable'); end if;
  if physical then
    foreach field_name in array array['firstName','lastName','country','city','addressLine1','postalCode'] loop if coalesce(length(btrim(contact->>field_name)),0)=0 then return jsonb_build_object('status','unavailable'); end if; end loop;
    select count(*) into matching_rules from local_commerce.catalog_pricing_rules where project_id=p_project_id and lifecycle='active' and rule_status='active' and definition->>'kind'='shipping' and definition->>'country'=upper(contact->>'country') and definition->>'method'=p_facts->>'shippingMethod';
    if matching_rules<>1 then return jsonb_build_object('status','unavailable'); end if;
    select definition into rule from local_commerce.catalog_pricing_rules where project_id=p_project_id and lifecycle='active' and rule_status='active' and definition->>'kind'='shipping' and definition->>'country'=upper(contact->>'country') and definition->>'method'=p_facts->>'shippingMethod';
    if rule->>'eligible' is distinct from 'true' or rule->>'currency' is distinct from 'USD' or subtotal<(rule->>'minSubtotalCents')::bigint then return jsonb_build_object('status','unavailable'); end if;
    computed_shipping:=(rule->>'amountCents')::bigint;
  end if;
  code:=nullif(btrim(p_facts->>'couponCode'),''); coupon_status:=case when code is null then 'not_selected' else 'invalid' end;
  select count(*) into matching_rules from local_commerce.catalog_pricing_rules where project_id=p_project_id and lifecycle='active' and rule_status='active' and definition->>'kind'='coupon' and definition->>'code'=code;
  if matching_rules>1 then return jsonb_build_object('status','unavailable'); end if;
  if matching_rules=1 then
    select definition into rule from local_commerce.catalog_pricing_rules where project_id=p_project_id and lifecycle='active' and rule_status='active' and definition->>'kind'='coupon' and definition->>'code'=code;
    if rule->>'currency' is distinct from 'USD' then return jsonb_build_object('status','unavailable'); end if;
    if clock_timestamp()>=(rule->>'expiresAt')::timestamptz then coupon_status:='expired';
    elsif rule->>'eligible' is distinct from 'true' or clock_timestamp()<(rule->>'validFrom')::timestamptz or subtotal<(rule->>'minSubtotalCents')::bigint then coupon_status:='not_applicable';
    else coupon_status:='valid'; if rule->>'discountType'='fixed' then computed_discount:=least(subtotal,(rule->>'discountValue')::bigint); elsif rule->>'discountType'='percent' then computed_discount:=least(subtotal,floor(subtotal::numeric*(rule->>'discountValue')::numeric/100)::bigint); else return jsonb_build_object('status','unavailable'); end if; end if;
  end if;
  if computed_shipping is distinct from shipping or computed_discount is distinct from discount or p_facts->>'couponStatus' is distinct from coupon_status then return jsonb_build_object('status','conflict'); end if;
  amounts:=p_facts->'amounts'; expected_allocations:=local_commerce.order_canonical_allocations(p_facts->'items',discount::integer,shipping::integer);
  if expected_allocations is distinct from jsonb_path_query_array(p_facts,'$.items[*].amounts') or expected_allocations is distinct from amounts->'lines' then return jsonb_build_object('status','conflict'); end if;
  if subtotal is distinct from (amounts->>'subtotalCents')::bigint or discount is distinct from (amounts->>'discountCents')::bigint or shipping is distinct from (amounts->>'shippingCents')::bigint or total is distinct from (amounts->>'localArithmeticTotalCents')::bigint
    or total<>subtotal+shipping-discount or amounts->'tax' is distinct from '{"status":"not_activated","amount":null}'::jsonb or total>2147483647 or subtotal>2147483647 or discount>2147483647 or shipping>2147483647
    or p_authority_expires_at<=clock_timestamp() or p_grant_expires_at<=clock_timestamp() or (p_owner_kind='customer' and session_expiry<=clock_timestamp()) then return jsonb_build_object('status','unavailable'); end if;
  t:=clock_timestamp(); order_uuid:=gen_random_uuid(); reference:='FM-LOCAL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into local_commerce.orders(project_id,id,owner_id,public_reference) values(p_project_id,order_uuid,owner_uuid,reference);
  insert into local_commerce.order_purchase_snapshots(project_id,order_id,owner_id,purchase_facts,pricing_snapshot,currency,subtotal_cents,shipping_cents,discount_cents,tax_status,tax_amount_cents,total_cents) values(p_project_id,order_uuid,owner_uuid,p_facts,p_facts->'amounts','USD',subtotal,shipping,discount,'not_activated',null,total);
  item_index:=0;
  for item in select value from jsonb_array_elements(p_facts->'items') loop
    item_uuid:=gen_random_uuid();
    insert into local_commerce.order_items(project_id,id,order_id,owner_id,item_sequence) values(p_project_id,item_uuid,order_uuid,owner_uuid,item_index);
    insert into local_commerce.order_item_purchase_snapshots(project_id,order_item_id,owner_id,product_id,product_slug,product_name,sku_code,variant_facts,customization_facts,configuration_revision,receipt_references,quantity,unit_price_cents,line_subtotal_cents,currency,fulfillment_type,pricing_snapshot)
      values(p_project_id,item_uuid,owner_uuid,(item#>>'{product,id}')::uuid,item#>>'{product,slug}',item#>>'{product,name}',item#>>'{variant,skuCode}',item->'variant',jsonb_build_object('definition',item->'configuration','values',item->'customizationValues','fulfillment',item->'fulfillment','selectedOptions',item->'selectedOptions'),(item#>>'{configuration,configurationRevision}')::integer,item->'media',(item->>'quantity')::integer,(item->>'unitPriceCents')::integer,(item->>'subtotalCents')::integer,'USD',item#>>'{fulfillment,fulfillmentType}',item->'pricingSnapshot');
    for media in select value from jsonb_array_elements(item->'media') loop
      insert into local_commerce.order_item_receipt_bindings(project_id,order_item_id,receipt_id,owner_id) select p_project_id,item_uuid,id,owner_uuid from local_commerce.media_receipts where project_id=p_project_id and receipt_reference=(media->>'receiptId')::uuid and owner_id=owner_uuid;
    end loop;
    item_index:=item_index+1;
  end loop;
  insert into local_commerce.access_grants(project_id,owner_id,resource_kind,resource_id,capability_hash,expires_at) values(p_project_id,owner_uuid,'local_order',order_uuid,p_capability_hash,p_grant_expires_at);
  insert into local_commerce.order_creation_bindings(project_id,owner_id,cart_id,cart_version,order_id,key_digest,context_digest) values(p_project_id,owner_uuid,p_cart_id,p_expected_version,order_uuid,p_key_digest,p_context_digest);
  return jsonb_build_object('status','found','value',jsonb_build_object('orderId',order_uuid,'publicReference',reference,'replayed',false));
exception when unique_violation then return jsonb_build_object('status','conflict'); when others then return jsonb_build_object('status','unavailable');
end;
$function$;
revoke all on function local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb) to service_role;

notify pgrst, 'reload schema';
