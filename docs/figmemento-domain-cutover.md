# FigMemento Domain Cutover Runbook

Status: **operator handoff only — not executed**

This runbook documents the evidence and sequencing required for a future
FigMemento domain cutover. It is not an automated deployment script. Reading
or applying this document does not authorize registrar, DNS, DNSSEC,
Cloudflare, provider, or production changes.

## Approved public identity

| Item | Approved value | Current state |
|---|---|---|
| Brand | `FigMemento` | Application identity already implemented locally |
| Production apex | `figmemento.com` | Approved; attachment not executed |
| Canonical production origin | `https://figmemento.com` | Approved application policy |
| WWW alias | `www.figmemento.com` | Approved exact redirect source |
| Planned staging host | `staging.figmemento.com` | Approved planning target; attachment not executed |
| Provider preview host | **UNRESOLVED** | Must be discovered from the actual provider |
| Production DNS target | **UNRESOLVED** | Must be discovered at deployment time |

## Stop and authorization rules

The operator must stop if an evidence gate is missing, the observed target is
ambiguous, or the proposed change would alter the approved origin policy. Do
not invent provider hostnames, IP addresses, CNAME values, account IDs, zone
IDs, nameservers, DS records, mail records, or deployment bindings.

The following actions are outside this repository-only handoff and require
separate authorization:

- registrar or domain ownership changes;
- nameserver, A, AAAA, CNAME, MX, TXT, CAA, or other DNS mutation;
- DNSSEC activation, deactivation, or DS changes;
- Cloudflare zone, custom-domain, or edge redirect changes;
- provider deployment or production release;
- Supabase, OAuth, Stripe, PayPal, email-provider, or analytics dashboard changes.

## Pre-cutover evidence worksheet

Complete this worksheet from the real operator accounts. Do not commit secret
values or credentials to Git.

### Domain ownership

- Authorized operator: `[deployment-time input]`
- Registrar/account under organizational control: `[deployment-time input]`
- Registration/ownership evidence location: `[deployment-time input]`
- Expiration and renewal state reviewed: `YES / NO / UNKNOWN`
- Evidence timestamp: `[deployment-time input]`

### Cloudflare and provider control

- Intended Cloudflare account: `[deployment-time input]`
- Intended Cloudflare zone: `[deployment-time input]`
- Account/zone ownership verified: `YES / NO / UNKNOWN`
- Cloudflare account ID: `[deployment-time input — do not guess]`
- Cloudflare zone ID: `[deployment-time input — do not guess]`
- Provider project/deployment: `[deployment-time input]`
- Provider-discovered custom-domain target: `[deployment-time input]`

### Nameservers

Record the values observed from the actual registrar and Cloudflare zone:

| Evidence | Value | Observed at | Operator |
|---|---|---|---|
| Current authoritative nameserver 1 | `[deployment-time input]` | `[time]` | `[operator]` |
| Current authoritative nameserver 2 | `[deployment-time input]` | `[time]` | `[operator]` |
| Intended Cloudflare nameserver 1 | `[deployment-time input]` | `[time]` | `[operator]` |
| Intended Cloudflare nameserver 2 | `[deployment-time input]` | `[time]` | `[operator]` |

Do not put generated or guessed nameservers in this document.

### Current DNS snapshot

Capture the pre-cutover public DNS state before any mutation. Include only
non-secret record data needed to restore routing.

| Record family | Current observed records | TTL | Source/time | Operator |
|---|---|---|---|---|
| A | `[deployment-time input]` | `[observed TTL]` | `[source/time]` | `[operator]` |
| AAAA | `[deployment-time input]` | `[observed TTL]` | `[source/time]` | `[operator]` |
| CNAME | `[deployment-time input]` | `[observed TTL]` | `[source/time]` | `[operator]` |
| MX | `[deployment-time input]` | `[observed TTL]` | `[source/time]` | `[operator]` |
| TXT | `[deployment-time input]` | `[observed TTL]` | `[source/time]` | `[operator]` |
| CAA | `[deployment-time input]` | `[observed TTL]` | `[source/time]` | `[operator]` |
| Other relevant records | `[deployment-time input]` | `[observed TTL]` | `[source/time]` | `[operator]` |

Do not invent TTLs or treat this blank worksheet as the current DNS state.

### DNSSEC sequencing

1. Inspect and record the current DNSSEC state as `enabled`, `disabled`, or
   `unknown`.
2. If DNSSEC is enabled, capture existing DS evidence through the authorized
   registrar/zone workflow without copying private credentials.
3. Confirm the actual registrar/Cloudflare-supported nameserver migration
   sequence before changing delegation.
4. Verify successful delegation and authoritative nameserver convergence.
5. Only then perform any separately approved DNSSEC activation or change.
6. Reverify resolution, TLS, and the reachable application after propagation.

Never generate DS values in this repository and never commit DS records that
were not supplied by the actual registrar/Cloudflare workflow.

## Staging-first workflow — `staging.figmemento.com`

Staging must be attached and verified before production apex work.

1. Confirm that the deployment owner has identified the provider project and
   deployment target.
2. Record the actual provider-discovered target in the deployment record:
   `PROVIDER-DISCOVERED TARGET: [deployment-time input]`.
3. Attach only `staging.figmemento.com` through the provider’s documented
   custom-domain workflow.
4. Record the actual CNAME/A/AAAA or custom-domain binding supplied by the
   provider at deployment time. Do not replace it with a guessed Pages or
   Workers hostname.
5. Wait for DNS and TLS propagation, then perform the verification below.

### Staging verification checklist

- [ ] DNS resolves to the intended provider target.
- [ ] TLS certificate is valid for exactly `staging.figmemento.com`.
- [ ] HTTPS reaches the intended staging deployment.
- [ ] The application classifies the host as `STAGING`.
- [ ] `APP_DEPLOYMENT_ENV` is explicitly `staging`.
- [ ] Robots prevents indexing.
- [ ] Root metadata is noindex.
- [ ] No staging canonical URL is emitted.
- [ ] No public staging sitemap is published or advertised.
- [ ] No provider-preview hostname is used as canonical.
- [ ] Staging does not unexpectedly redirect to production.
- [ ] Catalog/application behavior remains normal.
- [ ] Fixture/source safety remains consistent with the approved architecture.

These checks are future operator actions. They were not executed by this
change.

## Production apex attachment — `figmemento.com`

Apex attachment is a separately authorized action from staging and WWW work.

1. Confirm all ownership, Cloudflare, nameserver, DNS snapshot, DNSSEC, and
   staging gates above are complete.
2. Confirm the deployment owner has supplied the actual production target.
3. Attach the apex custom domain using the provider/Cloudflare workflow.
4. Set the approved production configuration only in the authorized
   deployment environment:
   `APP_DEPLOYMENT_ENV=production` and
   `NEXT_PUBLIC_DEPLOYMENT_ORIGIN=https://figmemento.com`.
5. Verify the apex before attaching or redirecting WWW.

### Apex verification checklist

- [ ] HTTPS is reachable and the TLS certificate is valid.
- [ ] The request reaches the correct deployment.
- [ ] Effective deployment environment is `production`.
- [ ] Effective production origin is `https://figmemento.com`.
- [ ] Root canonical is `https://figmemento.com/`.
- [ ] Open Graph public URL is `https://figmemento.com/`.
- [ ] Production robots allows public paths while disallowing `/admin/` and
      `/api/`.
- [ ] Robots advertises `https://figmemento.com/sitemap.xml`.
- [ ] Sitemap URLs use only `https://figmemento.com`.
- [ ] Product canonical URLs use the expected application-relative paths.
- [ ] Category canonical URLs use the expected application-relative paths.
- [ ] No staging or provider-preview hostname leaks into public metadata.

## WWW attachment and redirect activation

WWW is a separate attachment and a separate redirect activation. Do not
collapse apex attachment, WWW attachment, and redirect configuration into one
unreviewed action.

1. Attach `www.figmemento.com` using the actual provider/Cloudflare workflow.
2. Confirm the edge rule matches only the exact approved WWW hostname.
3. Activate the Cloudflare edge redirect only after apex verification passes.
4. Keep the application policy as defense-in-depth; do not add broad
   Host-header middleware.

### WWW verification checklist

- [ ] `https://www.figmemento.com/` returns a permanent redirect.
- [ ] Target is exactly `https://figmemento.com/`.
- [ ] `https://www.figmemento.com/product/example?ref=test` redirects to
      `https://figmemento.com/product/example?ref=test`.
- [ ] Permanent semantics are preserved.
- [ ] HTTPS is used at the target.
- [ ] Path is preserved.
- [ ] Query is preserved.
- [ ] Apex does not redirect back to WWW.
- [ ] No redirect loop occurs.
- [ ] Staging, preview, localhost, and `.test` hosts are not captured by this
      exact WWW rule.

Do not activate this redirect as part of the repository change.

## Rollback evidence and actions

Before cutover, preserve only non-secret evidence sufficient to restore the
last known reachable state:

- previous DNS record types and destinations;
- previous TTL values;
- previous nameserver state;
- previous custom-domain state;
- previous public endpoint;
- evidence timestamp;
- operator identity;
- verification result.

Do not record passwords, API tokens, private keys, database credentials, OAuth
secrets, webhook secrets, or session tokens.

### Rollback triggers

Stop and roll back or pause further changes if any of the following occurs:

- DNS resolves incorrectly;
- TLS failure or certificate mismatch;
- wrong application is reached or apex is unavailable;
- WWW redirect loops, loses path/query, or redirects the apex back to WWW;
- staging becomes indexable or exposes a staging canonical;
- production canonical, Open Graph, sitemap, or robots behavior is wrong;
- Auth callback or payment callback/return-origin behavior regresses;
- an email dependency breaks where relevant;
- an unexpected broad redirect is observed;
- critical monitoring fails.

### Rollback principle

1. Stop further changes.
2. Restore the prior known routing/custom-domain state using the recorded
   pre-cutover evidence.
3. Allow propagation and reverify the previous reachable endpoint.
4. Record failure evidence without secrets.
5. Do not retry blindly; obtain a new review if the cause is not understood.

No previous IP, CNAME, or provider target is prescribed here.

## Execution boundary

This document records future operator work only. No DNS, DNSSEC, Cloudflare,
provider custom-domain, or production deployment operation was executed while
creating it.
