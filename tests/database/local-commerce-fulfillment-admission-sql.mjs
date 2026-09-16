import {literal} from '../../scripts/local-commerce-ledger-wrapper.mjs';

/** Rollback-only SQL fixtures exercise transaction/schema guarantees, not a
 * claim that these synthetic setup rows travelled through customer HTTP. */
export function fulfillmentAdmissionSqlChecks(project,marker) {return `
create function pg_temp.fulfillment_call(p jsonb) returns jsonb language sql as $f$
 select local_commerce.fulfillment_admission(${literal(project)},coalesce(p->>'marker',${literal(marker)}),
 coalesce(p->>'actorKind','operator'),coalesce(p->>'actor','local-development-operator'),p->>'ref',p->>'operation',
 (p->>'order')::uuid,(p->>'version')::integer,p->>'key',p->>'context'); $f$;
create function pg_temp.admit(p jsonb) returns jsonb language plpgsql as $f$
declare r jsonb;begin
 r:=pg_temp.fulfillment_call(p||'{"operation":"prepare"}');
 if r->>'status'<>'found' or r#>>'{value,replayed}'='true' then return r; end if;
 return pg_temp.fulfillment_call(p||jsonb_build_object('operation','commit','version',r#>'{value,version}','context',r#>>'{value,contextDigest}'));
end; $f$;
create function pg_temp.fa(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FULFILLMENT: %',label;end if;end;$f$;
create function pg_temp.fulfillment_fixture(media_counts integer[],preview boolean default true,qty integer default 1,paid boolean default true,missing_media boolean default false,malformed_media boolean default false,preview_flags boolean[] default null)
returns jsonb language plpgsql as $f$
declare owner uuid:=gen_random_uuid();purchase uuid:=gen_random_uuid();item_id uuid;product uuid:=gen_random_uuid();variant uuid:=gen_random_uuid();
 ref text:='FM-LOCAL-'||upper(substr(replace(purchase::text,'-',''),1,16));h text:=encode(sha256(convert_to(purchase::text,'UTF8')),'hex');
 item jsonb;items jsonb:='[]';media jsonb;field_values jsonb;one jsonb; n integer;seq integer:=0;receipt uuid;
begin
 insert into local_commerce.commerce_owners(project_id,id,owner_kind,subject_hash) values(${literal(project)},owner,'guest',h);
 insert into local_commerce.orders(project_id,id,owner_id,public_reference,lifecycle_status)
 values(${literal(project)},purchase,owner,ref,case when paid then 'paid' else 'pending_payment' end);
 foreach n in array media_counts loop
  item_id:=gen_random_uuid();media:='[]';field_values:='[]';
  for j in 1..n loop receipt:=gen_random_uuid();media:=media||jsonb_build_array(jsonb_build_object('receiptId',receipt,'fieldId','photo','fieldCode','photo','position',j-1));end loop;
  item:=jsonb_build_object('product',jsonb_build_object('id',product,'slug','synthetic','name','Synthetic'),
   'variant',jsonb_build_object('id',variant,'productId',product,'skuCode','SYNTHETIC','selectedOptions','[]'::jsonb),
   'fulfillment',jsonb_build_object('productId',product,'requiresProductionPreview',coalesce(preview_flags[seq+1],preview)),
   'configuration','{}'::jsonb,'customizationValues',field_values,'quantity',qty,'media',media);
  if missing_media then item:=item-'media';end if;
  if malformed_media then item:=jsonb_set(item,'{media}','null'::jsonb);end if;
  items:=items||jsonb_build_array(item);
  insert into local_commerce.order_items(project_id,id,order_id,owner_id,item_sequence) values(${literal(project)},item_id,purchase,owner,seq);
  insert into local_commerce.order_item_purchase_snapshots(project_id,order_item_id,owner_id,product_id,product_slug,product_name,sku_code,
   variant_facts,customization_facts,configuration_revision,receipt_references,quantity,unit_price_cents,line_subtotal_cents,currency,fulfillment_type)
  values(${literal(project)},item_id,owner,product,'synthetic','Synthetic','SYNTHETIC',item->'variant',
   jsonb_build_object('fulfillment',item->'fulfillment','definition',item->'configuration','values',item->'customizationValues'),1,media,qty,100,100*qty,'USD','physical');
  seq:=seq+1;
 end loop;
 insert into local_commerce.order_purchase_snapshots(project_id,order_id,owner_id,purchase_facts,currency,subtotal_cents,shipping_cents,discount_cents,total_cents)
 values(${literal(project)},purchase,owner,jsonb_build_object('items',items,'contact','{}'::jsonb),'USD',100*qty*seq,0,0,100*qty*seq);
 if paid then insert into local_commerce.payment_attempts(project_id,order_id,owner_id,action_key,amount_cents,currency,outcome,lifecycle)
  values(${literal(project)},purchase,owner,h,100*qty*seq,'USD','succeeded','settled');end if;
 return jsonb_build_object('order',purchase,'owner',owner,'ref',ref,'key',h);
end;$f$;
do $check$
declare p jsonb;q jsonb;r jsonb;before_digest text;after_digest text;counts integer[];preview boolean;n integer;fid uuid;itemid uuid;
begin
 foreach counts slice 1 in array array[array[1,0],array[0,0],array[2,0],array[1,1]] loop
  foreach preview in array array[true,false] loop
   p:=pg_temp.fulfillment_fixture(counts,preview,3);
   select md5(row_to_json(s)::text) into before_digest from local_commerce.order_purchase_snapshots s where order_id=(p->>'order')::uuid;
   r:=pg_temp.fulfillment_call(p||'{"operation":"read"}');perform pg_temp.fa(r->>'status'='unavailable','read does not admit');
   perform pg_temp.fa((select count(*)=0 from local_commerce.fulfillments where order_id=(p->>'order')::uuid),'no read write');
   perform pg_temp.fa(pg_temp.admit(p||'{"actorKind":"customer"}')->>'status'='unavailable','customer cannot admit');
   r:=pg_temp.admit(p);perform pg_temp.fa(r->>'status'='found','admit: '||r::text);
   perform pg_temp.fa(r#>>'{value,fulfillment,status}'='photo_review' and r#>>'{value,fulfillment,version}'='1','initial aggregate');
   select count(*) into n from unnest(counts) x where x>0;
   perform pg_temp.fa((select count(*)=n from local_commerce.photo_reviews where order_id=(p->>'order')::uuid),'one per stable applicable item');
   perform pg_temp.fa(not exists(select 1 from local_commerce.photo_reviews where order_id=(p->>'order')::uuid and review_state<>'pending'),'no fake approval');
   perform pg_temp.fa(pg_temp.admit(p)#>>'{value,replayed}'='true','replay');
   perform pg_temp.fa(pg_temp.admit(p||'{"actor":"different-operator"}')->>'status'='conflict','actor changed');
   perform pg_temp.fa(pg_temp.admit(p||jsonb_build_object('key',encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex')))->>'status'='conflict','new key cannot duplicate');
   perform pg_temp.fa((select count(*)=1 from local_commerce.fulfillment_decisions where order_id=(p->>'order')::uuid and result->'audit' is not null),'one audit');
   select md5(row_to_json(s)::text) into after_digest from local_commerce.order_purchase_snapshots s where order_id=(p->>'order')::uuid;
   perform pg_temp.fa(before_digest=after_digest,'immutable');
  end loop;
 end loop;
 p:=pg_temp.fulfillment_fixture(array[1],true,1,false);perform pg_temp.fa(pg_temp.admit(p)->>'status'='unavailable','unpaid');
 p:=pg_temp.fulfillment_fixture(array[0],true,1,true,true);perform pg_temp.fa(pg_temp.admit(p)->>'status'='unavailable','missing not empty');
 p:=pg_temp.fulfillment_fixture(array[0],true,1,true,false,true);perform pg_temp.fa(pg_temp.admit(p)->>'status'='unavailable','malformed not empty');
 p:=pg_temp.fulfillment_fixture(array[1]);perform pg_temp.fa(pg_temp.admit(p||jsonb_build_object('marker',repeat('0',64)))->>'status'='unavailable','wrong marker');
 perform pg_temp.fa(pg_temp.admit(p||'{"actorKind":"admin"}')->>'status'='unavailable','no implicit Admin authority');
 perform pg_temp.admit(p);
 select id into fid from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 q:=pg_temp.fulfillment_fixture(array[1]);
 select id into itemid from local_commerce.order_items where order_id=(q->>'order')::uuid;
 begin
  insert into local_commerce.photo_reviews(project_id,fulfillment_id,order_item_id,order_id,owner_id)
  values(${literal(project)},fid,itemid,(p->>'order')::uuid,(p->>'owner')::uuid);
  raise exception 'foreign item unexpectedly allowed';
 exception when foreign_key_violation then null;end;
end;$check$;
create function pg_temp.fulfillment_fault() returns trigger language plpgsql as $f$ begin raise exception 'synthetic fault';end;$f$;
do $check$
declare target text;p jsonb;r jsonb;
begin
 foreach target in array array['fulfillments','photo_reviews','fulfillment_decisions'] loop
  p:=pg_temp.fulfillment_fixture(array[1,1]);
  execute 'create trigger task7_test_fault after insert on local_commerce.'||target||' for each row execute function pg_temp.fulfillment_fault()';
  r:=pg_temp.admit(p);perform pg_temp.fa(r->>'status'='unavailable','fault '||target);
  execute 'drop trigger task7_test_fault on local_commerce.'||target;
  perform pg_temp.fa((select count(*)=0 from local_commerce.fulfillments where order_id=(p->>'order')::uuid),'aggregate rollback');
  perform pg_temp.fa((select count(*)=0 from local_commerce.photo_reviews where order_id=(p->>'order')::uuid),'review rollback');
  perform pg_temp.fa((select count(*)=0 from local_commerce.fulfillment_decisions where order_id=(p->>'order')::uuid),'action/audit rollback');
 end loop;
end;$check$;
`;}
