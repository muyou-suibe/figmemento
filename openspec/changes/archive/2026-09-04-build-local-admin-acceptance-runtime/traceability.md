# Local Admin Acceptance Runtime Traceability

This supplementary matrix links the new capability requirements to the
implementation tasks and acceptance evidence. It does not replace the
normative delta spec or alter any existing OpenSpec change.

| Requirement | Primary tasks | Verification evidence |
| --- | --- | --- |
| Explicit and fail-closed Admin acceptance source | 1.2, 1.4, 5.1, 5.5 | Source parser tests; production rejection; no-fallback sentinel |
| Existing Admin authentication remains authoritative | 1.3, 4.1, 4.5, 5.2, 6.2 | Real `/admin/login`; signed-cookie verifier; unauthorized factory count zero |
| Local Admin Catalog uses existing typed boundaries | 2.1–2.5, 4.1–4.3, 5.3 | Local graph/read/command/lifecycle tests; Products browser evidence |
| Local Admin Orders is a separate synthetic read boundary | 3.1–3.4, 4.4–4.5, 5.4, 6.3 | Orders projection/privacy tests; no-Storage sentinel; Orders browser evidence |
| All relevant Admin routes share one server-side source boundary | 1.3, 4.1–4.5, 5.2, 5.5 | Route factory audit; local read/write source consistency tests |
| Provider isolation and safe failure are observable | 1.4, 3.3, 4.5, 5.2, 5.4–5.5, 6.2–6.3 | Supabase/fetch/Storage/production-Order counters; bounded unavailable output |
| Local state is process-memory only and isolated from storefront | 2.5, 5.3, 5.6 | Restart reset; public/downstream source isolation regression tests |
| Authorized Admin browser acceptance is bounded and truthful | 6.1–6.3, 7.1–7.3 | Manual Chrome desktop/375px matrix; local/test notices; high-fidelity handoff |

## Explicit non-goal checks

- No remote Supabase, database migration, production persistence, deployment,
  DNS, Cloudflare, email provider, payment provider, shipping provider,
  inventory, supplier, procurement, warehouse, or replacement auth system.
- No new production Admin workflow and no automatic completion of
  `build-figmemento-html-high-fidelity-port` Task 10.2.
