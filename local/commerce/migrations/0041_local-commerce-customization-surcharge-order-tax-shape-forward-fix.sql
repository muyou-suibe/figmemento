-- C03 forward fix: preserve the existing Order allocation tax shape while
-- Checkout continues to expose its separate amountCents projection.
-- Migrations 0039 and 0040 remain immutable.
-- The ledger wrapper owns the outer transaction; do not add transaction control.

do $forward$
declare
  definition text;
begin
  select pg_get_functiondef(
    'local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb)'::regprocedure
  ) into definition;

  if definition is null
    or position($needle$'{"status":"not_activated","amountCents":null}'::jsonb$needle$ in definition) = 0 then
    raise exception 'C03 order_commit tax-shape forward-fix target is not present';
  end if;

  definition := replace(
    definition,
    $needle$'{"status":"not_activated","amountCents":null}'::jsonb$needle$,
    $replacement$'{"status":"not_activated","amount":null}'::jsonb$replacement$
  );
  execute definition;
end
$forward$;

revoke all on function local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb) to service_role;

notify pgrst, 'reload schema';
