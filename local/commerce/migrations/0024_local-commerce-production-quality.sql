-- Task 7.5 candidate. Ledger wrapper owns the transaction.
alter table local_commerce.fulfillment_decisions drop constraint fulfillment_decisions_kind_check;
alter table local_commerce.fulfillment_decisions add constraint fulfillment_decisions_kind_check check
 (decision_kind in ('customer_approve','customer_revision','operator_timeout','enter_photo_review',
 'preview_reserve','preview_ready','preview_publish','start_production','mark_quality_check'));

create function local_commerce.fulfillment_lifecycle_command(
 p_project_id text,p_marker_digest text,p_actor_kind text,p_actor_id text,
 p_public_reference text,p_operation text,p_action text,p_expected_version integer,p_key_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $command$
declare
 purchase local_commerce.orders%rowtype; aggregate local_commerce.fulfillments%rowtype;
 previous local_commerce.fulfillment_decisions%rowtype; manifest local_commerce.preview_manifests%rowtype;
 facts jsonb; applicable jsonb; reviewed jsonb; required jsonb; actual jsonb;
 fingerprint text; result jsonb; stamp timestamptz; approved boolean;
begin
 if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
  or p_actor_kind is distinct from 'operator' or p_actor_id is null or p_actor_id!~'^[A-Za-z0-9_-]{8,200}$'
  or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$'
  or p_operation is null or p_operation not in ('prepare','commit')
  or p_action is null or p_action not in ('start_production','mark_quality_check')
  or p_expected_version is null or p_expected_version<1
  or p_key_digest is null or p_key_digest!~'^[0-9a-f]{64}$' then return jsonb_build_object('status','unavailable');end if;
 select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference for update;
 if not found then return jsonb_build_object('status','unavailable');end if;
 select * into aggregate from local_commerce.fulfillments where project_id=p_project_id and order_id=purchase.id and owner_id=purchase.owner_id;
 if not found then return jsonb_build_object('status','unavailable');end if;
 if p_operation='prepare' then return jsonb_build_object('status','found','value',jsonb_build_object(
  'orderId',purchase.id,'ownerId',purchase.owner_id,'fulfillmentId',aggregate.id));end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_project_id,purchase.id,purchase.owner_id,
  aggregate.id,p_actor_kind,p_actor_id,p_action,p_expected_version)::text,'UTF8')),'hex');
 select * into previous from local_commerce.fulfillment_decisions where project_id=p_project_id and action_key=p_key_digest;
 if found then
  if previous.order_id is distinct from purchase.id or previous.owner_id is distinct from purchase.owner_id
   or previous.fulfillment_id is distinct from aggregate.id or previous.actor_kind is distinct from p_actor_kind
   or previous.actor_id is distinct from p_actor_id or previous.decision_kind is distinct from p_action
   or previous.expected_aggregate_version is distinct from p_expected_version or previous.request_digest is distinct from fingerprint
   or previous.result is null then return jsonb_build_object('status','conflict');end if;
  return jsonb_build_object('status','found','value',previous.result->'value','replayed',true);
 end if;
 if purchase.lifecycle_status<>'paid' or purchase.lifecycle<>'active' or aggregate.lifecycle<>'active'
  or not exists(select 1 from local_commerce.payment_attempts where project_id=p_project_id and order_id=purchase.id
   and owner_id=purchase.owner_id and outcome='succeeded' and lifecycle='settled') then return jsonb_build_object('status','unavailable');end if;
 if aggregate.version<>p_expected_version then return jsonb_build_object('status','conflict');end if;
 facts:=local_commerce.fulfillment_purchased_items(p_project_id,purchase.id,purchase.owner_id);
 if facts is null then return jsonb_build_object('status','unavailable');end if;
 select coalesce(jsonb_agg(x->>'orderItemId' order by x->>'orderItemId'),'[]') into applicable
  from jsonb_array_elements(facts) x where jsonb_array_length(x#>'{purchasedItem,media}')>0;
 select coalesce(jsonb_agg(order_item_id::text order by order_item_id::text),'[]') into reviewed
  from local_commerce.photo_reviews where project_id=p_project_id and order_id=purchase.id and owner_id=purchase.owner_id
   and fulfillment_id=aggregate.id and lifecycle='active' and review_state='approved';
 if applicable is distinct from reviewed or jsonb_array_length(applicable)<>(select count(*) from local_commerce.photo_reviews
  where project_id=p_project_id and order_id=purchase.id and fulfillment_id=aggregate.id) then return jsonb_build_object('status','conflict');end if;
 select coalesce(jsonb_agg(x->>'orderItemId' order by x->>'orderItemId'),'[]') into required
  from jsonb_array_elements(facts) x where x#>'{purchasedItem,fulfillment,requiresProductionPreview}'='true'::jsonb;
 if jsonb_array_length(required)>0 then
  select * into manifest from local_commerce.preview_manifests where project_id=p_project_id and id=aggregate.current_manifest_id
   and owner_id=purchase.owner_id and order_id=purchase.id and fulfillment_id=aggregate.id;
  if not found or manifest.item_ids is distinct from required then return jsonb_build_object('status','conflict');end if;
  select coalesce(jsonb_agg(e.order_item_id::text order by e.order_item_id::text),'[]') into actual
   from local_commerce.preview_manifest_entries e join local_commerce.fulfillment_preview_media m
    on m.project_id=e.project_id and m.id=e.preview_media_id and m.order_id=e.order_id and m.owner_id=e.owner_id
    and m.fulfillment_id=e.fulfillment_id and m.order_item_id=e.order_item_id and m.manifest_version=e.manifest_version
    and m.lifecycle='ready'
   where e.project_id=p_project_id and e.manifest_id=manifest.id;
  select exists(select 1 from local_commerce.fulfillment_decisions d where d.project_id=p_project_id
   and d.order_id=purchase.id and d.owner_id=purchase.owner_id and d.fulfillment_id=aggregate.id and d.decision_kind='customer_approve'
   and d.expected_manifest_version=manifest.manifest_version and d.result#>>'{value,manifestId}'=manifest.id::text) into approved;
  if actual is distinct from required or not approved then return jsonb_build_object('status','conflict');end if;
 end if;
 if (p_action='start_production' and aggregate.fulfillment_state is distinct from
    case when jsonb_array_length(required)=0 then 'photo_review' else 'preview_approved' end)
  or (p_action='mark_quality_check' and aggregate.fulfillment_state<>'in_production')
  then return jsonb_build_object('status','conflict');end if;
 stamp:=clock_timestamp();
 update local_commerce.fulfillments set fulfillment_state=case when p_action='start_production' then 'in_production' else 'quality_check' end,
  version=version+1,updated_at=stamp where project_id=p_project_id and id=aggregate.id returning * into aggregate;
 result:=jsonb_build_object('value',jsonb_build_object('publicReference',purchase.public_reference,'version',aggregate.version,
  'status',aggregate.fulfillment_state,'revisionRequestsUsed',aggregate.revision_requests_used),
  'audit',jsonb_build_object('actorKind',p_actor_kind,'actorId',p_actor_id,'action',p_action,'timestamp',stamp,
   'manifestId',manifest.id,'previewRequired',jsonb_array_length(required)>0,'reviewedItemIds',applicable));
 insert into local_commerce.fulfillment_decisions(project_id,fulfillment_id,order_id,owner_id,decision_kind,action_key,
  actor_kind,actor_id,request_digest,expected_aggregate_version,result,created_at,updated_at)
 values(p_project_id,aggregate.id,purchase.id,purchase.owner_id,p_action,p_key_digest,p_actor_kind,p_actor_id,
  fingerprint,p_expected_version,result,stamp,stamp);
 return jsonb_build_object('status','found','value',result->'value','replayed',false);
exception when unique_violation or deadlock_detected then return jsonb_build_object('status','conflict');
 when others then return jsonb_build_object('status','unavailable');
end;$command$;
revoke all on function local_commerce.fulfillment_lifecycle_command(text,text,text,text,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function local_commerce.fulfillment_lifecycle_command(text,text,text,text,text,text,text,integer,text) to service_role;
notify pgrst,'reload schema';
