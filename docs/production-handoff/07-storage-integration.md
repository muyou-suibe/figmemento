# 07 — Production private storage integration

Overall status: **NEEDS PROVIDER DECISION** followed by **PRODUCTION
INTEGRATION REQUIRED**.

The accepted local adapter uses private local Supabase Storage only to validate
the provider-neutral media contracts. It does not select the production
provider.

## Existing private-media model

Classification: **LOCAL CORE COMPLETE**.

- Customer source images are private and immutable.
- Derived crop/preview media is server-produced from verified source bytes.
- Production preview media and digital-delivery files remain private.
- Browsers receive safe projections and same-origin authorized byte streams,
  never bucket names or permanent object locators.
- Database lifecycle (`pending/ready/failed`), operation identity, receipt,
  owner/project/Product/field binding and publication state remain canonical.
- Object writes and database publication use reconciliation rather than false
  distributed-transaction claims.
- Cleanup uses durable eligibility/lease/reference rules and cannot delete
  attached/shared objects.

## Provider decision

Choose one reviewed production adapter:

- Supabase Storage;
- Cloudflare R2;
- another explicitly approved private object provider.

Do not choose solely because local acceptance used Supabase Storage. The
decision must compare Worker compatibility, private-access model, egress/cost,
regional residency, lifecycle tooling, backup/recovery and operational support.

## Required production configuration

| Requirement | Classification | Decision/evidence needed |
| --- | --- | --- |
| Bucket/container separation | NEEDS PROVIDER DECISION | Source, derivative, production-preview and digital-delivery isolation. |
| Private access policy | PRODUCTION INTEGRATION REQUIRED | No public bucket; least-privilege server access and cross-owner denial. |
| CORS | PRODUCTION INTEGRATION REQUIRED | Exact production/staging origins and methods; no permissive wildcard credentials. |
| Object limits | BUSINESS CONFIGURATION REQUIRED | MIME, bytes, decoded dimensions/pixels and per-field counts. |
| Retention/deletion | BUSINESS CONFIGURATION REQUIRED | Guest expiry, Order/legal holds, account deletion and cleanup schedule. |
| Residency/privacy | NEEDS PROVIDER DECISION | Launch-market/legal requirements and data-processing terms. |
| Backup/recovery | NEEDS PROVIDER DECISION | Object durability, versioning, restore and evidence procedure. |
| Monitoring | PRODUCTION INTEGRATION REQUIRED | Failure/latency/orphan/cleanup/quota alerts. |
| Customer access | PRODUCTION INTEGRATION REQUIRED | Preserve authorized same-origin stream or equivalently reviewed private strategy. |

## Integration constraints

- Do not expose permanent raw object URLs.
- Signed URLs, if selected, must be short-lived, owner/resource scoped and must
  not bypass digital ticket/quota or preview authorization.
- Never let browser filenames, MIME, dimensions, object keys or hashes become
  authority.
- Preserve original immutability, server crop, stable slot/generation fencing,
  response-loss recovery and stale-result cleanup.
- The local sharp helper is not a production renderer decision.

## Acceptance checklist

- [ ] Private bucket/container and direct anonymous access denial.
- [ ] Cross-owner and cross-project object denial.
- [ ] Upload, server inspection, crop/derived publication and read-back digest.
- [ ] Response-loss/restart reconciliation without duplicate receipt/publication.
- [ ] Missing object returns bounded unavailable, never fabricated ready state.
- [ ] Cleanup/reference/attach races preserve live objects.
- [ ] Digital claim commits before customer bytes and quota never resets on restart.
- [ ] Logs, responses, redirects and client bundles contain no credentials/locators.
