-- Task 7.4 forward fix: read/prepare retain the existing authorized shared lock.
-- Only mutations upgrade the canonical Order lock; no new auth or replay policy.
create or replace function local_commerce.fulfillment_customer_command(
 p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
 p_customer_id uuid,p_session_hash text,p_authority_expires_at timestamptz,
 p_capability_hash text,p_public_reference text,p_operation text,p_key_digest text,
 p_expected_preview_version integer,p_note text,p_expected_aggregate_version integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $customer$
declare
 authorized jsonb; purchase local_commerce.orders%rowtype; aggregate local_commerce.fulfillments%rowtype;
 manifest local_commerce.preview_manifests%rowtype; previous local_commerce.fulfillment_decisions%rowtype;
 facts jsonb; required jsonb; actual jsonb; entries jsonb; request_digest text; actor text; kind text;
 result jsonb; stamp timestamptz; units integer; normalized text;
begin
 authorized:=local_commerce.read_order_history(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,
   p_customer_id,p_session_hash,p_authority_expires_at,p_capability_hash,null,p_public_reference,null,'customer_summary');
 if authorized->>'status' is distinct from 'found' then return jsonb_build_object('status','unavailable');end if;
 if p_operation is null or p_operation not in ('read','prepare','approve_preview','request_revision') then
   return jsonb_build_object('status','unavailable');end if;
 -- The existing history read holds fresh owner/account/session locks. Order
 -- lock serializes this command with publication, payment and other decisions.
 if p_operation in ('read','prepare') then
   select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference;
 else
   select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference for update;
 end if;
 select * into aggregate from local_commerce.fulfillments where project_id=p_project_id and order_id=purchase.id and owner_id=purchase.owner_id;
 if not found then return jsonb_build_object('status','unavailable');end if;
 if p_operation='prepare' then
   -- Server-only identity projection, after the exact existing customer read.
   -- No lifecycle eligibility or committed result is inferred at this stage.
   return jsonb_build_object('status','found','value',jsonb_build_object(
     'orderId',purchase.id,'ownerId',purchase.owner_id,'fulfillmentId',aggregate.id));
 end if;
 if p_operation<>'read' then
   if p_key_digest is null or p_key_digest !~ '^[0-9a-f]{64}$' or p_expected_preview_version is null
     or p_expected_preview_version not between 1 and 3 then return jsonb_build_object('status','unavailable');end if;
   -- Input is already normalized by the existing JavaScript validator. Match
   -- its trim set and UTF-16 code-unit length, not UTF-8 bytes or graphemes.
   normalized:=btrim(p_note,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
   if p_operation='request_revision' then
     select coalesce(sum(case when ascii(substr(normalized,i,1))>65535 then 2 else 1 end),0) into units
       from generate_series(1,char_length(normalized)) i;
     if p_note is null or normalized is distinct from p_note or units<1 or units>500 then
       return jsonb_build_object('status','unavailable');end if;
   elsif p_note is distinct from '' then return jsonb_build_object('status','unavailable');end if;
   actor:=encode(sha256(convert_to(jsonb_build_array(purchase.owner_id,p_owner_kind,p_customer_id,p_capability_hash)::text,'UTF8')),'hex');
   kind:=case when p_operation='approve_preview' then 'customer_approve' else 'customer_revision' end;
   -- Historical manifest identity is derived from the same Order and selector,
   -- not from the current pointer: exact old commits remain replayable.
   select * into manifest from local_commerce.preview_manifests where project_id=p_project_id
     and order_id=purchase.id and owner_id=purchase.owner_id and fulfillment_id=aggregate.id
     and manifest_version=p_expected_preview_version;
   request_digest:=encode(sha256(convert_to(jsonb_build_array(p_project_id,purchase.id,purchase.owner_id,
     aggregate.id,actor,kind,manifest.id,p_expected_preview_version,p_expected_aggregate_version,p_note)::text,'UTF8')),'hex');
   select * into previous from local_commerce.fulfillment_decisions where project_id=p_project_id and action_key=p_key_digest;
   if found then
     if previous.order_id is distinct from purchase.id or previous.owner_id is distinct from purchase.owner_id
       or previous.actor_kind is distinct from 'customer' or previous.actor_id is distinct from actor
       or previous.decision_kind is distinct from kind or previous.request_digest is distinct from request_digest
       or previous.expected_aggregate_version is distinct from p_expected_aggregate_version
       or previous.result is null then return jsonb_build_object('status','conflict');end if;
     return jsonb_build_object('status','found','value',previous.result->'value','replayed',true);
   end if;
 end if;
 if purchase.lifecycle_status<>'paid' or purchase.lifecycle<>'active' or aggregate.lifecycle<>'active'
   or not exists(select 1 from local_commerce.payment_attempts where project_id=p_project_id
     and order_id=purchase.id and owner_id=purchase.owner_id and outcome='succeeded' and lifecycle='settled')
   then return jsonb_build_object('status','unavailable');end if;
 select * into manifest from local_commerce.preview_manifests where project_id=p_project_id
   and id=aggregate.current_manifest_id and fulfillment_id=aggregate.id and order_id=purchase.id and owner_id=purchase.owner_id;
 if not found then return jsonb_build_object('status','unavailable');end if;
 facts:=local_commerce.fulfillment_purchased_items(p_project_id,purchase.id,purchase.owner_id);
 select jsonb_agg(x->>'orderItemId' order by x->>'orderItemId') into required from jsonb_array_elements(facts) x
   where x#>'{purchasedItem,fulfillment,requiresProductionPreview}'='true'::jsonb;
 select jsonb_agg(e.order_item_id::text order by e.order_item_id::text),jsonb_agg(jsonb_build_object(
   'previewMediaId',m.id,'contentType',m.content_type,'width',m.width,'height',m.height) order by e.order_item_id)
   into actual,entries from local_commerce.preview_manifest_entries e join local_commerce.fulfillment_preview_media m
   on m.project_id=e.project_id and m.id=e.preview_media_id and m.owner_id=e.owner_id and m.order_id=e.order_id
     and m.fulfillment_id=e.fulfillment_id and m.order_item_id=e.order_item_id and m.manifest_version=e.manifest_version and m.lifecycle='ready'
   where e.project_id=p_project_id and e.manifest_id=manifest.id;
 if required is null or required is distinct from actual or required is distinct from manifest.item_ids then
   return jsonb_build_object('status','unavailable');end if;
 if p_operation<>'read' then
   if p_expected_aggregate_version is null or aggregate.version<>p_expected_aggregate_version
     or aggregate.fulfillment_state<>'preview_pending' or manifest.manifest_version<>p_expected_preview_version
     or (p_operation='request_revision' and aggregate.revision_requests_used>=2) then return jsonb_build_object('status','conflict');end if;
   stamp:=clock_timestamp();
   update local_commerce.fulfillments set fulfillment_state=case when p_operation='approve_preview' then 'preview_approved' else 'preview_revision_requested' end,
     revision_requests_used=revision_requests_used+case when p_operation='request_revision' then 1 else 0 end,
     version=version+1,updated_at=stamp where project_id=p_project_id and id=aggregate.id returning * into aggregate;
 end if;
 result:=jsonb_build_object('publicReference',purchase.public_reference,'status',aggregate.fulfillment_state,
   'version',aggregate.version,'manifestId',manifest.id,'manifestVersion',manifest.manifest_version,
   'revisionRequestsUsed',aggregate.revision_requests_used,'entries',entries);
 if p_operation<>'read' then
   insert into local_commerce.fulfillment_decisions(project_id,fulfillment_id,order_id,owner_id,decision_kind,
     expected_manifest_version,action_key,note,actor_kind,actor_id,request_digest,expected_aggregate_version,result,created_at,updated_at)
   values(p_project_id,aggregate.id,purchase.id,purchase.owner_id,kind,p_expected_preview_version,p_key_digest,p_note,
     'customer',actor,request_digest,aggregate.version-1,jsonb_build_object('value',result,'audit',jsonb_build_object(
       'manifestId',manifest.id,'actorKind','customer','action',kind,'timestamp',stamp)),stamp,stamp);
 end if;
 return jsonb_build_object('status','found','value',result,'replayed',false);
exception when unique_violation or deadlock_detected then return jsonb_build_object('status','conflict');
 when others then return jsonb_build_object('status','unavailable');
end;$customer$;
revoke all on function local_commerce.fulfillment_customer_command(text,text,text,text,uuid,text,timestamptz,text,text,text,text,integer,text,integer) from public,anon,authenticated;
grant execute on function local_commerce.fulfillment_customer_command(text,text,text,text,uuid,text,timestamptz,text,text,text,text,integer,text,integer) to service_role;
