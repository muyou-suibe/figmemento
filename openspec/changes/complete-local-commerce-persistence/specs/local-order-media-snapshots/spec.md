## Purpose

Preserve the complete purchased meaning of each configured order item together with private originals, validated crop parameters and trustworthy derived previews in the isolated local persistent environment. Make receipt ownership, one-time attachment, failure recovery and cleanup behavior observable and verifiable without enabling the deferred production snapshot migration.

## ADDED Requirements

### Requirement: Complete immutable purchase and customization snapshots
Each committed local order item SHALL preserve its purchased product identity and display facts, SKU/variant identity and code, selected option identifiers and labels, quantity, base price, customization price components, applicable discount/tax/shipping allocations, totals and currency. It MUST also preserve the applicable product/SKU configuration, fulfillment type and rules, customization field definitions and constraints, configuration and rule versions, customer values/notes and image references in stable order with their crop parameters. The order MUST preserve corresponding order-level commercial facts. Subsequent catalog edits, price changes, field removal or product deletion MUST NOT rewrite these facts or require the current catalog to reconstruct historical meaning. Differently customized copies of one product MUST remain distinct items.

#### Scenario: Read history after catalog changes
- **WHEN** an administrator changes or removes the purchased product, SKU, option labels, price, fulfillment rules or customization fields after checkout
- **THEN** the authorized customer and operator still see the original purchased configuration, quantity, currency, charges, customization meaning and ordered image/crop snapshot

#### Scenario: Keep differently customized copies distinct
- **WHEN** two copies of the same SKU have different text, ordered images or crops and are purchased together
- **THEN** they remain separate order items with their own complete snapshots rather than being merged by product or SKU identity

### Requirement: Owned ready receipts attach once within the order transaction
A receipt SHALL authorize attachment only for its server-verified owner and eligible ready private media. The order transaction MUST atomically bind every receipt to exactly one order item together with the order snapshots, scoped access grant and idempotency result. Expired, revoked, removed, cleanup-claimed, failed, foreign or already differently attached receipts MUST be rejected. Any attachment failure MUST roll back all new purchase effects. The original authorized equivalent creation retry MUST return the original order without attempting to re-consume its receipts.

#### Scenario: Commit a multi-image order item
- **WHEN** an authorized owner purchases an item whose ordered receipts and derived previews are ready and eligible
- **THEN** the order, complete snapshots and each receipt's one-time item binding become visible together with the scoped order access grant

#### Scenario: Roll back when one receipt is ineligible
- **WHEN** one receipt in a multi-item checkout belongs to another user, has expired, is not ready or cannot be attached
- **THEN** the entire new order transaction fails without committing any item, binding, grant or successful idempotency result

#### Scenario: Competing orders attempt one receipt
- **WHEN** two independent application processes attempt to attach the same receipt to different order items
- **THEN** at most one order transaction succeeds, the other returns a conflict, and no receipt is bound to both items

#### Scenario: Idempotent replay after attachment
- **WHEN** the original owner retries an identical committed order request after a lost response or application restart
- **THEN** the original order and item bindings are returned unchanged without a second receipt consumption

### Requirement: Explicit controlled copying differs from item quantity
One receipt MUST NOT be attached to two order items. Reusing an image for another item SHALL require an explicit authorized copy operation that creates a new independently scoped receipt/authorization record and records its provenance. Sharing the same immutable private original between controlled copies SHALL be permitted only while access and retention protections remain independent. The system MUST reject implicit reuse of the old receipt or a client-forged copy reference. Increasing the quantity of one configured order item MUST NOT consume its receipt once per unit. Equivalent copy retries MUST return the same new authorization record, and conflicting retries MUST be rejected.

#### Scenario: Purchase several units of one configured item
- **WHEN** a single configured order item has quantity greater than one
- **THEN** each receipt binds once to that item while the snapshot records the full quantity and its server-calculated amount

#### Scenario: Explicitly reuse an owned original for another item
- **WHEN** an owner requests a controlled copy for a second item and retries the same copy request
- **THEN** one new scoped receipt is returned for that item, the original receipt retains its binding, and sharing private source bytes does not transfer another user's access

#### Scenario: Reject implicit or foreign copying
- **WHEN** a browser assigns one receipt to two items or requests a copy of another principal's original
- **THEN** the request is refused without creating a second attachment or revealing private source data

### Requirement: Originals are immutable and derived preview pixels are trustworthy
Accepted original image bytes SHALL remain private and MUST never be overwritten by cropping, replacement or preview generation. Crop metadata MUST be independently validated by the server against decoded original dimensions, finite coordinates, positive dimensions, image bounds and applicable field constraints. A durable derived preview MUST be generated from the trusted original and validated crop, not accepted as authoritative merely because the browser submitted canvas pixels. The saved snapshot MUST relate the original, ordered reference, validated crop and corresponding derived-preview version. Browser-local original previews MUST NOT be represented as server-persisted completion.

#### Scenario: Save a non-destructive crop
- **WHEN** an owner adjusts a valid crop and the server confirms its corresponding derived preview is durably ready
- **THEN** the saved item shows the crop-matched preview, retains the exact original bytes and permits authorized inspection of both after restart

#### Scenario: Reject forged canvas or crop authority
- **WHEN** a client submits unrelated canvas pixels, non-finite or out-of-bounds crop coordinates, or forged original dimensions
- **THEN** those inputs cannot become a trusted derived preview; invalid requests leave the prior confirmed media unchanged and report safe validation failure

### Requirement: Partial object and database writes never imply readiness
Original, derived-preview and associated persistence outcomes SHALL expose truthful `pending`, `ready` or `failed` availability independently of receipt removal/expiry lifecycle. Because private object writes and database commits are not atomic together, ready media MUST require both durable metadata and confirmed readable private bytes. Partial failures MUST remain pending or failed and MUST NOT produce an eligible attachment, completed preview or delivered item. Retrying or reconciling incomplete work MUST be idempotent, preserve confirmed media and avoid publishing or accidentally deleting another operation's objects.

#### Scenario: Object exists but metadata commit fails
- **WHEN** a private object write succeeds but its durable receipt or preview metadata commit fails
- **THEN** no ready receipt or completed preview is returned, no order can attach that incomplete result, and retry or cleanup handles the private orphan without exposing it

#### Scenario: Metadata exists but source or derived bytes fail
- **WHEN** a metadata record is pending and original upload, preview generation or private-object readability verification fails
- **THEN** availability remains pending or becomes failed, the UI cannot claim final completion and an earlier confirmed version is not overwritten

#### Scenario: Recover after interruption
- **WHEN** an interrupted media operation is retried after the application restarts
- **THEN** its durable state determines safe completion or failure, with no duplicate receipt and no ready result until both metadata and bytes satisfy the contract

### Requirement: Cleanup and attachment are mutually exclusive across processes
Cleanup claims and receipt attachment SHALL compete under one durable locking/serialization boundary. Once attachment commits, cleanup MUST NOT claim or delete that receipt's retained original or derived bytes. Once cleanup has legitimately claimed an unattached receipt, attachment MUST fail rather than race physical deletion. Cleanup MUST consider every retained reference when controlled copies share a private original; deleting one unused authorization MUST NOT delete bytes still retained by an attached or otherwise protected record. Cleanup failures and retries MUST retain auditable state and MUST NOT make private objects public.

#### Scenario: Attachment wins the cleanup race
- **WHEN** attachment commits while a separate process attempts cleanup of the same media
- **THEN** cleanup refuses to claim/delete the attached media and its bytes remain readable to the authorized order owner

#### Scenario: Cleanup wins the attachment race
- **WHEN** cleanup validly claims an unattached receipt before another process tries to purchase it
- **THEN** attachment fails and the new order transaction rolls back, without an order referencing bytes being deleted

#### Scenario: A shared original remains retained
- **WHEN** cleanup removes an unused copied receipt while another retained authorization references the same original
- **THEN** the unused record can be cleaned without deleting the protected original or interrupting the attached item's preview

### Requirement: Private historical media access and failure-safe verification
Originals, derived previews and order snapshots SHALL be readable only under the persisted customer session, scoped guest grant or authorized local operator access. Order numbers, email, receipt identifiers and forged cookies MUST NOT authorize access. Customer-facing projections MUST NOT expose storage credentials, bucket/key locators or permanent public media URLs. Verification MUST cover byte preservation, ordered multi-image snapshots, cross-user denial, transactional rollback, controlled copying and cleanup/attachment contention using the isolated local stack and distinct application processes; an unavailable stack MUST yield blocked evidence rather than passed acceptance.

#### Scenario: Restore private historical images in another process
- **WHEN** one process commits a multi-image order and exits, then a fresh process reads it with the owner's original valid grant
- **THEN** the same ordered originals, crops, derived previews and purchase meaning are available without reconstructing history from today's catalog

#### Scenario: Reject private-media enumeration
- **WHEN** a different account or a browser with a forged cookie requests a known receipt, preview or order item using its identifier and matching email
- **THEN** no private bytes, storage location or historical customization data is disclosed

### Requirement: Trusted local image processing has a restricted service boundary
Local derivative processing SHALL use only the explicitly configured local processing authority after service authentication and project-identity validation. Customer input MUST NOT select a processor origin, fetch URL, DNS target or filesystem path. The service MUST refuse non-allowlisted destinations, redirects, invalid service credentials and mismatched projects, apply decoded-pixel/input-size limits and fail closed when processing or private Storage is unavailable. This restriction MUST be verifiable through the actual local application runtime, not only a standalone processor test; it MUST NOT select a production image-processing provider.

#### Scenario: Local application produces a trusted derivative
- **WHEN** the local application runtime invokes the configured authenticated processor for an authorized original and valid crop in the same project
- **THEN** a verifiable private derivative can become ready without exposing the processing credential or allowing the browser to choose a source locator

#### Scenario: Reject arbitrary processor input or unavailable dependency
- **WHEN** a request attempts URL/path injection, a non-local origin, redirect, forged service credential, project mismatch or exceeds decode limits, or the processing/Storage dependency fails
- **THEN** processing produces no ready media, private bytes are not sent to an arbitrary destination and the previous confirmed media remains intact