## MODIFIED Requirements

### Requirement: Immutable configured-item snapshot

The canonical snapshot SHALL preserve the configuration facts actually committed at Order creation, including the configuration revision, selected options, and bounded customization values that the existing Order contract supports. Values and their order MUST be preserved without re-evaluation. In `local_persistent`, the snapshot SHALL additionally retain the accepted customization and fulfillment configuration needed to interpret those values, private media ordering/crop associations, physical/digital classification, and whether each item requires a production preview. These facts MUST remain immutable across restart and MUST NOT be reconstructed from current Catalog or supplier state.

#### Scenario: Configuration is read from the Order snapshot

- WHEN the current Catalog or customization definition differs from the definition used at Order creation
- THEN the read result still contains the committed revision, options, and values

#### Scenario: Persistent item preserves purchased rules

- WHEN a persistent item is read after application restart and current fulfillment or preview configuration has changed
- THEN its stored classification, preview requirement, configuration, and media ordering remain the facts committed with that item

### Requirement: Safe media references

Configured-item reads MAY expose only safe internal media receipt identifiers and bounded crop information already committed by the Order contract. In `local_persistent`, an authorized internal consumer MAY also receive safe opaque original/derived media identities and their immutable exact item associations and order where required by the committed media contract. Media access itself SHALL remain a separate authorized private boundary. Reads MUST NOT expose signed URLs, bucket names, raw storage keys, provider locators, or browser capability tokens.

#### Scenario: Image customization is returned safely

- WHEN the committed configuration contains an image receipt
- THEN the result contains only its safe receipt identity and permitted crop data, without a provider locator or signed URL

#### Scenario: Persistent media reference cannot grant object access

- WHEN an internal consumer reads an item's original or derived media association
- THEN it receives only bounded opaque committed identities and must separately authorize private bytes without a provider locator or public URL

### Requirement: Bounded local-first operation

This capability SHALL use the selected canonical Local Order authority: the existing process-memory architecture in `local_fake`, or the independent Docker local Supabase PostgreSQL project's durable Order-item snapshots in explicitly selected development/test `local_persistent`. `local_fake` SHALL add no remote Supabase operation, migration, external provider, new database, or filesystem persistence. `local_persistent` MUST be rejected in staging/production and SHALL use only the independent local commerce namespace; it MUST NOT mutate legacy `orders/order_items`, perform C1 backfill, activate Phase C production migration, or remove the normalized `/api/orders` 503 stop gate. Required commerce authorities MUST share the same local project, and missing state, database failure, or mode/project mismatch MUST fail closed without remote, memory, Catalog, or supplier fallback. Historical reads SHALL NOT require a current Catalog read or reconstruct missing data from private Storage.

#### Scenario: Local authority is unavailable

- WHEN the canonical local Order store cannot prove an exact item
- THEN the read returns `unavailable` without falling back to Catalog, browser, supplier, or remote data

#### Scenario: Persistent historical authority survives restart

- WHEN the same isolated local project contains a complete immutable Order item after restart and the caller has the required server-side authority
- THEN an exact Order/item read returns the same stable identity and committed facts without current Catalog resolution

#### Scenario: Persistent source cannot be used

- WHEN a persistent read is requested in staging/production or its database or project-consistency check fails
- THEN it returns a bounded unavailable/configuration result without reading a fake Order, another project, or the legacy database

## ADDED Requirements

### Requirement: Persistent exact-item consumers share canonical authority

Order-item reads for local fulfillment, Admin, supplier, tracking eligibility, preview manifests, and digital delivery SHALL resolve the exact canonical Order/item pair from the same selected local project. They MUST preserve existing fail-closed missing-evidence and legacy-snapshot behavior, including unavailable results rather than inferred backfill. A consumer not adapted to persistent authority SHALL be explicitly unavailable for persistent Orders and MUST NOT route them to a memory store. No supplier entry point SHALL manufacture a replacement Order, item, quantity, mapping, or configured snapshot to regain availability; unsupported entry points MUST be disclosed rather than claimed as restored.

#### Scenario: Cross-Order persistent item is rejected

- WHEN an authorized consumer supplies a stored item identity with a different canonical Order identity
- THEN the result is uniformly unavailable without exposing the other Order's identity, media, configuration, or existence

#### Scenario: Supplier consumer cannot use persistent authority

- WHEN a supplier admission or operation entry can only read memory Orders while persistent mode is selected
- THEN it fails closed with an explicit unsupported/unavailable boundary and creates no memory work order or substitute Order item

#### Scenario: Missing purchased facts after restart

- WHEN a stored persistent item lacks required identity, SKU selection, quantity, fulfillment classification, or immutable configuration evidence
- THEN the read is unavailable without guessing from current Catalog, supplier mappings, labels, or browser data