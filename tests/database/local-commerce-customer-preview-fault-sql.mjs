import {literal} from '../../scripts/local-commerce-ledger-wrapper.mjs';
export function customerPreviewFaultSql(project,marker){return `
set constraints all deferred;
create function pg_temp.customer_preview_state(oid uuid) returns text language sql as $f$
 select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from (
 select to_jsonb(t) v from local_commerce.fulfillments t where order_id=oid
 union all select to_jsonb(t) from local_commerce.fulfillment_decisions t where order_id=oid
 union all select to_jsonb(t) from local_commerce.preview_manifests t where order_id=oid
 union all select to_jsonb(t) from local_commerce.preview_manifest_entries t where order_id=oid
 union all select to_jsonb(t) from local_commerce.fulfillment_preview_media t where order_id=oid) s;$f$;
create function pg_temp.customer_history_state(oid uuid,max_version integer) returns text language sql as $f$
 select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from (
 select to_jsonb(t) v from local_commerce.preview_manifests t where order_id=oid and manifest_version<=max_version
 union all select to_jsonb(t) from local_commerce.preview_manifest_entries t where order_id=oid and manifest_version<=max_version
 union all select to_jsonb(t) from local_commerce.fulfillment_preview_media t where order_id=oid and manifest_version<=max_version
 union all select to_jsonb(t) from local_commerce.order_purchase_snapshots t where order_id=oid
 union all select to_jsonb(t) from local_commerce.order_items t where order_id=oid
 union all select to_jsonb(t) from local_commerce.order_item_purchase_snapshots t where order_item_id in(select id from local_commerce.order_items where order_id=oid)
 union all select to_jsonb(t) from local_commerce.order_item_receipt_bindings t where order_item_id in(select id from local_commerce.order_items where order_id=oid)
 union all select to_jsonb(t) from local_commerce.payment_attempts t where order_id=oid
 union all select to_jsonb(t) from local_commerce.payment_actions t where order_id=oid) s;$f$;
do $authorization$
declare p jsonb;q jsonb;r jsonb;k text;cid uuid;sh text;before_state text;patch jsonb;
begin
 p:=pg_temp.preview_setup(array[true]);q:=pg_temp.preview_setup(array[true]);
 insert into local_commerce.access_grants(project_id,owner_id,resource_kind,resource_id,capability_hash,expires_at)
 values(${literal(project)},(p->>'owner')::uuid,'local_order',(p->>'order')::uuid,p->>'key',clock_timestamp()+interval '10 minutes');
 perform pg_temp.next_preview(p);
 select p||jsonb_build_object('customerVersion',version) into p from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 before_state:=pg_temp.customer_preview_state((p->>'order')::uuid);
 for patch in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('project','foreign'),jsonb_build_object('marker',repeat('0',64)),
  jsonb_build_object('expires',clock_timestamp()-interval '1 second'),jsonb_build_object('ref',q->>'ref'),
  jsonb_build_object('owner',q->>'owner'),jsonb_build_object('key',repeat('0',64)))) loop
  perform pg_temp.fa(pg_temp.customer_preview(p||patch,'approve_preview',pg_temp.preview_key(),1)->>'status'='unavailable','guest exact authority');
 end loop;
 -- Synthetic authorization fixture only, entirely rolled back. Not a claim
 -- operation: production offers no owner conversion or account/email lookup.
 update local_commerce.commerce_owners set owner_kind='customer' where project_id=${literal(project)} and id=(p->>'owner')::uuid;
 cid:=gen_random_uuid();sh:=pg_temp.preview_key();
 insert into local_commerce.customer_accounts(project_id,id,owner_id,normalized_email,password_hash)
 values(${literal(project)},cid,(p->>'owner')::uuid,cid::text||'@example.invalid',repeat('x',64));
 insert into local_commerce.customer_sessions(project_id,owner_id,session_hash,expires_at)
 values(${literal(project)},(p->>'owner')::uuid,sh,clock_timestamp()+interval '10 minutes');
 p:=p||jsonb_build_object('ownerKind','customer','customer',cid,'session',sh);
 k:=pg_temp.preview_key();r:=pg_temp.customer_preview(p,'approve_preview',k,1);
 perform pg_temp.fa(r->>'status'='found','member exact authorization');
 for patch in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('session',null),jsonb_build_object('session',pg_temp.preview_key()),
  jsonb_build_object('customer',gen_random_uuid()),jsonb_build_object('owner',q->>'owner'),
  jsonb_build_object('expires',clock_timestamp()-interval '1 second'))) loop
  perform pg_temp.fa(pg_temp.customer_preview(p||patch,'approve_preview',k,1)->>'status'='unavailable','fresh member auth precedes committed replay');
 end loop;
 before_state:=pg_temp.customer_preview_state((p->>'order')::uuid);
 update local_commerce.customer_sessions set revoked_at=clock_timestamp() where project_id=${literal(project)} and session_hash=sh;
 perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',k,1)->>'status'='unavailable','revoked member replay rejected');
 update local_commerce.customer_sessions set revoked_at=null,expires_at=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '1 day' where project_id=${literal(project)} and session_hash=sh;
 perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',k,1)->>'status'='unavailable','expired member replay rejected');
 perform pg_temp.fa(pg_temp.customer_preview_state((p->>'order')::uuid)=before_state,'unauthorized replay no effect');
 -- New actions/reads cannot rely on an admitted aggregate after payment or
 -- lifecycle eligibility has disappeared. Existing exact replay stays first.
 update local_commerce.orders set lifecycle_status='payment_failed' where id=(p->>'order')::uuid;
 update local_commerce.customer_sessions set expires_at=clock_timestamp()+interval '10 minutes' where project_id=${literal(project)} and session_hash=sh;
 perform pg_temp.fa(pg_temp.customer_preview(p,'read',null,null)->>'status'='unavailable','unpaid read');
 perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',pg_temp.preview_key(),1)->>'status'='unavailable','unpaid new action');
 perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',k,1)->>'replayed'='true','exact committed replay before changed lifecycle');
end;$authorization$;
do $faults$
declare p jsonb;r jsonb;req jsonb;pub jsonb;target text;timing text;before_state text;historical text;
 v integer;item uuid;mid uuid;k text;bad integer;note text;
begin
 p:=pg_temp.preview_setup(array[true]);
 insert into local_commerce.access_grants(project_id,owner_id,resource_kind,resource_id,capability_hash,expires_at)
 values(${literal(project)},(p->>'owner')::uuid,'local_order',(p->>'order')::uuid,p->>'key',clock_timestamp()+interval '10 minutes');
 perform pg_temp.next_preview(p);
 for v in 1..2 loop
  historical:=pg_temp.customer_history_state((p->>'order')::uuid,v);
  select p||jsonb_build_object('customerVersion',version) into p from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
  before_state:=pg_temp.customer_preview_state((p->>'order')::uuid);
  foreach bad in array array[null,0,4,v+1] loop
   perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',pg_temp.preview_key(),bad)->>'status' in ('unavailable','conflict'),'bad preview selector');
  end loop;
  foreach bad in array array[null,0,(p->>'customerVersion')::integer-1,(p->>'customerVersion')::integer+1] loop
   perform pg_temp.fa(pg_temp.customer_preview(p||jsonb_build_object('customerVersion',bad),'approve_preview',pg_temp.preview_key(),v)->>'status' in ('unavailable','conflict'),'bad aggregate selector');
  end loop;
  foreach note in array array['',' ',repeat('x',501),repeat(U&'\\+01F600',251),' padded '] loop
   perform pg_temp.fa(pg_temp.customer_preview(p,'request_revision',pg_temp.preview_key(),v,note)->>'status'='unavailable','noncanonical note');
  end loop;
  perform pg_temp.fa(pg_temp.customer_preview(p||jsonb_build_object('key',repeat('0',64)),'approve_preview',pg_temp.preview_key(),v)->>'status'='unavailable','wrong capability');
  perform pg_temp.fa(pg_temp.customer_preview(p||jsonb_build_object('owner',gen_random_uuid()),'approve_preview',pg_temp.preview_key(),v)->>'status'='unavailable','wrong owner');
  perform pg_temp.fa(pg_temp.customer_preview_state((p->>'order')::uuid)=before_state,'all invalid input zero effect');
  -- Decisions include the action binding and bounded audit in the same row.
  -- Fault both before and after insertion, and both sides of the aggregate
  -- counter/lifecycle/version update. No compensating application writes.
  foreach target in array array['fulfillments','fulfillment_decisions'] loop
   foreach timing in array array['before','after'] loop
    execute 'create trigger customer_test_fault '||timing||' insert or update on local_commerce.'||target||' for each row execute function pg_temp.fulfillment_fault()';
    r:=pg_temp.customer_preview(p,'request_revision',pg_temp.preview_key(),v,'adjust');
    execute 'drop trigger customer_test_fault on local_commerce.'||target;
    perform pg_temp.fa(r->>'status'='unavailable','customer fault '||target||timing);
    perform pg_temp.fa(pg_temp.customer_preview_state((p->>'order')::uuid)=before_state,'zero partial customer state');
   end loop;
  end loop;
  k:=pg_temp.preview_key();
  r:=pg_temp.customer_preview(p,'request_revision',k,v,repeat(U&'\\+01F600',250));
  perform pg_temp.fa(r->>'status'='found','500 UTF16 SQL accepted');
  perform pg_temp.fa(pg_temp.customer_preview(p,'request_revision',k,v,repeat(U&'\\+01F600',250))->>'replayed'='true','Unicode replay');
  select p||jsonb_build_object('version',version) into p from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
  select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid;
  r:=pg_temp.preview_call(pg_temp.preview_reserve(p,item));
  perform pg_temp.fa((r#>>'{value,manifestVersion}')::integer=v+1,'canonical reservation target');mid:=(r#>>'{value,previewMediaId}')::uuid;
  perform pg_temp.fa(pg_temp.preview_call(pg_temp.preview_ready(p,mid))->>'status'='found','revision media ready');
  pub:=p||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('orderItemId',item,'previewMediaId',mid))));
  before_state:=pg_temp.customer_preview_state((p->>'order')::uuid);
  foreach target in array array['preview_manifests','preview_manifest_entries','fulfillments','fulfillment_decisions'] loop
   execute 'create trigger customer_test_fault after insert or update on local_commerce.'||target||' for each row execute function pg_temp.fulfillment_fault()';
   r:=pg_temp.preview_call(pub);
   execute 'drop trigger customer_test_fault on local_commerce.'||target;
   perform pg_temp.fa(r->>'status'='unavailable','v2/v3 publication fault '||target);
   perform pg_temp.fa(pg_temp.customer_preview_state((p->>'order')::uuid)=before_state,'zero partial revision publication');
  end loop;
  r:=pg_temp.preview_call(pub);perform pg_temp.fa((r#>>'{value,manifestVersion}')::integer=v+1,'revised publish');
  perform pg_temp.fa(pg_temp.preview_call(pub)->'value'=r->'value','publication replay');
  perform pg_temp.fa(pg_temp.customer_history_state((p->>'order')::uuid,v)=historical,'historical media entries manifest and upstream immutable');
 end loop;
 perform pg_temp.fa((select count(*)=3 and max(manifest_version)=3 from local_commerce.preview_manifests where order_id=(p->>'order')::uuid),'no v4');
 perform pg_temp.fa(not exists(select 1 from local_commerce.shipments where order_id=(p->>'order')::uuid),'no Shipment');
 perform pg_temp.fa(not exists(select 1 from local_commerce.shipment_events where order_id=(p->>'order')::uuid),'no events');
end;$faults$;
do $security$
declare signature regprocedure:='local_commerce.fulfillment_customer_command(text,text,text,text,uuid,text,timestamptz,text,text,text,text,integer,text,integer)'::regprocedure;role_name text;
begin
 perform pg_temp.fa((select prosecdef and proconfig @> array['search_path=pg_catalog, local_commerce'] from pg_proc where oid=signature),'fixed search path');
 perform pg_temp.fa(not exists(select 1 from pg_proc p,aclexplode(p.proacl) a where p.oid=signature and a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))),'minimum execute ACL');
 foreach role_name in array array['anon','authenticated'] loop
  perform pg_temp.fa(not has_function_privilege(role_name,signature,'execute'),'no client RPC');
  perform pg_temp.fa(not has_table_privilege(role_name,'local_commerce.fulfillment_decisions','select,insert,update,delete'),'no direct decision access');
 end loop;
 perform pg_temp.fa((select relrowsecurity from pg_class where oid='local_commerce.fulfillment_decisions'::regclass),'decisions RLS');
 perform pg_temp.fa(local_commerce.fulfillment_customer_command('foreign',${literal(marker)},'guest',repeat('a',64),null,null,clock_timestamp()+interval '1 minute',repeat('a',64),'FM-LOCAL-0000000000000000','read',null,null,'',null)->>'status'='unavailable','foreign project');
end;$security$;
set constraints all immediate;
`;}
