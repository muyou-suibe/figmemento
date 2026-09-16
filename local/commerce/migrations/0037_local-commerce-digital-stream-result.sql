-- Task 9.7: durable stream-result audit after the already-committed claim.
-- Claim/quota is never refunded here. A process loss before this RPC leaves
-- the canonical attempt as unknown rather than claiming a completed stream.

alter table local_commerce.digital_delivery_attempts
  add column stream_result_context_digest text,
  add column stream_result_at timestamptz;

alter table local_commerce.digital_delivery_attempts
  add constraint digital_delivery_attempts_stream_context_check check
    (stream_result_context_digest is null or stream_result_context_digest ~ '^[0-9a-f]{64}$'),
  add constraint digital_delivery_attempts_stream_result_shape_check check (
    (attempt_result='unknown' and stream_result_context_digest is null and stream_result_at is null)
    or
    (attempt_result in ('streamed','failed') and stream_result_context_digest is not null
      and stream_result_at is not null)
  );

create function local_commerce.digital_download_stream_result(
  p_project_id text,
  p_marker_digest text,
  p_attempt_id uuid,
  p_result text,
  p_context_digest text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, local_commerce
as $result$
declare
  target local_commerce.digital_delivery_attempts%rowtype;
  stamp timestamptz;
begin
  if not local_commerce.verify_project_identity(p_project_id,p_marker_digest)
    or p_attempt_id is null or p_result not in ('streamed','failed')
    or p_context_digest is null or p_context_digest !~ '^[0-9a-f]{64}$'
  then return jsonb_build_object('status','unavailable'); end if;

  select * into target from local_commerce.digital_delivery_attempts
   where project_id=p_project_id and id=p_attempt_id for update;
  if not found or target.claimed_at is null or target.attempt_result not in ('unknown','streamed','failed')
  then return jsonb_build_object('status','unavailable'); end if;

  if target.attempt_result<>'unknown' then
    if target.attempt_result=p_result and target.stream_result_context_digest=p_context_digest then
      return jsonb_build_object('status','found','value',jsonb_build_object(
        'attemptId',target.id,'result',target.attempt_result,'recordedAt',target.stream_result_at),'replayed',true);
    end if;
    return jsonb_build_object('status','conflict');
  end if;

  stamp:=clock_timestamp();
  update local_commerce.digital_delivery_attempts set
    attempt_result=p_result,
    lifecycle=case when p_result='streamed' then 'completed' else 'failed' end,
    stream_result_context_digest=p_context_digest,
    stream_result_at=stamp,
    version=version+1,
    updated_at=stamp
  where project_id=p_project_id and id=target.id;
  return jsonb_build_object('status','found','value',jsonb_build_object(
    'attemptId',target.id,'result',p_result,'recordedAt',stamp),'replayed',false);
exception
  when deadlock_detected or serialization_failure then
    return jsonb_build_object('status','conflict');
  when others then return jsonb_build_object('status','unavailable');
end;
$result$;

revoke all on function local_commerce.digital_download_stream_result(text,text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function local_commerce.digital_download_stream_result(text,text,uuid,text,text)
  to service_role;

notify pgrst,'reload schema';
