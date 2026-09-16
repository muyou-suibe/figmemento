import {literal} from '../../scripts/local-commerce-ledger-wrapper.mjs';

/** Transaction-local schema/RPC acceptance. These synthetic bindings prove
 * atomic database invariants; real upload/Cart/Order evidence is separate. */
export function photoReviewSql(project, marker) { return `
set constraints all deferred;
create function pg_temp.bind_purchased_media(p jsonb) returns void language plpgsql as $f$
declare i record;m jsonb;object_id uuid;receipt_id uuid;product_id uuid;
begin
 for i in select oi.id,s.product_id,s.receipt_references
  from local_commerce.order_items oi join local_commerce.order_item_purchase_snapshots s
   on s.project_id=oi.project_id and s.order_item_id=oi.id
  where oi.project_id=${literal(project)} and oi.order_id=(p->>'order')::uuid loop
  product_id:=i.product_id;
  insert into local_commerce.catalog_products(project_id,id,slug,name,description,publication_status,availability)
   values(${literal(project)},product_id,'review-'||replace(product_id::text,'-',''),'Review fixture','', 'published','available')
   on conflict(project_id,id) do nothing;
  if jsonb_typeof(i.receipt_references)='array' then
   for m in select value from jsonb_array_elements(i.receipt_references) loop
    object_id:=gen_random_uuid();receipt_id:=gen_random_uuid();
    insert into local_commerce.media_objects(project_id,id,owner_id,internal_locator,media_kind,mime_type,byte_size,object_status)
     values(${literal(project)},object_id,(p->>'owner')::uuid,'task-7.7/'||object_id,'original','image/png',100,'ready');
    insert into local_commerce.media_receipts(project_id,id,receipt_reference,owner_id,media_object_id,product_id,field_key,receipt_status,expires_at)
     values(${literal(project)},receipt_id,(m->>'receiptId')::uuid,(p->>'owner')::uuid,object_id,product_id,'photo','ready',clock_timestamp()+interval '1 day');
    insert into local_commerce.order_item_receipt_bindings(project_id,order_item_id,receipt_id,owner_id)
     values(${literal(project)},i.id,receipt_id,(p->>'owner')::uuid);
   end loop;
  end if;
 end loop;
end;$f$;
create function pg_temp.photo_review(p jsonb,kind text,k text,item uuid,v integer,actor text default 'local-development-operator')
returns jsonb language sql as $f$
 select local_commerce.fulfillment_photo_review_command(
  coalesce(p->>'project',${literal(project)}),coalesce(p->>'marker',${literal(marker)}),'operator',actor,
  p->>'ref','commit',kind,v,k,item);$f$;
create function pg_temp.photo_state(oid uuid) returns text language sql as $f$
 select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from(
  select to_jsonb(t) v from local_commerce.fulfillments t where order_id=oid
  union all select to_jsonb(t) from local_commerce.photo_reviews t where order_id=oid
  union all select to_jsonb(t) from local_commerce.fulfillment_decisions t where order_id=oid
  union all select to_jsonb(t) from local_commerce.preview_manifests t where order_id=oid
  union all select to_jsonb(t) from local_commerce.preview_manifest_entries t where order_id=oid
  union all select to_jsonb(t) from local_commerce.shipments t where order_id=oid
  union all select to_jsonb(t) from local_commerce.shipment_events t where order_id=oid) s;$f$;
do $review$
declare p jsonb;q jsonb;r jsonb;again jsonb;k text;item uuid;other_item uuid;v integer;before_state text;
begin
 p:=pg_temp.preview_setup(array[true],true,1);perform pg_temp.bind_purchased_media(p);
 select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid;
 select version into v from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 perform pg_temp.fa((select review_state='pending' and version=1 from local_commerce.photo_reviews where order_id=(p->>'order')::uuid and order_item_id=item),'canonical pending review');
 before_state:=pg_temp.photo_state((p->>'order')::uuid);k:=pg_temp.preview_key();
 r:=pg_temp.photo_review(p,'approve_photo_review',k,item,v);
 perform pg_temp.fa(r->>'status'='found' and r#>>'{value,photoReview,status}'='approved','approve');
 perform pg_temp.fa((r#>>'{value,version}')::integer=v+1 and r#>>'{value,status}'='photo_review','aggregate CAS');
 again:=pg_temp.photo_review(p,'approve_photo_review',k,item,v);
 perform pg_temp.fa(again->>'replayed'='true' and again->'value'=r->'value','exact replay');
 perform pg_temp.fa(pg_temp.photo_review(p,'reject_photo_review',k,item,v)->>'status'='conflict','changed action');
 perform pg_temp.fa(pg_temp.photo_review(p,'approve_photo_review',k,item,v+1)->>'status'='conflict','changed version');
 perform pg_temp.fa(pg_temp.photo_review(p,'approve_photo_review',k,item,v,'different-operator')->>'status'='conflict','changed actor');
 perform pg_temp.fa((select count(*)=1 from local_commerce.fulfillment_decisions where order_id=(p->>'order')::uuid and decision_kind='approve_photo_review'),'single approval decision');
 perform pg_temp.fa((select count(*)=0 from local_commerce.preview_manifests where order_id=(p->>'order')::uuid),'no manifest');
 perform pg_temp.fa((select count(*)=0 from local_commerce.shipments where order_id=(p->>'order')::uuid),'no shipment');
 q:=pg_temp.preview_setup(array[true],true,1);perform pg_temp.bind_purchased_media(q);
 select id into other_item from local_commerce.order_items where order_id=(q->>'order')::uuid;
 select version into v from local_commerce.fulfillments where order_id=(q->>'order')::uuid;
 k:=pg_temp.preview_key();r:=pg_temp.photo_review(q,'reject_photo_review',k,other_item,v);
 perform pg_temp.fa(r->>'status'='found' and r#>>'{value,photoReview,status}'='rejected','reject');
 perform pg_temp.fa(pg_temp.photo_review(q,'reject_photo_review',pg_temp.preview_key(),other_item,v+1)->>'status'='conflict','decided review cannot mutate twice');
 perform pg_temp.fa(pg_temp.photo_review(q,'approve_photo_review',pg_temp.preview_key(),item,v+1)->>'status'='conflict','foreign item rejected');
 before_state:=pg_temp.photo_state((q->>'order')::uuid);
 perform pg_temp.fa(pg_temp.photo_review(q,'approve_photo_review',pg_temp.preview_key(),other_item,null)->>'status'='unavailable','missing version');
 perform pg_temp.fa(pg_temp.photo_review(q,'approve_photo_review',pg_temp.preview_key(),other_item,v,'!')->>'status'='unavailable','invalid actor');
 perform pg_temp.fa(pg_temp.photo_review(q||'{"project":"foreign"}', 'approve_photo_review',pg_temp.preview_key(),other_item,v)->>'status'='unavailable','foreign project');
 perform pg_temp.fa(pg_temp.photo_review(q||jsonb_build_object('marker',repeat('0',64)), 'approve_photo_review',pg_temp.preview_key(),other_item,v)->>'status'='unavailable','wrong marker');
 perform pg_temp.fa(pg_temp.photo_state((q->>'order')::uuid)=before_state,'invalid selectors zero mutation');
 p:=pg_temp.preview_setup(array[true],true,0);
 select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid;
 perform pg_temp.fa(not exists(select 1 from local_commerce.photo_reviews where order_id=(p->>'order')::uuid),'empty purchased media no review');
 perform pg_temp.fa(pg_temp.photo_review(p,'approve_photo_review',pg_temp.preview_key(),item,1)->>'status'='conflict','empty media not applicable');
end;$review$;
do $faults$
declare p jsonb;r jsonb;k text;item uuid;v integer;target text;timing text;before_state text;
begin
 foreach target in array array['photo_reviews','fulfillments','fulfillment_decisions'] loop
  foreach timing in array array['before','after'] loop
   p:=pg_temp.preview_setup(array[true],true,1);perform pg_temp.bind_purchased_media(p);
   select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid;
   select version into v from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
   before_state:=pg_temp.photo_state((p->>'order')::uuid);k:=pg_temp.preview_key();
   execute 'create trigger photo_review_fault '||timing||' insert or update on local_commerce.'||target||' for each row execute function pg_temp.fulfillment_fault()';
   r:=pg_temp.photo_review(p,'approve_photo_review',k,item,v);
   execute 'drop trigger photo_review_fault on local_commerce.'||target;
   perform pg_temp.fa(r->>'status'='unavailable','fault '||target||' '||timing);
   perform pg_temp.fa(pg_temp.photo_state((p->>'order')::uuid)=before_state,'fault rollback '||target||' '||timing);
  end loop;
 end loop;
end;$faults$;
do $security$
declare signature regprocedure:='local_commerce.fulfillment_photo_review_command(text,text,text,text,text,text,text,integer,text,uuid)'::regprocedure;role_name text;
begin
 perform pg_temp.fa((select prosecdef and proconfig @> array['search_path=pg_catalog, local_commerce'] from pg_proc where oid=signature),'fixed search path');
 perform pg_temp.fa(not exists(select 1 from pg_proc p,aclexplode(p.proacl) a where p.oid=signature and a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))),'minimum execute ACL');
 foreach role_name in array array['anon','authenticated'] loop
  perform pg_temp.fa(not has_function_privilege(role_name,signature,'execute'),'no client RPC');
  perform pg_temp.fa(not has_table_privilege(role_name,'local_commerce.photo_reviews','select,insert,update,delete'),'no direct review access');
  perform pg_temp.fa(not has_table_privilege(role_name,'local_commerce.fulfillment_decisions','select,insert,update,delete'),'no direct decision access');
 end loop;
 perform pg_temp.fa((select relrowsecurity from pg_class where oid='local_commerce.photo_reviews'::regclass),'review RLS');
 perform pg_temp.fa(has_function_privilege('service_role',signature,'execute'),'service role minimum execute');
end;$security$;
set constraints all immediate;
`; }
