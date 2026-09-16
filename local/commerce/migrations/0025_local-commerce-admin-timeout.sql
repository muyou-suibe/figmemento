-- Task 7.6 candidate. Owner-approved 500 UTF-16 units / 72 hours.
-- No historical backfill. The ledger wrapper owns BEGIN/COMMIT.
alter table local_commerce.preview_manifests add column approval_deadline_at timestamptz;
create function local_commerce.set_preview_approval_deadline() returns trigger
language plpgsql set search_path=pg_catalog,local_commerce as $deadline$
begin
 if tg_op='INSERT' then
  new.approval_deadline_at:=new.published_at+interval '259200 seconds';
 elsif new.approval_deadline_at is distinct from old.approval_deadline_at then
  raise exception 'immutable preview deadline';
 end if;
 return new;
end;$deadline$;
revoke all on function local_commerce.set_preview_approval_deadline() from public,anon,authenticated,service_role;
create trigger preview_approval_deadline before insert or update on local_commerce.preview_manifests
 for each row execute function local_commerce.set_preview_approval_deadline();

-- Internal DB clock: never an HTTP/RPC argument or environment override.
create function local_commerce.fulfillment_timeout_now(p_project_id text,p_order_id uuid,p_manifest_id uuid)
returns timestamptz language sql volatile set search_path=pg_catalog as $clock$ select clock_timestamp(); $clock$;
revoke all on function local_commerce.fulfillment_timeout_now(text,uuid,uuid) from public,anon,authenticated,service_role;

create function local_commerce.fulfillment_admin_timeout_command(
 p_project_id text,p_marker_digest text,p_actor_kind text,p_actor_id text,
 p_public_reference text,p_operation text,p_action text,p_expected_version integer,p_key_digest text,
 p_manifest_id uuid,p_manifest_version integer,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $command$
declare
 purchase local_commerce.orders%rowtype; aggregate local_commerce.fulfillments%rowtype;
 previous local_commerce.fulfillment_decisions%rowtype; manifest local_commerce.preview_manifests%rowtype;
 facts jsonb; applicable jsonb; reviewed jsonb; required jsonb; actual jsonb;
 fingerprint text; result jsonb; stamp timestamptz; approved boolean; normalized text; units integer;
begin
 if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
  or p_actor_kind is distinct from 'admin' or p_actor_id is distinct from 'configured-admin'
  or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$'
  or p_operation is null or p_operation not in ('prepare','commit')
  or p_action is null or p_action <> 'operator_timeout'
  or p_expected_version is null or p_expected_version<1
  or p_manifest_id is null or p_manifest_version is null or p_manifest_version not between 1 and 3
  or p_key_digest is null or p_key_digest!~'^[0-9a-f]{64}$' then return jsonb_build_object('status','unavailable');end if;
 select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference for update;
 if not found then return jsonb_build_object('status','unavailable');end if;
 select * into aggregate from local_commerce.fulfillments where project_id=p_project_id and order_id=purchase.id and owner_id=purchase.owner_id;
 if not found then return jsonb_build_object('status','unavailable');end if;
 if p_operation='prepare' then return jsonb_build_object('status','found','value',jsonb_build_object(
  'orderId',purchase.id,'ownerId',purchase.owner_id,'fulfillmentId',aggregate.id));end if;
 normalized:=btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 select coalesce(sum(case when ascii(substr(normalized,i,1))>65535 then 2 else 1 end),0) into units
  from generate_series(1,char_length(normalized)) i;
 if p_reason is null or normalized is distinct from p_reason or units<1 or units>500 then return jsonb_build_object('status','unavailable');end if;
 -- Historical exact context is stable for committed replays after production.
 select * into manifest from local_commerce.preview_manifests where project_id=p_project_id
  and id=p_manifest_id and manifest_version=p_manifest_version and order_id=purchase.id
  and owner_id=purchase.owner_id and fulfillment_id=aggregate.id;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_project_id,purchase.id,purchase.owner_id,
  aggregate.id,p_actor_kind,p_actor_id,p_action,p_expected_version,p_manifest_id,p_manifest_version,p_reason,manifest.approval_deadline_at)::text,'UTF8')),'hex');
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
  if actual is distinct from required then return jsonb_build_object('status','conflict');end if;
 else return jsonb_build_object('status','conflict');end if;
 if aggregate.fulfillment_state<>'preview_pending' or manifest.id is distinct from p_manifest_id
  or manifest.manifest_version is distinct from p_manifest_version
  or manifest.approval_deadline_at is null then return jsonb_build_object('status','conflict');end if;
 stamp:=local_commerce.fulfillment_timeout_now(p_project_id,purchase.id,manifest.id);
 if stamp<manifest.approval_deadline_at then return jsonb_build_object('status','conflict');end if;
 update local_commerce.fulfillments set fulfillment_state='preview_approved',
  version=version+1,updated_at=stamp where project_id=p_project_id and id=aggregate.id returning * into aggregate;
 result:=jsonb_build_object('value',jsonb_build_object('publicReference',purchase.public_reference,'version',aggregate.version,
  'status',aggregate.fulfillment_state,'revisionRequestsUsed',aggregate.revision_requests_used,
  'decisionKind','operator_timeout','manifestId',manifest.id,'manifestVersion',manifest.manifest_version,
  'reason',p_reason,'actorId',p_actor_id,'confirmedAt',stamp,'approvalDeadlineAt',manifest.approval_deadline_at),
  'audit',jsonb_build_object('actorKind',p_actor_kind,'actorId',p_actor_id,'action',p_action,'timestamp',stamp,
   'manifestId',manifest.id,'approvalDeadlineAt',manifest.approval_deadline_at,'reason',p_reason,'previewRequired',jsonb_array_length(required)>0,'reviewedItemIds',applicable));
 insert into local_commerce.fulfillment_decisions(project_id,fulfillment_id,order_id,owner_id,decision_kind,action_key,
  actor_kind,actor_id,request_digest,expected_aggregate_version,expected_manifest_version,note,result,created_at,updated_at)
 values(p_project_id,aggregate.id,purchase.id,purchase.owner_id,p_action,p_key_digest,p_actor_kind,p_actor_id,
  fingerprint,p_expected_version,p_manifest_version,p_reason,result,stamp,stamp);
 return jsonb_build_object('status','found','value',result->'value','replayed',false);
exception when unique_violation or deadlock_detected then return jsonb_build_object('status','conflict');
 when others then return jsonb_build_object('status','unavailable');
end;$command$;
revoke all on function local_commerce.fulfillment_admin_timeout_command(text,text,text,text,text,text,text,integer,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function local_commerce.fulfillment_admin_timeout_command(text,text,text,text,text,text,text,integer,text,uuid,integer,text) to service_role;

create or replace function local_commerce.fulfillment_lifecycle_command(
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
   and d.order_id=purchase.id and d.owner_id=purchase.owner_id and d.fulfillment_id=aggregate.id and (d.decision_kind='customer_approve' or (d.decision_kind='operator_timeout' and d.actor_kind='admin'
    and d.actor_id='configured-admin' and manifest.approval_deadline_at is not null
    and (d.result#>>'{value,approvalDeadlineAt}')::timestamptz=manifest.approval_deadline_at
    and (d.result#>>'{value,confirmedAt}')::timestamptz>=manifest.approval_deadline_at))
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

