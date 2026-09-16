-- Forward migration; the existing ledger wrapper owns transaction atomicity.
-- Explicit same-owner receipt copy; Draft remains the only slot authority.
alter table local_commerce.media_operations drop constraint media_operations_operation_kind_check;
alter table local_commerce.media_operations add constraint media_operations_operation_kind_check
  check(operation_kind in ('upload','replace','crop','copy'));
alter table local_commerce.media_operations add constraint media_operations_copy_owner_key unique(project_id,id,owner_id);
alter table local_commerce.media_copy_bindings add column target_operation_id uuid;
alter table local_commerce.media_copy_bindings add column input_digest text;
alter table local_commerce.media_copy_bindings add column expected_version integer check(expected_version is null or expected_version>0);
alter table local_commerce.media_copy_bindings add constraint media_copy_input_digest_check check(input_digest is null or input_digest ~ '^[0-9a-f]{64}$');
alter table local_commerce.media_copy_bindings add constraint media_copy_operation_owner_fk
  foreign key(project_id,target_operation_id,owner_id) references local_commerce.media_operations(project_id,id,owner_id);

-- New operation kind may materialize its own server-reserved future slot,
-- exactly like an upload. Keep the existing Draft/CAS/cleanup wrapper intact.
do $patch$
declare definition text; needle text := 'if op.operation_kind<>''upload'' then raise exception ''removed slot''';
begin
  select pg_get_functiondef('local_commerce.draft_command_before_cleanup(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb)'::regprocedure) into definition;
  if length(definition)-length(replace(definition,needle,''))<>length(needle) then raise exception 'unexpected Draft implementation'; end if;
  execute replace(definition,needle,'if op.operation_kind not in (''upload'',''copy'') then raise exception ''removed slot''');
end $patch$;

-- Copy owns a new reservation, not a confirmed Draft link. Publication must
-- allow that reservation without silently confirming the customer's Draft.
do $publish_patch$
declare definition text; needle text := 'if o.operation_kind<>''upload'' and not exists';
begin
  select pg_get_functiondef('local_commerce.media_operation_before_cleanup(text,text,text,text,uuid,timestamptz,text,uuid,uuid,uuid,integer,jsonb)'::regprocedure) into definition;
  if length(definition)-length(replace(definition,needle,''))<>length(needle) then raise exception 'unexpected media publication implementation'; end if;
  execute replace(definition,needle,'if o.operation_kind not in (''upload'',''copy'') and not exists');
end $publish_patch$;

create function local_commerce.media_copy_command(
 p_project_id text,p_marker_digest text,p_owner_kind text,p_owner_selector text,
 p_customer_id uuid,p_authority_expires_at timestamptz,p_source_receipt uuid,
 p_target_draft uuid,p_expected_version integer,p_key_digest text,p_input_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce
as $function$
declare
 owner_uuid uuid; source local_commerce.media_operations%rowtype;
 receipt local_commerce.media_receipts%rowtype; draft local_commerce.configuration_drafts%rowtype;
 binding local_commerce.media_copy_bindings%rowtype; target local_commerce.media_operations%rowtype;
 reservation uuid; operation_uuid uuid; expires timestamptz; config_revision integer;
begin
 if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
  or p_owner_kind is null or p_owner_kind not in ('guest','customer')
  or p_authority_expires_at is null or not isfinite(p_authority_expires_at) or p_authority_expires_at<=clock_timestamp()
  or p_owner_selector is null or p_source_receipt is null or p_target_draft is null
  or p_expected_version is null or p_expected_version<1
  or p_key_digest is null or p_key_digest!~'^[0-9a-f]{64}$'
  or p_input_digest is null or p_input_digest!~'^[0-9a-f]{64}$' then return jsonb_build_object('status','unavailable'); end if;
 perform local_commerce.lock_media_project(p_project_id);
 if p_owner_kind='guest' then
  if p_customer_id is not null or p_owner_selector!~'^[0-9a-f]{64}$' then return jsonb_build_object('status','unavailable'); end if;
  select id into owner_uuid from local_commerce.commerce_owners where project_id=p_project_id and owner_kind='guest'
   and subject_hash=p_owner_selector and lifecycle='active' for share;
 else
  select o.id into owner_uuid from local_commerce.commerce_owners o join local_commerce.customer_accounts a
   on a.project_id=o.project_id and a.owner_id=o.id where o.project_id=p_project_id and o.id::text=p_owner_selector
   and o.owner_kind='customer' and o.lifecycle='active' and a.id=p_customer_id and a.lifecycle='active' and a.account_status='active' for share of o,a;
 end if;
 if owner_uuid is null then return jsonb_build_object('status','unavailable'); end if;
 select * into binding from local_commerce.media_copy_bindings where project_id=p_project_id and action_key=p_key_digest;
 if found then
  if binding.owner_id<>owner_uuid or binding.target_draft_id<>p_target_draft or binding.input_digest is distinct from p_input_digest
    or binding.expected_version is distinct from p_expected_version
    or binding.target_operation_id is null or not exists(select 1 from local_commerce.media_receipts
     where project_id=p_project_id and id=binding.source_receipt_id and owner_id=owner_uuid and receipt_reference=p_source_receipt)
    then return jsonb_build_object('status','conflict'); end if;
  select * into target from local_commerce.media_operations where project_id=p_project_id and id=binding.target_operation_id and owner_id=owner_uuid;
  if not found or target.expires_at<=clock_timestamp() or target.lifecycle='failed' then return jsonb_build_object('status','unavailable'); end if;
 else
  select * into draft from local_commerce.configuration_drafts where project_id=p_project_id and id=p_target_draft
   and owner_id=owner_uuid and lifecycle='confirmed' and (expires_at is null or expires_at>clock_timestamp()) for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if draft.version<>p_expected_version then return jsonb_build_object('status','conflict'); end if;
  select * into receipt from local_commerce.media_receipts where project_id=p_project_id and receipt_reference=p_source_receipt
   and owner_id=owner_uuid and product_id=draft.product_id and lifecycle='active' and receipt_status='ready' and expires_at>clock_timestamp() for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into source from local_commerce.media_operations where project_id=p_project_id and receipt_id=receipt.id
   and owner_id=owner_uuid and product_id=draft.product_id and field_key=receipt.field_key
   and lifecycle='ready' and expires_at>clock_timestamp() for update;
  if not found or source.source_generation<>receipt.source_generation or source.original_object_id is null or source.output_facts is null
   or exists(select 1 from local_commerce.media_cleanup_leases where project_id=p_project_id and internal_locator in (source.original_locator,source.derivative_locator))
   then return jsonb_build_object('status','unavailable'); end if;
  select c.revision into config_revision from local_commerce.catalog_configuration_snapshots c join local_commerce.catalog_products p
   on p.project_id=c.project_id and p.id=c.product_id where c.project_id=p_project_id and c.product_id=draft.product_id
   and c.lifecycle='active' and c.configuration_status='active' and p.lifecycle='active' and p.publication_status='published'
   and p.availability='available' and exists(select 1 from jsonb_array_elements(c.definition->'fields') f
    where f->>'id'=source.field_key and f->>'kind'='image' and f->>'isActive'='true') for share of c,p;
  if config_revision is distinct from source.configuration_revision then return jsonb_build_object('status','conflict'); end if;
  expires:=least(p_authority_expires_at,receipt.expires_at,source.expires_at,coalesce(draft.expires_at,p_authority_expires_at));
  insert into local_commerce.media_slot_reservations(project_id,owner_id,draft_id,product_id,field_key)
   values(p_project_id,owner_uuid,draft.id,draft.product_id,source.field_key) returning id into reservation;
  operation_uuid:=gen_random_uuid();
  insert into local_commerce.media_operations(project_id,id,owner_id,draft_id,slot_id,product_id,field_key,source_generation,crop_revision,
   configuration_revision,operation_kind,normalized_input,original_locator,derivative_locator,original_object_id,expires_at)
   values(p_project_id,operation_uuid,owner_uuid,draft.id,reservation,draft.product_id,source.field_key,1,1,config_revision,'copy',
    source.normalized_input||jsonb_build_object('kind','copy'),source.original_locator,p_project_id||'/media/'||operation_uuid::text||'/derivative',source.original_object_id,expires)
   returning * into target;
  insert into local_commerce.media_copy_bindings(project_id,owner_id,source_receipt_id,target_draft_id,action_key,source_generation,target_operation_id,input_digest,expected_version)
   values(p_project_id,owner_uuid,receipt.id,draft.id,p_key_digest,source.source_generation,target.id,p_input_digest,p_expected_version);
 end if;
 if p_authority_expires_at<=clock_timestamp() then raise exception 'authority expired'; end if;
 return jsonb_build_object('status','found','operation',to_jsonb(target),'receipt',
  (select jsonb_build_object('receiptId',receipt_reference,'createdAt',created_at,'expiresAt',expires_at,'lifecycle',lifecycle)
   from local_commerce.media_receipts where project_id=p_project_id and id=target.receipt_id and owner_id=owner_uuid));
exception when unique_violation then return jsonb_build_object('status','conflict');
 when others then return jsonb_build_object('status','unavailable');
end;
$function$;
revoke all on function local_commerce.media_copy_command(text,text,text,text,uuid,timestamptz,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function local_commerce.media_copy_command(text,text,text,text,uuid,timestamptz,uuid,uuid,integer,text,text) to service_role;
notify pgrst,'reload schema';
