import {literal} from '../../scripts/local-commerce-ledger-wrapper.mjs';
import {fullPreviewManifestSqlChecks} from './local-commerce-preview-manifest-full-sql.mjs';

// Transaction-local synthetic fixtures. Not a substitute for real HTTP bytes.
export function customerPreviewSqlChecks(project,marker){return `${fullPreviewManifestSqlChecks(project,marker)}
set constraints all deferred;
create function pg_temp.customer_preview(p jsonb,op text,k text,v integer,n text default '') returns jsonb language sql as $f$
 select local_commerce.fulfillment_customer_command(coalesce(p->>'project',${literal(project)}),coalesce(p->>'marker',${literal(marker)}),coalesce(p->>'ownerKind','guest'),
 case when p->>'ownerKind'='customer' then p->>'owner' else
 (select subject_hash from local_commerce.commerce_owners where project_id=${literal(project)} and id=(p->>'owner')::uuid) end,
 (p->>'customer')::uuid,p->>'session',coalesce((p->>'expires')::timestamptz,clock_timestamp()+interval '10 minutes'),p->>'key',p->>'ref',op,k,v,n,
 case when p ? 'customerVersion' then (p->>'customerVersion')::integer else
 (select version from local_commerce.fulfillments where project_id=${literal(project)} and order_id=(p->>'order')::uuid) end);$f$;
create function pg_temp.next_preview(p jsonb) returns jsonb language plpgsql as $f$
declare item uuid;media uuid;v integer;r jsonb;begin
 select version into v from local_commerce.fulfillments where project_id=${literal(project)} and order_id=(p->>'order')::uuid;
 p:=p||jsonb_build_object('version',v);
 select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid;
 r:=pg_temp.preview_call(pg_temp.preview_reserve(p,item));
 perform pg_temp.fa(r->>'status'='found','reserve next');media:=(r#>>'{value,previewMediaId}')::uuid;
 perform pg_temp.fa(pg_temp.preview_call(pg_temp.preview_ready(p,media))->>'status'='found','ready next');
 return pg_temp.preview_call(p||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',
   jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('orderItemId',item,'previewMediaId',media)))));
end;$f$;
do $cases$
declare p jsonb;r jsonb;again jsonb;k text;v integer;history text;bad text;original_version integer;
begin
 -- Independent initial approval: the revision-chain approval at v3 is not
 -- evidence for the zero-revision v1 path.
 p:=pg_temp.preview_setup(array[true]);
 insert into local_commerce.access_grants(project_id,owner_id,resource_kind,resource_id,capability_hash,expires_at)
 values(${literal(project)},(p->>'owner')::uuid,'local_order',(p->>'order')::uuid,p->>'key',clock_timestamp()+interval '10 minutes');
 perform pg_temp.next_preview(p);
 select version into original_version from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 p:=p||jsonb_build_object('customerVersion',original_version);
 k:=pg_temp.preview_key();r:=pg_temp.customer_preview(p,'approve_preview',k,1);
 perform pg_temp.fa(r#>>'{value,status}'='preview_approved' and r#>>'{value,revisionRequestsUsed}'='0','independent v1 approval');
 again:=pg_temp.customer_preview(p,'approve_preview',k,1);
 perform pg_temp.fa(again->>'replayed'='true' and again->'value'=r->'value','v1 exact CAS replay');
 perform pg_temp.fa(pg_temp.customer_preview(p||jsonb_build_object('customerVersion',original_version+1),'approve_preview',k,1)->>'status'='conflict','v1 changed CAS conflicts');
 perform pg_temp.fa(pg_temp.customer_preview(p,'request_revision',k,1,'changed action')->>'status'='conflict','v1 changed action conflicts');
 perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',k,2)->>'status'='conflict','same action changed preview version conflicts');
 perform pg_temp.fa((select count(*)=1 from local_commerce.fulfillment_decisions where order_id=(p->>'order')::uuid and decision_kind='customer_approve'),'one approval');
 perform pg_temp.fa(not exists(select 1 from local_commerce.fulfillment_decisions where order_id=(p->>'order')::uuid and decision_kind='customer_revision'),'no revision decision');
 perform pg_temp.fa((select count(*)=1 and max(manifest_version)=1 from local_commerce.preview_manifests where order_id=(p->>'order')::uuid),'no v2');
 perform pg_temp.fa(not exists(select 1 from local_commerce.shipments where order_id=(p->>'order')::uuid),'v1 no shipment');
 p:=pg_temp.preview_setup(array[true]);
 insert into local_commerce.access_grants(project_id,owner_id,resource_kind,resource_id,capability_hash,expires_at)
 values(${literal(project)},(p->>'owner')::uuid,'local_order',(p->>'order')::uuid,p->>'key',clock_timestamp()+interval '10 minutes');
 r:=pg_temp.next_preview(p);perform pg_temp.fa(r#>>'{value,manifestVersion}'='1','v1');
 for v in 1..2 loop
   select version into original_version from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
   p:=p||jsonb_build_object('customerVersion',original_version);
   foreach bad in array array['',' ',repeat('x',501)] loop
     perform pg_temp.fa(pg_temp.customer_preview(p,'request_revision',pg_temp.preview_key(),v,bad)->>'status'='unavailable','bad note');
   end loop;
   perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',pg_temp.preview_key(),null)->>'status'='unavailable','missing version');
   k:=pg_temp.preview_key();r:=pg_temp.customer_preview(p,'request_revision',k,v,repeat('x',500));
   perform pg_temp.fa(r->>'status'='found','revision '||r::text);
   perform pg_temp.fa((r#>>'{value,revisionRequestsUsed}')::integer=v,'one increment');
   again:=pg_temp.customer_preview(p,'request_revision',k,v,repeat('x',500));
   perform pg_temp.fa(again->>'replayed'='true' and again->'value'=r->'value','exact replay');
   perform pg_temp.fa(pg_temp.customer_preview(p||jsonb_build_object('customerVersion',original_version+1),'request_revision',k,v,repeat('x',500))->>'status'='conflict','changed aggregate CAS conflicts');
   perform pg_temp.fa(pg_temp.customer_preview(p,'request_revision',k,v,'changed')->>'status'='conflict','changed note');
   perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',pg_temp.preview_key(),v)->>'status'='conflict','revision pending');
   select md5(string_agg(to_jsonb(m)::text,',' order by m.id)) into history from local_commerce.preview_manifests m where order_id=(p->>'order')::uuid;
   r:=pg_temp.next_preview(p);perform pg_temp.fa((r#>>'{value,manifestVersion}')::integer=v+1,'next server version');
   perform pg_temp.fa((r#>>'{value,revisionRequestsUsed}')::integer=v,'counter retained');
   perform pg_temp.fa((select md5(string_agg(to_jsonb(m)::text,',' order by m.id))=history from local_commerce.preview_manifests m where order_id=(p->>'order')::uuid and manifest_version<=v),'old manifests unchanged');
   perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',pg_temp.preview_key(),v)->>'status'='conflict','stale');
 end loop;
 select version into original_version from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 p:=p||jsonb_build_object('customerVersion',original_version);
 perform pg_temp.fa(pg_temp.customer_preview(p,'request_revision',pg_temp.preview_key(),3,'third')->>'status'='conflict','third');
 k:=pg_temp.preview_key();r:=pg_temp.customer_preview(p,'approve_preview',k,3);
 perform pg_temp.fa(r#>>'{value,status}'='preview_approved','approval');
 perform pg_temp.fa(pg_temp.customer_preview(p,'approve_preview',k,3)->>'replayed'='true','approval replay');
 perform pg_temp.fa((select max(manifest_version)=3 and count(*)=3 from local_commerce.preview_manifests where order_id=(p->>'order')::uuid),'no v4');
 perform pg_temp.fa(not exists(select 1 from local_commerce.shipments where order_id=(p->>'order')::uuid),'no shipment');
end;$cases$;
set constraints all immediate;
`;}
