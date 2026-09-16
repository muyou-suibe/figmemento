## Purpose

Provide private, versioned digital-item delivery for authorized customers and guests in the isolated local persistent commerce environment. Define truthful readiness, finite grants, short-lived same-origin tickets and atomic download-attempt accounting without exposing storage locations, enabling real delivery email or claiming production readiness.

## ADDED Requirements

### Requirement: Authorized item-bound version publication
Only an authorized local administrator SHALL upload and publish a digital-delivery version for an existing digital order item in the selected persistent project. The server MUST verify the item's order membership and digital fulfillment snapshot rather than trusting submitted order/item identifiers. New publication and replacement SHALL use the same authoritative command gate as Admin commerce: canonical local paid/succeeded, passed applicable photo review, and approval of the latest required complete preview manifest. Items whose purchased configuration disables preview SHALL not acquire a dummy preview requirement. Digital-only delivery MUST NOT require shipment or tracking. A published version MUST reference immutable private bytes and durable version metadata. Availability MUST be `pending`, `ready` or `failed`; neither successful object upload alone nor metadata alone establishes ready or delivered state. Replacement MUST publish a new version rather than overwrite original published bytes. Equivalent publication retries after fresh authorization MUST return the original result; reused operation identities with conflicting files, versions or item ownership MUST be rejected.

#### Scenario: Publish a ready version for the correct item
- **WHEN** an authorized administrator publishes a file whose private bytes and durable metadata are confirmed for an existing digital order item
- **THEN** the item exposes that version as ready to eligible authorized readers without exposing a public file URL or affecting other items

#### Scenario: Reject ordinary users or mismatched order items
- **WHEN** an ordinary customer attempts publication or an administrator supplies an order identifier with an item belonging to another order or a physical-only item
- **THEN** publication is rejected without changing delivery state or leaking another order's private file

#### Scenario: Partial publication failure and retry
- **WHEN** an object write or metadata commit fails, or the publication response is lost
- **THEN** partial work remains pending/failed and cannot be delivered; an equivalent retry safely resolves the same operation without creating duplicate published versions or overriding a later publication

#### Scenario: Alternate publication cannot bypass review gates
- **WHEN** an Admin uses any publication or replacement route while canonical payment, applicable photo review or required latest-preview approval is missing
- **THEN** the shared command rejects publication without making the item ready, regardless of whether the route is reached through the Admin UI

### Requirement: Owner paid and ready eligibility is item-specific
A download grant and every ticket issuance/claim SHALL require a valid persisted owner session or scoped guest grant, the authoritative order's successful local simulated-payment state and the requested digital item's current ready version. Order number, email and client payment/readiness claims MUST NOT authorize delivery. Local login MUST NOT acquire a guest order merely by matching its email. A digital-only order MUST NOT require a shipping address, shipment or tracking status to become downloadable; normal contact validation still applies. In mixed orders, digital readiness MUST be evaluated per item and physical shipping gates MUST remain independent.

#### Scenario: Authorized paid digital-only purchase
- **WHEN** a customer or guest with valid ownership requests a current ready digital item on a locally paid digital-only order
- **THEN** delivery eligibility does not require a shipping address, shipment or tracking record and remains explicitly local/test delivery

#### Scenario: Mixed-order per-item eligibility
- **WHEN** a paid mixed order contains one ready digital item, another pending digital item and an unshipped physical item
- **THEN** only the ready digital item is eligible for its owner's download, without marking the other digital item ready or the physical item shipped

#### Scenario: Reject unpaid or forged authority
- **WHEN** a request has only a matching email/order number, a forged cookie, another user's session, a browser-supplied paid flag, or an unpaid/unready item
- **THEN** no ticket or private file bytes are returned and no download allowance is consumed

### Requirement: Explicit finite server-time grants
Each delivery grant SHALL persist its owner and item scope, finite expiry, revocation state, configured `maxDownloads` and consumed-attempt count. Validity duration MUST be an explicitly configured finite positive value and `maxDownloads` MUST be an explicitly configured finite positive integer; missing, zero, negative, non-finite or otherwise invalid values MUST prevent grant activation rather than imply unlimited access. Example durations/counts used in tests MUST be labeled test-only and MUST NOT become an unapproved default operating policy. Expiry MUST be judged by server time with rejection at or after expiry; controlled clocks MUST support deterministic acceptance. Reissuing tickets, refreshing a page or restarting the application MUST NOT create a fresh allowance.

#### Scenario: Reject absent or unlimited policy
- **WHEN** a grant is requested with missing expiry configuration or missing, zero, negative, infinite or fractional `maxDownloads`
- **THEN** the grant is not activated and no unlimited or silently defaulted download policy is applied

#### Scenario: Server expiry defeats browser clock changes
- **WHEN** the controlled server clock reaches the grant expiry while the browser reports an earlier time
- **THEN** both new tickets and claims are denied without changing the count, regardless of client time

#### Scenario: Retain allowance across refresh and restart
- **WHEN** an owner refreshes, requests several tickets or reconnects through a new application process
- **THEN** the same persisted consumed count and finite grant limits continue to apply rather than resetting the allowance

### Requirement: Same-origin short-lived opaque download tickets
Eligible owners SHALL receive only a short-lived opaque same-origin download ticket, scoped to the persisted grant, owner, item and current version. Its expiry MUST be no later than the grant expiry and MUST be explicitly bounded to a short lifetime. Ticket issuance MUST NOT consume a download allowance. Tickets MUST NOT encode or return Storage signed URLs, bucket/key locators, service credentials or a permanent public download URL, whether in response bodies, redirects or headers. Private bytes MUST be delivered through the authorized same-origin boundary, not by redirecting to object storage. Durable ticket verification MUST avoid storing plaintext bearer tokens.

#### Scenario: Issue several tickets without consuming quota
- **WHEN** an eligible owner requests multiple tickets for a ready item
- **THEN** each ticket is scoped and expires no later than its grant while the consumed count remains unchanged; possession of several tickets does not reserve extra downloads

#### Scenario: Keep the storage provider private
- **WHEN** the browser inspects ticket responses, headers and the download destination
- **THEN** it sees only the same-origin opaque ticket mechanism and safe delivery metadata, not a Storage signed URL, bucket, object key or storage credential

### Requirement: GET atomically claims one download attempt before streaming
Only an explicit authorized download GET SHALL claim a ticket. At claim time the server MUST atomically enforce ticket single use and expiry, grant expiry/revocation, current-version identity, current ownership, local paid state, ready status and remaining allowance across processes. The server MUST successfully open the private object for reading before committing the claim, then commit the ticket use and exactly one consumed-attempt increment together before streaming any file bytes to the client. Opening the object alone MUST NOT commit a claim; eligibility MUST still hold at commit. Unreadable objects or database failure before commit MUST consume nothing and emit no file bytes. Successful claim means one download attempt, not a guarantee that the client received the final byte; client disconnection or stream failure after commit MUST NOT automatically refund the count or reactivate the ticket.

#### Scenario: Successfully claim and stream
- **WHEN** an owner's explicit GET has a valid ticket and remaining allowance, the current private object opens successfully and all claim conditions still hold
- **THEN** one transaction marks the ticket used and consumes one attempt before the same-origin response streams private file bytes

#### Scenario: Object cannot be opened before commit
- **WHEN** the private object is missing, unreadable or Storage is unavailable before a claim commits
- **THEN** no file bytes are emitted, the count is unchanged, the ticket is not marked used and a later retry must revalidate all eligibility conditions

#### Scenario: Database failure after object open
- **WHEN** the object opens but the claim transaction fails before commit
- **THEN** no file bytes are sent, neither ticket use nor allowance consumption commits, and the opened object is not treated as a delivered download

#### Scenario: Disconnect after committed claim
- **WHEN** a claim has committed and the client disconnects or streaming fails before the final byte
- **THEN** the attempt stays counted and its ticket stays used, the result is recorded without claiming complete receipt, and no automatic refund occurs

### Requirement: Single-use tickets and bounded concurrency
A successful GET claim SHALL make its ticket unusable for subsequent GETs, including replay, automatic retries and partial/range follow-up requests. HEAD and requests identified as prefetch/preload or non-download probes MUST NOT claim a ticket, consume allowance or return file content; the supported UI MUST NOT prefetch ticket URLs. With one remaining allowance and multiple independently issued tickets, concurrent claims MUST allow at most one success. Ticket issuance MUST NOT preallocate quota. Failed claims MUST NOT send bytes, decrement below zero or change the published version.

#### Scenario: Multiple tickets race for the final allowance
- **WHEN** two independent application processes receive concurrent explicit GETs with different valid tickets for the same grant's final remaining attempt
- **THEN** exactly one can commit and stream if the object is readable and commit succeeds, while the other returns an exhausted result with no file bytes and total consumption never exceeds `maxDownloads`

#### Scenario: Replay a successfully claimed ticket
- **WHEN** the same ticket is submitted again after a successful claim, including a range request or a retry after client disconnection
- **THEN** no new stream or second consumption is permitted; any new attempt requires a new eligible ticket and remaining grant allowance

#### Scenario: HEAD and prefetch are not downloads
- **WHEN** a browser or client sends HEAD or an identified prefetch/preload probe to a ticket URL
- **THEN** the request neither emits file content nor consumes allowance nor marks the ticket used, and the UI does not trigger an implicit download claim

### Requirement: Version replacement and revocation do not reset quota
Publishing a replacement version SHALL invalidate all tickets for the old version and preserve the item's grant consumption history, configured limit and original expiry; a new version MUST NOT mint fresh quota or extend expired access implicitly. Revocation MUST block subsequent ticket issuance and stream claims across application processes, including tickets issued before revocation. Claims and replacement/revocation MUST have a single ordered outcome: if replacement or revocation commits first, the old claim MUST fail; a stream whose claim already committed is an existing attempt. Revocation MUST NOT promise to recover bytes already delivered or reliably retract an already authorized stream. Revoked access MUST NOT become active merely through replacement publication.

#### Scenario: Replace a version after some attempts
- **WHEN** an administrator publishes a new ready version after the owner consumed part or all of the allowance
- **THEN** old tickets become invalid, the same consumed count and grant expiry apply to the replacement, and an exhausted owner cannot bypass the limit by requesting new-version tickets

#### Scenario: Revoke before a pending claim commits
- **WHEN** an administrator revokes the grant while another process has opened the object but has not committed its claim
- **THEN** if revocation commits first the claim is denied with no bytes and no count increment, and new tickets or claims remain blocked after restart

#### Scenario: Replacement fails before becoming ready
- **WHEN** replacement bytes or metadata cannot be completed
- **THEN** the incomplete replacement is not published as ready or delivered, the last valid publication is not silently overwritten and no quota is reset

#### Scenario: Already delivered bytes cannot be recalled
- **WHEN** revocation occurs after an earlier claim committed and delivered some or all bytes
- **THEN** later stream claims are blocked, but the user-facing result and audit do not claim that already delivered bytes were recovered

### Requirement: Redacted durable delivery audit and legacy-path isolation
The system SHALL record durable, privacy-minimized publication, replacement, ticket issuance, download attempt/result and revocation audit events sufficient to relate actor scope, order item, version, server time, outcome and quota effect. Audits MUST NOT contain raw tokens, cookies, signed URLs, bucket/key locators, credentials or unnecessary customer contact data. A committed claim and its quota effect MUST remain auditable even if streaming or the process later fails; incomplete streams MUST NOT be reported as proven full downloads. Local persistent items MUST NOT be accessible through legacy order-number/email lookup, legacy signed-URL generation or legacy administrator writes that bypass these gates. This capability MUST NOT send real email or imply a production-ready delivery service.

#### Scenario: Audit a failed and successful attempt safely
- **WHEN** a denied request is followed by an authorized committed claim that later disconnects
- **THEN** the audit distinguishes denial, committed quota consumption and interrupted/unknown stream result without recording bearer secrets or claiming receipt of the final byte

#### Scenario: Deny the legacy lookup route
- **WHEN** a caller submits a local persistent order number and matching email to an older download lookup or attempts a legacy delivery write
- **THEN** that path grants no access to the local private item and cannot issue a storage URL, publish a bypass version or alter its allowance

### Requirement: Delivery acceptance proves durable failure and race semantics
Digital-delivery acceptance SHALL run separately from database-free offline checks and use the isolated local PostgreSQL/private Storage project. It MUST cover customer and guest ownership, cross-user and forged-cookie/email rejection, explicit finite policy, controlled server expiry, HEAD/prefetch, repeated GET, multiple-ticket contention above the limit, publication partial failures, object-read and database-commit failures, disconnection, version replacement, revocation and redacted audit. Recovery MUST be demonstrated by writing through application process A, terminating it and reading/claiming through freshly started process B with original credentials and unchanged allowance, not by an in-memory reset. Unavailable local-stack prerequisites MUST be reported as blocked, never skipped as passed; results MUST remain local/test evidence only.

#### Scenario: Resume through a real second process
- **WHEN** process A persists a ready item, owner grant, ticket and consumed history, then exits and process B starts against the retained project
- **THEN** valid unexpired authority and unspent tickets still obey the same version, revocation and allowance checks, while spent tickets and expired grants remain denied

#### Scenario: Verify deadline and race boundaries
- **WHEN** the controlled server clock crosses ticket or grant expiry and independent processes concurrently submit more claims than the remaining allowance
- **THEN** expired claims fail without bytes or consumption and eligible claims never exceed the persisted limit regardless of browser time

#### Scenario: Report missing private storage honestly
- **WHEN** offline delivery-rule checks pass but the selected private Storage or database is unavailable
- **THEN** the integration delivery result is blocked with the unavailable prerequisite, not described as completed persistence, successful real download verification or production readiness