# brand-domain-configuration Specification

## Purpose
Defines a safe, testable application identity and hostname contract for FigMemento across production, staging, preview, local, and test environments while preserving stable business and historical identities.
## Requirements
### Requirement: Authoritative public brand and domain identity
The application SHALL expose one authoritative, provider-neutral public identity whose approved values are brand name `FigMemento`, production origin `https://figmemento.com`, canonical hostname `figmemento.com`, and staging hostname `staging.figmemento.com`. The identity SHALL NOT contain secrets, credentials, signing material, or provider API keys, and production SHALL NOT silently fall back to a temporary brand or origin.

#### Scenario: Production reads the approved identity
- **WHEN** public metadata, navigation, or another public application surface requests the production identity
- **THEN** it receives `FigMemento` and `https://figmemento.com` from the authoritative configuration rather than a local request origin or unrelated hardcoded copy

#### Scenario: Secret values remain outside public identity
- **WHEN** the public brand/domain configuration is inspected or serialized for browser use
- **THEN** it contains no Supabase secret, payment secret, password, signing secret, email-provider key, or analytics credential

#### Scenario: Invalid deployment identity fails safely
- **WHEN** a production deployment declares a missing, malformed, insecure, or unapproved production hostname/origin configuration
- **THEN** configuration validation fails instead of substituting `localhost`, an example domain, a preview hostname, or the temporary PhotoGift identity

### Requirement: Explicit deployment-environment classification
The system SHALL distinguish production, staging, provider preview, local development, and offline test contexts using validated configuration and host classification. Staging and preview contexts MUST NOT be treated as canonical production, and the existing rule that production cannot use development catalog fixtures SHALL remain unchanged.

#### Scenario: Staging is classified separately
- **WHEN** the application runs for `staging.figmemento.com`
- **THEN** it is classified as staging and is not allowed to emit staging as the production canonical origin

#### Scenario: Provider preview is noncanonical
- **WHEN** the application runs on a provider-assigned preview hostname
- **THEN** it is classified as preview without assuming or hardcoding a particular unknown Pages project hostname

#### Scenario: Production fixture protection remains active
- **WHEN** the production environment attempts to enable a development/test fixture source
- **THEN** the existing production rejection remains effective

### Requirement: Canonical production SEO identity
On canonical production, root metadata, page canonical links, sitemap URLs, robots sitemap references, Open Graph URLs/site identity, and public structured data SHALL use `https://figmemento.com`. Product and Category canonical paths SHALL remain data-driven application-relative paths, and this change MUST NOT redesign Product SEO or add unsupported marketing claims.

#### Scenario: Production catalog canonical URL
- **WHEN** a published Product has the data-driven canonical path `/product/example-gift`
- **THEN** production emits `https://figmemento.com/product/example-gift` as its canonical and Open Graph URL

#### Scenario: Production sitemap and robots agree
- **WHEN** production generates the sitemap and robots metadata
- **THEN** every public sitemap URL and the robots sitemap reference use `https://figmemento.com`

#### Scenario: Relative catalog paths remain authoritative
- **WHEN** a Product or Category defines a valid application-relative canonical path
- **THEN** the path is preserved and only the authoritative production origin is applied

### Requirement: Nonproduction indexation safety
Staging and provider preview deployments SHALL emit `noindex` behavior and SHALL NOT publish their own origins as canonical URLs or public sitemap origins. Local and offline test behavior SHALL remain deterministic and SHALL NOT make network requests to the real production domain.

#### Scenario: Staging cannot become canonical
- **WHEN** a crawler reads metadata or robots output from `staging.figmemento.com`
- **THEN** the response is non-indexable and does not identify the staging origin as canonical

#### Scenario: Preview cannot become canonical
- **WHEN** a crawler reaches a provider preview deployment
- **THEN** the response is non-indexable and does not expose the preview hostname in canonical or sitemap output

#### Scenario: Offline tests use reserved origins
- **WHEN** brand, SEO, host, or request-origin tests run
- **THEN** they use local or reserved `.test` inputs and perform no request to `figmemento.com`

### Requirement: Canonical host and redirect policy
The production apex `figmemento.com` SHALL serve as the canonical public host. `www.figmemento.com` SHALL permanently redirect to the equivalent HTTPS apex URL while preserving path and query. Staging, preview, local, and test hosts SHALL NOT be redirected to production by this alias rule, and the policy MUST avoid redirect loops.

#### Scenario: WWW request redirects to apex
- **WHEN** a request targets `https://www.figmemento.com/product/example?ref=email`
- **THEN** it receives a permanent redirect to `https://figmemento.com/product/example?ref=email`

#### Scenario: Apex request is not redirected to itself
- **WHEN** a request already targets `https://figmemento.com`
- **THEN** the WWW alias policy does not redirect it

#### Scenario: Staging remains isolated
- **WHEN** a request targets `https://staging.figmemento.com`
- **THEN** it remains in staging and is not redirected to production by the WWW alias policy

### Requirement: User-visible FigMemento identity
Current application-controlled public and admin brand copy SHALL use `FigMemento`, including navigation, headings, metadata, structured site identity, loading and error states, and brand-bearing operational output names. Product/Category content, customer content, and unapproved marketing claims SHALL remain unchanged. A public support address MUST NOT be fabricated; production contact copy SHALL use an explicitly approved/configured address or omit the address until one exists.

#### Scenario: Storefront and admin surfaces show final brand
- **WHEN** a user views application-controlled storefront or admin identity surfaces
- **THEN** the visible site brand is `FigMemento` rather than `PhotoGift`

#### Scenario: Business content is preserved
- **WHEN** brand migration is applied to catalog and order surfaces
- **THEN** Product descriptions, Product slugs, Category content, customization content, and customer content are not rewritten as brand copy

#### Scenario: Support address is not guessed
- **WHEN** no approved support mailbox has been configured
- **THEN** the application does not publish a guessed `@figmemento.com` address or retain a temporary PhotoGift example address as a production contact

### Requirement: Stable internal and historical identity preservation
The change SHALL preserve database UUIDs, Product and order IDs, approved migration files and history, Supabase project references, historical snapshots, stable API identifiers, database constraint names without user value, Git history, and archived OpenSpec records. Existing internal `photogift` technical names SHALL be retained when renaming would create compatibility risk and SHALL be recorded as technical debt rather than silently broadened into a repository-wide rename.

#### Scenario: Historical artifacts remain immutable
- **WHEN** the brand migration inventory encounters an approved migration, archived change, baseline evidence, or historical snapshot containing PhotoGift
- **THEN** the occurrence is classified as historical and left unchanged

#### Scenario: Compatibility-sensitive technical name is preserved
- **WHEN** an existing environment variable, storage bucket, cookie, or stable identifier contains `photogift` and a compatible migration is not explicitly approved
- **THEN** the identifier remains operational and is recorded in the technical-name debt inventory

### Requirement: Operator-gated domain and DNS runbook
The repository SHALL contain an operational runbook covering domain registration status, Cloudflare zone/account placement, authoritative nameserver verification, DNSSEC when registrar/zone state permits, staging attachment, later apex attachment, later WWW redirect/attachment, cutover verification, and rollback. Unknown deployment targets SHALL be explicit operator inputs, and executing the change SHALL NOT by itself authorize DNS, registrar, remote provider, or production deployment mutations.

#### Scenario: Unknown deployment target is not fabricated
- **WHEN** the runbook reaches a DNS record or custom-domain target that depends on the future deployment
- **THEN** it requires the operator to obtain and verify the actual provider value instead of inventing a Pages hostname or record target

#### Scenario: Cutover requires separate authorization
- **WHEN** application preparation and offline verification are complete
- **THEN** remote DNS, custom-domain attachment, DNSSEC, and production deployment actions remain unchecked manual gates requiring explicit authorization

#### Scenario: Rollback is available
- **WHEN** production hostname verification fails after an authorized cutover
- **THEN** the runbook provides a path to remove or revert the new routing while preserving the previous reachable deployment

### Requirement: External-origin dependency checklist
The change SHALL document exact later configuration points for Supabase Auth site URL/redirect allowlists, Google OAuth callbacks, customer OTP links, cookie host behavior, Stripe success/cancel and webhook URLs, PayPal return/cancel/webhook URLs, transactional email sender/domain work, mailbox policy, and GA4/Meta/TikTok domain settings. It SHALL NOT widen allowlists, change payment/auth behavior, create speculative MX/SPF/DKIM/DMARC records, or invent analytics identifiers.

#### Scenario: Auth dependencies are documented but not mutated
- **WHEN** the final production origin is prepared
- **THEN** the checklist identifies the required Supabase/Auth/OAuth/OTP settings and limits staging entries explicitly without changing remote configuration

#### Scenario: Payment endpoints are documented but unchanged
- **WHEN** the checklist is reviewed for Stripe and PayPal
- **THEN** it records final-origin success, cancel, return, and webhook endpoints while leaving payment implementation and dashboard configuration unchanged

#### Scenario: Email and analytics remain provider-gated
- **WHEN** no email mailbox/provider policy or analytics identifiers have been approved
- **THEN** the plan records later work without generating DNS records, sender claims, measurement IDs, or pixels

### Requirement: Auditable occurrence classification
Before brand implementation, repository occurrences of temporary brand/origin values SHALL be classified as public identity to migrate, current operational documentation/configuration to migrate, isolated local/test fixture to retain or deliberately clarify, compatibility-sensitive technical debt to retain, historical evidence to preserve, or external deployment dependency. Implementation SHALL be limited by that reviewed classification.

#### Scenario: Public identity occurrence is selected for migration
- **WHEN** a PhotoGift occurrence controls current navigation, metadata, structured data, an admin heading, or another application-owned visible identity
- **THEN** it is classified for migration to FigMemento

#### Scenario: Example content remains safe
- **WHEN** `example.com`, `example.test`, `localhost`, or `photogift.test` is used only as an offline fixture, placeholder customer address, or local runtime input
- **THEN** it is not converted into a production network dependency and is either retained with its purpose documented or deliberately changed to another reserved test value

#### Scenario: Unclassified occurrence blocks broad replacement
- **WHEN** an occurrence has not been classified or its compatibility impact is uncertain
- **THEN** implementation leaves it unchanged and records it for review instead of replacing it automatically
