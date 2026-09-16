import {literal} from '../../scripts/local-commerce-ledger-wrapper.mjs';
import {fulfillmentAdmissionSqlChecks} from './local-commerce-fulfillment-admission-sql.mjs';

// SQL fixtures are rolled back. They are NOT customer HTTP/Storage acceptance.
export function previewManifestSqlChecks(project, marker) {
  return `${fulfillmentAdmissionSqlChecks(project, marker)}
create function pg_temp.preview_call(p jsonb) returns jsonb language sql as $f$
 select local_commerce.fulfillment_preview_command(coalesce(p->>'project',${literal(project)}),coalesce(p->>'marker',${literal(marker)}),
 coalesce(p->>'actorKind','operator'),coalesce(p->>'actor','local-development-operator'),p->>'ref',p->>'operation',
 (p->>'fulfillment')::uuid,coalesce((p->>'version')::integer,1),p->>'key',coalesce(p->'input','{}'));
$f$;
create function pg_temp.preview_key() returns text language sql as $f$
 select encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');$f$;
do $test$
declare p jsonb;q jsonb;r jsonb;request jsonb;ready_request jsonb;publication jsonb;entries jsonb;item record;
 fid uuid;mid uuid;before_digest text;target text;bad jsonb; foreign_order uuid; foreign_fulfillment uuid;
begin
 p:=pg_temp.fulfillment_fixture(array[0,0,0],true,1,true,false,false,array[true,false,true]);perform pg_temp.admit(p);
 select id into fid from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 p:=p||jsonb_build_object('fulfillment',fid);entries:='[]';
 select md5(row_to_json(s)::text) into before_digest from local_commerce.order_purchase_snapshots s where order_id=(p->>'order')::uuid;
 for item in select id from local_commerce.order_items where order_id=(p->>'order')::uuid and item_sequence<>1 loop
   request:=p||jsonb_build_object('operation','reserve','key',pg_temp.preview_key(),
     'input',jsonb_build_object('orderItemId',item.id,'inputDigest',repeat('a',64)));
   perform pg_temp.fa(pg_temp.preview_call(request||'{"actorKind":"customer"}')->>'status'='unavailable','customer reserve denied');
   perform pg_temp.fa(pg_temp.preview_call(request||jsonb_build_object('marker',repeat('0',64)))->>'status'='unavailable','marker denied');
   perform pg_temp.fa(pg_temp.preview_call(request||'{"project":"foreign-project"}')->>'status'='unavailable','project denied');
   r:=pg_temp.preview_call(request);perform pg_temp.fa(r->>'status'='found','reserve');
   mid:=(r#>>'{value,previewMediaId}')::uuid;
   perform pg_temp.fa((select content_digest is null and width is null and byte_size is null from local_commerce.fulfillment_preview_media where id=mid),'pending facts unset');
   perform pg_temp.fa(pg_temp.preview_call(request)#>>'{replayed}'='true','reserve replay');
   perform pg_temp.fa(pg_temp.preview_call(request||'{"actor":"different-operator"}')->>'status'='conflict','actor conflict');
   perform pg_temp.fa(pg_temp.preview_call(request||jsonb_build_object('input',(request->'input')||'{"manifestVersion":4}'))->>'status'='conflict','normalized input conflict');
   perform pg_temp.fa(pg_temp.preview_call(request||'{"operation":"publish"}')->>'status'='conflict','same key different kind');
   perform pg_temp.fa(pg_temp.preview_call(request||jsonb_build_object('fulfillment',gen_random_uuid()))->>'status'='conflict','same key different fulfillment');
   entries:=entries||jsonb_build_array(jsonb_build_object('orderItemId',item.id,'previewMediaId',mid));
   publication:=p||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',jsonb_build_object('entries',entries));
   perform pg_temp.fa(pg_temp.preview_call(publication)->>'status'='unavailable','missing or unready denies');
   ready_request:=p||jsonb_build_object('operation','ready','key',pg_temp.preview_key(),'input',jsonb_build_object('previewMediaId',mid,
     'contentDigest',repeat('b',64),'contentType','image/png','byteSize',100,'width',10,'height',10));
   perform pg_temp.fa(pg_temp.preview_call(ready_request||jsonb_build_object('input',(ready_request->'input')||'{"width":0}'))->>'status'='unavailable','invalid ready metadata');
   create trigger preview_ready_fault after insert on local_commerce.fulfillment_decisions for each row execute function pg_temp.fulfillment_fault();
   perform pg_temp.fa(pg_temp.preview_call(ready_request)->>'status'='unavailable','ready audit failure');
   drop trigger preview_ready_fault on local_commerce.fulfillment_decisions;
   perform pg_temp.fa((select lifecycle='pending' and content_digest is null and version=1 from local_commerce.fulfillment_preview_media where id=mid),'ready failure rolls back final facts');
   r:=pg_temp.preview_call(ready_request);perform pg_temp.fa(r->>'status'='found','ready transition: '||r::text);
   perform pg_temp.fa(pg_temp.preview_call(ready_request)->>'replayed'='true','ready replay');
   perform pg_temp.fa(pg_temp.preview_call(ready_request||jsonb_build_object('input',(ready_request->'input')||'{"width":11}'))->>'status'='conflict','ready conflict');
   begin
     update local_commerce.fulfillment_preview_media set width=11 where id=mid;
     raise exception 'ready mutation unexpectedly allowed';
   exception when raise_exception then
     if sqlerrm<>'immutable preview media facts' then raise;end if;
   end;
 end loop;
 publication:=p||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',jsonb_build_object('entries',entries));
 for bad in select value from jsonb_array_elements(jsonb_build_array(
   jsonb_build_object('entries',jsonb_build_array(entries->0)),
   jsonb_build_object('entries',jsonb_build_array(entries->0,(entries->1)||jsonb_build_object('previewMediaId',gen_random_uuid()))),
   jsonb_build_object('entries',jsonb_build_array(entries->0,(entries->1)||jsonb_build_object('previewMediaId',entries#>>'{0,previewMediaId}'))),
   jsonb_build_object('entries',jsonb_build_array(entries->0,(entries->1)||jsonb_build_object('orderItemId',gen_random_uuid()))),
   jsonb_build_object('entries',entries||jsonb_build_array(jsonb_build_object('orderItemId',
     (select id from local_commerce.order_items where order_id=(p->>'order')::uuid and item_sequence=1),'previewMediaId',mid)))
 )) loop
   perform pg_temp.fa(pg_temp.preview_call(publication||jsonb_build_object('input',bad))->>'status'='unavailable','exact relational input rejection');
 end loop;
 foreach target in array array['preview_manifests','preview_manifest_entries','fulfillments','fulfillment_decisions'] loop
   execute 'create trigger preview_test_fault after insert or update on local_commerce.'||target||' for each row execute function pg_temp.fulfillment_fault()';
   r:=pg_temp.preview_call(publication);perform pg_temp.fa(r->>'status'='unavailable','publication fault '||target);
   execute 'drop trigger preview_test_fault on local_commerce.'||target;
   perform pg_temp.fa(not exists(select 1 from local_commerce.preview_manifests where fulfillment_id=fid),'manifest rollback');
   perform pg_temp.fa(not exists(select 1 from local_commerce.preview_manifest_entries where fulfillment_id=fid),'entries rollback');
   perform pg_temp.fa((select current_manifest_id is null and fulfillment_state='photo_review' and version=1 from local_commerce.fulfillments where id=fid),'pointer lifecycle rollback');
   perform pg_temp.fa(not exists(select 1 from local_commerce.fulfillment_decisions where action_key=publication->>'key'),'action audit rollback');
 end loop;
 bad:=publication||jsonb_build_object('input',jsonb_build_object('entries',jsonb_build_array(entries->0,entries->0)));
 perform pg_temp.fa(pg_temp.preview_call(bad)->>'status'='unavailable','duplicate item');
 perform pg_temp.fa(pg_temp.preview_call(publication||jsonb_build_object('input',(publication->'input')||'{"manifestVersion":4}'))->>'status'='unavailable','no arbitrary version');
 r:=pg_temp.preview_call(publication);perform pg_temp.fa(r->>'status'='found','publish: '||r::text);
 perform pg_temp.fa(r#>>'{value,manifestVersion}'='1' and r#>>'{value,revisionRequestsUsed}'='0','initial v1 zero revisions');
 set constraints all immediate;
 perform pg_temp.fa(pg_temp.preview_call(publication)->>'replayed'='true','publish replay after lifecycle');
 perform pg_temp.fa(pg_temp.preview_call(publication||jsonb_build_object('key',pg_temp.preview_key()))->>'status' in ('conflict','unavailable'),'new publication cannot duplicate');
 perform pg_temp.fa((select count(*)=2 from local_commerce.preview_manifest_entries where fulfillment_id=fid),'two exact entries');
 begin
   update local_commerce.preview_manifests set manifest_version=2 where id=(r#>>'{value,manifestId}')::uuid;
   raise exception 'published manifest changed';
 exception when raise_exception then if sqlerrm<>'immutable preview manifest' then raise;end if;end;
 begin
   delete from local_commerce.preview_manifest_entries where manifest_id=(r#>>'{value,manifestId}')::uuid;
   raise exception 'published entries deleted';
 exception when raise_exception then if sqlerrm<>'immutable preview manifest entry' then raise;end if;end;
 perform pg_temp.fa((select md5(row_to_json(s)::text)=before_digest from local_commerce.order_purchase_snapshots s where order_id=(p->>'order')::uuid),'purchase unchanged');
 q:=pg_temp.fulfillment_fixture(array[0]);perform pg_temp.admit(q);
 perform pg_temp.fa(pg_temp.preview_call(publication||jsonb_build_object('ref',q->>'ref'))->>'status'='conflict','key changed Order');
 perform pg_temp.fa(pg_temp.preview_call(publication||'{"actorKind":"customer"}')->>'status'='unavailable','customer publication replay denied');
 begin
   update local_commerce.fulfillments set current_manifest_id=(r#>>'{value,manifestId}')::uuid where order_id=(q->>'order')::uuid;
   raise exception 'foreign manifest installed';
 exception when foreign_key_violation then null;end;
 -- Same owner is insufficient: current pointer must match Order/Fulfillment.
 foreign_order:=gen_random_uuid();foreign_fulfillment:=gen_random_uuid();
 insert into local_commerce.orders(project_id,id,owner_id,public_reference)
   values(${literal(project)},foreign_order,(p->>'owner')::uuid,'FM-LOCAL-'||upper(substr(replace(foreign_order::text,'-',''),1,16)));
 insert into local_commerce.fulfillments(project_id,id,order_id,owner_id)
   values(${literal(project)},foreign_fulfillment,foreign_order,(p->>'owner')::uuid);
 begin
   update local_commerce.fulfillments set current_manifest_id=(r#>>'{value,manifestId}')::uuid where id=foreign_fulfillment;
   raise exception 'same owner foreign manifest installed';
 exception when foreign_key_violation then null;end;
 begin
   insert into local_commerce.preview_manifest_entries(project_id,manifest_id,fulfillment_id,order_id,owner_id,manifest_version,order_item_id,preview_media_id)
   values(${literal(project)},(r#>>'{value,manifestId}')::uuid,fid,(p->>'order')::uuid,(p->>'owner')::uuid,2,(entries#>>'{0,orderItemId}')::uuid,(entries#>>'{0,previewMediaId}')::uuid);
   raise exception 'wrong relational version allowed';
 exception when foreign_key_violation or unique_violation then null;end;
 q:=pg_temp.fulfillment_fixture(array[0],false);perform pg_temp.admit(q);
 select id into foreign_fulfillment from local_commerce.fulfillments where order_id=(q->>'order')::uuid;
 perform pg_temp.fa(pg_temp.preview_call(q||jsonb_build_object('fulfillment',foreign_fulfillment,'operation','publish','key',pg_temp.preview_key(),'input',jsonb_build_object('entries','[]'::jsonb)))->>'status'='unavailable','no dummy manifest');
end;$test$;
`;
}
