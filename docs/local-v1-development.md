# FigMemento Local Ecommerce V1

This repository supports a local development/test V1 only. Local customer
accounts, Cart, Checkout, Local Order, simulated Payment, Fulfillment,
Supplier, Tracking, Contact, Newsletter, Reviews, Points, notifications, and
analytics use explicit process-memory boundaries where enabled by the local
environment. Restarting the server clears local records.

## Customer-facing capabilities

- Guest and local-account checkout remain available.
- `/login`, `/register`, and `/account` use the development-only customer
  provider when `CUSTOMER_AUTH_SOURCE=local_fake` is enabled.
- Account order history is read from the canonical Local Order store and is
  filtered by the authenticated server session.
- Points are earned after a successful local Payment, and redemption is capped
  by the local promotion policy. This policy is not a production commercial
  approval.
- Product Reviews are accepted only for an authenticated customer whose
  canonical Local Order has reached local Tracking `delivered`.
- Contact and Newsletter forms create local records only. They do not send
  email.

## Local operations

`/local-admin` is a development/test index for the existing Admin, Fulfillment,
Tracking, Supplier, Account, local notification outbox, and provider-neutral
analytics event log. Notification status is always `queued_local`; analytics
never connects to GA4, Meta, TikTok, or another remote provider.

## Explicit non-goals

This V1 does not claim production readiness and does not activate Stripe,
PayPal, Supabase persistence, object storage, email delivery, carrier APIs,
supplier procurement, migration/backfill, deployment, DNS, or production
analytics. Supplier demo mappings remain development/test-only and require
separate business approval before any real supplier use.
