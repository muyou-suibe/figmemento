# local-configured-item-read-authority Specification

## Purpose
Provide one server-owned, exact read authority for the immutable configured
item facts committed to a canonical Local Order, so internal production
consumers can read historical Order truth without reconstructing it from a
browser, a current Catalog, or supplier data.
## Requirements
### Requirement: Canonical Order-item identity

Every configured item that is committed to a canonical Local Order SHALL have
an opaque, stable `orderItemId` generated and captured by the server at Order
creation. The identity MUST remain stable for the life of the Order and MUST
NOT be derived from array position or cart-local line position.

#### Scenario: Ordered item receives a stable identity

- WHEN a Local Order is created with one or more configured items
- THEN each committed item has a distinct server-owned `orderItemId` that is
  preserved in the immutable Order line snapshot

#### Scenario: Array position is not an item identity

- WHEN a consumer requests an item after Order lines have been reordered or
  contain multiple copies of one Product
- THEN the read authority uses the stored `orderItemId` and does not use a line
  index to identify the item

### Requirement: Immutable Product and SKU identity

The committed item snapshot SHALL preserve the Product and Variant identity,
Product slug, and approved SKU code that were accepted at Order creation.
Where the canonical line already stores Product display name, that name SHALL
remain historical snapshot data and MUST NOT be refreshed from the Catalog.

#### Scenario: Historical Product and SKU facts are returned

- WHEN an exact committed item is found
- THEN the result contains its stored Product/Variant identity, Product slug,
  and SKU code from the Order snapshot

### Requirement: Explicit canonical Product selection and Supplier mapping input

The committed item SHALL preserve the exact server-accepted Product Variant
identity, approved SKU code, and complete structured `selectedOptions` set that
defined the customer’s catalog selection. A scalar
`selectedSpecificationKey` is not a canonical Local Order field. A downstream
Supplier mapping MAY translate these canonical facts into a reviewed
Supplier-local `SupplierOfferVariant.specificationKey`; an unresolved or
ambiguous mapping SHALL remain unavailable to that Supplier consumer.

#### Scenario: Explicit canonical selection survives Order creation

- WHEN a configured item with a Product Variant, SKU, and selected option/value
  IDs is committed
- THEN the exact machine selection is stored in the immutable Order item
  snapshot and returned by the read authority without requiring a Supplier key

#### Scenario: Supplier mapping is separate from customer Order identity

- WHEN a downstream Supplier consumer needs a Supplier Offer Variant
- THEN it uses an explicit reviewed mapping from the canonical Product/Variant/
  SKU/selected-options facts and does not require or invent a canonical
  `selectedSpecificationKey`

### Requirement: Canonical quantity

The committed item snapshot SHALL preserve the server-accepted quantity for
that Order item. Internal consumers MUST read this quantity from canonical
Order state and MUST NOT accept a browser or operator quantity override.

#### Scenario: Consumer receives canonical quantity

- WHEN an exact item is read
- THEN the result contains the stored quantity and no caller-supplied quantity
  changes it

### Requirement: Immutable configured-item snapshot

The canonical snapshot SHALL preserve the configuration facts actually
committed at Order creation, including the configuration revision, selected
options, and bounded customization values that the existing Order contract
supports. Values and their order MUST be preserved without re-evaluation.

#### Scenario: Configuration is read from the Order snapshot

- WHEN the current Catalog or customization definition differs from the
  definition used at Order creation
- THEN the read result still contains the committed revision, options, and
  values

### Requirement: Safe media references

Configured-item reads MAY expose only safe internal media receipt identifiers
and bounded crop information already committed by the Order contract. They
MUST NOT expose signed URLs, bucket names, raw storage keys, provider locators,
or browser capability tokens.

#### Scenario: Image customization is returned safely

- WHEN the committed configuration contains an image receipt
- THEN the result contains only its safe receipt identity and permitted crop
  data, without a provider locator or signed URL

### Requirement: Exact Order ownership

The read authority SHALL resolve an item only when the supplied canonical Order
identity and stable `orderItemId` refer to the same stored Order. A public
Order reference SHALL remain an identifier and SHALL NOT become authorization.
Mismatched or cross-Order identities SHALL return `unavailable` without
revealing whether another Order or item exists.

#### Scenario: Wrong Order identity is rejected

- WHEN a valid item identity is paired with a different Order identity
- THEN the result is `unavailable` and no item facts are returned

#### Scenario: Public reference alone is not authorization

- WHEN a caller supplies only a public Order reference without the required
  server-side authority boundary
- THEN the read authority does not treat the reference as authorization

### Requirement: Historical immutability

Once a Local Order is created, later Catalog, Product, customization-schema,
pricing, or supplier changes MUST NOT rewrite the committed configured-item
snapshot or change a subsequent read result.

#### Scenario: Catalog drift does not rewrite history

- WHEN the current Catalog Product, SKU, price, option definition, or Supplier
  mapping is changed or deleted after Order creation
- THEN a subsequent exact read returns the same committed item identity and
  configuration

### Requirement: Fail-closed missing evidence

If any required canonical identity, Product/Variant/SKU selection,
`selectedOptions`, quantity, fulfillment classification, or other
production-relevant snapshot fact is missing, malformed, or cannot be proven
from the canonical Order, the read SHALL return a bounded `unavailable` result.
It MUST NOT return a partial item or manufacture replacement facts. A missing
Supplier mapping is handled as unavailable at the downstream Supplier boundary;
it MUST NOT be repaired by adding a guessed Order fact.

#### Scenario: Incomplete canonical item is unavailable

- WHEN a stored item lacks a required production identity
- THEN the read fails closed with no partial configured-item projection

### Requirement: No inference or reconstruction

The read authority MUST NOT infer configured-item identity, Product selection,
or a Supplier specification key from Product display name, option labels,
prices, array position, supplier source labels, customer filenames, current
Catalog guesses, Supplier mapping guesses, or browser-carried configuration.

#### Scenario: Ambiguous matching inputs are rejected

- WHEN only display data or an unreviewed Supplier mapping could be used to
  guess the configured item or Supplier specification
- THEN the read returns `unavailable` rather than selecting a candidate

### Requirement: No Catalog drift dependency

An exact historical configured-item read SHALL use server-owned canonical Order
state as its authority and SHALL NOT require current Catalog resolution for
facts captured at Order creation.

#### Scenario: Current Catalog is unavailable

- WHEN the current Catalog cannot be read
- THEN an otherwise complete canonical Order item can still be read from its
  immutable snapshot

### Requirement: Server-only read authority

The read port SHALL accept canonical server-side identifiers and return a
server-only result. Customer-provided configuration payloads, local storage,
session storage, or browser state MUST NOT be authoritative, and the internal
projection MUST NOT be exported as a client authority.

#### Scenario: Browser payload conflicts with canonical state

- WHEN a browser supplies configuration that differs from the stored Order
  item
- THEN the read ignores the browser payload and uses canonical Order state

### Requirement: Privacy-preserving projection

The read result SHALL contain only the configured-item and Order-item facts
needed by an authorized internal consumer. It MUST omit unrelated contact,
owner, capability, payment, and private provider-locator data unless a separate
approved boundary explicitly requires it.

#### Scenario: Read projection does not disclose unrelated Order data

- WHEN an internal consumer reads a configured item
- THEN the result excludes unrelated customer contact, authorization secrets,
  and provider-specific storage data

### Requirement: Backward compatibility is fail-closed

Older in-memory or test Order snapshots that lack newly required canonical
fields SHALL remain readable through existing customer-safe Local Order paths,
but SHALL return `unavailable` through this configured-item production read
authority. No silent backfill, inferred Product selection, or inferred Supplier
specification key is allowed.

#### Scenario: Legacy snapshot lacks the new identity

- WHEN an older fixture has no stable `orderItemId`, explicit Product/Variant/
  SKU/selected-options selection, or fulfillment classification
- THEN the new read is unavailable and existing Local Order behavior is not
  silently rewritten

### Requirement: Supplier-independent capability

The canonical configured-item read authority SHALL remain generic and SHALL NOT
own Supplier IDs, Supplier Offers, Supplier costs, Supplier-local
`specificationKey` values, warehouse state, or Supplier Assignments.
SupplierWorkOrder may consume the read result and a separately reviewed mapping
downstream, but supplier operations MUST NOT become the source of canonical
Order facts.

#### Scenario: Supplier consumer reads canonical history

- WHEN SupplierWorkOrder admission requests a configured item
- THEN it consumes the exact server-owned projection and does not reconstruct
  or persist a supplier-specific copy

### Requirement: Bounded local-first operation

This capability SHALL use the existing local canonical Order process-memory
architecture and SHALL add no remote Supabase operation, migration, external
provider, new database, or filesystem persistence.

#### Scenario: Local authority is unavailable

- WHEN the canonical local Order store cannot prove an exact item
- THEN the read returns `unavailable` without falling back to Catalog, browser,
  supplier, or remote data
