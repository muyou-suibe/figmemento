import {literal} from '../../scripts/local-commerce-ledger-wrapper.mjs';
import {previewManifestSqlChecks} from './local-commerce-preview-manifest-sql.mjs';

/** Full pre-apply schema/command matrix. All fixtures and DDL are rolled back;
 * media ready fixtures here do NOT replace the later real byte acceptance. */
export function fullPreviewManifestSqlChecks(project,marker) {return `${previewManifestSqlChecks(project,marker)}
-- The preceding matrix explicitly flushed deferred constraints. Restore the
-- transaction default before testing another independent publication.
set constraints all deferred;
create function pg_temp.preview_setup(flags boolean[],paid boolean default true,images integer default 0) returns jsonb language plpgsql as $f$
declare p jsonb;fid uuid;
begin
 p:=pg_temp.fulfillment_fixture(array_fill(images,array[cardinality(flags)]),true,1,paid,false,false,flags);
 if paid then perform pg_temp.admit(p);select id into fid from local_commerce.fulfillments where order_id=(p->>'order')::uuid;end if;
 return p||jsonb_build_object('fulfillment',fid,'version',1);
end;$f$;
create function pg_temp.preview_reserve(p jsonb,item uuid) returns jsonb language sql as $f$
 select p||jsonb_build_object('operation','reserve','key',pg_temp.preview_key(),'input',jsonb_build_object('orderItemId',item,'inputDigest',repeat('a',64)));$f$;
create function pg_temp.preview_ready(p jsonb,media uuid) returns jsonb language sql as $f$
 select p||jsonb_build_object('operation','ready','key',pg_temp.preview_key(),'input',jsonb_build_object('previewMediaId',media,
 'contentDigest',repeat('b',64),'contentType','image/png','byteSize',100,'width',10,'height',10));$f$;
do $full$
declare p jsonb;q jsonb;r jsonb;req jsonb;rr jsonb;pub jsonb;patch jsonb;bad jsonb;entries jsonb;
 item uuid;otheritem uuid;mid uuid;othermedia uuid;fid uuid;owner uuid;manifest uuid;flag boolean[];
 header_before text;items_before text;shipments_before bigint;events_before bigint;
begin
 select count(*) into shipments_before from local_commerce.shipments;
 select count(*) into events_before from local_commerce.shipment_events;
 foreach flag slice 1 in array array[array[true,false],array[true,true]] loop
   p:=pg_temp.preview_setup(flag);q:=pg_temp.preview_setup(array[true]);
   select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid order by item_sequence limit 1;
   select id into otheritem from local_commerce.order_items where order_id=(q->>'order')::uuid;
   req:=pg_temp.preview_reserve(p,item);
   for patch in select value from jsonb_array_elements(jsonb_build_array(
     '{"actorKind":"customer"}'::jsonb,'{"actorKind":"admin"}'::jsonb,'{"actorKind":"unsupported"}'::jsonb,
     '{"actor":"!"}'::jsonb,jsonb_build_object('project','foreign-project'),jsonb_build_object('marker',repeat('0',64)),
     jsonb_build_object('fulfillment',gen_random_uuid())
   )) loop perform pg_temp.fa(pg_temp.preview_call(req||patch)->>'status'='unavailable','new unauthorized/wrong identity rejected');end loop;
   perform pg_temp.fa(pg_temp.preview_call(pg_temp.preview_reserve(p,otheritem))->>'status'='unavailable','existing foreign item reserve');
   if flag[2]=false then
     select id into otheritem from local_commerce.order_items where order_id=(p->>'order')::uuid and item_sequence=1;
     perform pg_temp.fa(pg_temp.preview_call(pg_temp.preview_reserve(p,otheritem))->>'status'='unavailable','disabled item reserve');
   end if;
   r:=pg_temp.preview_call(req);mid:=(r#>>'{value,previewMediaId}')::uuid;
   perform pg_temp.fa(mid is not null and mid<>item,'server generated media identity');
   perform pg_temp.fa(pg_temp.preview_call(req||jsonb_build_object('ref',q->>'ref'))->>'status'='conflict','reserve changed Order');
   rr:=pg_temp.preview_ready(p,mid);
   for patch in select value from jsonb_array_elements('[{"contentDigest":"invalid"},{"contentDigest":null},{"contentType":"image/jpeg"},{"byteSize":0},{"byteSize":94371841},{"width":0},{"height":0},{"width":16000001},{"height":null}]'::jsonb) loop
     perform pg_temp.fa(pg_temp.preview_call(rr||jsonb_build_object('input',(rr->'input')||patch))->>'status'='unavailable','invalid final metadata rejected');
     perform pg_temp.fa((select lifecycle='pending' and version=1 and content_digest is null from local_commerce.fulfillment_preview_media where id=mid),'invalid metadata no partial ready');
   end loop;
   perform pg_temp.fa(pg_temp.preview_call(rr||jsonb_build_object('input',(rr->'input')||jsonb_build_object('previewMediaId',gen_random_uuid())))->>'status'='unavailable','unknown media ready');
   perform pg_temp.fa(pg_temp.preview_call(rr||jsonb_build_object('ref',q->>'ref','fulfillment',q->>'fulfillment'))->>'status'='unavailable','foreign owner Order media ready');
   perform pg_temp.fa(pg_temp.preview_call(rr||jsonb_build_object('fulfillment',gen_random_uuid()))->>'status'='unavailable','wrong fulfillment ready');
   -- Ready accepts no caller item/owner reassignment even with the right media.
   for patch in select value from jsonb_array_elements(jsonb_build_array(jsonb_build_object('ownerId',gen_random_uuid()),jsonb_build_object('orderItemId',gen_random_uuid()),jsonb_build_object('orderId',gen_random_uuid()))) loop
     perform pg_temp.fa(pg_temp.preview_call(rr||jsonb_build_object('input',(rr->'input')||patch))->>'status'='unavailable','ready ownership parameter pollution');
   end loop;
   perform pg_temp.fa(pg_temp.preview_call(rr)->>'status'='found','exact ready');
 end loop;
 -- Fully ready foreign artifact cannot satisfy a real local required item.
 select id into item from local_commerce.order_items where order_id=(q->>'order')::uuid;
 r:=pg_temp.preview_call(pg_temp.preview_reserve(q,item));othermedia:=(r#>>'{value,previewMediaId}')::uuid;
 perform pg_temp.fa(pg_temp.preview_call(pg_temp.preview_ready(q,othermedia))->>'status'='found','foreign ready setup');
 select jsonb_agg(jsonb_build_object('orderItemId',id,'previewMediaId',othermedia) order by item_sequence) into entries from local_commerce.order_items where order_id=(p->>'order')::uuid;
 pub:=p||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',jsonb_build_object('entries',entries));
 perform pg_temp.fa(pg_temp.preview_call(pub)->>'status'='unavailable','existing foreign ready media publication');
 -- Single required item success independently, including both snapshot tables.
 select md5(row_to_json(s)::text) into header_before from local_commerce.order_purchase_snapshots s where order_id=(q->>'order')::uuid;
 select md5(string_agg(row_to_json(s)::text,',' order by s.id)) into items_before from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.id=s.order_item_id where i.order_id=(q->>'order')::uuid;
 pub:=q||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('orderItemId',item,'previewMediaId',othermedia))));
 for patch in select jsonb_build_object('manifestVersion',n) from generate_series(2,4) n loop
   perform pg_temp.fa(pg_temp.preview_call(pub||jsonb_build_object('input',(pub->'input')||patch))->>'status'='unavailable','v2 v3 v4 cannot be allocated');
 end loop;
 r:=pg_temp.preview_call(pub);perform pg_temp.fa(r->>'status'='found' and r#>>'{value,manifestVersion}'='1','single v1');
 perform pg_temp.fa((select count(*)=1 from local_commerce.preview_manifest_entries where order_id=(q->>'order')::uuid),'single cardinality');
 perform pg_temp.fa((select md5(row_to_json(s)::text)=header_before from local_commerce.order_purchase_snapshots s where order_id=(q->>'order')::uuid),'header immutable');
 perform pg_temp.fa((select md5(string_agg(row_to_json(s)::text,',' order by s.id))=items_before from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.id=s.order_item_id where i.order_id=(q->>'order')::uuid),'item snapshots immutable');
 -- Direct relational forgery matrix. Nested blocks roll back each attempted
 -- parent plus entry; immediate FKs must reject before deferred completeness.
 p:=pg_temp.preview_setup(array[true]);select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid;
 fid:=(p->>'fulfillment')::uuid;owner:=(p->>'owner')::uuid;
 r:=pg_temp.preview_call(pg_temp.preview_reserve(p,item));mid:=(r#>>'{value,previewMediaId}')::uuid;
 set constraints all deferred;
 begin
   manifest:=gen_random_uuid();
   insert into local_commerce.preview_manifests(project_id,id,fulfillment_id,order_id,owner_id,manifest_version,item_ids,published_by,published_at)
     values(${literal(project)},manifest,fid,(p->>'order')::uuid,owner,1,jsonb_build_array(item),'local-development-operator',clock_timestamp());
   insert into local_commerce.preview_manifest_entries(project_id,manifest_id,fulfillment_id,order_id,owner_id,manifest_version,order_item_id,preview_media_id)
     values(${literal(project)},manifest,fid,(p->>'order')::uuid,owner,1,item,mid);
   raise exception 'pending lifecycle FK bypass';
 exception when foreign_key_violation then null;end;
 perform pg_temp.fa(pg_temp.preview_call(pg_temp.preview_ready(p,mid))->>'status'='found','FK ready setup');
 for patch in select value from jsonb_array_elements(jsonb_build_array(
   jsonb_build_object('project_id','foreign-project'),jsonb_build_object('owner_id',gen_random_uuid()),
   jsonb_build_object('order_id',q->>'order'),jsonb_build_object('fulfillment_id',q->>'fulfillment'),
   jsonb_build_object('manifest_version',2),jsonb_build_object('order_item_id',gen_random_uuid()),
   jsonb_build_object('preview_media_id',othermedia),jsonb_build_object('manifest_id',gen_random_uuid())
 )) loop
   begin
     manifest:=gen_random_uuid();
     insert into local_commerce.preview_manifests(project_id,id,fulfillment_id,order_id,owner_id,manifest_version,item_ids,published_by,published_at)
       values(${literal(project)},manifest,fid,(p->>'order')::uuid,owner,1,jsonb_build_array(item),'local-development-operator',clock_timestamp());
     bad:=jsonb_build_object('project_id',${literal(project)},'manifest_id',manifest,'fulfillment_id',fid,'order_id',p->>'order','owner_id',owner,'manifest_version',1,'order_item_id',item,'preview_media_id',mid)||patch;
     insert into local_commerce.preview_manifest_entries(project_id,manifest_id,fulfillment_id,order_id,owner_id,manifest_version,order_item_id,preview_media_id)
       values(bad->>'project_id',(bad->>'manifest_id')::uuid,(bad->>'fulfillment_id')::uuid,(bad->>'order_id')::uuid,(bad->>'owner_id')::uuid,(bad->>'manifest_version')::integer,(bad->>'order_item_id')::uuid,(bad->>'preview_media_id')::uuid);
     raise exception 'exact entry FK bypass';
   exception when foreign_key_violation then null;end;
 end loop;
 -- Parent manifest must itself match all four canonical relationship keys.
 q:=pg_temp.preview_setup(array[true]);
 for patch in select value from jsonb_array_elements(jsonb_build_array(
   jsonb_build_object('project_id','foreign-project'),jsonb_build_object('owner_id',gen_random_uuid()),
   jsonb_build_object('order_id',q->>'order'),jsonb_build_object('fulfillment_id',q->>'fulfillment')
 )) loop
   begin
     bad:=jsonb_build_object('project_id',${literal(project)},'order_id',p->>'order','owner_id',owner,'fulfillment_id',fid)||patch;
     insert into local_commerce.preview_manifests(project_id,fulfillment_id,order_id,owner_id,manifest_version,item_ids,published_by,published_at)
       values(bad->>'project_id',(bad->>'fulfillment_id')::uuid,(bad->>'order_id')::uuid,(bad->>'owner_id')::uuid,1,jsonb_build_array(item),'local-development-operator',clock_timestamp());
     raise exception 'exact parent FK bypass';
   exception when foreign_key_violation then null;end;
 end loop;
 -- All-required multi-item success, distinct from the mixed-order matrix.
 p:=pg_temp.preview_setup(array[true,true]);entries:='[]';
 for item in select id from local_commerce.order_items where order_id=(p->>'order')::uuid order by item_sequence loop
   r:=pg_temp.preview_call(pg_temp.preview_reserve(p,item));mid:=(r#>>'{value,previewMediaId}')::uuid;
   perform pg_temp.fa(pg_temp.preview_call(pg_temp.preview_ready(p,mid))->>'status'='found','multi required ready');
   entries:=entries||jsonb_build_array(jsonb_build_object('orderItemId',item,'previewMediaId',mid));
 end loop;
 pub:=p||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',jsonb_build_object('entries',entries));
 bad:=jsonb_build_array((entries->0)||jsonb_build_object('previewMediaId',entries#>>'{1,previewMediaId}'),(entries->1)||jsonb_build_object('previewMediaId',entries#>>'{0,previewMediaId}'));
 perform pg_temp.fa(pg_temp.preview_call(pub||jsonb_build_object('input',jsonb_build_object('entries',bad)))->>'status'='unavailable','distinct media swapped between items');
 r:=pg_temp.preview_call(pub);
 perform pg_temp.fa(r->>'status'='found' and r#>>'{value,manifestVersion}'='1' and r#>>'{value,revisionRequestsUsed}'='0','all required multi v1');
 perform pg_temp.fa((select count(*)=2 from local_commerce.preview_manifest_entries where order_id=(p->>'order')::uuid),'all required two entries');
 -- Unpaid and pending photo review cannot authorize publication.
 p:=pg_temp.preview_setup(array[true],false);req:=p||jsonb_build_object('operation','reserve','key',pg_temp.preview_key(),'fulfillment',gen_random_uuid(),'input','{}'::jsonb);
 perform pg_temp.fa(pg_temp.preview_call(req)->>'status'='unavailable','unpaid');
 p:=pg_temp.preview_setup(array[true],true,1);select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid;
 r:=pg_temp.preview_call(pg_temp.preview_reserve(p,item));mid:=(r#>>'{value,previewMediaId}')::uuid;
 perform pg_temp.fa(pg_temp.preview_call(pg_temp.preview_ready(p,mid))->>'status'='found','photo gate ready');
 pub:=p||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('orderItemId',item,'previewMediaId',mid))));
 perform pg_temp.fa(pg_temp.preview_call(pub)->>'status'='unavailable','pending applicable photo review blocks');
 perform pg_temp.fa((select count(*) from local_commerce.shipments)=shipments_before,'no Shipment');
 perform pg_temp.fa((select count(*) from local_commerce.shipment_events)=events_before,'no tracking events');
 set constraints all immediate;
end;$full$;
`;}
