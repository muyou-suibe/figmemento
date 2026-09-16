-- Task 7.7: real persistent photo-review decisions. Ledger wrapper owns the transaction.
alter table local_commerce.fulfillment_decisions drop constraint fulfillment_decisions_kind_check;
alter table local_commerce.fulfillment_decisions add constraint fulfillment_decisions_kind_check check
 (decision_kind in ('customer_approve','customer_revision','operator_timeout','enter_photo_review',
 'preview_reserve','preview_ready','preview_publish','start_production','mark_quality_check',
 'approve_photo_review','reject_photo_review'));

create function local_commerce.fulfillment_photo_review_command(
 p_project_id text,p_marker_digest text,p_actor_kind text,p_actor_id text,
 p_public_reference text,p_operation text,p_action text,p_expected_version integer,
 p_key_digest text,p_order_item_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $command$
declare
 purchase local_commerce.orders%rowtype; aggregate local_commerce.fulfillments%rowtype;
 review local_commerce.photo_reviews%rowtype; previous local_commerce.fulfillment_decisions%rowtype;
 facts jsonb; item jsonb; fingerprint text; result jsonb; stamp timestamptz;
begin
 if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
  or p_actor_kind is distinct from 'operator' or p_actor_id is null or p_actor_id!~'^[A-Za-z0-9_-]{8,200}$'
  or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$'
  or p_operation is null or p_operation not in ('prepare','commit')
  or p_action is null or p_action not in ('approve_photo_review','reject_photo_review')
  or p_expected_version is null or p_expected_version<1
  or p_key_digest is null or p_key_digest!~'^[0-9a-f]{64}$'
  or p_order_item_id is null then return jsonb_build_object('status','unavailable');end if;
 select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference for update;
 if not found then return jsonb_build_object('status','unavailable');end if;
 select * into aggregate from local_commerce.fulfillments where project_id=p_project_id and order_id=purchase.id
  and owner_id=purchase.owner_id for update;
 if not found then return jsonb_build_object('status','unavailable');end if;
 if p_operation='prepare' then return jsonb_build_object('status','found','value',jsonb_build_object(
  'orderId',purchase.id,'ownerId',purchase.owner_id,'fulfillmentId',aggregate.id));end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_project_id,purchase.id,purchase.owner_id,
  aggregate.id,p_actor_kind,p_actor_id,p_action,p_expected_version,p_order_item_id)::text,'UTF8')),'hex');
 select * into previous from local_commerce.fulfillment_decisions where project_id=p_project_id and action_key=p_key_digest;
 if found then
  if previous.order_id is distinct from purchase.id or previous.owner_id is distinct from purchase.owner_id
   or previous.fulfillment_id is distinct from aggregate.id or previous.actor_kind is distinct from p_actor_kind
   or previous.actor_id is distinct from p_actor_id or previous.decision_kind is distinct from p_action
   or previous.expected_aggregate_version is distinct from p_expected_version
   or previous.request_digest is distinct from fingerprint or previous.result is null
   then return jsonb_build_object('status','conflict');end if;
  return jsonb_build_object('status','found','value',previous.result->'value','replayed',true);
 end if;
 if purchase.lifecycle_status<>'paid' or purchase.lifecycle<>'active' or aggregate.lifecycle<>'active'
  or aggregate.fulfillment_state<>'photo_review'
  or not exists(select 1 from local_commerce.payment_attempts where project_id=p_project_id and order_id=purchase.id
   and owner_id=purchase.owner_id and outcome='succeeded' and lifecycle='settled')
  then return jsonb_build_object('status','unavailable');end if;
 if aggregate.version<>p_expected_version then return jsonb_build_object('status','conflict');end if;
 facts:=local_commerce.fulfillment_purchased_items(p_project_id,purchase.id,purchase.owner_id);
 if facts is null then return jsonb_build_object('status','unavailable');end if;
 select value into item from jsonb_array_elements(facts) where value->>'orderItemId'=p_order_item_id::text;
 if item is null or jsonb_typeof(item#>'{purchasedItem,media}') is distinct from 'array'
  or jsonb_array_length(item#>'{purchasedItem,media}')=0 then return jsonb_build_object('status','conflict');end if;
 -- The immutable purchased media must still resolve to exact committed receipt bindings.
 if exists(select 1 from jsonb_array_elements(item#>'{purchasedItem,media}') media
   where jsonb_typeof(media) is distinct from 'object' or media->>'receiptId' is null
   or not exists(select 1 from local_commerce.order_item_receipt_bindings b
    join local_commerce.media_receipts r on r.project_id=b.project_id and r.id=b.receipt_id and r.owner_id=b.owner_id
    join local_commerce.media_objects o on o.project_id=r.project_id and o.id=r.media_object_id and o.owner_id=r.owner_id
    where b.project_id=p_project_id and b.order_item_id=p_order_item_id and b.owner_id=purchase.owner_id
     and r.receipt_reference::text=media->>'receiptId' and r.receipt_status='ready' and r.lifecycle='active'
     and o.object_status='ready' and o.lifecycle='active')) then return jsonb_build_object('status','conflict');end if;
 select * into review from local_commerce.photo_reviews where project_id=p_project_id and fulfillment_id=aggregate.id
  and order_id=purchase.id and owner_id=purchase.owner_id and order_item_id=p_order_item_id and lifecycle='active' for update;
 if not found or review.review_state<>'pending' then return jsonb_build_object('status','conflict');end if;
 stamp:=clock_timestamp();
 update local_commerce.photo_reviews set review_state=case when p_action='approve_photo_review' then 'approved' else 'rejected' end,
  version=version+1,updated_at=stamp where project_id=p_project_id and id=review.id returning * into review;
 update local_commerce.fulfillments set version=version+1,updated_at=stamp where project_id=p_project_id and id=aggregate.id returning * into aggregate;
 result:=jsonb_build_object('value',jsonb_build_object('publicReference',purchase.public_reference,'version',aggregate.version,
  'status',aggregate.fulfillment_state,'revisionRequestsUsed',aggregate.revision_requests_used,
  'photoReview',jsonb_build_object('orderItemId',review.order_item_id,'status',review.review_state,
   'version',review.version,'decidedAt',stamp,'actorId',p_actor_id)),
  'audit',jsonb_build_object('actorKind',p_actor_kind,'actorId',p_actor_id,'action',p_action,
   'orderItemId',review.order_item_id,'reviewVersion',review.version,'timestamp',stamp));
 insert into local_commerce.fulfillment_decisions(project_id,fulfillment_id,order_id,owner_id,decision_kind,action_key,
  actor_kind,actor_id,request_digest,expected_aggregate_version,result,created_at,updated_at)
 values(p_project_id,aggregate.id,purchase.id,purchase.owner_id,p_action,p_key_digest,p_actor_kind,p_actor_id,
  fingerprint,p_expected_version,result,stamp,stamp);
 return jsonb_build_object('status','found','value',result->'value','replayed',false);
exception when unique_violation or deadlock_detected then return jsonb_build_object('status','conflict');
 when others then return jsonb_build_object('status','unavailable');
end;$command$;
revoke all on function local_commerce.fulfillment_photo_review_command(text,text,text,text,text,text,text,integer,text,uuid)
 from public,anon,authenticated;
grant execute on function local_commerce.fulfillment_photo_review_command(text,text,text,text,text,text,text,integer,text,uuid)
 to service_role;
notify pgrst,'reload schema';
