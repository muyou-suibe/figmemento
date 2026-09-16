## Purpose

Defines secure, provider-neutral handling of private customer customization images from browser selection through temporary draft ownership, order attachment, authorized access, expiry, and cleanup.

## ADDED Requirements

### Requirement: Customer upload validation is enforced before and during storage

The system SHALL accept customer customization images only when their detected and declared type is JPEG, PNG, or WebP, their byte size is greater than zero and within the configured maximum, and decoded dimensions and image count satisfy the authoritative CustomizationField constraints. Browser checks provide early feedback but MUST NOT replace server validation of received content and metadata.

#### Scenario: Valid customer image is selected
- **WHEN** a JPEG, PNG, or WebP image satisfies configured size, dimension, and count constraints
- **THEN** client preflight permits an upload attempt and the server independently validates it before storage acceptance

#### Scenario: Declared type does not match content
- **WHEN** a file claims an allowed MIME type but server inspection cannot validate it as that image type
- **THEN** the server rejects the upload without creating an accepted receipt

#### Scenario: Unsupported or oversized file is selected
- **WHEN** a file is empty, over the configured maximum, or not JPEG, PNG, or WebP
- **THEN** it is rejected before being attached to the customization draft and the user receives a safe actionable error

### Requirement: Upload receipts are opaque and provider-neutral

After successful storage, the server SHALL return an opaque upload receipt containing only public-safe identity and validated display metadata needed by the draft. It MUST NOT return or accept as authority a bucket name, provider object key, credential, signed provider request, permanent public URL, or server-only storage locator.

#### Scenario: Upload succeeds
- **WHEN** the server validates and stores a customer image
- **THEN** it returns an opaque receipt ID plus safe metadata such as original filename, MIME type, byte size, dimensions, warning state, and expiry without revealing provider location

#### Scenario: Browser alters receipt metadata
- **WHEN** a later handoff changes filename, MIME type, dimensions, ownership, or storage details associated with a receipt
- **THEN** the server uses its stored receipt record and rejects any material mismatch rather than trusting the browser

### Requirement: Guest draft ownership is server-authorized

The system SHALL support guest customization without requiring account creation by establishing an unguessable, server-verifiable draft ownership context. Every create, read, replace, remove, preview-access, and attach operation MUST verify that context before using the upload repository. Object identity alone MUST NOT authorize access, and ownership credentials MUST NOT be exposed to client JavaScript or logs when a secure server-managed mechanism is available.

#### Scenario: Guest accesses an owned receipt
- **WHEN** a guest presents the valid server-managed draft ownership context for an unexpired receipt
- **THEN** the server may authorize the requested draft operation without requiring Supabase Auth

#### Scenario: Another guest presents a receipt ID
- **WHEN** a request identifies an upload receipt but lacks its matching ownership context
- **THEN** the server rejects access without revealing whether the receipt or underlying object exists

#### Scenario: Ownership context is invalid
- **WHEN** a draft ownership credential is malformed, expired, or fails verification
- **THEN** the server rejects the request before creating a privileged storage client or repository operation

### Requirement: Private media remains separate from public catalog media

Customer uploads SHALL be treated as private customer content and MUST NOT be stored as ProductAssets, returned by public catalog endpoints, emitted into sitemap or SEO data, copied into public development fixtures, or represented by permanent public URLs. ProductAssets SHALL remain public marketing metadata only.

#### Scenario: Public catalog is rendered
- **WHEN** a public Product, Category, shop page, or sitemap is generated
- **THEN** no customer upload receipt, object locator, original filename, preview URL, or private metadata is queried or emitted

#### Scenario: Customer upload is offered as ProductAsset input
- **WHEN** a catalog operation attempts to associate a customer receipt or private storage reference with ProductAsset
- **THEN** the operation is rejected at the domain or server boundary

### Requirement: Customer-input preview access is temporary and authorized

The system SHALL create browser-local previews before upload where practical and SHALL provide any server-backed preview only through a short-lived, server-authorized access response. Preview access MUST NOT convert a private object into a permanent public asset and MUST be labeled as customer input rather than a production preview.

#### Scenario: Shopper previews a local selection
- **WHEN** a supported image is selected before upload
- **THEN** the browser may display a revocable local preview without publishing or uploading it automatically

#### Scenario: Server-backed preview is requested
- **WHEN** an authorized draft owner requests a preview of an uploaded image
- **THEN** the server returns or redirects through time-limited access without exposing permanent provider credentials or object authority

#### Scenario: Preview access expires
- **WHEN** temporary access expires
- **THEN** later access requires fresh authorization and the underlying object remains private

### Requirement: Upload lifecycle supports replacement, removal, attachment, expiry, and cleanup

Each upload receipt SHALL have a server-derived lifecycle sufficient to distinguish temporary active draft content, replaced/removed content, order-attached content, expired content, and cleanup completion or retry. Equivalent retry requests MUST NOT create multiple active attachments or falsely delete order-attached media. Abandoned temporary uploads SHALL be eligible for bounded cleanup only after expiry and reference checks.

#### Scenario: Shopper replaces an upload
- **WHEN** an owned active receipt is replaced by a newly accepted receipt for the same field position
- **THEN** the new receipt becomes the draft value and the prior temporary receipt becomes cleanup-eligible without deleting any order-attached object

#### Scenario: Removal is retried
- **WHEN** the same authorized removal request is repeated
- **THEN** it produces the same safe inactive outcome without creating duplicate active records or reporting a nonexistent provider deletion as new success

#### Scenario: Receipt is attached to an accepted purchase boundary
- **WHEN** the server accepts a configured item containing an owned active receipt
- **THEN** the receipt is attached exactly once to the resulting order/customization boundary and is no longer eligible for abandoned-draft cleanup

#### Scenario: Cleanup encounters provider failure
- **WHEN** an expired unreferenced object cannot be deleted from the provider
- **THEN** the system retains a safe retryable cleanup state, does not expose provider details, and does not mark deletion complete falsely

### Requirement: Upload failures are fail-closed and safely observable

Validation, authorization, persistence, and provider failures SHALL return stable safe errors without leaking storage keys, signed URLs, credentials, SQL details, customer content, or cross-customer existence. Failed uploads MUST NOT become valid draft values, and partial records/objects MUST be reconciled through explicit cleanup behavior.

#### Scenario: Storage provider is unavailable
- **WHEN** an otherwise valid upload cannot be stored
- **THEN** the request fails without an accepted receipt and the draft remains incomplete with a retryable user message

#### Scenario: Metadata persistence fails after object storage
- **WHEN** a private object is written but its authoritative receipt record cannot be committed
- **THEN** the server does not return success and records or performs a provider-neutral compensation/cleanup path without exposing the object

#### Scenario: Error contains sensitive provider details
- **WHEN** an underlying adapter returns a credential, object key, SQL detail, or provider diagnostic
- **THEN** the public response and application logs use sanitized context and do not serialize private customer content or secrets

### Requirement: Storage provider selection remains deferred

The upload capability SHALL depend on a provider-neutral repository/service contract for storing, accessing, and deleting private objects. This change MUST NOT make Supabase Storage or Cloudflare R2 the final production architecture, create a production bucket, configure provider infrastructure, or require live provider access for automated tests.

#### Scenario: Offline test exercises upload workflow
- **WHEN** upload validation, ownership, replacement, expiry, or failure behavior is tested
- **THEN** a deterministic in-memory or local fake adapter supplies the storage boundary without contacting Supabase Storage, R2, or another live service

#### Scenario: Production provider has not been approved
- **WHEN** implementation reaches the production adapter/deployment gate without a separately approved provider decision
- **THEN** production provider configuration stops while provider-neutral domain, UI, and offline work may remain verifiable
