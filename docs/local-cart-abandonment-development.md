# Local Cart Abandonment Boundary

This document records the LOCAL V1 boundary for abandoned-cart recovery.

## Current local result

The current Cart is an anonymous, process-memory session identified by the
host-only `figmemento-local-cart` cookie. It has no durable customer ownership,
last-activity timestamp, consented contact destination, or background scheduler.
The existing notification outbox is therefore not allowed to infer an abandoned
Cart or pretend that an email was sent.

**LOCAL EVENT MODEL COMPLETE — PRODUCTION SCHEDULER DEFERRED**

The local V1 implementation intentionally does not emit `cart_abandoned` from a
timer, browser unload, or guessed elapsed time. A future local simulation may
accept an explicit test clock and an explicitly owned recipient, but it must
remain server-owned, deterministic, idempotent, and visibly local.

## Deferred production dependencies

- durable Cart/session activity persistence;
- authenticated or consented recipient ownership;
- retention and privacy policy;
- production scheduler/worker;
- transactional email provider and sender approval.

No external email, analytics, carrier, payment, or production database is
activated by this local boundary.
