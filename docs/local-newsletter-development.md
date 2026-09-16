# Local Newsletter Signup

The Home **Join the atelier** form is a local development/test signup. Set
`LOCAL_NEWSLETTER_SOURCE=local_fake` in the ignored `.env.local` file while
running the local server. Leave it empty or disabled when this capability is
not being exercised.

The server trims and lowercases the submitted email, validates its bounded
shape, and stores one `subscribed` record in a process-memory repository.
Submitting the same normalized email again returns `already_subscribed` and
does not create another record. The browser submits only the email; it cannot
choose the source or provide subscription identity, timestamps, coupons,
discounts, or provider fields.

This is a development/test-only capability. The local repository is lost when
the server process restarts, and the UI must describe the result as saved for
the local demo. No marketing email, coupon, discount, or external provider is
used or implied. Production rejects `local_fake` and does not silently fall
back to it; any future production provider would need an explicit server-side
source, persistence, privacy, and rate-limiting decision.

Run the focused contract tests with:

```sh
node --experimental-strip-types --test tests/local-newsletter.test.mjs
```
