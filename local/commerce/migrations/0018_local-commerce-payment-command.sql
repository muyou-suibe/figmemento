-- Local simulation only. The ledger wrapper owns the transaction.
-- Purchase facts are read through the existing canonical history authority.
-- A read-only prepare returns the server-owned version; commit requires it.
create function local_commerce.payment_command(
  p_project_id text, p_marker_digest text, p_owner_kind text, p_owner_selector text,
  p_customer_id uuid, p_session_hash text, p_authority_expires_at timestamptz,
  p_capability_hash text, p_public_reference text, p_operation text,
  p_order_id uuid, p_expected_version integer, p_key_digest text,
  p_context_digest text, p_outcome text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,local_commerce
as $payment$
declare
  purchase local_commerce.orders%rowtype;
  header local_commerce.order_purchase_snapshots%rowtype;
  action local_commerce.payment_actions%rowtype;
  grant_row local_commerce.access_grants%rowtype;
  history jsonb; context_digest text; payment_id uuid; payment_reference text;
  terminal text; target text; public_result jsonb; committed_at timestamptz;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_operation is null or p_operation not in ('prepare','commit')
    or p_public_reference is null or p_public_reference!~'^FM-LOCAL-[A-Z0-9]{16}$'
    or p_key_digest is null or p_key_digest!~'^[0-9a-f]{64}$'
    or p_outcome is null or p_outcome not in ('success','failed','cancelled')
    or (p_operation='commit' and (p_order_id is null or p_expected_version is null or p_expected_version<1
      or p_context_digest is null or p_context_digest!~'^[0-9a-f]{64}$')) then
    return jsonb_build_object('status','unavailable'); end if;

  -- Lock before history's SHARE lock to avoid SHARE-to-UPDATE upgrade races.
  -- This is identity selection only: no Payment lookup or disclosure yet.
  if p_operation='commit' then
    select * into purchase from local_commerce.orders where project_id=p_project_id
      and public_reference=p_public_reference and id=p_order_id for update;
  else
    select * into purchase from local_commerce.orders where project_id=p_project_id
      and public_reference=p_public_reference;
  end if;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  history:=local_commerce.read_order_history(p_project_id,p_marker_digest,p_owner_kind,p_owner_selector,
    p_customer_id,p_session_hash,p_authority_expires_at,p_capability_hash,purchase.id,p_public_reference,null,'customer_summary');
  if history->>'status' is distinct from 'found' then return jsonb_build_object('status','unavailable'); end if;
  -- Keep revocation ordered with the command, and recheck server expiry after waiting.
  select * into grant_row from local_commerce.access_grants where project_id=p_project_id
    and owner_id=purchase.owner_id and resource_kind='local_order' and resource_id=purchase.id
    and capability_hash=p_capability_hash and lifecycle='active' and revoked_at is null for share;
  if not found or grant_row.expires_at<=clock_timestamp() or p_authority_expires_at<=clock_timestamp() then
    return jsonb_build_object('status','unavailable'); end if;
  context_digest:=encode(sha256(convert_to(jsonb_build_array(p_project_id,purchase.owner_id,purchase.id,
    p_capability_hash,p_outcome)::text,'UTF8')),'hex');

  -- Fresh authorization precedes replay; lifecycle/version only gate NEW work.
  select * into action from local_commerce.payment_actions where project_id=p_project_id and action_key=p_key_digest;
  if found then
    if action.owner_id<>purchase.owner_id then return jsonb_build_object('status','unavailable'); end if;
    if action.order_id<>purchase.id or action.request_digest<>context_digest
      or (p_operation='commit' and p_context_digest<>context_digest) then
      return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','found','value',jsonb_build_object('replayed',true,
      'orderId',purchase.id,'ownerId',purchase.owner_id,'version',purchase.version,'payment',action.result->'payment'));
  end if;
  if p_operation='prepare' then
    return jsonb_build_object('status','found','value',jsonb_build_object('replayed',false,
      'orderId',purchase.id,'ownerId',purchase.owner_id,'version',purchase.version,'contextDigest',context_digest));
  end if;
  if p_context_digest<>context_digest or purchase.version<>p_expected_version
    or purchase.lifecycle<>'active' or purchase.lifecycle_status not in ('pending_payment','payment_failed') then
    return jsonb_build_object('status','conflict'); end if;
  select * into header from local_commerce.order_purchase_snapshots where project_id=p_project_id
    and order_id=purchase.id and owner_id=purchase.owner_id;
  if not found or header.currency<>'USD' or header.tax_status<>'not_activated' or header.tax_amount_cents is not null
    or header.total_cents<0 or header.total_cents::bigint<>header.subtotal_cents::bigint+header.shipping_cents-header.discount_cents
    or header.total_cents is distinct from (history#>>'{value,commercial,localArithmeticTotalCents}')::integer
    or header.currency is distinct from history#>>'{value,commercial,currency}' then
    return jsonb_build_object('status','unavailable'); end if;
  payment_id:=gen_random_uuid();
  payment_reference:='LP-LOCAL-'||upper(substr(replace(payment_id::text,'-',''),1,16));
  committed_at:=clock_timestamp();
  terminal:=case p_outcome when 'success' then 'succeeded' else p_outcome end;
  target:=case p_outcome when 'success' then 'paid' when 'failed' then 'payment_failed' else 'pending_payment' end;
  public_result:=jsonb_build_object('kind','local_payment_projection','paymentReference',payment_reference,
    'orderReference',purchase.public_reference,'status',terminal,'outcome',p_outcome,
    'simulatedAmountCents',header.total_cents,'simulatedCurrency',header.currency,'timestamp',committed_at,
    'notice','Development/test simulation only. No real money was charged.');
  insert into local_commerce.payment_attempts(project_id,id,order_id,owner_id,action_key,amount_cents,currency,outcome,lifecycle,created_at,updated_at)
    values(p_project_id,payment_id,purchase.id,purchase.owner_id,p_key_digest,header.total_cents,header.currency,terminal,'settled',committed_at,committed_at);
  -- One durable action owns both the replay result and bounded audit fact.
  insert into local_commerce.payment_actions(project_id,order_id,attempt_id,owner_id,action_key,request_digest,result,created_at,updated_at)
    values(p_project_id,purchase.id,payment_id,purchase.owner_id,p_key_digest,context_digest,
      jsonb_build_object('payment',public_result,'audit',jsonb_build_object('paymentId',payment_id,'orderId',purchase.id,
        'outcome',p_outcome,'amountCents',header.total_cents,'currency',header.currency,'terminal',terminal,
        'timestamp',committed_at,'contextDigest',context_digest)),committed_at,committed_at);
  update local_commerce.orders set lifecycle_status=target,version=version+1 where project_id=p_project_id and id=purchase.id;
  return jsonb_build_object('status','found','value',jsonb_build_object('replayed',false,
    'orderId',purchase.id,'ownerId',purchase.owner_id,'version',purchase.version+1,'payment',public_result));
exception
  when unique_violation then return jsonb_build_object('status','conflict');
  when others then return jsonb_build_object('status','unavailable');
end;
$payment$;
revoke all on function local_commerce.payment_command(text,text,text,text,uuid,text,timestamptz,text,text,text,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function local_commerce.payment_command(text,text,text,text,uuid,text,timestamptz,text,text,text,uuid,integer,text,text,text) to service_role;
notify pgrst, 'reload schema';
