# Local Contact Message

The Contact page submits to `POST /api/local-contact` only when
`LOCAL_CONTACT_SOURCE=local_fake` is selected in the ignored `.env.local`
file during development or tests. The server validates bounded name, email,
optional public Order reference, and message fields, then stores a
server-owned `received` record in process memory.

The response means only that the local application received the message. No
email is sent, no provider is contacted, and no automatic Order lookup or
refund is created. The public Order reference is an identifier, not
authorization. Browser-supplied status, identity, timestamp, provider, and
delivery fields are rejected.

Process-memory messages are lost when the server restarts. Production rejects
`local_fake` and does not silently fall back to it. A production contact
channel would require an explicit persistence, privacy, abuse-prevention,
rate-limiting, and email/provider decision.

Focused contract test:

```sh
node --experimental-strip-types --test tests/local-contact.test.mjs
```
