# PhotoGift engineering baseline

Recorded on 2026-08-07 before implementing change `stabilize-photogift-foundation`.

## Verification results

| Gate | Command | Result | Evidence |
|---|---|---|---|
| Lint | `npm run lint` | Pass | ESLint completed with exit code 0. |
| Strict TypeScript | `npx tsc --noEmit --incremental false` | Fail | Strict checking completed with exit code 2. |
| Existing test | `npm test` | Pass | The script built the application and passed one rendered-homepage test. It was not an offline unit-test gate because it depended on a production build. |
| Production build | `npm run build` | Pass | vinext completed all five build environments and emitted the current application routes. |

## Initial TypeScript failure ownership

- `app/page.tsx`: recursive photo metadata typing, React-versus-DOM keyboard events, an undefined `setPhotoUrls` reference, and an implicit callback type.
- `app/admin/orders/page.tsx`: fallback query results omit the `order_status_logs` relationship expected by the primary query result.
- `app/api/admin/cleanup-uploads/route.ts`: Supabase `FileObject.created_at` can be `null` but the local collection type did not allow it.
- `app/api/admin/orders/route.ts`: an unknown metadata value was assigned to an optional string field without narrowing.
- `app/api/orders/route.ts`: photo metadata width and height were used before narrowing unknown values.
- `db/index.ts`: the inactive D1 helper depends on the Cloudflare-only `cloudflare:workers` module in the general TypeScript project.
- `worker/index.ts`: Cloudflare `Fetcher` and `D1Database` globals were not available to the general TypeScript project; the D1 member is inactive, while Worker runtime participation must be preserved.

These failures are baseline evidence, not approved behavior. They must be fixed at their owning boundary rather than hidden by weakened compiler settings.
