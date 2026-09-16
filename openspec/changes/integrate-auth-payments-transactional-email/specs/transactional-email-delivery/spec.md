## Purpose

Deliver the confirmed transactional notification categories through provider-owned authentication email and durable application email processing, with private-page links, auditable business-event provenance, bounded retries, and truthful acceptance, delivery, and uncertainty states.

## ADDED Requirements

### Requirement: Eleven notification categories and thirteen explicit mappings

The system SHALL cover the eleven categories in requirements section 13 through the following thirteen mappings. The two photo-action variants and two preview-revision-result variants SHALL remain variants of their existing categories, not new business requirements. Mapping names describe contracts rather than asserting that current producers exist. Each application mapping SHALL reference a committed canonical business event, authoritative event version, project/order, recipient, and template version. Missing producers SHALL be D blocked, not replaced with UI clicks, browser status, test fixtures, or invented business events.

| Mapping | Confirmed category | Authoritative trigger and delivery owner |
| --- | --- | --- |
| M01 | 邮箱登录验证码 | Supabase `signInWithOtp` authentication request; Supabase Auth creates/verifies code and sends via configured SMTP, outside application notification outbox |
| M02 | 订单创建 | Committed canonical order-created event; application Resend notification to order email |
| M03 | 支付成功 | Committed server-verified paid event after amount/currency/payment binding checks and order projection; application Resend notification to order email |
| M04 | 照片需补充或重新上传 | Committed photo-review request for additional material; application Resend notification |
| M05 | 照片需补充或重新上传 | Committed photo-review reupload request; application Resend notification |
| M06 | 生产预览待确认 | Committed customer-visible production-preview-available version; application Resend notification |
| M07 | 生产预览修改结果 | Committed fulfilled revision result with a revised preview; application Resend notification |
| M08 | 生产预览修改结果 | Committed revision result that cannot fulfill the request and requires explanation/contact; application Resend notification |
| M09 | 订单进入生产 | Committed production-started transition; application Resend notification |
| M10 | 订单发货 | Committed shipment transition; application Resend notification to order email |
| M11 | 物流单号和查询链接 | Committed tracking-detail/version availability; application Resend notification, optionally combined with M10 |
| M12 | 数字商品可下载 | Committed digital-ready event with authoritative paid status and private file readiness; application Resend notification |
| M13 | 订单异常或需要人工联系 | Committed order-exception/contact-required event version; application Resend notification |

M07/M08 SHALL describe outcomes of the confirmed revision-result category without inventing an approval/refund workflow; absent approved canonical result events their D wiring SHALL remain blocked. M10/M11 MAY share one message when both facts are committed together; the combined message SHALL durably mark both semantic mappings as covered so replay sends neither duplicate. Later newly committed tracking versions SHALL remain eligible for their own notification under the approved event policy. Marketing, abandonment recovery, review invitations, bulk sending, and production-process video expansion SHALL remain out of scope.

#### Scenario: Full mapping coverage
- **WHEN** template/contract acceptance is reviewed
- **THEN** all eleven confirmed categories have the thirteen explicit mappings above, with M01 attributed only to Supabase SMTP and each unavailable canonical producer labeled D blocked

#### Scenario: Combined shipping and tracking
- **WHEN** a committed shipment event includes its authoritative tracking details and policy selects one combined notification
- **THEN** one email covers M10 and M11 with durable semantic coverage preventing duplicate standalone sends for the same facts

#### Scenario: No committed producer
- **WHEN** a preview, revision, photo-review, production, or other producer exists only as a mock or browser action
- **THEN** its application notification is not emitted as a business event and its D acceptance stays blocked

### Requirement: Supabase owns authentication email

Supabase Auth SHALL own numeric OTP generation, expiry, verification, resend policy integration, and SMTP delivery. The provider template SHALL actually render the email numeric code; a default magic-link-only template MUST NOT be accepted as OTP support. Resend SMTP MAY be configured externally as Supabase's SMTP transport, but that configuration SHALL be a C prerequisite, not an application Resend API send or duplicate outbox message. Application notification templates MUST NOT contain OTPs, provider access/refresh tokens, auth authorization codes, or authentication links carrying secrets. The sole OTP-content exception SHALL be the provider-owned authentication email itself. Missing SMTP/template credentials MUST NOT result in application-minted codes or a claim of successful real email delivery.

#### Scenario: One provider-owned OTP email
- **WHEN** an allowed test user requests a numeric login code
- **THEN** Supabase creates and sends it using the configured SMTP template and no application outbox/Resend API duplicate is created

#### Scenario: SMTP or numeric template missing
- **WHEN** the test project lacks usable SMTP or only has the default magic-link template
- **THEN** C numeric OTP delivery is blocked without creating a fallback code or asserting that the OTP requirement passed

### Requirement: Transactional event production and durable outbox

Application notifications SHALL be generated only from committed business facts and persisted in a durable outbox. When business state/event and outbox share a database, their event, state transition, and outbox intent MUST commit in the same transaction. A separate integration ledger SHALL consume through a durable inbox and approved projection boundary: the authoritative producer SHALL atomically commit its business event and a durable publish intent; the consumer SHALL atomically commit inbox deduplication, its projection, and notification outbox. An acknowledgement MUST NOT precede the required durable commit. A post-commit best-effort callback or application memory queue MUST NOT be represented as transactional production. Failure between stores SHALL be recoverable by replay from durable producer evidence, not by scanning arbitrary legacy/local orders. Missing business-event producers or approved canonical adapters SHALL block D wiring. Existing `local_queued` notifications and local fake/local-persistent events MUST NOT be migrated or drained to Resend.

#### Scenario: Same-database commit failure
- **WHEN** a business transition succeeds in memory but its event or notification-outbox insert fails within the shared transaction
- **THEN** the transaction rolls back without leaving a committed transition that silently lost its required notification intent

#### Scenario: Separate-store crash and replay
- **WHEN** the producer commits state/event/publish intent and the integration consumer crashes before or after inbox/projection/outbox commit
- **THEN** replay from the durable source completes the consumer transaction once without losing or duplicating the notification

#### Scenario: Local queue remains local
- **WHEN** Resend test mode is enabled while local simulated notifications are queued
- **THEN** those records remain local and cannot be replayed as external sends

### Requirement: Business version deduplication and immutable send intent

The outbox SHALL enforce a durable semantic uniqueness key incorporating project/environment, canonical aggregate/order, committed business event identity and event version, notification mapping, and recipient identity. Replaying an event SHALL produce no duplicate intent; a genuinely new approved event version SHALL remain distinguishable. Recipient and safe sender/subject/header/body/template/link inputs SHALL be validated and frozen before the first external attempt, alongside a stable Resend idempotency key and payload digest. Retries MUST reuse the same exact payload and key; template updates, email changes, worker restarts, or retry counts MUST NOT silently mutate an attempted message. Order-created, paid, and shipped messages SHALL target the authoritative order email, not an arbitrary current browser/customer address. Superseding a permanently failed unsent intent SHALL require an audited authorized decision and MUST NOT be used to bypass an uncertain send.

#### Scenario: Replayed and newly versioned events
- **WHEN** the same event/version is consumed repeatedly and a later legitimate version is subsequently committed
- **THEN** the first version creates only one semantic intent and the new version is evaluated independently under its mapping policy

#### Scenario: Template changes during retry
- **WHEN** a worker retries after templates or account email have changed
- **THEN** it uses the original frozen recipient, payload, and idempotency key without turning the retry into a different send

#### Scenario: Browser payment claim
- **WHEN** a browser reports payment success without an authoritative committed verified-paid event
- **THEN** no paid email intent is produced

### Requirement: Private safe templates and protected-page entry

Every application notification SHALL provide plaintext and HTML variants with escaped untrusted dynamic HTML content, bounded validated fields, and header-injection protection for recipient, sender, reply-to, and subject. Header values MUST reject CR/LF injection and recipients MUST come from authorized durable business data. URLs SHALL use approved HTTPS origins and safe protected application-page paths; arbitrary browser redirects, private image URLs, Storage URLs, presigned object URLs, download tickets, and permanent public file URLs MUST NOT appear in messages. Application emails MUST NOT attach private originals, previews, digital files, or expose OTPs, auth/session tokens, guest capability secrets, or private-file credentials. Plaintext SHALL offer equivalent safe content and destinations. Reading or clicking an email MUST NOT itself confirm a preview, mutate an order, or authorize a download.

Protected-page access SHALL require the original valid guest capability or an authorized member session with committed ownership. If the guest lacks that capability, the page SHALL offer secure sign-in and automatic eligible association after fresh provider verified-email proof, without demanding an extra guest cookie or a second challenge after proof. No private content SHALL be rendered before authorization. Digital-download authorization, expiry, and count checks SHALL occur on the protected page before separately issuing any short-lived file access, not by embedding a ticket in the email.

#### Scenario: Unsafe dynamic content
- **WHEN** customer-controlled text contains HTML markup or header fields contain CR/LF sequences
- **THEN** HTML content is escaped and invalid headers are rejected without script injection, added recipients, or additional headers

#### Scenario: Private preview or digital notification
- **WHEN** a preview-available or digital-ready email is rendered
- **THEN** it contains only an approved protected-page entry with plaintext/HTML parity and no private file, Storage URL, or download ticket

#### Scenario: Guest opens email without capability cookie
- **WHEN** a guest follows the safe page entry without their original valid guest capability
- **THEN** the page withholds private data and offers sign-in followed by fresh verified-email eligible association without an extra guest-cookie requirement

#### Scenario: Link scanner or nonowner
- **WHEN** an email scanner follows the link or a different authenticated customer guesses the page URL
- **THEN** no mutation, private file release, or unauthorized order disclosure occurs

### Requirement: Lease expiry and fencing for concurrent dispatch

Outbox claiming SHALL use durable leases with expiry, worker identity, and monotonically changing fencing tokens or equivalent compare-and-set ownership. Only the current lease holder SHALL claim or update dispatch state; long work SHALL renew the lease or stop before further dispatch when renewal fails. Stale workers MUST NOT overwrite newer outcomes. Recovery after worker death SHALL retain the original immutable payload and idempotency key; fencing alone MUST NOT be claimed to guarantee that an already in-flight external request was never sent. A replacement worker SHALL apply the finite provider idempotency-window and ambiguity rules before sending.

#### Scenario: Two workers claim one message
- **WHEN** two workers concurrently claim the same due outbox row
- **THEN** only one obtains the current valid lease and the other cannot dispatch or commit its state transition

#### Scenario: Stale worker returns after lease expiry
- **WHEN** a lease expires and a replacement worker acquires a newer fence before the old network request returns
- **THEN** the old worker cannot overwrite newer state and recovery treats its possible external send as ambiguous under the original idempotency key

### Requirement: Finite Resend idempotency and ambiguous send recovery

Before external dispatch, the outbox SHALL durably record the stable key, immutable payload/digest, first-attempt time, and conservative retry deadline for Resend's 24-hour idempotency retention window. A lost response, timeout, connection reset after possible submission, or crash after send before local acceptance persistence SHALL be ambiguous, not proof of failure. Within the remaining safe window, retry SHALL reuse the exact payload and same key; dispatch MUST stop before the retention boundary using a safety margin for clock/network uncertainty. Once an ambiguous attempt reaches or exceeds that safe window, it SHALL enter `status_unknown` with no automatic resend. The system MUST NOT generate a new key or mutate payload to blindly resend after the window. Authorized manual reconciliation SHALL inspect available provider evidence, record an auditable resolution, and require explicit risk-aware authorization for any later new send if the original outcome cannot be determined; provider observability MUST NOT be assumed to prove non-delivery.

#### Scenario: Ambiguous timeout within window
- **WHEN** a send times out after possible provider acceptance and the conservative 24-hour deadline has not been reached
- **THEN** bounded retry uses the same key and identical payload so the provider can deduplicate the possible prior send

#### Scenario: Ambiguity exceeds provider window
- **WHEN** the original outcome remains unknown at or beyond the conservative retention deadline
- **THEN** the intent becomes `status_unknown`, automatic sending stops, and manual reconciliation is required without changing the key to force another send

#### Scenario: Crash before local accepted write
- **WHEN** Resend accepted a message but the worker crashes before persisting the response
- **THEN** recovery treats the outcome as ambiguous rather than creating a fresh intent or blindly sending with a new key

### Requirement: Bounded retries and dead-letter outcomes

Dispatch SHALL use bounded network deadlines, capped attempts and elapsed retry duration, jittered backoff, and the stricter of the retry budget and finite idempotency deadline. A 429 response SHALL honor valid `Retry-After` timing without retrying earlier; if that timing exceeds the allowed window/budget, dispatch SHALL stop safely rather than ignore it. Retryable 5xx/network failures SHALL retain the same key/payload and account for possible acceptance. Permanent invalid configuration, unauthorized credentials, invalid sender/domain, invalid recipient/payload, or idempotency payload conflict SHALL produce a safe actionable blocked/dead-letter outcome rather than infinite retry or automatic key replacement. Exhausting retry budget with a possibly accepted outcome SHALL remain unknown/reconciliation-required, not falsely definitive failure. No retry policy SHALL bypass recipient suppression or test authorization.

#### Scenario: Throttled provider
- **WHEN** Resend returns 429 with a valid Retry-After
- **THEN** retry is scheduled no earlier than that delay and only within the remaining attempt/time/idempotency limits

#### Scenario: Temporary failure
- **WHEN** a 5xx or network failure occurs within the allowed budget
- **THEN** bounded backoff retains the same frozen payload/key and preserves ambiguity where submission may have occurred

#### Scenario: Permanent configuration failure
- **WHEN** credentials, sender configuration, recipient validation, or payload are permanently invalid
- **THEN** the intent becomes blocked/dead-letter with safe diagnostics and no endless retry or hidden alternate sender

### Requirement: Accepted is not delivered

A successful Resend send API 2xx response with a valid provider message identifier SHALL mean `accepted`, not `delivered`. A missing/malformed identifier or uncertain response SHALL remain pending/unknown rather than fabricating correlation. Delivery, bounce, and complaint evidence SHALL be separately persisted and correlated by provider message identifier, project/environment, and notification intent. UI and audit reports SHALL distinguish queued, in-flight, retry scheduled, accepted, delivered, bounced, complained/suppressed, dead-letter, and status unknown as applicable. API acceptance MUST NOT claim inbox placement, read status, or human action; even a delivery webhook SHALL describe provider-reported delivery rather than guaranteed inbox placement.

#### Scenario: API accepts a notification
- **WHEN** a valid 2xx send response includes the provider message identifier
- **THEN** the intent becomes accepted with that correlation and remains not-yet-delivered until verified delivery evidence arrives

#### Scenario: No delivery evidence
- **WHEN** an accepted message has no verified delivery event
- **THEN** reporting remains accepted/awaiting delivery evidence and does not silently upgrade it to delivered

### Requirement: Raw signed webhooks and monotonic suppression

Resend delivery webhooks SHALL be verified using Svix signature validation against the raw request body and the expected endpoint secret, including signed message ID/timestamp, bounded timestamp tolerance, and replay protection. Verification MUST precede JSON interpretation and state mutation; requests with invalid/missing signatures or unacceptable timestamps SHALL be rejected. Verified webhook events SHALL be durably deduplicated by provider event identity and correlated within the expected project/environment. Unknown or early provider-message correlation SHALL be durably retained for bounded reconciliation without mutating arbitrary orders or discarding valid evidence. Delivery, bounce, and complaint processing SHALL be idempotent and resilient to out-of-order arrival: delayed accepted/delivered events MUST NOT erase a recorded bounce, complaint, or suppression. Event evidence SHALL be retained separately where facts coexist, rather than applying a naive last-write-wins status.

Hard bounce and complaint evidence SHALL create durable recipient suppression checked before every send/retry, including queued work. Transient bounce classification SHALL follow verified provider semantics and MUST NOT automatically relabel permanent failure as transient. Unsuppression SHALL require a separately authorized audited policy and MUST NOT occur from later delivery events or new business-event versions. Webhook data and diagnostics MUST NOT disclose private message bodies, tokens, or full provider secrets.

#### Scenario: Invalid signature or modified raw body
- **WHEN** signature verification fails, the signed timestamp is unacceptable, or the body differs from the signed raw bytes
- **THEN** the webhook is rejected without delivery-state, suppression, or order changes

#### Scenario: Duplicate and early webhook
- **WHEN** a verified webhook is replayed or arrives before the send response is correlated locally
- **THEN** one durable event is recorded and an early event awaits safe reconciliation without duplicate state effects or loss of evidence

#### Scenario: Complaint precedes delayed delivery
- **WHEN** a complaint/hard bounce has suppressed a recipient and an older accepted/delivered event arrives later
- **THEN** the adverse evidence and suppression remain effective and later queued/retried sends to that recipient are blocked

#### Scenario: Consumer crashes before acknowledgement
- **WHEN** webhook handling crashes around its durable inbox/state commit
- **THEN** provider replay applies any missing effects idempotently and no success acknowledgement is treated as durable before commit

### Requirement: Authorized test delivery and evidence boundaries

Real Resend API sends and Supabase SMTP sends SHALL be treated as external side effects even when labeled test; this change MUST NOT assume a fully isolated no-delivery Resend sandbox. C sending SHALL require explicit authorization, approved test-project/sender configuration, and a narrow allowlist of owner-controlled recipient addresses enforced before enqueue and again before dispatch. Missing Resend credentials, sender-domain authorization, Svix endpoint secret/reachable callback, Supabase SMTP, or recipient authorization SHALL block affected C evidence without weakening gates or sending to arbitrary real customers. No bulk sending or live enablement is in scope. A offline template/adapter tests, B isolated durable outbox/inbox/concurrency tests, C authorized external acceptance/webhook evidence, and D per-producer canonical business wiring SHALL be reported separately; unavailable producers SHALL remain D blocked even after a test email succeeds.

Secrets, OTPs, auth codes, provider tokens, raw app-session tokens, guest capabilities, private file URLs, and complete sensitive message bodies MUST NOT enter logs, traces, exception responses, or metric labels. Diagnostics SHALL use opaque event/message references, safe error classes, bounded/redacted metadata, and sanitized headers. This round SHALL write planning files only and MUST NOT execute code, initialize databases, deploy, log into remote services, send test email, or imply C/D acceptance.

#### Scenario: Unauthorized test recipient
- **WHEN** a test send targets an address outside the owner-controlled allowlist or lacks explicit external-send authorization
- **THEN** enqueue/dispatch is denied without contacting the email provider, even if credentials are present

#### Scenario: Revoked authorization while queued
- **WHEN** recipient allowlisting or external-send authorization is removed after enqueue but before dispatch/retry
- **THEN** the message remains blocked and no external send occurs

#### Scenario: Test send does not prove business wiring
- **WHEN** an authorized allowlisted message is accepted and receives a verified delivery webhook but canonical business producers are missing
- **THEN** only the demonstrated C integration evidence is recorded and the affected D mappings remain blocked

#### Scenario: Safe provider diagnostics
- **WHEN** an auth/email provider returns an error containing secrets, unsafe headers, or private URLs
- **THEN** logging and client responses expose only sanitized bounded metadata and no sensitive token, code, file address, or message body