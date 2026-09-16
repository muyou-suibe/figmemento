# 10 — Production end-to-end readiness checklist

Status: **PRODUCTION INTEGRATION REQUIRED — NOT EXECUTED**.

This is a future production-like acceptance plan. Every row must record three
separate outcomes: external/provider result, canonical server/business result
and durable database/private-object result. A UI success message alone cannot
pass a row.

## Preconditions

- [ ] Exact staging/production-like environment and project identities recorded.
- [ ] Approved canonical migrations applied through reviewed procedure.
- [ ] Provider test/sandbox credentials and callbacks approved.
- [ ] Real production-like Product/SKU/configuration and business rules loaded.
- [ ] Synthetic/test/customer data separation and cleanup/retention approved.
- [ ] Logging, monitoring, backup and rollback are operational.
- [ ] Desktop and mobile browsers selected; cross-user profiles isolated.

## Journey matrix

| Step | Classification | External result | Server/business result | Durable result | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| Public Product | BUSINESS CONFIGURATION REQUIRED | CDN/browser serves correct page/assets | Exact published Product/SKU/config resolved | Canonical Catalog revision identifiable | URL, screenshot, server trace, safe DB projection |
| Guest identity | PRODUCTION INTEGRATION REQUIRED | Browser receives secure guest context | Guest owner verified server-side | Owner/project binding durable | Cookie attributes and bounded DB evidence |
| Member OTP/Google | PRODUCTION INTEGRATION REQUIRED | Provider authenticates approved test user | Stable subject/current session established | Session/subject mapping durable | Provider + app + DB correlation without tokens |
| Browser upload | PRODUCTION INTEGRATION REQUIRED | Real file upload completes | MIME/bytes/dimensions/field/owner verified | Private original receipt ready | Network, digest/size and private-access denial |
| Crop/derived media | PRODUCTION INTEGRATION REQUIRED | Preview displayed on desktop/mobile | Stable slot/generation/crop accepted | Derived private bytes and Draft revision durable | Screenshot plus digest/crop/read-back |
| Cart | LOCAL CORE COMPLETE | Line visible and editable | Server accepts exact Product/SKU/config and CAS | Cart/line/version persisted | UI/network/DB safe projection |
| Checkout | PRODUCTION INTEGRATION REQUIRED | Address/method/coupon UX completes | Fresh canonical price/discount/shipping validation | Accepted facts available for atomic Order command | Server calculation and rule-version evidence |
| Stripe or PayPal initiation | PRODUCTION INTEGRATION REQUIRED | Provider test/sandbox transaction created | Exact Order/amount/currency/provider binding verified | Payment attempt/action durable | Redacted provider and DB correlation |
| Signed webhook/reconciliation | PRODUCTION INTEGRATION REQUIRED | Genuine signed event/retrieve succeeds | One canonical payment winner; duplicates bounded | Inbox/action/paid transition committed once | Event IDs redacted, replay evidence |
| Order | LOCAL CORE COMPLETE | Success page uses safe reference | Immutable purchase snapshots and capability issued | Order/items/receipt attachments/grants durable | Sanitized snapshot digest and access tests |
| Transactional email | PRODUCTION INTEGRATION REQUIRED | Provider accepted/delivered; inbox observation separate | Correct canonical trigger/recipient/template chosen | Outbox/message/callback/suppression durable | Provider ID plus message/audit projection |
| Photo review | LOCAL CORE COMPLETE | Authorized Admin/operator can decide | Exact applicable item review accepted/rejected | Review/action/audit durable | UI/network/DB evidence |
| Production preview | LOCAL CORE COMPLETE | Customer reads private complete preview | Exact current manifest/version authorized | Manifest/entries/current pointer durable | Private-byte digest and manifest projection |
| Approval/revision | LOCAL CORE COMPLETE | Customer approves or requests revision | Original capability/session/version checked | Decision/counter/action atomic; max two revisions | v1→v3 and replay/conflict evidence |
| Production/QC | LOCAL CORE COMPLETE | Operator actions available only when eligible | Paid/review/preview gates rechecked | Fulfillment lifecycle/version/audit durable | Gate-negative and positive evidence |
| Shipment | PRODUCTION INTEGRATION REQUIRED | Real or approved manual carrier/tracking assigned | Physical-only QC/paid gates rechecked | Unique Shipment and event committed | Provider/manual record + DB projection |
| Tracking | PRODUCTION INTEGRATION REQUIRED | Real provider update/poll/webhook observed | Event normalized through canonical command | Ordered event/status/idempotency durable | Provider correlation and customer safe view |
| Digital publication/download | PRODUCTION INTEGRATION REQUIRED | Private file published and authorized user receives bytes | Paid/item/review/preview/ticket/grant/quota gates pass | Version/grant/ticket/claim/stream audit durable | Digest/headers/quota and replay denial |
| Cross-user denial | LOCAL CORE COMPLETE | Foreign profiles receive bounded rejection | No resource existence or private data disclosed | Zero mutation/audit as designed | HTTP matrix and DB before/after |
| Admin journey | PRODUCTION INTEGRATION REQUIRED | Real Admin identity accesses approved controls | Same-origin/role/action gates pass | Audit and canonical mutation durable | Auth trace, UI and DB evidence |
| Analytics | PRODUCTION INTEGRATION REQUIRED | GA4/Meta/TikTok debug receives safe events | Purchase uses canonical paid facts | Dedup/event record as designed | Provider debug and payload privacy review |
| Monitoring/recovery | PRODUCTION INTEGRATION REQUIRED | Alert fires for injected bounded failure | Application fails closed/reconciles truthfully | No partial state; recovery evidence retained | Alert, logs, DB/object comparison |

## Required variants

- [ ] Physical preview-required Order through delivered tracking.
- [ ] Digital Order through private publication and quota-accounted download.
- [ ] Mixed Order with physical shipping and independent digital eligibility.
- [ ] Guest purchase.
- [ ] Member purchase without re-login during recovery validation.
- [ ] One preview revision and the two-revision limit.
- [ ] Payment failure, cancel, duplicate webhook and lost response.
- [ ] Upload/helper/Storage failure and retry/reconciliation.
- [ ] Cross-user, forged credential and direct-object denial.
- [ ] Desktop and 375px mobile, including keyboard-accessible alternatives.
- [ ] Application restart and two-live-instance race on the production-like stack.

## Final launch gate

Do not call production ready until every applicable row is PASS with all three
outcome layers, every blocked provider/business decision is closed, security
and rollback are independently reviewed, and at least one authorized full
production-like transaction reaches its intended terminal state.

An explicitly approved small live transaction requires separate owner and
financial authorization; this document does not grant it.
