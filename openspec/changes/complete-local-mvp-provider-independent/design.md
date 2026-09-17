## Context

See [proposal.md](proposal.md) for motivation. The frozen authority is the 210-row audit at `docs/local-mvp-gap-audit.md`; its 59 `ENGINEERING` IDs are the complete provider-independent implementation set. The accepted local-commerce baseline already supplies server-owned Catalog/Cart/Checkout/Order/Payment/Fulfillment/Tracking/Digital Delivery boundaries, local PostgreSQL schema version 37, private Storage, RLS/RPC, idempotency, restart evidence, and visual customer flows.

The change is broad and crosses domain, persistence, HTTP, Admin, account, and storefront surfaces. It therefore uses phased authority slices rather than one feature branch or catch-all migration. Owner decisions remain explicit gates. Provider rows, Phase 2 rows, Owner Configuration/Policy rows as business-data completion, four quality-hardening recommendations, optional carrier quotation/label APIs, and seven non-software KPI items remain outside implementation scope.

## Goals / Non-Goals

**Goals:**

- Close exactly the 59 frozen Engineering IDs with one primary task and independent evidence per ID.
- Preserve accepted authority contracts while adding versioned local persistence and safe projections.
- Make each phase independently implementable, reviewable, committable, and reversible.
- Record precise owner-input and schema-impact gates before implementation starts.

**Non-Goals:**

- No provider activation, remote Supabase, production database, deployment, real payment/email/carrier/analytics call, or Supplier persistence.
- No implementation of explicit Phase 2 features, owner-readiness data, quality-hardening recommendations, optional extensions, or non-software KPIs.
- No functional code, tests, package changes, SQL migration, or migration execution during this planning task.
- No edits to migrations `0001`–`0037` and no pre-creation of `0038`.

## Decisions

### D1. Frozen audit IDs are the planning authority

`tasks.md` owns the mechanical traceability table. Every Engineering ID appears once as primary ownership with phase, task, current/target status, owner-input flag, schema expectation, implementation surface, focused evidence, and final gate. Cross-task references are dependencies only.

Alternative considered: re-audit or reorganize IDs around current modules. Rejected because it could silently change the approved 210-row classification and blur owner/provider exclusions.

### D2. Ten dependency phases and bounded authority slices

Implementation follows these phases:

| Phase | Primary IDs | Purpose | Schema expected |
| --- | --- | --- | --- |
| 0 Configuration foundation | K08, H19 | Fail-closed configuration inventory and restricted non-secret Admin settings | YES |
| 1 Customization model/Admin | C03, C07, C08, C09, C10, C28, C29, H03 | Typed fields, rules, surcharge authority, Admin editing, purchase snapshots | YES |
| 2 Photo intelligence/guidance | C20, C21, C22, C23, C24, N08 | Provider-neutral trusted inspection and Product-specific guidance | MAYBE |
| 3 Payment reliability | E07, E28 | Refund domain and durable provider-neutral webhook inbox | YES |
| 4 Promotions/coupons | E13–E20, E29, H11, G08, N06 | Durable rules, grants/redemptions, Admin/account/PDP projections | YES |
| 5 Shipping completeness | F03–F06, H18, N07, N09 | Versioned rules, Admin controls, Checkout/PDP projections | YES |
| 6 Account/ownership/privacy | G06, G07, G09, G12, G13, G14, K07 | History/detail, claim, profile/sign-in compatibility, deletion execution | YES |
| 7 Admin operations/fulfillment | H04, H06, H07, H13, M01 | Safe management, reporting, canonical commands, redo/remake | YES |
| 8 Messaging/analytics groundwork | K11, J04, J07, J08 | Durable outbox and canonical privacy-safe local events | YES |
| 9 SEO/customer-facing completeness | K16, K17, K18, N02, N10, N13 | Truthful Catalog/content-backed customer surfaces | MAYBE |

`MAYBE` means implementation must first prove whether existing versioned Catalog/configuration entities can represent the capability. It does not authorize implicit JSON blobs or a migration in advance.

Alternative considered: one horizontal persistence phase followed by one UI phase. Rejected because that creates oversized, hard-to-review commits and delays usable acceptance evidence.

### D3. Dependency graph

```text
Configuration core (K08)
  -> restricted settings (H19)
  -> every owner-approved configurable rule

Customization core (C03/C07-C10/C28/C29)
  -> Admin customization (H03)
  -> PDP/configured-item validation
  -> immutable Cart/Order snapshots

Photo inspection core (C20-C24)
  -> Product guidance/examples (N08)

Payment refund/inbox (E07/E28)
  -> later Stripe/PayPal adapters (outside this change)

Promotion core (E13-E20/E29)
  -> Admin coupon management (H11)
  -> account coupons (G08)
  -> PDP promotion projection (N06)

Shipping rule core (F03-F06)
  -> Admin shipping (H18)
  -> PDP shipping projections (N07/N09)

Member Order read model (G06/G07)
  -> verified guest-Order claim integration (G09)
  -> Phase 6 acceptance proves legitimately claimed Orders appear in the same owner-scoped history/detail surfaces

Authenticated deletion request (G12)
  -> retention/erasure executor (K07)

Route compatibility (G13/G14) is independent

Admin command/read foundations
  -> pricing/order lifecycle/reporting (H04/H06/H07/H13)
  -> redo/remake lifecycle (M01)

Durable messaging core (K11)
  -> later Resend adapter (outside this change)

Canonical local event bindings (J04/J07/J08)
  -> later GA4/Meta/TikTok adapters (outside this change)
```

Independent route-compatibility work (`G13`, `G14`) and customer-facing metadata/presentation work (`K16`–`K18`, `N02`, `N10`, `N13`) can proceed after their authoritative read models exist.

### D4. Existing command ports remain the only business mutation boundaries

New capabilities must enter through current server-only verified contexts and expected-version/idempotency contracts. Internal repositories may be extended, but no second application-facing non-CAS mutation path, browser-selected owner/project, DB/Map dual write, process-memory fallback, or public fixture mutation endpoint is allowed.

Immutable Order snapshots receive new purchase facts at creation; later Catalog/configuration changes do not rewrite history. Payment, Fulfillment, Tracking, and Digital Delivery lifecycle state remains separate from purchase facts.

Alternative considered: implement each UI directly against new tables. Rejected because it would duplicate authority and bypass accepted authorization/transaction semantics.

### D5. Owner decisions are explicit pre-implementation gates

The following decisions materially affect Engineering tasks and must be supplied before their dependent mutation semantics can be accepted:

| Decision | Affected IDs | Required authority |
| --- | --- | --- |
| Refund eligibility, amounts, status effects, operator roles | E07 | Written owner refund policy/version |
| Surcharge types, allocation/rounding, stacking | C03, H04 | Approved pricing semantics |
| Select/multi/numeric/file constraints | C07–C10, H03 | Approved field limits and file policy |
| Conditional rule predicates and dependency limits | C28, C29 | Approved rule vocabulary and cycle/visibility behavior |
| Image thresholds and warning vs rejection | C20–C24 | Approved thresholds/fallback/privacy decision |
| Coupon expiry, stacking, usage, eligibility | E13–E20, E29, H11, G08, N06 | Approved promotion policy/version |
| Welcome/holiday/digital-add-on policy | E16, E19, E20 | Exact grant/timing/eligibility facts |
| Shipping weights, bands, thresholds, ranges | F03–F06, H18, N07, N09 | Approved local fixture/business-rule packet |
| Guest claim proof and conflicts | G09 | Verified-identity claim policy; email alone forbidden |
| Retention/erasure exceptions | G12, K07 | Approved privacy retention policy/version |
| Redo/remake transitions and customer effects | M01 | Approved quality remediation policy |
| Admin settings allowlist | K08, H19 | Explicit non-secret key/value/types list |
| Reporting definitions | H13 | Approved measures, periods, privacy thresholds |
| Home/PDP assets and FAQ content | N02, N08, K16, K17, N13 | Approved content/assets; no fabricated claims |
| Product/Offer launch facts and canonical public domain/content | K18 | Generic structured-data work may use clearly labelled local fixtures; final acceptance requires approved truthful launch facts |
| Product classification and preview-required policy | N10 | Generic PDP projection may use existing Product fulfillment configuration; final acceptance requires the approved D02 classification/policy |

Missing input blocks only the dependent task; it does not remove or reclassify the ID.

### D6. Schema and migration discipline

Migrations `0001`–`0037` are immutable. During implementation, each schema-bearing task must first inventory existing entities/RPCs and state its minimum additive change. The first required migration is `0038`; subsequent files are ordered and domain-coherent. Every migration requires:

- exact project/marker/environment verification;
- manifest checksum and ledger registration;
- rollback-only pre-apply validation and forward-fix plan;
- RLS enabled and restricted RPC grants where applicable;
- isolated local database constraint/security evidence;
- no remote apply, reset, reseed, or production access.

Likely schema-bearing boundaries are configuration, customization, payment reliability, promotions, shipping, ownership/privacy, Admin lifecycle/reporting, and outbox/analytics. Photo guidance and SEO/content first reuse existing versioned Product assets/configuration; they add schema only if that model cannot represent the approved facts without ambiguity.

Backfills are not assumed. Any historical-row backfill that would invent owner policy or recompute immutable purchase facts is forbidden and must become a separately approved task. Compatibility uses nullable/new-version readers until all required producers write the new facts.

### D7. Failure, concurrency, and replay are acceptance concerns

Mutation tasks require deterministic result unions (`found`, bounded rejection/conflict/unavailable as appropriate), idempotency context, expected aggregate/rule version, and atomic DB effects. Focused acceptance injects faults around decision/action/audit/aggregate writes, runs two live workers for last-resource races, and restarts processes to prove durable recovery. UI and HTTP acceptance must prove no secret/private locator leak and non-enumerating cross-owner failure.

Alternative considered: defer concurrency and recovery to final verification. Rejected because defects would span many domains and could make later evidence non-localizable.

### D8. Phase and final quality gates

Every bounded task has focused evidence. Each phase ends with an independent gate covering its relevant domain, HTTP, persistence, authorization, race/replay, fault, and rendered/browser contracts. From the final working tree, every phase preserves lint, typecheck, offline tests, fresh build before rendered tests, full verify, OpenSpec strict, diff check, and migration integrity. Existing accepted test counts cannot silently decrease; changed counts require explained test inventory evidence.

## Risks / Trade-offs

- **[Owner decisions arrive incrementally]** → Keep dependent tasks visible and blocked; implement independent route/read/security groundwork without choosing values.
- **[One change spans many domains]** → Use small tasks, one primary ID owner, phase gates, and coherent migration slices.
- **[Schema proliferation]** → Inventory existing entities first and add only authoritative versioned facts; prohibit catch-all `0038`.
- **[Rule engines become unbounded]** → Use approved predicate/action vocabularies, explicit limits, cycle checks, deterministic normalization, and version snapshots.
- **[Image inspection false positives/privacy]** → Separate warning/rejection policy, trusted server execution, private inputs, bounded outputs, and no external provider by default.
- **[Promotion/shipping totals regress]** → Keep Checkout/Order server authority and immutable allocations; reject stale rules and browser amounts.
- **[Guest claim or erasure broadens access]** → Require fresh verified identity, exact resource authority, atomic audit, cross-owner negatives, and explicit retention exceptions.
- **[Durable messaging implies delivery]** → Model intent/lease/result truthfully; no provider-delivered claim without a later adapter and external evidence.
- **[Presentation work fabricates missing content]** → Use Catalog/content readiness failures and safe fallbacks; owner assets/copy remain owner input.

## Migration Plan

1. Freeze each phase's owner decisions and focused acceptance packet before implementation.
2. Inventory current domain/repository/RPC/read-model surfaces for the phase.
3. If schema is needed, design one coherent additive migration at the next available version, validate rollback-only, then apply only to an authorized isolated local stack.
4. Implement domain and internal persistence adapters before HTTP/Admin/storefront wiring.
5. Run focused security, restart, race, replay, and fault tests; then run the phase gate.
6. Keep previous readers compatible until authoritative producers and read-back evidence pass; use forward-fix migrations after permanent apply.
7. At final closure, mechanically reconcile all 59 IDs and produce a Local Engineering Gate report without claiming owner/provider/Phase 2 readiness.

Rollback is code/config disablement plus forward-fix for already-applied migrations; applied migration bytes are never edited or removed. No remote or production migration is part of this change.
