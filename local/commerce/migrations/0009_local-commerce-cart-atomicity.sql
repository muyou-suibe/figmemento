-- Cart atomicity forward fix. Ledger wrapper owns the transaction.
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
  v_input jsonb; v_result jsonb; v_line uuid; v_position integer;
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
  -- Lock the exact owned Cart before inspecting a committed result. The lock is
  -- database-owned; distinct application instances cannot bypass CAS.
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
    -- Revalidate time after lock waits, before either replay or mutation.
    if p_authority_expires_at <= clock_timestamp() or (v_cart.expires_at is not null and v_cart.expires_at <= clock_timestamp()) then
      return jsonb_build_object('status','unavailable','reason','invalid_authority');
    end if;
    if found then
      -- Normalize old v8 bindings on comparison only; historical rows stay intact.
      if (v_binding.input_digest || jsonb_build_object('item',case when v_binding.input_digest->>'operation'='add'
          then coalesce(v_binding.input_digest#>'{item,handoff}',v_binding.input_digest->'item') else null end)) <> v_input then return jsonb_build_object('status','conflict','reason','idempotency_mismatch'); end if;
      return v_binding.result;
    end if;
  end if;
  if p_operation='replay_add' then
    return jsonb_build_object('status','unavailable','reason','not_found');
  end if;
  if p_operation='create' then
    insert into local_commerce.carts(project_id,owner_id) values(p_project_id,v_owner) returning * into v_cart;
  else
    if p_operation <> 'read' and v_cart.version <> p_expected_version then
      return jsonb_build_object('status','conflict','reason','version_mismatch');
    end if;
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
        and v.selected_options=p_item#>'{handoff,selectedOptions}'
        and c.revision::text=p_item#>>'{handoff,configurationRevision}'
        and p.publication_status='published' and p.availability='available' and p.lifecycle='active'
        and v.lifecycle='active' and v.availability='available' and c.configuration_status='active' and c.lifecycle='active') then
      return jsonb_build_object('status','unavailable','reason','rejected');
    end if;
    select coalesce(max(position)+1,0) into v_position from local_commerce.cart_lines where project_id=p_project_id and cart_id=v_cart.id;
    insert into local_commerce.cart_lines(project_id,cart_id,owner_id,product_id,variant_id,configuration_revision,configuration_values,quantity,position,accepted_item)
      values(p_project_id,v_cart.id,v_owner,(p_item#>>'{handoff,productId}')::uuid,(p_item#>>'{handoff,variantId}')::uuid,
        (p_item#>>'{handoff,configurationRevision}')::integer,p_item#>'{handoff,customizationValues}',1,v_position,p_item) returning id into v_line;
  elsif p_operation in ('update','remove') then
    if p_operation='update' and (p_quantity is null or p_quantity not between 1 and 20) then
      return jsonb_build_object('status','unavailable','reason','invalid_request');
    end if;
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
      'customization',l.accepted_item->'customization') order by l.position) filter(where l.id is not null),'[]'::jsonb))))
    into v_result from local_commerce.cart_lines l where l.project_id=p_project_id and l.cart_id=v_cart.id and l.lifecycle='active';
  if p_operation <> 'read' then
    insert into local_commerce.cart_command_bindings(project_id,owner_id,command_key,input_digest,result)
      values(p_project_id,v_owner,p_command_key,v_input,v_result);
  end if;
  return v_result;
end;
$function$;
revoke all on function local_commerce.cart_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function local_commerce.cart_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb,integer) to service_role;
