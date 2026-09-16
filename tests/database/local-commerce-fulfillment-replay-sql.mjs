// Exact-run transaction-local acceptance only; always rolled back.
export function fulfillmentReplaySql(){return `
set constraints all deferred;
do $replay$
declare p jsonb;q jsonb;reserve jsonb;ready jsonb;pub jsonb;r jsonb;original jsonb;
 item uuid;mid uuid;before_state text;patch jsonb;request jsonb;target text;timing text;
begin
 p:=pg_temp.preview_setup(array[true]);q:=pg_temp.preview_setup(array[true]);
 select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid;
 reserve:=pg_temp.preview_reserve(p,item);
 foreach target in array array['fulfillment_preview_media','fulfillment_decisions'] loop
  foreach timing in array array['before','after'] loop
   before_state:=pg_temp.customer_preview_state((p->>'order')::uuid);
   execute 'create trigger replay_fault '||timing||' insert on local_commerce.'||target||' for each row execute function pg_temp.fulfillment_fault()';
   r:=pg_temp.preview_call(reserve);
   execute 'drop trigger replay_fault on local_commerce.'||target;
   perform pg_temp.fa(r->>'status'='unavailable','reserve fault');
   perform pg_temp.fa(pg_temp.customer_preview_state((p->>'order')::uuid)=before_state,'reserve no partial effects');
  end loop;
 end loop;
 r:=pg_temp.preview_call(reserve);perform pg_temp.fa(r->>'status'='found','reserve commit');
 mid:=(r#>>'{value,previewMediaId}')::uuid;
 ready:=pg_temp.preview_ready(p,mid);
 foreach target in array array['fulfillment_preview_media','fulfillment_decisions'] loop
  foreach timing in array array['before','after'] loop
   before_state:=pg_temp.customer_preview_state((p->>'order')::uuid);
   execute 'create trigger replay_fault '||timing||' insert or update on local_commerce.'||target||' for each row execute function pg_temp.fulfillment_fault()';
   r:=pg_temp.preview_call(ready);
   execute 'drop trigger replay_fault on local_commerce.'||target;
   perform pg_temp.fa(r->>'status'='unavailable','ready fault');
   perform pg_temp.fa(pg_temp.customer_preview_state((p->>'order')::uuid)=before_state,'ready no partial effects');
  end loop;
 end loop;
 r:=pg_temp.preview_call(ready);perform pg_temp.fa(r->>'status'='found','ready commit');
 pub:=p||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',
  jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('orderItemId',item,'previewMediaId',mid))));
 perform pg_temp.fa(pg_temp.preview_call(pub)->>'status'='found','publish');
 foreach request in array array[reserve,ready,pub] loop
  before_state:=pg_temp.customer_preview_state((p->>'order')::uuid);
  r:=pg_temp.preview_call(request);perform pg_temp.fa(r->>'replayed'='true','replay after state advancement');
  select result->'value' into original from local_commerce.fulfillment_decisions where action_key=request->>'key';
  perform pg_temp.fa(r->'value'=original,'original durable result');
  for patch in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('actor','other-authorized-operator'),jsonb_build_object('ref',q->>'ref'),
    jsonb_build_object('fulfillment',gen_random_uuid()),jsonb_build_object('version',2),
    jsonb_build_object('input',(request->'input')||jsonb_build_object('changedSemanticInput',true)),
    jsonb_build_object('operation',case when request->>'operation'='publish' then 'ready' else 'publish' end)
  )) loop perform pg_temp.fa(pg_temp.preview_call(request||patch)->>'status'='conflict','changed normalized replay context conflict');end loop;
  for patch in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('project','foreign'),jsonb_build_object('marker',repeat('0',64)),jsonb_build_object('actorKind','customer')
  )) loop perform pg_temp.fa(pg_temp.preview_call(request||patch)->>'status'='unavailable','fresh authority before replay');end loop;
  perform pg_temp.fa(pg_temp.customer_preview_state((p->>'order')::uuid)=before_state,'replay/conflict no mutation/audit');
 end loop;
 perform pg_temp.fa((select count(*)=4 and count(result->'audit')=4 and count(distinct action_key)=4
  from local_commerce.fulfillment_decisions where order_id=(p->>'order')::uuid),'one audit per admission/reserve/ready/publish');
end;$replay$;
do $acl$
declare f record;t text;
begin
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='local_commerce' and p.proname in('fulfillment_admission','fulfillment_preview_command','fulfillment_customer_command') loop
  perform pg_temp.fa(f.prosecdef and f.proconfig @> array['search_path=pg_catalog, local_commerce'],'restricted search_path');
  perform pg_temp.fa(not exists(select 1 from aclexplode(f.proacl) a where a.grantee not in(f.proowner,(select oid from pg_roles where rolname='service_role'))),'no PUBLIC/client execute');
  perform pg_temp.fa(has_function_privilege('service_role',f.oid,'execute'),'minimum service execute');
 end loop;
 foreach t in array array['fulfillments','photo_reviews','fulfillment_decisions','preview_manifests','preview_manifest_entries','fulfillment_preview_media'] loop
  perform pg_temp.fa((select relrowsecurity from pg_class where oid=('local_commerce.'||t)::regclass),'RLS');
  perform pg_temp.fa(not has_table_privilege('anon','local_commerce.'||t,'select,insert,update,delete'),'anon no CRUD');
  perform pg_temp.fa(not has_table_privilege('authenticated','local_commerce.'||t,'select,insert,update,delete'),'authenticated no CRUD');
 end loop;
end;$acl$;
set constraints all immediate;
`;}
