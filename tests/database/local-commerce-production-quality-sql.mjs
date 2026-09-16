import {literal} from '../../scripts/local-commerce-ledger-wrapper.mjs';
export function productionQualitySql(project,marker){return `
set constraints all deferred;
create function pg_temp.lifecycle_call(p jsonb,a text,k text,v integer) returns jsonb language sql as $f$
 select local_commerce.fulfillment_lifecycle_command(coalesce(p->>'project',${literal(project)}),coalesce(p->>'marker',${literal(marker)}),
 coalesce(p->>'actorKind','operator'),coalesce(p->>'actor','local-development-operator'),p->>'ref','commit',a,v,k);$f$;
do $cases$
declare p jsonb;r jsonb;original jsonb;k text;v integer;s text;history text;target text;timing text;patch jsonb;images integer;
begin
 for images in 0..1 loop
  p:=pg_temp.preview_setup(array[false],true,images);
  if images=1 then
   perform pg_temp.fa(pg_temp.lifecycle_call(p,'start_production',pg_temp.preview_key(),1)->>'status'='conflict','pending review blocks no-preview');
   update local_commerce.photo_reviews set review_state='rejected' where order_id=(p->>'order')::uuid;
   perform pg_temp.fa(pg_temp.lifecycle_call(p,'start_production',pg_temp.preview_key(),1)->>'status'='conflict','rejected review blocks');
   -- Transaction-private gate fixture; not a production review command.
   update local_commerce.photo_reviews set review_state='approved' where order_id=(p->>'order')::uuid;
  end if;
  history:=pg_temp.customer_history_state((p->>'order')::uuid,3);
  foreach target in array array['fulfillments','fulfillment_decisions'] loop
   foreach timing in array array['before','after'] loop
    s:=pg_temp.customer_preview_state((p->>'order')::uuid);
    execute 'create trigger lifecycle_fault '||timing||' insert or update on local_commerce.'||target||' for each row execute function pg_temp.fulfillment_fault()';
    r:=pg_temp.lifecycle_call(p,'start_production',pg_temp.preview_key(),1);
    execute 'drop trigger lifecycle_fault on local_commerce.'||target;
    perform pg_temp.fa(r->>'status'='unavailable' and s=pg_temp.customer_preview_state((p->>'order')::uuid),'lifecycle fault zero partial state');
   end loop;
  end loop;
  k:=pg_temp.preview_key();original:=pg_temp.lifecycle_call(p,'start_production',k,1);
  perform pg_temp.fa(original#>>'{value,status}'='in_production','disabled preview production');
  perform pg_temp.fa(not exists(select 1 from local_commerce.preview_manifests where order_id=(p->>'order')::uuid),'no dummy manifest');
  perform pg_temp.fa(not exists(select 1 from local_commerce.fulfillment_decisions where order_id=(p->>'order')::uuid and decision_kind='customer_approve'),'no dummy approval');
  perform pg_temp.fa(pg_temp.lifecycle_call(p,'mark_quality_check',pg_temp.preview_key(),2)#>>'{value,status}'='quality_check','quality terminal');
  r:=pg_temp.lifecycle_call(p,'start_production',k,1);
  perform pg_temp.fa(r->>'replayed'='true' and r->'value'=original->'value','old production replay after quality');
  for patch in select value from jsonb_array_elements('[{"actor":"changed-operator"},{"actorKind":"customer"},{"project":"wrong"},{"marker":"wrong"}]') loop
   perform pg_temp.fa(pg_temp.lifecycle_call(p||patch,'start_production',k,1)->>'status' in ('conflict','unavailable'),'foreign authority');
  end loop;
  perform pg_temp.fa(pg_temp.lifecycle_call(p,'start_production',k,2)->>'status'='conflict','same key changed version');
  perform pg_temp.fa(pg_temp.lifecycle_call(p,'mark_quality_check',k,1)->>'status'='conflict','same key changed kind');
  perform pg_temp.fa(pg_temp.lifecycle_call(p,'mark_quality_check',pg_temp.preview_key(),3)->>'status'='conflict','terminal no next quality');
  perform pg_temp.fa(history=pg_temp.customer_history_state((p->>'order')::uuid,3),'immutable purchases');
  perform pg_temp.fa(not exists(select 1 from local_commerce.shipments where order_id=(p->>'order')::uuid),'zero shipment');
 end loop;
 p:=pg_temp.preview_setup(array[true]);
 insert into local_commerce.access_grants(project_id,owner_id,resource_kind,resource_id,capability_hash,expires_at)
 values(${literal(project)},(p->>'owner')::uuid,'local_order',(p->>'order')::uuid,p->>'key',clock_timestamp()+interval '10 minutes');
 perform pg_temp.fa(pg_temp.lifecycle_call(p,'start_production',pg_temp.preview_key(),1)->>'status'='conflict','missing required preview');
 perform pg_temp.next_preview(p);
 select version into v from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 perform pg_temp.fa(pg_temp.lifecycle_call(p,'start_production',pg_temp.preview_key(),v)->>'status'='conflict','unapproved preview');
 perform pg_temp.customer_preview(p,'request_revision',pg_temp.preview_key(),1,'adjust');
 select version into v from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 perform pg_temp.fa(pg_temp.lifecycle_call(p,'start_production',pg_temp.preview_key(),v)->>'status'='conflict','revision pending blocks production');
 perform pg_temp.next_preview(p);
 select version into v from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 perform pg_temp.fa(pg_temp.lifecycle_call(p,'start_production',pg_temp.preview_key(),v)->>'status'='conflict','unapproved current v2 blocks production');
 perform pg_temp.customer_preview(p,'approve_preview',pg_temp.preview_key(),2);
 select version into v from local_commerce.fulfillments where order_id=(p->>'order')::uuid;
 perform pg_temp.fa(pg_temp.lifecycle_call(p,'start_production',pg_temp.preview_key(),v)#>>'{value,status}'='in_production','approved current preview production');
 perform pg_temp.fa(pg_temp.lifecycle_call(p,'mark_quality_check',pg_temp.preview_key(),v+1)#>>'{value,status}'='quality_check','required preview quality');
 perform pg_temp.fa(not exists(select 1 from local_commerce.shipments where order_id=(p->>'order')::uuid),'no shipping effect');
 perform pg_temp.fa(not has_function_privilege('anon','local_commerce.fulfillment_lifecycle_command(text,text,text,text,text,text,text,integer,text)','EXECUTE'),'anon denied');
 perform pg_temp.fa(not has_function_privilege('authenticated','local_commerce.fulfillment_lifecycle_command(text,text,text,text,text,text,text,integer,text)','EXECUTE'),'authenticated denied');
 perform pg_temp.fa(has_function_privilege('service_role','local_commerce.fulfillment_lifecycle_command(text,text,text,text,text,text,text,integer,text)','EXECUTE'),'service role allowed');
end;$cases$;
set constraints all immediate;
`;}
