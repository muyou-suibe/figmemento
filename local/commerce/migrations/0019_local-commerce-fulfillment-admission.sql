-- Task 7.1 only. The ledger wrapper owns BEGIN/COMMIT.
-- Reuse the existing aggregate/review/decision tables, never copy Order state.
alter table local_commerce.fulfillments alter column fulfillment_state set default 'photo_review';
alter table local_commerce.fulfillments drop constraint fulfillments_state_check;
alter table local_commerce.fulfillments add constraint fulfillments_state_check check
  (fulfillment_state in ('photo_review','preview_pending','preview_revision_requested','preview_approved','in_production','quality_check'));
alter table local_commerce.fulfillments add column revision_requests_used integer not null default 0
  check (revision_requests_used between 0 and 2);
alter table local_commerce.fulfillments add constraint fulfillments_exact_order_key unique(project_id,id,order_id,owner_id);
alter table local_commerce.order_items add constraint order_items_exact_order_key unique(project_id,id,order_id,owner_id);
alter table local_commerce.photo_reviews add constraint photo_reviews_exact_fulfillment_fk
  foreign key(project_id,fulfillment_id,order_id,owner_id) references local_commerce.fulfillments(project_id,id,order_id,owner_id);
alter table local_commerce.photo_reviews add constraint photo_reviews_exact_item_fk
  foreign key(project_id,order_item_id,order_id,owner_id) references local_commerce.order_items(project_id,id,order_id,owner_id);
alter table local_commerce.fulfillment_decisions add constraint fulfillment_decisions_exact_order_fk
  foreign key(project_id,fulfillment_id,order_id,owner_id) references local_commerce.fulfillments(project_id,id,order_id,owner_id);
-- One existing decision relation also owns admission's binding and bounded audit.
-- Nullable only for previously admitted foundation records; new RPC writes all.
alter table local_commerce.fulfillment_decisions add column actor_kind text check(actor_kind in ('operator','customer','admin'));
alter table local_commerce.fulfillment_decisions add column actor_id text check(actor_id ~ '^[A-Za-z0-9_-]{8,200}$');
alter table local_commerce.fulfillment_decisions add column request_digest text check(request_digest ~ '^[0-9a-f]{64}$');
alter table local_commerce.fulfillment_decisions add column expected_aggregate_version integer check(expected_aggregate_version>=0);
alter table local_commerce.fulfillment_decisions add column result jsonb check(jsonb_typeof(result)='object');
alter table local_commerce.fulfillment_decisions drop constraint fulfillment_decisions_kind_check;
alter table local_commerce.fulfillment_decisions add constraint fulfillment_decisions_kind_check
  check(decision_kind in ('customer_approve','customer_revision','operator_timeout','enter_photo_review'));

-- Private acquisition over the SAME canonical purchase tables used by 6.5.
-- No service/client execution grant: only an already-authorized command calls it.
create function local_commerce.fulfillment_purchased_items(p_project_id text,p_order_id uuid,p_owner_id uuid)
returns jsonb language plpgsql set search_path=pg_catalog,local_commerce as $items$
declare
  purchase local_commerce.orders%rowtype; header local_commerce.order_purchase_snapshots%rowtype;
  selected record; item jsonb; result jsonb:='[]'; count_items integer:=0;
begin
  select * into purchase from local_commerce.orders where project_id=p_project_id and id=p_order_id and owner_id=p_owner_id;
  if not found then return null; end if;
  select * into header from local_commerce.order_purchase_snapshots where project_id=p_project_id and order_id=p_order_id and owner_id=p_owner_id;
  if not found or jsonb_typeof(header.purchase_facts->'items') is distinct from 'array' then return null; end if;
  for selected in select i.id as item_id,i.item_sequence,s.* from local_commerce.order_items i
    join local_commerce.order_item_purchase_snapshots s on s.project_id=i.project_id and s.order_item_id=i.id and s.owner_id=i.owner_id
    where i.project_id=p_project_id and i.order_id=p_order_id and i.owner_id=p_owner_id order by i.item_sequence loop
    item:=header.purchase_facts->'items'->selected.item_sequence;
    if selected.item_sequence<>count_items or jsonb_typeof(item->'media') is distinct from 'array'
      or jsonb_typeof(item#>'{fulfillment,requiresProductionPreview}') is distinct from 'boolean'
      or item->'fulfillment' is distinct from selected.customization_facts->'fulfillment'
      or item->'configuration' is distinct from selected.customization_facts->'definition'
      or item->'customizationValues' is distinct from selected.customization_facts->'values'
      or item->'variant' is distinct from selected.variant_facts
      or item->'media' is distinct from selected.receipt_references
      or item#>>'{product,id}' is distinct from selected.product_id::text
      or item#>>'{product,name}' is distinct from selected.product_name
      or item#>>'{product,slug}' is distinct from selected.product_slug
      or item#>>'{variant,skuCode}' is distinct from selected.sku_code
      or (item->>'quantity')::integer is distinct from selected.quantity then return null; end if;
    result:=result||jsonb_build_array(jsonb_build_object('orderId',purchase.id,'publicReference',purchase.public_reference,
      'orderItemId',selected.item_id,'createdAt',purchase.created_at,'orderLifecycle',purchase.lifecycle_status,
      'itemSequence',selected.item_sequence,'contact',header.purchase_facts->'contact','purchasedItem',item));
    count_items:=count_items+1;
  end loop;
  if count_items=0 or count_items<>jsonb_array_length(header.purchase_facts->'items')
    or count_items<>(select count(*) from local_commerce.order_items where project_id=p_project_id and order_id=p_order_id and owner_id=p_owner_id) then return null; end if;
  return result;
exception when others then return null;
end; $items$;
revoke all on function local_commerce.fulfillment_purchased_items(text,uuid,uuid) from public,anon,authenticated,service_role;

create function local_commerce.fulfillment_admission(
  p_project_id text,p_marker_digest text,p_actor_kind text,p_actor_id text,
  p_public_reference text,p_operation text,p_order_id uuid,p_expected_version integer,
  p_key_digest text,p_context_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $admission$
declare
  purchase local_commerce.orders%rowtype; aggregate local_commerce.fulfillments%rowtype;
  action local_commerce.fulfillment_decisions%rowtype;
  items jsonb; item jsonb; context_digest text; result jsonb; committed_at timestamptz;
  expected integer; applicable jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_actor_kind is distinct from 'operator' or p_actor_id is null or p_actor_id!~'^[A-Za-z0-9_-]{8,200}$'
    or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$'
    or p_operation is null or p_operation not in ('read','prepare','commit')
    or (p_operation<>'read' and (p_key_digest is null or p_key_digest!~'^[0-9a-f]{64}$'))
    or (p_operation='commit' and (p_order_id is null or p_expected_version is null or p_expected_version<0
      or p_context_digest is null or p_context_digest!~'^[0-9a-f]{64}$')) then
    return jsonb_build_object('status','unavailable'); end if;
  -- Actor is verified afresh by the server BEFORE constructing this restricted
  -- service-role RPC. A customer capability is neither accepted nor required.
  if p_operation='commit' then
    select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference and id=p_order_id for update;
  else
    select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference;
  end if;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into aggregate from local_commerce.fulfillments where project_id=p_project_id and order_id=purchase.id and owner_id=purchase.owner_id;
  if p_operation='read' then
    if aggregate.id is null then return jsonb_build_object('status','unavailable'); end if;
    return jsonb_build_object('status','found','value',jsonb_build_object('publicReference',purchase.public_reference,
      'version',aggregate.version,'status',aggregate.fulfillment_state,'revisionRequestsUsed',aggregate.revision_requests_used));
  end if;
  -- Equivalent replay does not depend on the old pre-admission state or a
  -- current Catalog/Storage read. No raw authority enters this action binding.
  select * into action from local_commerce.fulfillment_decisions where project_id=p_project_id and action_key=p_key_digest;
  if found then
    if action.order_id<>purchase.id or action.actor_kind<>p_actor_kind or action.actor_id<>p_actor_id
      or action.decision_kind<>'enter_photo_review' or action.result is null
      or (p_operation='commit' and (action.request_digest<>p_context_digest or action.expected_aggregate_version<>p_expected_version)) then
      return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','found','value',jsonb_build_object('replayed',true,'fulfillment',action.result->'fulfillment'));
  end if;
  if purchase.lifecycle_status<>'paid' or purchase.lifecycle<>'active'
    or not exists(select 1 from local_commerce.payment_attempts where project_id=p_project_id
      and order_id=purchase.id and owner_id=purchase.owner_id and outcome='succeeded' and lifecycle='settled') then
    return jsonb_build_object('status','unavailable'); end if;
  items:=local_commerce.fulfillment_purchased_items(p_project_id,purchase.id,purchase.owner_id);
  if items is null then return jsonb_build_object('status','unavailable'); end if;
  expected:=coalesce(aggregate.version,0);
  context_digest:=encode(sha256(convert_to(jsonb_build_array(p_project_id,purchase.id,purchase.owner_id,
    p_actor_kind,p_actor_id,'enter_photo_review',expected,items)::text,'UTF8')),'hex');
  if p_operation='prepare' then
    return jsonb_build_object('status','found','value',jsonb_build_object('replayed',false,'orderId',purchase.id,
      'ownerId',purchase.owner_id,'version',expected,'contextDigest',context_digest,'items',items));
  end if;
  if aggregate.id is not null or p_expected_version<>0 or context_digest<>p_context_digest then
    return jsonb_build_object('status','conflict'); end if;
  committed_at:=clock_timestamp();
  insert into local_commerce.fulfillments(project_id,order_id,owner_id,fulfillment_state,created_at,updated_at)
    values(p_project_id,purchase.id,purchase.owner_id,'photo_review',committed_at,committed_at) returning * into aggregate;
  applicable:='[]';
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_array_length(item#>'{purchasedItem,media}')>0 then
      insert into local_commerce.photo_reviews(project_id,fulfillment_id,order_item_id,order_id,owner_id,review_state,created_at,updated_at)
        values(p_project_id,aggregate.id,(item->>'orderItemId')::uuid,purchase.id,purchase.owner_id,'pending',committed_at,committed_at);
      applicable:=applicable||jsonb_build_array(item->>'orderItemId');
    end if;
  end loop;
  result:=jsonb_build_object('fulfillment',jsonb_build_object('publicReference',purchase.public_reference,
    'version',aggregate.version,'status',aggregate.fulfillment_state,'revisionRequestsUsed',0),
    'audit',jsonb_build_object('actorKind',p_actor_kind,'actorId',p_actor_id,'action','enter_photo_review',
      'orderId',purchase.id,'fulfillmentId',aggregate.id,'applicableItemIds',applicable,'timestamp',committed_at));
  insert into local_commerce.fulfillment_decisions(project_id,fulfillment_id,order_id,owner_id,decision_kind,
    action_key,actor_kind,actor_id,request_digest,expected_aggregate_version,result,created_at,updated_at)
    values(p_project_id,aggregate.id,purchase.id,purchase.owner_id,'enter_photo_review',p_key_digest,p_actor_kind,p_actor_id,
      context_digest,0,result,committed_at,committed_at);
  return jsonb_build_object('status','found','value',jsonb_build_object('replayed',false,'fulfillment',result->'fulfillment'));
exception when unique_violation then return jsonb_build_object('status','conflict');
  when others then return jsonb_build_object('status','unavailable');
end; $admission$;
revoke all on function local_commerce.fulfillment_admission(text,text,text,text,text,text,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function local_commerce.fulfillment_admission(text,text,text,text,text,text,uuid,integer,text,text) to service_role;
notify pgrst,'reload schema';
