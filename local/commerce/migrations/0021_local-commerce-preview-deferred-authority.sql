-- Forward fix for Task 7.2: deferred triggers run after the command's
-- SECURITY DEFINER frame has returned. Keep their integrity read privileged
-- without granting callers access to private history or preview relations.
alter function local_commerce.assert_preview_manifest_complete() security definer;
alter function local_commerce.assert_preview_manifest_complete() set search_path=pg_catalog,local_commerce;
revoke all on function local_commerce.assert_preview_manifest_complete() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
