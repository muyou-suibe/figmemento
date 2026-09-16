-- Ledger owns transaction. Shared lock order for cleanup and future attach/copy:
-- 1 project advisory lock; 2 operation; 3 cleanup object lease.
-- Future Order attach/copy MUST acquire this same project lock before binding.
-- Immutable unique object locators are never reassigned after a cleanup claim.
create table local_commerce.media_cleanup_leases (
  project_id text not null, id uuid not null default gen_random_uuid(),
  operation_id uuid not null, internal_locator text not null,
  lease_token uuid not null default gen_random_uuid(), acquired_at timestamptz not null,
  expires_at timestamptz not null, attempts integer not null default 1 check(attempts>0),
  version integer not null default 1 check(version>0),
  lifecycle text not null check(lifecycle in ('leased','failed','completed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(project_id,id), unique(project_id,internal_locator),
  foreign key(project_id,operation_id) references local_commerce.media_operations(project_id,id),
  check(expires_at>acquired_at and expires_at<=acquired_at+interval '60 seconds')
);
alter table local_commerce.media_cleanup_leases enable row level security;
revoke all on local_commerce.media_cleanup_leases from public,anon,authenticated;
grant select,insert,update on local_commerce.media_cleanup_leases to service_role;
create policy local_commerce_service_role_media_cleanup on local_commerce.media_cleanup_leases
  for all to service_role using(true) with check(true);

create function local_commerce.lock_media_project(p_project_id text)
returns void language sql security definer set search_path=pg_catalog,local_commerce
as $$ select pg_advisory_xact_lock(hashtextextended('local-commerce-media:' || p_project_id,0)); $$;
revoke all on function local_commerce.lock_media_project(text) from public,anon,authenticated,service_role;

-- Server maintenance command only. No browser route; project/marker are required
-- even for service-role requests. Caller supplies operation identity, NOT a path.
create function local_commerce.media_cleanup_command(p_project_id text,p_marker_digest text,
 p_operation_id uuid,p_resource text,p_command text,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce
as $function$
declare o local_commerce.media_operations%rowtype; j local_commerce.media_cleanup_leases%rowtype;
 loc text; live boolean; retained boolean; t timestamptz:=clock_timestamp();
begin
 if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
   or p_resource is null or p_resource not in ('original','derivative')
   or p_command is null or p_command not in ('claim','check','complete','fail') then
   return jsonb_build_object('status','unavailable'); end if;
 perform local_commerce.lock_media_project(p_project_id);
 select * into o from local_commerce.media_operations where project_id=p_project_id and id=p_operation_id for update;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 loc:=case when p_resource='original' then o.original_locator else o.derivative_locator end;
 -- A committed Order binding protects both original and derivative forever.
 select exists(select 1 from local_commerce.order_item_receipt_bindings b
   join local_commerce.media_operations x on x.project_id=b.project_id and x.receipt_id=b.receipt_id
   where b.project_id=p_project_id and (case when p_resource='original' then x.original_locator=loc else x.derivative_locator=loc end)) into retained;
 if retained then return jsonb_build_object('status','retained'); end if;
 -- Protect every live shared reference AND unfinished eligible operation.
 select exists(select 1 from local_commerce.media_operations x
   left join local_commerce.media_receipts r on r.project_id=x.project_id and r.id=x.receipt_id
   where x.project_id=p_project_id and (case when p_resource='original' then x.original_locator=loc else x.derivative_locator=loc end)
   and x.lifecycle in ('pending','ready') and x.expires_at>t
   and (x.receipt_id is null or (r.lifecycle='active' and r.receipt_status='ready' and r.expires_at>t))) into live;
 if live then return jsonb_build_object('status','retained'); end if;
 select * into j from local_commerce.media_cleanup_leases where project_id=p_project_id and internal_locator=loc for update;
 if p_command='claim' then
   if found and j.lifecycle='completed' then return jsonb_build_object('status','completed'); end if;
   if found and j.lifecycle='leased' and j.expires_at>t then return jsonb_build_object('status','conflict'); end if;
   insert into local_commerce.media_cleanup_leases(project_id,operation_id,internal_locator,acquired_at,expires_at,lifecycle)
    values(p_project_id,o.id,loc,t,t+interval '60 seconds','leased')
    on conflict(project_id,internal_locator) do update set operation_id=o.id,lease_token=gen_random_uuid(),
      acquired_at=t,expires_at=t+interval '60 seconds',lifecycle='leased',attempts=media_cleanup_leases.attempts+1,
      version=media_cleanup_leases.version+1,updated_at=t returning * into j;
   -- Eligibility is never restored when deletion fails. Late publish is blocked
   -- by the wrapper below for every claimed immutable locator.
   update local_commerce.media_receipts r set lifecycle='expired',version=version+1,updated_at=t
    where r.project_id=p_project_id and r.lifecycle='active' and r.expires_at<=t
    and exists(select 1 from local_commerce.media_operations x where x.project_id=r.project_id and x.receipt_id=r.id
      and (x.original_locator=loc or x.derivative_locator=loc));
 elsif j.id is null or j.operation_id<>o.id or j.lease_token is distinct from p_lease_token
   or j.lifecycle<>'leased' or j.expires_at<=t then return jsonb_build_object('status','conflict');
 elsif p_command in ('complete','fail') then
   update local_commerce.media_cleanup_leases set lifecycle=case when p_command='complete' then 'completed' else 'failed' end,
     version=version+1,updated_at=t where project_id=p_project_id and id=j.id;
   return jsonb_build_object('status',case when p_command='complete' then 'completed' else 'failed' end);
 end if;
 return jsonb_build_object('status','leased','leaseToken',j.lease_token,'expiresAt',j.expires_at,'locator',loc);
exception when others then return jsonb_build_object('status','unavailable');
end;
$function$;
revoke all on function local_commerce.media_cleanup_command(text,text,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function local_commerce.media_cleanup_command(text,text,uuid,text,text,uuid) to service_role;

alter function local_commerce.media_operation_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,uuid,integer,jsonb) rename to media_operation_before_cleanup;
revoke all on function local_commerce.media_operation_before_cleanup(text,text,text,text,uuid,timestamptz,text,uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
create function local_commerce.media_operation_command(p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
 p_customer_id uuid,p_authority_expires_at timestamptz,p_command text,p_operation_id uuid,p_draft_id uuid,p_slot_id uuid,p_expected_version integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce
as $function$
declare r jsonb; o local_commerce.media_operations%rowtype;
begin
 if not local_commerce.verify_project_identity(p_project_id,p_marker_digest) then return jsonb_build_object('status','unavailable'); end if;
 perform local_commerce.lock_media_project(p_project_id);
 if p_command='remove' then
   r:=local_commerce.media_operation_before_cleanup(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,p_customer_id,p_authority_expires_at,'lookup',p_operation_id,null,null,null,null);
   if r->>'status'<>'found' then return jsonb_build_object('status','unavailable'); end if;
   select * into o from local_commerce.media_operations where project_id=p_project_id and id=p_operation_id for update;
   update local_commerce.media_receipts set lifecycle='removed',version=version+1,updated_at=now()
     where project_id=p_project_id and id=o.receipt_id and lifecycle='active';
   -- Removing Draft eligibility never removes immutable Order bindings/bytes.
   return jsonb_build_object('status','found','operation',to_jsonb(o),'receipt',null);
 end if;
 if p_command in ('publish','prepare') and exists(select 1 from local_commerce.media_operations x
   join local_commerce.media_cleanup_leases l on l.project_id=x.project_id
     and l.internal_locator in (x.original_locator,x.derivative_locator)
   where x.project_id=p_project_id and x.id=p_operation_id) then return jsonb_build_object('status','unavailable'); end if;
 r:=local_commerce.media_operation_before_cleanup(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,p_customer_id,p_authority_expires_at,p_command,p_operation_id,p_draft_id,p_slot_id,p_expected_version,p_input);
 if p_command in ('begin','prepare','publish','receipt') and r->>'status'='found' and exists(select 1 from local_commerce.media_cleanup_leases l where l.project_id=p_project_id
   and l.internal_locator in (r#>>'{operation,original_locator}',r#>>'{operation,derivative_locator}')) then
   raise exception 'retired media' using errcode='P0001'; end if;
 return r;
exception when others then return jsonb_build_object('status','unavailable');
end;
$function$;
revoke all on function local_commerce.media_operation_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.media_operation_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,uuid,integer,jsonb) to service_role;

alter function local_commerce.draft_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb) rename to draft_command_before_cleanup;
revoke all on function local_commerce.draft_command_before_cleanup(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated,service_role;
create function local_commerce.draft_command(p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
 p_customer_id uuid,p_authority_expires_at timestamptz,p_operation text,p_draft_id uuid,p_product_id uuid,p_expected_version integer,
 p_command_key text,p_fingerprint text,p_slots jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce
as $function$
declare r jsonb; old_receipts uuid[];
begin
 if not local_commerce.verify_project_identity(p_project_id,p_marker_digest) then return jsonb_build_object('status','unavailable'); end if;
 perform local_commerce.lock_media_project(p_project_id);
 if p_operation='save' then
   select array_agg(receipt_id) into old_receipts from local_commerce.draft_media_links where project_id=p_project_id and draft_id=p_draft_id;
   if exists(select 1 from jsonb_array_elements(p_slots) slot join local_commerce.media_receipts x
    on x.project_id=p_project_id and x.receipt_reference::text=slot->>'receiptReference'
    where x.lifecycle<>'active' or x.expires_at<=clock_timestamp()) then return jsonb_build_object('status','unavailable'); end if;
 end if;
 r:=local_commerce.draft_command_before_cleanup(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,p_customer_id,p_authority_expires_at,p_operation,p_draft_id,p_product_id,p_expected_version,p_command_key,p_fingerprint,p_slots);
 if r->>'status'='found' and p_operation='save' then
   update local_commerce.media_receipts x set lifecycle='removed',version=version+1,updated_at=now()
    where x.project_id=p_project_id and x.id=any(old_receipts) and x.lifecycle='active'
    and not exists(select 1 from local_commerce.draft_media_links l where l.project_id=x.project_id and l.receipt_id=x.id);
 end if;
 return r;
exception when others then return jsonb_build_object('status','unavailable');
end;
$function$;
revoke all on function local_commerce.draft_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.draft_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb) to service_role;
