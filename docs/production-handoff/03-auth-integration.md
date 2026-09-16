# 03 — Authentication and ownership integration

Overall status: **PRODUCTION INTEGRATION REQUIRED**.

## Current accepted local model

Classification: **LOCAL CORE COMPLETE** for development/test only.

- Normalized email plus securely salted password hash.
- Unique durable local customer identity with concurrent-registration safety.
- Cryptographically random opaque session token; database stores only its hash.
- Session expiry, revoke, logout invalidation and cross-process recovery.
- Signed guest owner context with expiry and durable project/owner resource
  binding.
- Member Order reads require the original Order capability and a fresh matching
  active member session.
- Guest Orders, Carts, Drafts, uploads and receipts are not automatically
  migrated when a customer signs in.
- Same email alone never grants ownership.

This local model is not Supabase Auth and must not be enabled in production.

## Production target

| Requirement | Classification | Required work |
| --- | --- | --- |
| Supabase Auth project | NEEDS PRODUCTION VALUE | Approved project, Site URL, exact redirect allowlist and provider settings. |
| Email OTP | PRODUCTION INTEGRATION REQUIRED | Digital-code template, approved SMTP, rate limits, verify flow, BFF session and failure/reuse/expiry evidence. |
| Google OAuth | PRODUCTION INTEGRATION REQUIRED | Google client/consent, Supabase provider, PKCE callback, state/replay checks and exact redirects. |
| Server session boundary | PRODUCTION INTEGRATION REQUIRED | Keep provider access/refresh tokens server-owned; define refresh, revoke, expiry and SSR/API current-session behavior. |
| Subject mapping | PRODUCTION INTEGRATION REQUIRED | Map stable provider subject to canonical customer owner without email becoming resource authority. |
| Guest continuity | LOCAL CORE COMPLETE | Preserve original guest resource and Order-capability semantics unless a separately approved claim transaction applies. |
| Admin identity | NEEDS PROVIDER DECISION | Separate production Admin identity/role/session; do not reuse customer or local password authority. |

## Historical guest Order association decision

The product requirements request automatic association of historical guest
Orders when a verified member has the same email. This conflicts with the
accepted local rule that email is not ownership authority.

Classification: **DEFERRED / NOT AUTHORIZED** until an explicit reviewed
identity-claim/migration contract is approved.

That contract must define:

1. Which Order states and resources are eligible.
2. Verified-email and provider-subject requirements.
3. Whether current browser guest proof is required.
4. Exclusion of already-owned or conflicting Orders.
5. Cart/Draft/upload/receipt behavior—no implicit transfer.
6. Transactional idempotency, concurrency and rollback.
7. Audit records and customer-visible explanation.
8. Revocation, account recovery and provider-account-linking behavior.
9. Backfill scope and explicit C1/Phase C/canonical schema approval.

Never implement this as `UPDATE owner_id WHERE email = ...`, public-reference
lookup, or email-only grant creation.

## Acceptance checklist

- [ ] OTP issuance and verification use approved real SMTP and never log codes.
- [ ] Google callback uses PKCE/state and exact environment redirects.
- [ ] Browser never receives provider refresh tokens or service credentials.
- [ ] Refresh/logout/revoke work across two live application instances.
- [ ] Forged, expired and wrong-environment sessions fail closed.
- [ ] Guest and member resources remain isolated without an approved claim.
- [ ] Approved claim flow, if any, is atomic, idempotent and audited.
- [ ] Account deletion/privacy handling has a reviewed data-retention contract.
