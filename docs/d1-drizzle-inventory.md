# D1 and Drizzle inventory

This inventory records the evidence gathered before isolating D1/Drizzle from PhotoGift's active business architecture. Supabase PostgreSQL remains the authoritative MVP business database.

## Verified classifications

| Path or concern | Classification | Import, binding, script, and build evidence | Approved handling |
|---|---|---|---|
| `vite.config.ts` | Runtime-required | Vite loads it for every vinext build. It imports the Sites plugin and creates optional local D1/R2 binding arrays from hosting metadata. | Retain. Keep the currently inactive optional D1 branch. |
| `worker/index.ts` | Runtime-required | It is the configured Worker `main` entry and handles vinext routing and image optimization. | Retain. Remove only inactive D1 typing if doing so does not affect the build. |
| `build/sites-vite-plugin.ts` | Runtime-required build support | `vite.config.ts` imports it and the successful production build runs its `closeBundle` hook. | Retain the plugin and hosting metadata packaging; stop packaging inactive root Drizzle output. |
| `.openai/hosting.json` | Runtime-required deployment metadata | The build packages it. Both `d1` and `r2` are currently `null`, so no D1 or R2 binding is configured. | Retain unchanged. |
| Optional D1 branch in `vite.config.ts` | Inert optional runtime support | The branch is present, but `.openai/hosting.json` supplies no D1 binding and the production build succeeds without one. | Retain as approved. |
| `db/index.ts` and `db/schema.ts` | Inactive template residue | No PhotoGift application module imports them. Only the excluded `examples/d1/` route imports the root helper. The empty schema defines no business table. | Retain uncertain/source example material, but exclude it from active PhotoGift compilation and tooling. Do not delete it in C0. |
| `drizzle.config.ts` | Inactive template tooling | It is referenced only by the `db:generate` package script and targets SQLite/D1, not Supabase PostgreSQL. | Retain the file as non-product example material, but remove its active package script and dependency path. |
| `drizzle/meta/_journal.json` | Inactive generated residue | It has no migrations. The Sites plugin currently copies the directory mechanically even though no D1 binding exists. | Retain the source file, but stop packaging the directory into PhotoGift deployment output. |
| `drizzle-orm`, `drizzle-kit`, `db:generate` | Inactive dependencies/tooling | Searches found use only in the root D1 helper/config and `examples/d1/`; no PhotoGift business route uses them. | Removed from active package scripts and installed project dependencies after successful typecheck and build verification. |
| `examples/d1/` | Explicitly retained example | vinext's production route list does not include the example route. Before isolation, general TypeScript globs included it. | Retained as example-only material and now explicitly excluded from PhotoGift TypeScript and lint verification. |

## Isolation safety rules

- Do not remove or disable vinext, Vite, Worker, Sites, or Cloudflare runtime support.
- Do not remove the optional D1 branch in `vite.config.ts` during C0.
- Do not delete a file whose purpose remains uncertain.
- After isolation, run strict TypeScript checking and a production build. If evidence contradicts this inventory, retain the path and revise the classification instead of suppressing the error.
