-- Task 9.1 forward fix: publish the already-restricted 0031 RPC signatures to
-- the local PostgREST schema cache. No data, policy, or business fact changes.
notify pgrst, 'reload schema';
