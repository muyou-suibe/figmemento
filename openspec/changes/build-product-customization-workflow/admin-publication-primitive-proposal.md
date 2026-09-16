# Admin Customization Configuration Publication Primitive — Proposal

## Status and purpose

This is a **pre-Task 4.5 human-approval design gate**. It defines the one
server-only atomic persistence primitive required by the already-completed
Task 4.4 `CustomizationFieldAtomicPublicationRepository` contract. It does
not authorize SQL, a migration artifact, an adapter, a route, an editor, or
any connected-database action.

The frozen artifacts remain unchanged:

- `20260812120000_add_customization_configuration_schema.sql` (Phase A)
- `20260812121000_add_customization_draft_media_schema.sql` (Phase B)

Task 4.5 editor save MUST NOT be wired to production persistence until this
proposal is human-approved and a separately approved local primitive artifact
exists.

## Proposed primitive

**Name:** `public.publish_product_customization_configuration`

The name follows the existing C1 verb-first, Product-scoped RPC convention
(`save_product_sku_graph`, `transition_catalog_lifecycle`) without inheriting
either C1 domain's behavior.

One invocation publishes a complete immutable configuration revision for one
Product. It is the only future persistence operation permitted to transition a
Product from one current normalized customization configuration to another.
It does not update a `customization_fields` definition row in place and does
not modify an existing stable identity's code.

## Provider-facing input contract

The future RPC has three provider-facing arguments:

| Argument | Type | Meaning |
|---|---|---|
| `p_product_id` | UUID | Target Product identity. |
| `p_expected_current_revision_id` | UUID nullable | The exact current revision expected by the editor, or explicit `null` when the editor observed no normalized configuration. |
| `p_fields` | JSONB array | The complete desired replacement configuration, in deterministic field position order. |

`p_fields` corresponds exactly to Task 4.4's parsed
`ReplaceCustomizationConfigurationIntent.fields`. Each array item contains
only the following allowed shape:

```text
{
  identity:
    { kind: "existing", id: stableFieldId, code }
    | { kind: "new", draftId: "new:<request-local-token>", code },
  label,
  kind: "image" | "short_text" | "long_text",
  required,
  isActive,
  position,
  constraints: approved typed text-or-image constraints
}
```

The JSON structure deliberately preserves the application distinction:

- An **existing** field supplies a stable identity and its immutable code. It
  is an assertion that must be re-resolved under the target Product.
- A **new** field supplies only a temporary `draftId` correlation token and a
  proposed code. `draftId` is not stored and is never a persistent UUID or
  database identity.

The caller cannot supply a configuration-revision ID, a definition-row ID, or
a persistent stable ID for a new field. Browser persistent IDs for `kind:
"new"` are therefore neither accepted nor interpreted.

The database function receives parsed, server-originated values from the
protected Task 4.4 command boundary. It still verifies the JSON top-level is
an array and each identity has the minimally required typed shape before it
uses any value. It uses fixed record parsing only; it accepts no
caller-controlled table, column, function, SQL, or JSON path names.

## Bounded result contract

The RPC SHOULD use the existing C1 bounded table-result style, returning one
row with these conceptual columns:

| Field | Present for | Meaning |
|---|---|---|
| `result_status` | every response | One of `applied`, `stale_revision`, `not_found`, `invalid_configuration`, or `source_failure`. |
| `product_id` | `applied` | The target Product UUID. |
| `configuration_revision_id` | `applied` | The newly committed database-generated revision UUID. |
| `configuration` | `applied` | Complete resulting configuration: Product ID, revision ID, and every immutable definition projected as Task 4.4's `CustomizationField` shape. |
| `new_field_id_mappings` | `applied` | Array of `{ draftId, stableFieldId }` only for the submitted `kind: "new"` fields. |
| `safe_issues` | `invalid_configuration` when useful | A bounded allowlisted list of safe path/code/message entries; it contains no database/provider diagnostic. |

`configuration` is preferred over a post-write current-configuration read.
It keeps the successful command response tied to the precise revision it
committed even if a second administrator publishes another revision immediately
afterward. It also avoids making a second read authoritative for commit
success. `new_field_id_mappings` gives Task 4.5 a direct, lossless way to
replace each temporary `new:<draftId>` identity in its local editor state.

### Required future application contract for applied publication

Before Task 4.5 production-save wiring, Task 4.4's provider-neutral
application contract must be extended—not bypassed—to include:

```text
type AdminCustomizationNewFieldIdMapping = {
  draftId: string;
  stableFieldId: string;
};

type AdminCustomizationFieldWriteResult =
  | {
      status: "applied";
      value: AdminCustomizationFieldConfiguration;
      newFieldIdMappings: readonly AdminCustomizationNewFieldIdMapping[];
    }
  | existing non-applied safe result variants;
```

The future `CustomizationFieldAtomicPublicationRepository` and the protected
Task 4.4 command boundary must carry this mapping losslessly from the one RPC
response to the admin editor. The mapping is an application response
reconciliation value, not persistent customer/domain data and not a
definition-row identity.

For every `applied` result, the adapter must strictly validate that:

1. mappings exist only for submitted `kind: "new"` fields;
2. every submitted `draftId` appears exactly once, unchanged from its request
   correlation identity, in deterministic submitted field/position order;
3. no existing field has a mapping, and there are no unknown, duplicate,
   missing, or extra `draftId` values;
4. each `stableFieldId` is a valid stable logical identity and is unique across
   mappings;
5. each mapped stable identity appears in the returned resulting
   configuration and its immutable code is consistent with the corresponding
   submitted field; and
6. definition-row IDs are never exposed or substituted for stable identities.

Any violation is a malformed/corrupt provider result and MUST map to safe
`source_failure`, even if the database may already have committed. The adapter
must never reconstruct an identity from code. This is a design dependency for
Task 4.5, not an implementation change or a reason to add UI in this turn.

## Atomic publication sequence

Within one database transaction, the primitive performs the following fixed
sequence:

1. Lock the target `public.products` row with an exclusive row lock. If it is
   absent, return `not_found` without mutation.
2. Under that Product lock, lock and resolve the Product's current
   `public.product_customization_configs` row, if one exists.
3. Compare the locked current state with `p_expected_current_revision_id`:
   an existing current revision requires exact equality; no current revision
   requires an explicit null expectation. A mismatch returns
   `stale_revision` before any mutation.
4. Validate the complete replacement's structural identity invariants under
   the same lock: no duplicate submitted code, position, existing ID, or new
   `draftId`; all existing IDs belong to the Product and keep the stored code;
   every new code is absent from the entire Product identity registry.
5. Enforce the omission policy described below against the locked previous
   current revision.
6. Allocate a database UUID for the new configuration revision by inserting
   without caller-provided identity, relying on the approved Phase A database
   UUID default. Allocate one database UUID in the same way for every new
   `customization_field_identities` row, recording each `draftId` mapping only
   in the bounded result.
7. Insert one new immutable `customization_fields` row for every desired
   field, referencing the new revision and the existing or newly allocated
   stable identity. No prior definition row is updated.
8. Mark the former current revision non-current and set its supersession time,
   when one existed.
9. Mark the fully populated new revision current. The partial unique current
   index remains the declarative backstop that permits at most one committed
   current revision per Product.
10. Construct the bounded success projection and commit.

Every ordinary rejected outcome returns before step 6. Every unexpected
failure rolls back the transaction's publication work and becomes only the
bounded `source_failure` result at the RPC/application boundary. No outcome
commits a partial revision, partial definition set, supersession without a new
current revision, or partially allocated new identity set.

## Concurrency and stale revision semantics

The Product row lock is the serialization point for all publications of one
Product. The primitive does not treat Task 4.4's application pre-read as the
final concurrency check.

For two administrators who both observe revision `R`:

1. Admin A locks Product and current config `R`, matches expected `R`, commits
   a fully populated `R2`.
2. Admin B waits for the Product lock, then observes current `R2`.
3. B's expected `R` no longer matches and it receives `stale_revision` with
   zero mutation.

The same Product lock resolves the first-configuration race. If two
administrators both send `expectedCurrentRevision = null` while no current
row exists, the first lock holder creates the one current revision. The second
waits, then sees that current revision and receives `stale_revision`. The
partial unique current index independently prevents more than one committed
current revision even if a future caller violates the intended sequence.

## Stable identity, immutable code, and omission policy

`customization_field_identities.id` is the immutable logical field identity.
Its Product owner and `code` are immutable. Revision-specific properties
(`label`, `kind`, `required`, `is_active`, `position`, and typed constraints)
belong only to newly inserted definition rows.

The primitive must enforce all of the following:

- `kind: "existing"` may use only an identity owned by the target Product,
  with exactly the identity registry's code.
- A submitted `kind: "new"` code may not equal a code from **any** historical
  Product identity, whether or not that identity is represented in the
  current revision. It returns `invalid_configuration`; it never silently
  reactivates or reinterprets the historical identity.
- New stable IDs and the new revision ID are server/database generated UUIDs;
  the function does not use a timestamp or hash as revision authority.
- An existing identity is not cross-Product reusable, and a stable code is not
  renameable or reusable.

### Decision: complete omission is invalid

The replacement intent is a complete configuration, but logical fields from
the preceding current revision **must remain represented** in the next
revision. To deactivate a customer-facing field, the administrator submits
that same `existing` identity and immutable code with `isActive: false`.

Omitting a prior stable field entirely returns `invalid_configuration` before
publication. This is the preferred safe editor behavior because it keeps every
historical logical field administratively visible and preserves explicit
deactivation rather than creating an ambiguous disappearance. The field's code
remains permanently reserved by its identity row. A new field may never claim
that code; any future reintroduction requires the explicit stable identity,
not code-based recovery.

Publishing an empty `fields` array is valid **only** for a Product with no
previous current configuration. It creates an explicit current configuration
revision with zero definitions; this is distinct from having no normalized
configuration and does not delete or unconfigure the Product. Once a current
revision contains fields, the omission rule means `fields: []` is invalid;
the administrator must publish those fields inactive instead.

## Validation responsibility split

This primitive is not a second customization policy engine.

| Owner | Responsibility |
|---|---|
| Task 4.4 parser | Strict request shape; allowed keys; `new:` token format; approved field kinds; code/label/flag/position formats; applicable text/image constraint parsing; duplicate request identity/code/position rejection. |
| Atomic primitive | Product existence; locked current-revision comparison; stable-ID Product ownership and immutable-code re-resolution; historical code-collision check; complete-replacement omission check; server-side ID allocation; all-or-nothing revision publication; bounded status/result mapping. |
| Phase A schema constraints | UUID/FK ownership tuples; permanent Product-scoped code uniqueness; one stable definition and one position per revision; at-most-one current revision; row-local label/kind/position and typed text/image constraint validity. |

The primitive may perform minimal fixed-shape JSON parsing needed to map the
already-parsed input to columns and emit a bounded invalid result. It does not
implement pricing, surcharges, conditions, supplier instructions, storage
rules, customer values, or an alternate interpretation of field constraints.

## Security, grants, and RLS

The proposed function uses **`SECURITY INVOKER`**, matching the existing C1
atomic RPC posture. The protected server route performs existing admin-session
authorization before it creates the privileged repository. The RPC is not an
authentication mechanism and does not receive an actor, browser session, or
browser authorization claim as authority.

The function design requires:

- fixed `search_path = pg_catalog`;
- every application relation explicitly schema-qualified as `public.*`;
- built-in JSON, lock, and time functions explicitly from `pg_catalog` where
  relevant;
- no dynamic SQL and no caller-controlled relation/function names;
- server/database identity defaults rather than caller UUID allocation;
- no secret, credential, SQL diagnostic, table/constraint name, hint, detail,
  query text, or raw exception returned in the result.

The intended EXECUTE posture is least privilege:

| Role | Direct execute |
|---|---|
| `public` | revoked |
| `anon` | revoked |
| `authenticated` | revoked |
| `service_role` | granted |

PostgreSQL object privileges still apply to the invoker and must remain least
privilege. Phase A keeps RLS enabled on the configuration relations to protect
ordinary non-bypass roles and direct table access. However, the Supabase
`service_role` used by the privileged server repository is a privileged
**BYPASSRLS** role: RLS policies do not authorize or constrain this publication
path. The authorization boundary is instead the protected server route's
existing admin-session verification before the service-role repository/client
is constructed. Possession of a service-role credential is therefore
privileged and it must remain server-only.

Direct browser invocation is separately blocked by the absence of
`anon`/`authenticated` EXECUTE privilege; the function itself never becomes an
authentication mechanism. `SECURITY INVOKER` means the function uses the
invoker's PostgreSQL object privileges, not implicit definer privileges; it
does not make the service-role call subject to RLS.

`SECURITY DEFINER` is deliberately not proposed. If a future environment made
the service-role invoker posture impossible, a new approval would be required
to revisit owner assumptions, RLS bypass, fixed search path, schema-qualified
relations, privilege revocation, and service-only access; it must not be
silently substituted.

## Safe error and retry behavior

Expected contention and validation outcomes are normal result statuses, not
uncaught database exceptions:

- revision expectation mismatch → `stale_revision`;
- Product absent → `not_found`;
- malformed fixed-shape input, identity ownership/code conflict, historical
  code collision, omission, or schema-constraint-safe failure →
  `invalid_configuration` with only allowlisted safe issues where useful;
- unexpected database/provider failure → `source_failure`.

The adapter collapses any transport/provider exception or malformed RPC result,
including a malformed new-field ID mapping, to Task 4.4's safe
`source_failure` result. It must not surface SQLSTATE, constraint/table names,
PostgreSQL messages, detail/hint, query text, or service-role credentials.

No generic idempotency framework or request-ID relation is proposed. If a
transaction commits but its response is lost, retrying the same request with
the original expected revision receives `stale_revision`. Task 4.5 must treat
that as an unknown-outcome recovery case: re-read the authoritative current
admin configuration, do not infer new stable identities from code, and present
an unknown-outcome/reload state if the original applied response and mapping
were lost. After reload, persistent stable field IDs come only from the
authoritative admin configuration read. The editor must not automatically
issue another publication using a refreshed revision. This bounded behavior
avoids inventing a new persistent workflow/idempotency model while preserving
zero duplicate publication.

## Explicit boundaries

The primitive never reads or writes:

- `products.customization_schema`, `order_items.customization`, or
  `order_uploads`;
- Product Options, Variants/SKUs, prices, currency, weight,
  FulfillmentConfig, ProductAssets, or order snapshots;
- `customization_drafts`, `customization_draft_values`,
  `customer_upload_receipts`, `customization_value_images`, or any Phase C
  relation.

Old drafts naturally become stale when a current revision advances. This
primitive does not rewrite drafts, receipts, customer content, legacy data, or
order history. It does not choose a storage provider, create a preview, add
customization pricing, or affect C1's blocked catalog backfill work.

## Conceptual migration placement and future adapter

If human-approved later, the primitive is a **new third local migration
artifact**, never an edit to frozen Phase A or Phase B. It depends only on the
Phase A configuration tables and may be applied conceptually without C1 3.8.
Because Phase A and Phase B artifacts are frozen and already ordered, the
safest standard timestamped placement is after both frozen artifacts:

```text
Phase A schema → Phase B draft/media schema (frozen) → publication primitive
```

The primitive neither requires nor unblocks Phase C, C1 3.8, C1 7.4, or the
C1 backfill chain. Task 3.4 remains PARTIAL; this proposal does not change any
task state or authorize a connected-database migration.

After a separately approved artifact exists, a future concrete Supabase
`CustomizationFieldAtomicPublicationRepository` will:

1. invoke exactly one `publish_product_customization_configuration` RPC per
   publication;
2. strictly parse the bounded RPC row to `AdminCustomizationFieldWriteResult`
   and, for an applied result, consume the returned complete configuration and
   lossless `newFieldIdMappings` application contract;
3. reject malformed, missing, duplicate, extra, code-inconsistent, or
   definition-ID-shaped mappings as safe `source_failure`, never reconstructing
   an identity from code;
4. perform no client-side or adapter-side multi-table orchestration and no
   second write; and
5. collapse unexpected provider failures safely.

## Approval request

Before Task 4.5 begins, human approval is required for this primitive design,
especially:

1. `SECURITY INVOKER` / service-role-only execution posture;
2. complete resulting-configuration plus new-field mapping result shape;
3. omission-as-invalid and inactive-field deactivation policy;
4. empty configuration allowed only as an explicit first configuration; and
5. lost-response retry returning stale rather than introducing idempotency
   storage.

**TASK 4.5 EDITOR SAVE MUST NOT BE WIRED TO PRODUCTION PERSISTENCE UNTIL THIS
PRIMITIVE IS HUMAN-APPROVED AND A LOCAL ARTIFACT EXISTS.**
