import {literal} from '../../scripts/local-commerce-ledger-wrapper.mjs';

// Executed inside a rollback-only transaction. Temporary helpers and synthetic
// rows never survive. No retained Order is selected for mutation.
export function paymentSqlChecks(project,marker) {return `
create function pg_temp.payment_call(p jsonb) returns jsonb language sql as $f$
 select local_commerce.payment_command(p->>'project',p->>'marker',p->>'kind',p->>'selector',
 (p->>'customer')::uuid,p->>'session',(p->>'expiry')::timestamptz,p->>'cap',p->>'ref',p->>'operation',
 (p->>'order')::uuid,(p->>'version')::integer,p->>'key',p->>'context',p->>'outcome'); $f$;
create function pg_temp.payment_fixture(member boolean default false, existing_owner uuid default null) returns jsonb language plpgsql as $f$
declare o uuid:=coalesce(existing_owner,gen_random_uuid()); customer uuid:=gen_random_uuid(); purchase uuid:=gen_random_uuid(); item uuid:=gen_random_uuid();
 ref text:='FM-LOCAL-'||upper(substr(replace(purchase::text,'-',''),1,16)); h text:=encode(sha256(convert_to(o::text,'UTF8')),'hex');
begin
 if existing_owner is null then insert into local_commerce.commerce_owners(project_id,id,owner_kind,subject_hash) values(${literal(project)},o,case when member then 'customer' else 'guest' end,h); end if;
 if member then
 insert into local_commerce.customer_accounts(project_id,id,owner_id,normalized_email,password_hash) values(${literal(project)},customer,o,customer::text||'@example.invalid',repeat('x',64));
 insert into local_commerce.customer_sessions(project_id,owner_id,session_hash,expires_at) values(${literal(project)},o,h,clock_timestamp()+interval '1 hour'); end if;
 insert into local_commerce.orders(project_id,id,owner_id,public_reference) values(${literal(project)},purchase,o,ref);
 insert into local_commerce.order_purchase_snapshots(project_id,order_id,owner_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,purchase_facts)
 values(${literal(project)},purchase,o,'USD',1200,100,50,1250,'{"contact":{},"couponStatus":"valid"}');
 insert into local_commerce.order_items(project_id,id,order_id,owner_id,item_sequence) values(${literal(project)},item,purchase,o,0);
 insert into local_commerce.order_item_purchase_snapshots(project_id,order_item_id,owner_id,product_id,product_slug,product_name,sku_code,configuration_revision,quantity,unit_price_cents,line_subtotal_cents,currency,fulfillment_type)
 values(${literal(project)},item,o,gen_random_uuid(),'synthetic','Synthetic','SYNTHETIC',1,1,1200,1200,'USD','physical');
 insert into local_commerce.access_grants(project_id,owner_id,resource_kind,resource_id,capability_hash,expires_at)
 values(${literal(project)},o,'local_order',purchase,h,clock_timestamp()+interval '1 hour');
 return jsonb_build_object('project',${literal(project)},'marker',${literal(marker)},'kind',case when member then 'customer' else 'guest' end,
 'selector',case when member then o::text else h end,'customer',case when member then customer else null end,'session',case when member then h else null end,
 'expiry',clock_timestamp()+interval '1 hour','cap',h,'ref',ref,'operation','prepare','order',purchase,'owner',o,'key',encode(sha256(convert_to(purchase::text,'UTF8')),'hex'),'outcome','success');
end; $f$;
create function pg_temp.payment_attempt(p jsonb) returns jsonb language plpgsql as $f$
declare r jsonb;begin r:=pg_temp.payment_call(p||'{"operation":"prepare"}');
 if r->>'status'<>'found' or (r#>>'{value,replayed}')::boolean then return r; end if;
 return pg_temp.payment_call(p||jsonb_build_object('operation','commit','order',r#>>'{value,orderId}','version',r#>'{value,version}','context',r#>>'{value,contextDigest}'));
end; $f$;
create function pg_temp.payment_assert(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'PAYMENT CHECK: %',label; end if; end; $f$;
do $check$
declare p jsonb; q jsonb; a jsonb; b jsonb; outcome text; before_digest text; after_digest text;
begin
 foreach outcome in array array['success','failed','cancelled'] loop
  p:=pg_temp.payment_fixture()||jsonb_build_object('outcome',outcome);
  select md5(row_to_json(s)::text) into before_digest from local_commerce.order_purchase_snapshots s where order_id=(p->>'order')::uuid;
  a:=pg_temp.payment_attempt(p); perform pg_temp.payment_assert(a->>'status'='found','commit '||outcome||': '||a);
  perform pg_temp.payment_assert(a#>>'{value,payment,simulatedAmountCents}'='1250','amount');
  perform pg_temp.payment_assert(a#>>'{value,payment,simulatedCurrency}'='USD','currency');
  b:=pg_temp.payment_attempt(p);perform pg_temp.payment_assert(b#>>'{value,replayed}'='true' and b#>'{value,payment}'=a#>'{value,payment}','exact replay');
  perform pg_temp.payment_assert((select count(*)=1 from local_commerce.payment_attempts where order_id=(p->>'order')::uuid),'one attempt');
  perform pg_temp.payment_assert((select count(*)=1 from local_commerce.payment_actions where order_id=(p->>'order')::uuid and result->'audit' is not null),'one audit');
  perform pg_temp.payment_assert(pg_temp.payment_attempt(p||jsonb_build_object('outcome',case when outcome='success' then 'failed' else 'success' end))->>'status'='conflict','changed outcome');
  if outcome='success' then
   perform pg_temp.payment_assert(pg_temp.payment_attempt(p||jsonb_build_object('key',repeat('c',64)))->>'status'='conflict','paid new key');
  else
   b:=pg_temp.payment_attempt(p||jsonb_build_object('key',encode(sha256(convert_to(p::text,'UTF8')),'hex'),'outcome','success'));
   perform pg_temp.payment_assert(b->>'status'='found','retry success');
   b:=pg_temp.payment_attempt(p);perform pg_temp.payment_assert(b#>'{value,payment}'=a#>'{value,payment}','old failed/cancel replay');
  end if;
  perform pg_temp.payment_assert((select lifecycle_status='paid' from local_commerce.orders where id=(p->>'order')::uuid),'paid canonical state');
  select md5(row_to_json(s)::text) into after_digest from local_commerce.order_purchase_snapshots s where order_id=(p->>'order')::uuid;
  perform pg_temp.payment_assert(before_digest=after_digest,'immutable header');
  perform pg_temp.payment_assert(pg_temp.payment_attempt(p||jsonb_build_object('cap',repeat('0',64)))->>'status'='unavailable','wrong capability replay');
  perform pg_temp.payment_assert(pg_temp.payment_attempt(p||jsonb_build_object('selector',repeat('0',64)))->>'status'='unavailable','wrong owner replay');
  perform pg_temp.payment_assert(pg_temp.payment_attempt(p||jsonb_build_object('project','wrong'))->>'status'='unavailable','wrong project');
  perform pg_temp.payment_assert(pg_temp.payment_attempt(p||jsonb_build_object('marker',repeat('0',64)))->>'status'='unavailable','wrong marker');
  perform pg_temp.payment_assert(pg_temp.payment_attempt(p||jsonb_build_object('expiry',clock_timestamp()))->>'status'='unavailable','expiry replay');
  q:=pg_temp.payment_fixture();perform pg_temp.payment_assert(pg_temp.payment_attempt(q||jsonb_build_object('key',p->>'key'))->>'status'='unavailable','foreign owner selector non disclosure');
  q:=pg_temp.payment_fixture(false,(p->>'owner')::uuid);
  perform pg_temp.payment_assert(pg_temp.payment_attempt(q||jsonb_build_object('key',p->>'key'))->>'status'='conflict','same owner other Order selector');
 end loop;
 p:=pg_temp.payment_fixture(true);a:=pg_temp.payment_attempt(p);perform pg_temp.payment_assert(a->>'status'='found','member');
 update local_commerce.customer_sessions set revoked_at=clock_timestamp(),lifecycle='revoked' where project_id=${literal(project)} and owner_id=(p->>'owner')::uuid;
 perform pg_temp.payment_assert(pg_temp.payment_attempt(p)->>'status'='unavailable','revoked session replay');
 p:=pg_temp.payment_fixture(true);a:=pg_temp.payment_attempt(p);
 update local_commerce.customer_sessions set expires_at=clock_timestamp()-interval '1 second' where project_id=${literal(project)} and owner_id=(p->>'owner')::uuid;
 perform pg_temp.payment_assert(pg_temp.payment_attempt(p)->>'status'='unavailable','expired member session replay');
 p:=pg_temp.payment_fixture();a:=pg_temp.payment_call(p);
 perform pg_temp.payment_assert(pg_temp.payment_call(p||jsonb_build_object('operation','commit','version',0,'context',a#>>'{value,contextDigest}'))->>'status'='unavailable','missing/invalid version');
end; $check$;
-- Trigger failures are uncommitted and scoped to this transaction. No retained
-- row is changed; every fault must roll back the complete RPC subtransaction.
create function pg_temp.payment_fault() returns trigger language plpgsql as $f$
begin raise exception 'synthetic payment failure'; end; $f$;
do $check$
declare point text; p jsonb; r jsonb; before_digest text; after_digest text; target text;
begin
 foreach point in array array['after_attempt','before_binding_audit','after_binding_audit','before_order','after_order'] loop
  p:=pg_temp.payment_fixture();
  select md5(row_to_json(o)::text) into before_digest from local_commerce.orders o where id=(p->>'order')::uuid;
  target:=case point when 'after_attempt' then 'after insert on local_commerce.payment_attempts'
    when 'before_binding_audit' then 'before insert on local_commerce.payment_actions'
    when 'after_binding_audit' then 'after insert on local_commerce.payment_actions'
    when 'before_order' then 'before update on local_commerce.orders' else 'after update on local_commerce.orders' end;
  execute 'create trigger payment_acceptance_fault '||target||' for each row execute function pg_temp.payment_fault()';
  r:=pg_temp.payment_attempt(p);perform pg_temp.payment_assert(r->>'status'='unavailable','fault '||point);
  execute 'drop trigger payment_acceptance_fault on local_commerce.'||case point when 'after_attempt' then 'payment_attempts' when 'before_binding_audit' then 'payment_actions' when 'after_binding_audit' then 'payment_actions' else 'orders' end;
  perform pg_temp.payment_assert((select count(*)=0 from local_commerce.payment_attempts where order_id=(p->>'order')::uuid),'attempt rollback');
  perform pg_temp.payment_assert((select count(*)=0 from local_commerce.payment_actions where order_id=(p->>'order')::uuid),'binding/audit rollback');
  select md5(row_to_json(o)::text) into after_digest from local_commerce.orders o where id=(p->>'order')::uuid;
  perform pg_temp.payment_assert(before_digest=after_digest,'lifecycle rollback');
 end loop;
end; $check$;
`;}
