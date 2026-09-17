-- C03 forward fix: align the accepted order_commit tax projection with the
-- canonical LocalTaxState shape. Migration 0039 remains immutable.
-- The ledger wrapper owns the outer transaction; do not add transaction control.

do $forward$
declare
  definition text;
begin
  select pg_get_functiondef(
    'local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb)'::regprocedure
  ) into definition;

  if definition is null
    or position($needle$'{"status":"not_activated","amount":null}'::jsonb$needle$ in definition) = 0 then
    raise exception 'C03 order_commit forward-fix target is not present';
  end if;

  definition := replace(
    definition,
    $needle$'{"status":"not_activated","amount":null}'::jsonb$needle$,
    $replacement$'{"status":"not_activated","amountCents":null}'::jsonb$replacement$
  );
  execute definition;
end
$forward$;

revoke all on function local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb) to service_role;

notify pgrst, 'reload schema';
