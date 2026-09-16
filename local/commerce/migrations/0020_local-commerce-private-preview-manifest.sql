-- Task 7.2 candidate; transaction ownership belongs to the migration ledger.
-- Operator-published previews are NOT customer upload receipts.
create table local_commerce.fulfillment_preview_media (
 project_id text not null,
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null,
 order_id uuid not null,
 fulfillment_id uuid not null,
 order_item_id uuid not null,
 manifest_version integer not null check(manifest_version between 1 and 3),
 action_key text not null check(action_key ~ '^[0-9a-f]{64}$'),
 actor_id text not null check(actor_id ~ '^[A-Za-z0-9_-]{8,200}$'),
 input_digest text not null check(input_digest ~ '^[0-9a-f]{64}$'),
 object_locator text not null,
 content_digest text check(content_digest ~ '^[0-9a-f]{64}$'),
 content_type text check(content_type='image/png'),
 byte_size integer check(byte_size between 1 and 94371840),
 width integer check(width>0),
 height integer check(height>0),
 lifecycle text not null default 'pending' check(lifecycle in ('pending','ready')),
 version integer not null default 1 check(version>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(project_id,id),
 unique(project_id,action_key),
 unique(project_id,object_locator),
 unique(project_id,id,owner_id,order_id,fulfillment_id,order_item_id,manifest_version,lifecycle),
 constraint preview_media_ready_facts check (
   (lifecycle='pending' and content_digest is null and content_type is null and byte_size is null and width is null and height is null)
   or (lifecycle='ready' and content_digest is not null and content_type is not null and byte_size is not null and width is not null and height is not null)),
 check(width::bigint*height::bigint<=16000000),
 foreign key(project_id,fulfillment_id,order_id,owner_id) references local_commerce.fulfillments(project_id,id,order_id,owner_id),
 foreign key(project_id,order_item_id,order_id,owner_id) references local_commerce.order_items(project_id,id,order_id,owner_id)
);
alter table local_commerce.fulfillment_preview_media enable row level security;
revoke all on local_commerce.fulfillment_preview_media from public,anon,authenticated,service_role;

-- Entries live in the exact relational child below, not a competing JSON copy.
alter table local_commerce.preview_manifests add column published_by text;
alter table local_commerce.preview_manifests add column published_at timestamptz;
alter table local_commerce.preview_manifests add constraint preview_manifest_exact_order
 foreign key(project_id,fulfillment_id,order_id,owner_id) references local_commerce.fulfillments(project_id,id,order_id,owner_id);
alter table local_commerce.preview_manifests add constraint preview_manifest_max_version check(manifest_version between 1 and 3);
alter table local_commerce.preview_manifests add constraint preview_manifest_exact_identity
 unique(project_id,id,fulfillment_id,order_id,owner_id,manifest_version);
alter table local_commerce.preview_manifests add constraint preview_manifest_current_identity
 unique(project_id,id,fulfillment_id,order_id,owner_id);
alter table local_commerce.fulfillments add column current_manifest_id uuid;
alter table local_commerce.fulfillments add constraint fulfillment_current_manifest_owner
 foreign key(project_id,current_manifest_id,id,order_id,owner_id)
 references local_commerce.preview_manifests(project_id,id,fulfillment_id,order_id,owner_id);

create table local_commerce.preview_manifest_entries (
 project_id text not null,
 id uuid not null default gen_random_uuid(),
 manifest_id uuid not null,
 fulfillment_id uuid not null,
 order_id uuid not null,
 owner_id uuid not null,
 manifest_version integer not null check(manifest_version between 1 and 3),
 order_item_id uuid not null,
 preview_media_id uuid not null,
 media_lifecycle text not null default 'ready' check(media_lifecycle='ready'),
 version integer not null default 1 check(version=1),
 lifecycle text not null default 'published' check(lifecycle='published'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(project_id,id),
 unique(project_id,manifest_id,order_item_id),
 unique(project_id,manifest_id,preview_media_id),
 foreign key(project_id,manifest_id,fulfillment_id,order_id,owner_id,manifest_version)
   references local_commerce.preview_manifests(project_id,id,fulfillment_id,order_id,owner_id,manifest_version),
 foreign key(project_id,order_item_id,order_id,owner_id)
   references local_commerce.order_items(project_id,id,order_id,owner_id),
 foreign key(project_id,preview_media_id,owner_id,order_id,fulfillment_id,order_item_id,manifest_version,media_lifecycle)
   references local_commerce.fulfillment_preview_media(project_id,id,owner_id,order_id,fulfillment_id,order_item_id,manifest_version,lifecycle)
);
alter table local_commerce.preview_manifest_entries enable row level security;
revoke all on local_commerce.preview_manifest_entries from public,anon,authenticated,service_role;

create function local_commerce.guard_preview_manifest_facts() returns trigger
language plpgsql set search_path=pg_catalog,local_commerce as $guard$
begin
 if tg_op='DELETE' then raise exception 'immutable preview manifest';end if;
 if (new.project_id,new.id,new.owner_id,new.order_id,new.fulfillment_id,new.manifest_version,new.item_ids,new.published_by,new.published_at,new.created_at)
   is distinct from (old.project_id,old.id,old.owner_id,old.order_id,old.fulfillment_id,old.manifest_version,old.item_ids,old.published_by,old.published_at,old.created_at)
 then raise exception 'immutable preview manifest';end if;
 return new;
end;$guard$;
revoke all on function local_commerce.guard_preview_manifest_facts() from public,anon,authenticated,service_role;
create trigger preview_manifest_immutable before update or delete on local_commerce.preview_manifests for each row execute function local_commerce.guard_preview_manifest_facts();

create function local_commerce.guard_preview_media_facts() returns trigger
language plpgsql set search_path=pg_catalog,local_commerce as $guard$
begin
 if tg_op='DELETE' then raise exception 'preview media retention requires separate authority';end if;
 if (to_jsonb(new)-array['lifecycle','version','updated_at','content_digest','content_type','byte_size','width','height'])
   is distinct from (to_jsonb(old)-array['lifecycle','version','updated_at','content_digest','content_type','byte_size','width','height'])
   or old.lifecycle='ready' or new.lifecycle<>'ready' or new.version<>old.version+1
 then raise exception 'immutable preview media facts';end if;
 return new;
end;$guard$;
revoke all on function local_commerce.guard_preview_media_facts() from public,anon,authenticated,service_role;
create trigger preview_media_immutable before update or delete on local_commerce.fulfillment_preview_media for each row execute function local_commerce.guard_preview_media_facts();

create function local_commerce.guard_preview_entry_facts() returns trigger
language plpgsql set search_path=pg_catalog,local_commerce as $guard$
begin raise exception 'immutable preview manifest entry';end;$guard$;
revoke all on function local_commerce.guard_preview_entry_facts() from public,anon,authenticated,service_role;
create trigger preview_entry_immutable before update or delete on local_commerce.preview_manifest_entries
 for each row execute function local_commerce.guard_preview_entry_facts();

-- Deferred only within the publication transaction: no committed manifest can
-- omit an immutable required item or add a preview-disabled item. FK readiness
-- is immediate. The RPC also checks explicitly so failures remain bounded.
create function local_commerce.assert_preview_manifest_complete() returns trigger
language plpgsql set search_path=pg_catalog,local_commerce as $complete$
declare m local_commerce.preview_manifests%rowtype; required jsonb; actual jsonb; facts jsonb;
begin
 if tg_table_name='preview_manifests' then
   select * into m from local_commerce.preview_manifests where project_id=new.project_id and id=new.id;
 else
   select * into m from local_commerce.preview_manifests where project_id=new.project_id and id=new.manifest_id;
 end if;
 facts:=local_commerce.fulfillment_purchased_items(m.project_id,m.order_id,m.owner_id);
 select jsonb_agg(x->>'orderItemId' order by x->>'orderItemId') into required
   from jsonb_array_elements(facts) x where x#>'{purchasedItem,fulfillment,requiresProductionPreview}'='true'::jsonb;
 select jsonb_agg(order_item_id::text order by order_item_id::text) into actual
   from local_commerce.preview_manifest_entries where project_id=m.project_id and manifest_id=m.id;
 if facts is null or required is null or actual is distinct from required or m.item_ids is distinct from required
   or m.published_by is null or m.published_at is null then raise exception 'incomplete preview manifest';end if;
 return null;
end;$complete$;
revoke all on function local_commerce.assert_preview_manifest_complete() from public,anon,authenticated,service_role;
create constraint trigger preview_manifest_complete after insert on local_commerce.preview_manifests
 deferrable initially deferred for each row execute function local_commerce.assert_preview_manifest_complete();
create constraint trigger preview_entries_complete after insert on local_commerce.preview_manifest_entries
 deferrable initially deferred for each row execute function local_commerce.assert_preview_manifest_complete();

alter table local_commerce.fulfillment_decisions drop constraint fulfillment_decisions_kind_check;
alter table local_commerce.fulfillment_decisions add constraint fulfillment_decisions_kind_check
 check(decision_kind in ('customer_approve','customer_revision','operator_timeout','enter_photo_review',
 'preview_reserve','preview_ready','preview_publish'));

-- Only the server's independently authorized operator adapter can invoke this
-- service-only command. Metadata for ready is the adapter's verified read-back,
-- never a public request payload. Each command owns its separate action key.
create function local_commerce.fulfillment_preview_command(
 p_project_id text,p_marker_digest text,p_actor_kind text,p_actor_id text,
 p_public_reference text,p_operation text,p_fulfillment_id uuid,
 p_expected_version integer,p_key_digest text,p_input jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $command$
declare
 purchase local_commerce.orders%rowtype; aggregate local_commerce.fulfillments%rowtype;
 previous local_commerce.fulfillment_decisions%rowtype; media local_commerce.fulfillment_preview_media%rowtype;
 manifest local_commerce.preview_manifests%rowtype; facts jsonb; required jsonb; applicable jsonb;
 request_digest text; result jsonb; safe_media jsonb; selected jsonb; actual jsonb;
 item_id uuid; media_id uuid; stamp timestamptz; kind text; operation text; probe boolean;
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
     'fulfillmentId',aggregate.id,'version',aggregate.version,'items',facts,'currentManifestId',aggregate.current_manifest_id));
 end if;
 if aggregate.id<>p_fulfillment_id then return jsonb_build_object('status','unavailable');end if;
 if aggregate.version<>p_expected_version then return jsonb_build_object('status','conflict');end if;
 if purchase.lifecycle_status<>'paid' or purchase.lifecycle<>'active'
   or not exists(select 1 from local_commerce.payment_attempts where project_id=p_project_id and order_id=purchase.id
      and owner_id=purchase.owner_id and outcome='succeeded' and lifecycle='settled')
   or aggregate.fulfillment_state<>'photo_review' or aggregate.current_manifest_id is not null
   or aggregate.revision_requests_used<>0 or required is null then return jsonb_build_object('status','unavailable');end if;
 stamp:=clock_timestamp();
 if p_operation='reserve' then
   if p_input-array['orderItemId','inputDigest']<>'{}'::jsonb
     or p_input->>'inputDigest' is null or p_input->>'inputDigest' !~ '^[0-9a-f]{64}$'
     or not (required ? (p_input->>'orderItemId')) then return jsonb_build_object('status','unavailable');end if;
   item_id:=(p_input->>'orderItemId')::uuid;media_id:=gen_random_uuid();
   insert into local_commerce.fulfillment_preview_media(project_id,id,owner_id,order_id,fulfillment_id,order_item_id,
     manifest_version,action_key,actor_id,input_digest,object_locator,created_at,updated_at)
   values(p_project_id,media_id,purchase.owner_id,purchase.id,aggregate.id,item_id,1,p_key_digest,p_actor_id,
     p_input->>'inputDigest','production-preview/'||purchase.id::text||'/'||media_id::text||'.png',stamp,stamp) returning * into media;
   result:=jsonb_build_object('previewMediaId',media.id,'orderItemId',media.order_item_id,'manifestVersion',1,'state','pending');
 elsif p_operation='ready' then
   if p_input-array['previewMediaId','contentDigest','contentType','byteSize','width','height']<>'{}'::jsonb
     or p_input->>'previewMediaId' is null then return jsonb_build_object('status','unavailable');end if;
   select * into media from local_commerce.fulfillment_preview_media where project_id=p_project_id
     and id=(p_input->>'previewMediaId')::uuid and owner_id=purchase.owner_id and order_id=purchase.id
     and fulfillment_id=aggregate.id and actor_id=p_actor_id and manifest_version=1;
   if not found or not(required ? media.order_item_id::text) then return jsonb_build_object('status','unavailable');end if;
   if media.lifecycle<>'pending' then return jsonb_build_object('status','conflict');end if;
   update local_commerce.fulfillment_preview_media set lifecycle='ready',version=version+1,updated_at=stamp,
     content_digest=p_input->>'contentDigest',content_type=p_input->>'contentType',byte_size=(p_input->>'byteSize')::integer,
     width=(p_input->>'width')::integer,height=(p_input->>'height')::integer
     where project_id=p_project_id and id=media.id returning * into media;
   result:=jsonb_build_object('previewMediaId',media.id,'orderItemId',media.order_item_id,'manifestVersion',1,'state','ready',
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
       and fulfillment_id=aggregate.id and order_item_id=(selected->>'orderItemId')::uuid and manifest_version=1 and lifecycle='ready';
     if not found then return jsonb_build_object('status','unavailable');end if;
     safe_media:=safe_media||jsonb_build_array(jsonb_build_object('orderItemId',media.order_item_id,'previewMediaId',media.id,
       'contentType',media.content_type,'width',media.width,'height',media.height));
   end loop;
   insert into local_commerce.preview_manifests(project_id,fulfillment_id,order_id,owner_id,manifest_version,item_ids,published_by,published_at)
     values(p_project_id,aggregate.id,purchase.id,purchase.owner_id,1,required,p_actor_id,stamp) returning * into manifest;
   for selected in select value from jsonb_array_elements(safe_media) loop
     insert into local_commerce.preview_manifest_entries(project_id,manifest_id,fulfillment_id,order_id,owner_id,manifest_version,order_item_id,preview_media_id)
       values(p_project_id,manifest.id,aggregate.id,purchase.id,purchase.owner_id,1,(selected->>'orderItemId')::uuid,(selected->>'previewMediaId')::uuid);
   end loop;
   update local_commerce.fulfillments set current_manifest_id=manifest.id,fulfillment_state='preview_pending',version=version+1,updated_at=stamp
     where project_id=p_project_id and id=aggregate.id returning * into aggregate;
   result:=jsonb_build_object('manifestId',manifest.id,'manifestVersion',1,'entries',safe_media,'publicReference',purchase.public_reference,
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
