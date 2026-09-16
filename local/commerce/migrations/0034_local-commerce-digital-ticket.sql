-- Task 9.3: short-lived opaque customer ticket issuance. Ledger wrapper owns transaction.
alter table local_commerce.digital_tickets
  add column order_id uuid, add column order_item_id uuid,
  add column digital_version_id uuid, add column issued_at timestamptz;
alter table local_commerce.digital_tickets
  add constraint digital_tickets_order_owner_fk foreign key(project_id,order_id,owner_id) references local_commerce.orders(project_id,id,owner_id),
  add constraint digital_tickets_item_owner_fk foreign key(project_id,order_item_id,owner_id) references local_commerce.order_items(project_id,id,owner_id),
  add constraint digital_tickets_version_owner_fk foreign key(project_id,digital_version_id,owner_id) references local_commerce.digital_versions(project_id,id,owner_id),
  add constraint digital_tickets_hash_digest_check check(ticket_hash~'^[0-9a-f]{64}$'),
  add constraint digital_tickets_policy_check check(order_id is not null and order_item_id is not null and digital_version_id is not null and issued_at is not null and isfinite(issued_at) and isfinite(expires_at) and expires_at>issued_at and expires_at<=issued_at+interval '600 seconds'),
  add constraint digital_tickets_unclaimed_shape_check check((lifecycle='active' and consumed_at is null) or (lifecycle='consumed' and consumed_at is not null) or lifecycle in ('expired','revoked'));

create function local_commerce.digital_ticket_issue(p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,p_customer_id uuid,p_session_hash text,p_authority_expires_at timestamptz,p_capability_hash text,p_public_reference text,p_order_item_id uuid,p_grant_id uuid,p_ticket_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,local_commerce as $ticket$
declare owner_uuid uuid; purchase local_commerce.orders%rowtype; item local_commerce.order_items%rowtype; item_snapshot local_commerce.order_item_purchase_snapshots%rowtype; grant_row local_commerce.digital_grants%rowtype; ready_version local_commerce.digital_versions%rowtype; stamp timestamptz; ticket_expiry timestamptz; ticket_id uuid;
begin
 if not local_commerce.verify_project_identity(p_project_id,p_marker_digest) or p_owner_kind is null or p_owner_kind not in('guest','customer') or p_owner_selector is null or p_authority_expires_at is null or not isfinite(p_authority_expires_at) or p_authority_expires_at<=clock_timestamp() or p_capability_hash is null or p_capability_hash!~'^[0-9a-f]{64}$' or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$' or p_order_item_id is null or p_grant_id is null or p_ticket_hash is null or p_ticket_hash!~'^[0-9a-f]{64}$' then return jsonb_build_object('status','unavailable'); end if;
 if p_owner_kind='guest' then
  if p_customer_id is not null or p_session_hash is not null or p_owner_selector!~'^[0-9a-f]{64}$' then return jsonb_build_object('status','unavailable'); end if;
  select id into owner_uuid from local_commerce.commerce_owners where project_id=p_project_id and owner_kind='guest' and subject_hash=p_owner_selector and lifecycle='active' for share;
 else
  if p_customer_id is null or p_session_hash is null or p_owner_selector!~'^[0-9a-f-]{36}$' then return jsonb_build_object('status','unavailable'); end if;
  select o.id into owner_uuid from local_commerce.commerce_owners o join local_commerce.customer_accounts a on a.project_id=o.project_id and a.owner_id=o.id join local_commerce.customer_sessions s on s.project_id=o.project_id and s.owner_id=o.id where o.project_id=p_project_id and o.id::text=p_owner_selector and o.owner_kind='customer' and o.lifecycle='active' and a.id=p_customer_id and a.account_status='active' and a.lifecycle='active' and s.session_hash=p_session_hash and s.lifecycle='active' and s.revoked_at is null and s.expires_at>clock_timestamp() for share of o,a,s;
 end if;
 if owner_uuid is null then return jsonb_build_object('status','unavailable'); end if;
 select * into purchase from local_commerce.orders o where o.project_id=p_project_id and o.owner_id=owner_uuid and o.public_reference=p_public_reference and o.lifecycle='active' and o.lifecycle_status='paid' and exists(select 1 from local_commerce.access_grants g where g.project_id=o.project_id and g.owner_id=o.owner_id and g.resource_kind='local_order' and g.resource_id=o.id and g.capability_hash=p_capability_hash and g.lifecycle='active' and g.revoked_at is null and g.expires_at>clock_timestamp()) and exists(select 1 from local_commerce.payment_attempts p where p.project_id=o.project_id and p.order_id=o.id and p.owner_id=o.owner_id and p.outcome='succeeded' and p.lifecycle='settled') for share;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 select * into item from local_commerce.order_items where project_id=p_project_id and id=p_order_item_id and order_id=purchase.id and owner_id=owner_uuid and lifecycle='active' for share;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 select * into item_snapshot from local_commerce.order_item_purchase_snapshots where project_id=p_project_id and order_item_id=item.id and owner_id=owner_uuid;
 if not found or item_snapshot.fulfillment_type<>'digital' or item_snapshot.lifecycle<>'committed' then return jsonb_build_object('status','unavailable'); end if;
 select * into grant_row from local_commerce.digital_grants where project_id=p_project_id and id=p_grant_id and owner_id=owner_uuid and order_id=purchase.id and order_item_id=item.id for update;
 if not found or grant_row.grant_status<>'active' or grant_row.lifecycle<>'active' or grant_row.revoked_at is not null or clock_timestamp()>=grant_row.expires_at or grant_row.used_attempts>=grant_row.max_attempts then return jsonb_build_object('status','unavailable'); end if;
 select * into ready_version from local_commerce.digital_versions where project_id=p_project_id and order_item_id=item.id and owner_id=owner_uuid and status='ready' and lifecycle='active' and is_current for share;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 stamp:=clock_timestamp();ticket_expiry:=least(stamp+interval '600 seconds',grant_row.expires_at);if ticket_expiry<=stamp then return jsonb_build_object('status','unavailable');end if;ticket_id:=gen_random_uuid();
 insert into local_commerce.digital_tickets(project_id,id,grant_id,order_id,order_item_id,digital_version_id,owner_id,ticket_hash,issued_at,expires_at,consumed_at,lifecycle) values(p_project_id,ticket_id,grant_row.id,purchase.id,item.id,ready_version.id,owner_uuid,p_ticket_hash,stamp,ticket_expiry,null,'active');
 return jsonb_build_object('status','found','value',jsonb_build_object('ticketId',ticket_id,'grantId',grant_row.id,'orderItemId',item.id,'digitalVersionId',ready_version.id,'issuedAt',stamp,'expiresAt',ticket_expiry));
exception when unique_violation or deadlock_detected or serialization_failure then return jsonb_build_object('status','conflict');when others then return jsonb_build_object('status','unavailable');end;$ticket$;
revoke all on function local_commerce.digital_ticket_issue(text,text,text,text,uuid,text,timestamptz,text,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function local_commerce.digital_ticket_issue(text,text,text,text,uuid,text,timestamptz,text,text,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
