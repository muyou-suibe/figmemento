-- Task 9.1: local development/test digital publication. The ledger wrapper
-- owns the outer transaction. This migration does not activate grants,
-- tickets, downloads, email, or any production provider.

alter table local_commerce.digital_versions
  drop constraint digital_versions_status_check;

update local_commerce.digital_versions
set status = case status
  when 'draft' then 'pending'
  when 'published' then 'ready'
  when 'revoked' then 'failed'
  else status
end;

alter table local_commerce.digital_versions
  alter column status set default 'pending',
  add constraint digital_versions_status_check
    check (status in ('pending', 'ready', 'failed')),
  add column operation_key text,
  add column context_digest text,
  add column actor_id text,
  add column content_digest text,
  add column content_type text,
  add column byte_size integer,
  add column safe_file_name text,
  add column is_current boolean not null default false,
  add column ready_at timestamptz,
  add column failed_at timestamptz,
  add column publication_result jsonb;

alter table local_commerce.digital_versions
  add constraint digital_versions_operation_key unique (project_id, operation_key),
  add constraint digital_versions_operation_check check
    (operation_key is null or operation_key ~ '^[0-9a-f]{64}$'),
  add constraint digital_versions_context_check check
    (context_digest is null or context_digest ~ '^[0-9a-f]{64}$'),
  add constraint digital_versions_actor_check check
    (actor_id is null or actor_id ~ '^[A-Za-z0-9_-]{8,200}$'),
  add constraint digital_versions_content_digest_check check
    (content_digest is null or content_digest ~ '^[0-9a-f]{64}$'),
  add constraint digital_versions_content_type_check check
    (content_type is null or content_type in
      ('image/jpeg','image/png','image/webp','application/pdf','application/zip')),
  add constraint digital_versions_byte_size_check check
    (byte_size is null or byte_size between 1 and 15728640),
  add constraint digital_versions_file_name_check check
    (safe_file_name is null or (length(safe_file_name) between 1 and 160
      and safe_file_name = btrim(safe_file_name))),
  add constraint digital_versions_ready_shape_check check (
    (status = 'pending' and ready_at is null and failed_at is null and is_current = false)
    or (status = 'ready' and ready_at is not null and failed_at is null
      and operation_key is not null and context_digest is not null and actor_id is not null
      and content_digest is not null and content_type is not null and byte_size is not null
      and safe_file_name is not null and publication_result is not null)
    or (status = 'failed' and ready_at is null and failed_at is not null and is_current = false)
  );

create unique index digital_versions_current_item_key
  on local_commerce.digital_versions(project_id, order_item_id)
  where is_current;

create function local_commerce.digital_publication_command(
  p_project_id text,
  p_marker_digest text,
  p_actor_kind text,
  p_actor_id text,
  p_public_reference text,
  p_order_item_id uuid,
  p_operation text,
  p_key_digest text,
  p_context_digest text,
  p_input jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, local_commerce
as $command$
declare
  purchase local_commerce.orders%rowtype;
  item local_commerce.order_items%rowtype;
  item_snapshot local_commerce.order_item_purchase_snapshots%rowtype;
  aggregate local_commerce.fulfillments%rowtype;
  prior local_commerce.digital_versions%rowtype;
  current_version local_commerce.digital_versions%rowtype;
  manifest local_commerce.preview_manifests%rowtype;
  facts jsonb;
  item_fact jsonb;
  result jsonb;
  next_number integer;
  version_id uuid;
  locator text;
  approved boolean;
  stamp timestamptz;
begin
  if not local_commerce.verify_project_identity(p_project_id, p_marker_digest)
    or p_actor_kind is distinct from 'admin'
    or p_actor_id is null or p_actor_id !~ '^[A-Za-z0-9_-]{8,200}$'
    or p_public_reference is null or p_public_reference !~ '^FM-LOCAL-[A-Z0-9]{16}$'
    or p_order_item_id is null
    or p_operation is null or p_operation not in ('probe','reserve','ready','fail')
    or p_key_digest is null or p_key_digest !~ '^[0-9a-f]{64}$'
    or p_context_digest is null or p_context_digest !~ '^[0-9a-f]{64}$'
    or p_input is null or jsonb_typeof(p_input) <> 'object'
    or p_input->>'contentDigest' is null or p_input->>'contentDigest' !~ '^[0-9a-f]{64}$'
    or p_input->>'contentType' not in ('image/jpeg','image/png','image/webp','application/pdf','application/zip')
    or (p_input->>'byteSize') is null or (p_input->>'byteSize') !~ '^[0-9]+$'
    or (p_input->>'byteSize')::bigint not between 1 and 15728640
    or p_input->>'fileName' is null or length(p_input->>'fileName') not between 1 and 160
    or p_input->>'fileName' is distinct from btrim(p_input->>'fileName')
    or p_input ?| array['ownerId','paid','paymentStatus','fulfillmentType','versionNumber','contentReference','storagePath','bucket','ready']
  then return jsonb_build_object('status','unavailable'); end if;

  select * into prior from local_commerce.digital_versions
   where project_id = p_project_id and operation_key = p_key_digest;
  if found then
    if prior.order_item_id is distinct from p_order_item_id
      or prior.actor_id is distinct from p_actor_id
      or prior.context_digest is distinct from p_context_digest
      or prior.content_digest is distinct from p_input->>'contentDigest'
      or prior.content_type is distinct from p_input->>'contentType'
      or prior.byte_size is distinct from (p_input->>'byteSize')::integer
      or prior.safe_file_name is distinct from p_input->>'fileName'
    then return jsonb_build_object('status','conflict'); end if;
    if prior.status in ('ready','failed') then
      return jsonb_build_object('status','found','value',prior.publication_result,'replayed',true);
    end if;
    return jsonb_build_object('status','found','value',jsonb_build_object(
      'state','pending','versionId',prior.id,'versionNumber',prior.version_number,
      'contentReference',prior.content_reference),'replayed',true);
  end if;
  if p_operation <> 'reserve' then return jsonb_build_object('status','not_found'); end if;

  select * into purchase from local_commerce.orders
   where project_id = p_project_id and public_reference = p_public_reference for update;
  if not found or purchase.lifecycle_status <> 'paid' or purchase.lifecycle <> 'active'
    or not exists(select 1 from local_commerce.payment_attempts p
      where p.project_id=p_project_id and p.order_id=purchase.id and p.owner_id=purchase.owner_id
        and p.outcome='succeeded' and p.lifecycle='settled')
  then return jsonb_build_object('status','unavailable'); end if;

  select * into item from local_commerce.order_items
   where project_id=p_project_id and id=p_order_item_id and order_id=purchase.id
     and owner_id=purchase.owner_id and lifecycle='active' for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into item_snapshot from local_commerce.order_item_purchase_snapshots
   where project_id=p_project_id and order_item_id=item.id and owner_id=purchase.owner_id;
  if not found or item_snapshot.fulfillment_type <> 'digital' or item_snapshot.lifecycle <> 'committed'
  then return jsonb_build_object('status','unavailable'); end if;

  select * into aggregate from local_commerce.fulfillments
   where project_id=p_project_id and order_id=purchase.id and owner_id=purchase.owner_id and lifecycle='active';
  if not found then return jsonb_build_object('status','unavailable'); end if;
  facts := local_commerce.fulfillment_purchased_items(p_project_id,purchase.id,purchase.owner_id);
  if facts is null then return jsonb_build_object('status','unavailable'); end if;
  select value into item_fact from jsonb_array_elements(facts)
   where value->>'orderItemId'=item.id::text;
  if item_fact is null or item_fact#>>'{purchasedItem,fulfillment,fulfillmentType}' <> 'digital'
    or jsonb_typeof(item_fact#>'{purchasedItem,media}') <> 'array'
    or jsonb_typeof(item_fact#>'{purchasedItem,fulfillment,requiresProductionPreview}') <> 'boolean'
  then return jsonb_build_object('status','unavailable'); end if;

  if jsonb_array_length(item_fact#>'{purchasedItem,media}') > 0 and not exists(
    select 1 from local_commerce.photo_reviews r
     where r.project_id=p_project_id and r.order_id=purchase.id and r.order_item_id=item.id
       and r.owner_id=purchase.owner_id and r.fulfillment_id=aggregate.id
       and r.lifecycle='active' and r.review_state='approved')
  then return jsonb_build_object('status','conflict'); end if;

  if item_fact#>'{purchasedItem,fulfillment,requiresProductionPreview}' = 'true'::jsonb then
    select * into manifest from local_commerce.preview_manifests
     where project_id=p_project_id and id=aggregate.current_manifest_id and order_id=purchase.id
       and owner_id=purchase.owner_id and fulfillment_id=aggregate.id;
    if not found or not (manifest.item_ids ? item.id::text)
      or not exists(select 1 from local_commerce.preview_manifest_entries e
        join local_commerce.fulfillment_preview_media m
          on m.project_id=e.project_id and m.id=e.preview_media_id and m.order_id=e.order_id
          and m.owner_id=e.owner_id and m.fulfillment_id=e.fulfillment_id
          and m.order_item_id=e.order_item_id and m.manifest_version=e.manifest_version and m.lifecycle='ready'
        where e.project_id=p_project_id and e.manifest_id=manifest.id and e.order_item_id=item.id)
    then return jsonb_build_object('status','conflict'); end if;
    select exists(select 1 from local_commerce.fulfillment_decisions d
      where d.project_id=p_project_id and d.order_id=purchase.id and d.owner_id=purchase.owner_id
        and d.fulfillment_id=aggregate.id and d.decision_kind in ('customer_approve','operator_timeout')
        and d.expected_manifest_version=manifest.manifest_version
        and d.result#>>'{value,manifestId}'=manifest.id::text) into approved;
    if not approved then return jsonb_build_object('status','conflict'); end if;
  end if;

  select coalesce(max(version_number),0)+1 into next_number
   from local_commerce.digital_versions where project_id=p_project_id and order_item_id=item.id;
  version_id := gen_random_uuid();
  locator := 'digital/' || item.id::text || '/' || version_id::text;
  insert into local_commerce.digital_versions(
    project_id,id,order_item_id,owner_id,version_number,content_reference,status,
    operation_key,context_digest,actor_id,content_digest,content_type,byte_size,safe_file_name)
  values(p_project_id,version_id,item.id,purchase.owner_id,next_number,locator,'pending',
    p_key_digest,p_context_digest,p_actor_id,p_input->>'contentDigest',p_input->>'contentType',
    (p_input->>'byteSize')::integer,p_input->>'fileName');
  return jsonb_build_object('status','found','value',jsonb_build_object(
    'state','pending','versionId',version_id,'versionNumber',next_number,'contentReference',locator),'replayed',false);
exception when unique_violation or deadlock_detected or serialization_failure then
  return jsonb_build_object('status','conflict');
end;
$command$;

-- Complete/fail is separated so private Storage write + readback occurs between
-- reservation and publication. The same operation row remains the authority.
create function local_commerce.digital_publication_complete(
  p_project_id text,p_marker_digest text,p_actor_kind text,p_actor_id text,
  p_public_reference text,p_order_item_id uuid,p_operation text,p_key_digest text,
  p_context_digest text,p_version_id uuid,p_readback_digest text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,local_commerce as $complete$
declare
  purchase local_commerce.orders%rowtype;
  item local_commerce.order_items%rowtype;
  target local_commerce.digital_versions%rowtype;
  stamp timestamptz;
  result jsonb;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_actor_kind is distinct from 'admin' or p_actor_id is null or p_actor_id!~'^[A-Za-z0-9_-]{8,200}$'
    or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$'
    or p_order_item_id is null or p_version_id is null or p_operation not in ('ready','fail')
    or p_key_digest is null or p_key_digest!~'^[0-9a-f]{64}$'
    or p_context_digest is null or p_context_digest!~'^[0-9a-f]{64}$'
    or p_readback_digest is null or p_readback_digest!~'^[0-9a-f]{64}$'
  then return jsonb_build_object('status','unavailable');end if;
  select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference for update;
  if not found then return jsonb_build_object('status','unavailable');end if;
  select * into item from local_commerce.order_items where project_id=p_project_id and id=p_order_item_id
    and order_id=purchase.id and owner_id=purchase.owner_id for update;
  if not found then return jsonb_build_object('status','unavailable');end if;
  select * into target from local_commerce.digital_versions where project_id=p_project_id and id=p_version_id for update;
  if not found or target.order_item_id<>item.id or target.owner_id<>purchase.owner_id
    or target.operation_key<>p_key_digest or target.context_digest<>p_context_digest or target.actor_id<>p_actor_id
  then return jsonb_build_object('status','conflict');end if;
  if target.status in ('ready','failed') then
    return jsonb_build_object('status','found','value',target.publication_result,'replayed',true);
  end if;
  stamp:=clock_timestamp();
  if p_operation='fail' or p_readback_digest<>target.content_digest then
    result:=jsonb_build_object('publicReference',purchase.public_reference,'orderItemId',item.id,
      'versionId',target.id,'versionNumber',target.version_number,'status','failed',
      'fileName',target.safe_file_name,'contentType',target.content_type,'byteSize',target.byte_size);
    update local_commerce.digital_versions set status='failed',failed_at=stamp,publication_result=result,
      version=version+1,updated_at=stamp where project_id=p_project_id and id=target.id;
    return jsonb_build_object('status','found','value',result,'replayed',false);
  end if;
  if exists(select 1 from local_commerce.digital_versions d where d.project_id=p_project_id
    and d.order_item_id=item.id and d.status='ready' and d.version_number>target.version_number)
  then return jsonb_build_object('status','conflict');end if;
  update local_commerce.digital_versions set is_current=false,updated_at=stamp
    where project_id=p_project_id and order_item_id=item.id and is_current;
  result:=jsonb_build_object('publicReference',purchase.public_reference,'orderItemId',item.id,
    'versionId',target.id,'versionNumber',target.version_number,'status','ready',
    'fileName',target.safe_file_name,'contentType',target.content_type,'byteSize',target.byte_size);
  update local_commerce.digital_versions set status='ready',is_current=true,ready_at=stamp,
    publication_result=result,version=version+1,updated_at=stamp
    where project_id=p_project_id and id=target.id;
  return jsonb_build_object('status','found','value',result,'replayed',false);
exception when unique_violation or deadlock_detected or serialization_failure then
  return jsonb_build_object('status','conflict');
end;
$complete$;

revoke all on function local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)
  to service_role;
revoke all on function local_commerce.digital_publication_complete(text,text,text,text,text,uuid,text,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function local_commerce.digital_publication_complete(text,text,text,text,text,uuid,text,text,text,uuid,text)
  to service_role;
