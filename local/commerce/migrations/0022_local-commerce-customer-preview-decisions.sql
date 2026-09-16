-- Task 7.3 candidate. Unregistered/unapplied until full rollback acceptance.
-- Existing customer authorization is evaluated inside this transaction before
-- any decision replay/current-preview disclosure. No new credential protocol.
create function local_commerce.fulfillment_customer_command(
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
 select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference for update;
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
create or replace function local_commerce.fulfillment_preview_command(
 p_project_id text,p_marker_digest text,p_actor_kind text,p_actor_id text,
 p_public_reference text,p_operation text,p_fulfillment_id uuid,
 p_expected_version integer,p_key_digest text,p_input jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $command$
declare
 purchase local_commerce.orders%rowtype; aggregate local_commerce.fulfillments%rowtype;
 previous local_commerce.fulfillment_decisions%rowtype; media local_commerce.fulfillment_preview_media%rowtype;
 manifest local_commerce.preview_manifests%rowtype; facts jsonb; required jsonb; applicable jsonb;
 request_digest text; result jsonb; safe_media jsonb; selected jsonb; actual jsonb;
 item_id uuid; media_id uuid; stamp timestamptz; kind text; operation text; probe boolean; target_version integer; current_version integer;
begin
 if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
   or p_actor_kind is distinct from 'operator' or p_actor_id is null or p_actor_id !~ '^[A-Za-z0-9_-]{8,200}$'
   or p_public_reference is null or p_public_reference !~ '^FM-LOCAL-[A-Z0-9]{16}$'
   or p_operation is null or p_operation not in ('read','acquire','reserve','ready','publish','probe_reserve','probe_ready','probe_publish')
   or jsonb_typeof(p_input) is distinct from 'object' then return jsonb_build_object('status','unavailable');end if;
 operation:=replace(p_operation,'probe_','');probe:=p_operation like 'probe_%';
 if p_operation not in ('read','acquire') and (p_fulfillment_id is null or p_expected_version is null or p_expected_version<1
   or p_key_digest is null or p_key_digest !~ '^[0-9a-f]{64}$') then return jsonb_build_object('status','unavailable');end if;
 -- Serializing on canonical Order also orders readiness/publication across
 -- independent workers. No application Map or DB/Storage transaction fiction.
 select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference for update;
 if not found then return jsonb_build_object('status','unavailable');end if;
 select * into aggregate from local_commerce.fulfillments where project_id=p_project_id and order_id=purchase.id and owner_id=purchase.owner_id;
 if not found then return jsonb_build_object('status','unavailable');end if;
 select manifest_version into current_version from local_commerce.preview_manifests where project_id=p_project_id and id=aggregate.current_manifest_id;
 target_version:=case when aggregate.fulfillment_state='photo_review' and aggregate.current_manifest_id is null and aggregate.revision_requests_used=0 then 1
 when aggregate.fulfillment_state='preview_revision_requested' and current_version=aggregate.revision_requests_used and current_version between 1 and 2 then current_version+1 else null end;
 kind:='preview_'||operation;
 request_digest:=encode(sha256(convert_to(jsonb_build_array(p_project_id,purchase.id,purchase.owner_id,
   p_fulfillment_id,p_actor_kind,p_actor_id,kind,p_expected_version,p_input)::text,'UTF8')),'hex');
 if p_operation not in ('read','acquire') then
   select * into previous from local_commerce.fulfillment_decisions where project_id=p_project_id and action_key=p_key_digest;
   if found then
     if previous.order_id is distinct from purchase.id or previous.fulfillment_id is distinct from p_fulfillment_id
       or previous.actor_kind is distinct from p_actor_kind or previous.actor_id is distinct from p_actor_id
       or previous.decision_kind is distinct from kind or previous.request_digest is distinct from request_digest
       or previous.result is null then return jsonb_build_object('status','conflict');end if;
     return jsonb_build_object('status','found','value',previous.result->'value','replayed',true);
   end if;
   if probe then return jsonb_build_object('status','not_found');end if;
 end if;
 if p_operation='acquire' then
   if p_input-array['previewMediaId']<>'{}'::jsonb or p_input->>'previewMediaId' is null
     or p_fulfillment_id is distinct from aggregate.id then return jsonb_build_object('status','unavailable');end if;
   select * into media from local_commerce.fulfillment_preview_media where project_id=p_project_id
     and id=(p_input->>'previewMediaId')::uuid and owner_id=purchase.owner_id and order_id=purchase.id and fulfillment_id=aggregate.id;
   if not found then return jsonb_build_object('status','unavailable');end if;
   return jsonb_build_object('status','found','value',to_jsonb(media)-array['action_key','actor_id','input_digest']);
 end if;
 facts:=local_commerce.fulfillment_purchased_items(p_project_id,purchase.id,purchase.owner_id);
 if facts is null then return jsonb_build_object('status','unavailable');end if;
 select jsonb_agg(x->>'orderItemId' order by x->>'orderItemId') into required from jsonb_array_elements(facts) x
   where x#>'{purchasedItem,fulfillment,requiresProductionPreview}'='true'::jsonb;
 if p_operation='read' then
   if p_input<>'{}'::jsonb then return jsonb_build_object('status','unavailable');end if;
   -- Internal context only; never forward this result to a customer response.
   return jsonb_build_object('status','found','value',jsonb_build_object('orderId',purchase.id,'ownerId',purchase.owner_id,
     'fulfillmentId',aggregate.id,'version',aggregate.version,'items',facts,'currentManifestId',aggregate.current_manifest_id,'targetManifestVersion',target_version));
 end if;
 if aggregate.id<>p_fulfillment_id then return jsonb_build_object('status','unavailable');end if;
 if aggregate.version<>p_expected_version then return jsonb_build_object('status','conflict');end if;
 if purchase.lifecycle_status<>'paid' or purchase.lifecycle<>'active'
   or not exists(select 1 from local_commerce.payment_attempts where project_id=p_project_id and order_id=purchase.id
      and owner_id=purchase.owner_id and outcome='succeeded' and lifecycle='settled')
   or target_version is null or required is null then return jsonb_build_object('status','unavailable');end if;
 stamp:=clock_timestamp();
 if p_operation='reserve' then
   if p_input-array['orderItemId','inputDigest']<>'{}'::jsonb
     or p_input->>'inputDigest' is null or p_input->>'inputDigest' !~ '^[0-9a-f]{64}$'
     or not (required ? (p_input->>'orderItemId')) then return jsonb_build_object('status','unavailable');end if;
   item_id:=(p_input->>'orderItemId')::uuid;media_id:=gen_random_uuid();
   insert into local_commerce.fulfillment_preview_media(project_id,id,owner_id,order_id,fulfillment_id,order_item_id,
     manifest_version,action_key,actor_id,input_digest,object_locator,created_at,updated_at)
   values(p_project_id,media_id,purchase.owner_id,purchase.id,aggregate.id,item_id,target_version,p_key_digest,p_actor_id,
     p_input->>'inputDigest','production-preview/'||purchase.id::text||'/'||media_id::text||'.png',stamp,stamp) returning * into media;
   result:=jsonb_build_object('previewMediaId',media.id,'orderItemId',media.order_item_id,'manifestVersion',target_version,'state','pending');
 elsif p_operation='ready' then
   if p_input-array['previewMediaId','contentDigest','contentType','byteSize','width','height']<>'{}'::jsonb
     or p_input->>'previewMediaId' is null then return jsonb_build_object('status','unavailable');end if;
   select * into media from local_commerce.fulfillment_preview_media where project_id=p_project_id
     and id=(p_input->>'previewMediaId')::uuid and owner_id=purchase.owner_id and order_id=purchase.id
     and fulfillment_id=aggregate.id and actor_id=p_actor_id and manifest_version=target_version;
   if not found or not(required ? media.order_item_id::text) then return jsonb_build_object('status','unavailable');end if;
   if media.lifecycle<>'pending' then return jsonb_build_object('status','conflict');end if;
   update local_commerce.fulfillment_preview_media set lifecycle='ready',version=version+1,updated_at=stamp,
     content_digest=p_input->>'contentDigest',content_type=p_input->>'contentType',byte_size=(p_input->>'byteSize')::integer,
     width=(p_input->>'width')::integer,height=(p_input->>'height')::integer
     where project_id=p_project_id and id=media.id returning * into media;
   result:=jsonb_build_object('previewMediaId',media.id,'orderItemId',media.order_item_id,'manifestVersion',target_version,'state','ready',
     'contentType',media.content_type,'width',media.width,'height',media.height);
 else
   if p_input-array['entries']<>'{}'::jsonb or jsonb_typeof(p_input->'entries') is distinct from 'array'
     or jsonb_array_length(p_input->'entries')<>jsonb_array_length(required) then return jsonb_build_object('status','unavailable');end if;
   select jsonb_agg(x->>'orderItemId' order by x->>'orderItemId') into actual from jsonb_array_elements(p_input->'entries') x;
   if actual is distinct from required then return jsonb_build_object('status','unavailable');end if;
   -- Exact review set, no default approval, no missing applicable row.
   select jsonb_agg(x->>'orderItemId' order by x->>'orderItemId') into applicable from jsonb_array_elements(facts) x
     where jsonb_array_length(x#>'{purchasedItem,media}')>0;
   select jsonb_agg(order_item_id::text order by order_item_id::text) into actual from local_commerce.photo_reviews
     where project_id=p_project_id and fulfillment_id=aggregate.id and order_id=purchase.id and owner_id=purchase.owner_id;
   if actual is distinct from applicable or exists(select 1 from local_commerce.photo_reviews
     where project_id=p_project_id and fulfillment_id=aggregate.id and review_state<>'approved') then
     return jsonb_build_object('status','unavailable');end if;
   safe_media:='[]';
   for selected in select value from jsonb_array_elements(p_input->'entries') order by value->>'orderItemId' loop
     if selected-array['orderItemId','previewMediaId']<>'{}'::jsonb then return jsonb_build_object('status','unavailable');end if;
     select * into media from local_commerce.fulfillment_preview_media where project_id=p_project_id
       and id=(selected->>'previewMediaId')::uuid and owner_id=purchase.owner_id and order_id=purchase.id
       and fulfillment_id=aggregate.id and order_item_id=(selected->>'orderItemId')::uuid and manifest_version=target_version and lifecycle='ready';
     if not found then return jsonb_build_object('status','unavailable');end if;
     safe_media:=safe_media||jsonb_build_array(jsonb_build_object('orderItemId',media.order_item_id,'previewMediaId',media.id,
       'contentType',media.content_type,'width',media.width,'height',media.height));
   end loop;
   insert into local_commerce.preview_manifests(project_id,fulfillment_id,order_id,owner_id,manifest_version,item_ids,published_by,published_at)
     values(p_project_id,aggregate.id,purchase.id,purchase.owner_id,target_version,required,p_actor_id,stamp) returning * into manifest;
   for selected in select value from jsonb_array_elements(safe_media) loop
     insert into local_commerce.preview_manifest_entries(project_id,manifest_id,fulfillment_id,order_id,owner_id,manifest_version,order_item_id,preview_media_id)
       values(p_project_id,manifest.id,aggregate.id,purchase.id,purchase.owner_id,target_version,(selected->>'orderItemId')::uuid,(selected->>'previewMediaId')::uuid);
   end loop;
   update local_commerce.fulfillments set current_manifest_id=manifest.id,fulfillment_state='preview_pending',version=version+1,updated_at=stamp
     where project_id=p_project_id and id=aggregate.id returning * into aggregate;
   result:=jsonb_build_object('manifestId',manifest.id,'manifestVersion',target_version,'entries',safe_media,'publicReference',purchase.public_reference,
     'status','preview_pending','version',aggregate.version,'revisionRequestsUsed',aggregate.revision_requests_used);
 end if;
 insert into local_commerce.fulfillment_decisions(project_id,fulfillment_id,order_id,owner_id,decision_kind,action_key,
   actor_kind,actor_id,request_digest,expected_aggregate_version,result,created_at,updated_at)
 values(p_project_id,aggregate.id,purchase.id,purchase.owner_id,kind,p_key_digest,p_actor_kind,p_actor_id,request_digest,p_expected_version,
   jsonb_build_object('value',result,'audit',jsonb_build_object('actorKind',p_actor_kind,'actorId',p_actor_id,'action',kind,
     'orderId',purchase.id,'fulfillmentId',aggregate.id,'timestamp',stamp)),stamp,stamp);
 return jsonb_build_object('status','found','value',result,'replayed',false);
exception when unique_violation then return jsonb_build_object('status','conflict');
 when others then return jsonb_build_object('status','unavailable');
end;$command$;
revoke all on function local_commerce.fulfillment_preview_command(text,text,text,text,text,text,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.fulfillment_preview_command(text,text,text,text,text,text,uuid,integer,text,jsonb) to service_role;
notify pgrst,'reload schema';
