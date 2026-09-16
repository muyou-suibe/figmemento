import {literal} from '../../scripts/local-commerce-ledger-wrapper.mjs';
export function adminTimeoutSql(project,marker){return `
set constraints all deferred;
create temporary table timeout_test_clock(manifest_id uuid primary key,stamp timestamptz);
-- Transaction-private clock injection, never installed by the migration.
create or replace function local_commerce.fulfillment_timeout_now(p_project_id text,p_order_id uuid,p_manifest_id uuid)
returns timestamptz language sql volatile set search_path=pg_catalog as $clock$
 select coalesce((select stamp from pg_temp.timeout_test_clock where manifest_id=p_manifest_id),clock_timestamp());$clock$;
create function pg_temp.timeout_call(p jsonb,k text,n text default 'Reviewed after deadline') returns jsonb language sql as $f$
 select local_commerce.fulfillment_admin_timeout_command(coalesce(p->>'project',${literal(project)}),coalesce(p->>'marker',${literal(marker)}),
 coalesce(p->>'actorKind','admin'),coalesce(p->>'actor','configured-admin'),p->>'ref','commit',coalesce(p->>'action','operator_timeout'),
 (p->>'version')::int,k,(p->>'manifest')::uuid,(p->>'previewVersion')::int,n);$f$;
create function pg_temp.timeout_setup() returns jsonb language plpgsql as $f$
declare p jsonb;r jsonb;begin
 p:=pg_temp.preview_setup(array[true]);r:=pg_temp.next_preview(p);
 return p||jsonb_build_object('version',(r#>>'{value,version}')::int,'manifest',r#>>'{value,manifestId}','previewVersion',1);
end;$f$;
do $cases$
declare p jsonb;r jsonb;original jsonb;k text;d timestamptz;s text;history text;patch jsonb;reason text;target text;timing text;
begin
 p:=pg_temp.timeout_setup();
 select approval_deadline_at into d from local_commerce.preview_manifests where id=(p->>'manifest')::uuid;
 perform pg_temp.fa(d is not null and (select approval_deadline_at=published_at+interval '259200 seconds'
  from local_commerce.preview_manifests where id=(p->>'manifest')::uuid),'durable exact 72 hours');
 perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key())->>'status'='conflict','fresh before deadline');
 insert into pg_temp.timeout_test_clock values((p->>'manifest')::uuid,d-interval '1 second');
 perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key())->>'status'='conflict','71h59m59s rejects');
 update pg_temp.timeout_test_clock set stamp=d;
 foreach reason in array array['',' ',repeat('x',501),repeat('😀',251),' untrimmed '] loop
  perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key(),reason)->>'status'='unavailable','invalid canonical reason');
 end loop;
 for patch in select value from jsonb_array_elements('[{"actorKind":"customer"},{"actorKind":"operator"},{"actor":"wrong-admin"},{"project":"wrong"},{"marker":"wrong"},{"previewVersion":2},{"version":999}]') loop
  perform pg_temp.fa(pg_temp.timeout_call(p||patch,pg_temp.preview_key())->>'status' in ('conflict','unavailable'),'invalid authority/state');
 end loop;
 history:=pg_temp.customer_history_state((p->>'order')::uuid,3);
 foreach target in array array['fulfillments','fulfillment_decisions'] loop
  foreach timing in array array['before','after'] loop
   s:=pg_temp.customer_preview_state((p->>'order')::uuid);
   execute 'create trigger timeout_fault '||timing||' insert or update on local_commerce.'||target||' for each row execute function pg_temp.fulfillment_fault()';
   r:=pg_temp.timeout_call(p,pg_temp.preview_key());
   execute 'drop trigger timeout_fault on local_commerce.'||target;
   perform pg_temp.fa(r->>'status'='unavailable' and s=pg_temp.customer_preview_state((p->>'order')::uuid),'timeout fault atomic rollback');
  end loop;
 end loop;
 k:=pg_temp.preview_key();original:=pg_temp.timeout_call(p,k,repeat('😀',250));
 perform pg_temp.fa(original#>>'{value,status}'='preview_approved' and original#>>'{value,decisionKind}'='operator_timeout','exact deadline succeeds');
 perform pg_temp.fa(original#>>'{value,revisionRequestsUsed}'='0','counter unchanged');
 perform pg_temp.fa((original#>>'{value,confirmedAt}')::timestamptz=d,'exact DB clock');
 perform pg_temp.fa(not exists(select 1 from local_commerce.fulfillment_decisions where order_id=(p->>'order')::uuid and decision_kind='customer_approve'),'no fabricated customer');
 perform pg_temp.fa(pg_temp.timeout_call(p,k,repeat('😀',250))->>'replayed'='true','exact replay');
 perform pg_temp.fa(pg_temp.timeout_call(p,k,'changed')->>'status'='conflict','reason conflict');
 perform pg_temp.fa(pg_temp.timeout_call(p||'{"version":999}',k,repeat('😀',250))->>'status'='conflict','CAS conflict');
 perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key())->>'status'='conflict','second decision denied');
 perform pg_temp.fa(pg_temp.lifecycle_call(p,'start_production',pg_temp.preview_key(),(p->>'version')::int+1)#>>'{value,status}'='in_production','separate production consumes timeout');
 r:=pg_temp.timeout_call(p,k,repeat('😀',250));
 perform pg_temp.fa(r->>'replayed'='true' and r->'value'=original->'value','replay after production unchanged');
 perform pg_temp.fa(history=pg_temp.customer_history_state((p->>'order')::uuid,3),'immutable upstream/history');
 perform pg_temp.fa((select count(*)=1 and max(manifest_version)=1 from local_commerce.preview_manifests where order_id=(p->>'order')::uuid),'no new manifest');
 p:=pg_temp.timeout_setup();
 select approval_deadline_at into d from local_commerce.preview_manifests where id=(p->>'manifest')::uuid;
 insert into pg_temp.timeout_test_clock values((p->>'manifest')::uuid,d+interval '1 second');
 perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key(),repeat('x',500))->>'status'='found','after deadline and 500 units');
 perform pg_temp.fa(not exists(select 1 from local_commerce.shipments where order_id=(p->>'order')::uuid),'zero shipment');
 -- Deadline mutation cannot extend or enable a historical manifest.
 begin
  update local_commerce.preview_manifests set approval_deadline_at=approval_deadline_at+interval '1 second' where id=(p->>'manifest')::uuid;
  raise exception using errcode='XX999',message='deadline mutation bypass';
 exception when raise_exception then null;end;
 perform pg_temp.fa(not has_function_privilege('anon','local_commerce.fulfillment_admin_timeout_command(text,text,text,text,text,text,text,integer,text,uuid,integer,text)','EXECUTE'),'anon no RPC');
 perform pg_temp.fa(not has_function_privilege('authenticated','local_commerce.fulfillment_admin_timeout_command(text,text,text,text,text,text,text,integer,text,uuid,integer,text)','EXECUTE'),'authenticated no RPC');
 perform pg_temp.fa(has_function_privilege('service_role','local_commerce.fulfillment_admin_timeout_command(text,text,text,text,text,text,text,integer,text,uuid,integer,text)','EXECUTE'),'service RPC allowed');
 perform pg_temp.fa(not has_function_privilege('service_role','local_commerce.fulfillment_timeout_now(text,uuid,uuid)','EXECUTE'),'helper not granted');
end;$cases$;
do $review_gate$
declare p jsonb;r jsonb;d timestamptz;state text;before text;
begin
 p:=pg_temp.preview_setup(array[true],true,1);
 -- SQL-only transaction-private review fixtures test the timeout gate. They
 -- do NOT satisfy Task 7.7's real human/operator review mutation requirement.
 update local_commerce.photo_reviews set review_state='approved' where order_id=(p->>'order')::uuid;
 r:=pg_temp.next_preview(p);
 p:=p||jsonb_build_object('version',(r#>>'{value,version}')::int,'manifest',r#>>'{value,manifestId}','previewVersion',1);
 select approval_deadline_at into d from local_commerce.preview_manifests where id=(p->>'manifest')::uuid;
 insert into pg_temp.timeout_test_clock values((p->>'manifest')::uuid,d);
 foreach state in array array['pending','rejected'] loop
  update local_commerce.photo_reviews set review_state=state where order_id=(p->>'order')::uuid;
  before:=pg_temp.customer_preview_state((p->>'order')::uuid);
  perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key())->>'status'='conflict','timeout rejects review '||state);
  perform pg_temp.fa(before=pg_temp.customer_preview_state((p->>'order')::uuid),'rejected timeout zero mutation');
 end loop;
 update local_commerce.photo_reviews set review_state='approved' where order_id=(p->>'order')::uuid;
 perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key())->>'status'='found','applicable passed review allows timeout');
end;$review_gate$;
do $more$
declare p jsonb;r jsonb;old jsonb;v integer;d timestamptz;mid uuid;before text;
begin
 -- Simulate a pre-0025 manifest only inside this rolled-back transaction.
 set constraints all immediate;
 alter table local_commerce.preview_manifests disable trigger preview_approval_deadline;
 set constraints all deferred;
 p:=pg_temp.timeout_setup();
 set constraints all immediate;
 alter table local_commerce.preview_manifests enable trigger preview_approval_deadline;
 set constraints all deferred;
 perform pg_temp.fa((select approval_deadline_at is null from local_commerce.preview_manifests where id=(p->>'manifest')::uuid),'legacy no deadline');
 perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key())->>'status'='conflict','missing deadline fails closed');
 p:=pg_temp.timeout_setup();
 insert into local_commerce.access_grants(project_id,owner_id,resource_kind,resource_id,capability_hash,expires_at)
 values(${literal(project)},(p->>'owner')::uuid,'local_order',(p->>'order')::uuid,p->>'key',clock_timestamp()+interval '10 minutes');
 for v in 1..2 loop
  old:=p;
  perform pg_temp.fa(pg_temp.customer_preview(p,'request_revision',pg_temp.preview_key(),v,'revise')->>'status'='found','real customer revision');
  p:=p||jsonb_build_object('version',(select version from local_commerce.fulfillments where order_id=(p->>'order')::uuid));
  insert into pg_temp.timeout_test_clock values((p->>'manifest')::uuid,clock_timestamp()+interval '4 days');
  perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key())->>'status'='conflict','revision pending never timeout');
  r:=pg_temp.next_preview(p);
  p:=p||jsonb_build_object('version',(r#>>'{value,version}')::int,'manifest',r#>>'{value,manifestId}','previewVersion',v+1);
  perform pg_temp.fa(pg_temp.timeout_call(old||jsonb_build_object('version',p->'version'),pg_temp.preview_key())->>'status'='conflict','old manifest deadline rejects');
  perform pg_temp.fa(pg_temp.timeout_call(p,pg_temp.preview_key())->>'status'='conflict','new manifest has own future deadline');
  perform pg_temp.fa((select approval_deadline_at=published_at+interval '259200 seconds' from local_commerce.preview_manifests where id=(p->>'manifest')::uuid),'new version own exact deadline');
 end loop;
 select approval_deadline_at into d from local_commerce.preview_manifests where id=(p->>'manifest')::uuid;
 insert into pg_temp.timeout_test_clock values((p->>'manifest')::uuid,d);
 r:=pg_temp.timeout_call(p,pg_temp.preview_key());
 perform pg_temp.fa(r#>>'{value,revisionRequestsUsed}'='2','timeout never resets revisions');
 perform pg_temp.fa((select count(*)=3 and max(manifest_version)=3 from local_commerce.preview_manifests where order_id=(p->>'order')::uuid),'no v4');
end;$more$;
set constraints all immediate;
`;}
