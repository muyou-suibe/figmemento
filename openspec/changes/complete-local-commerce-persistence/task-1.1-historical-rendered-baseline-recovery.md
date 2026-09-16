# Task 1.1 historical rendered baseline recovery

Status: **PASS — INDEPENDENTLY ACCEPTED**

Task 1.1 was independently accepted and is checked complete. This artifact
recovers the contemporaneous individual failure records behind the historical
`7/11` rendered result.

## Contemporaneous source

- Source: `/Users/youmu/.codex/sessions/2026/08/07/rollout-2026-08-07T09-35-08-019fd9dc-19c0-7543-bb24-5231f3cd2a01.jsonl`
- JSONL line: `100087`
- Independently inspectable minimal extract:
  `task-1.1-historical-command-event.jsonl`
- Event timestamp: `2026-09-10T06:04:49.629Z`
- Event type: `CommandExecution`
- Primary payload: `payload.item.stdout`
- Duplicate retained payloads in the same event: `payload.item.aggregated_output`
  and `payload.item.formatted_output`

This is contemporaneous evidence because the retained event is the raw command
execution result written at the time of the historical validation. The event's
top-level `payload.item.command` is `npm run verify`; its stdout contains the
fresh build immediately followed by the `test:rendered` lifecycle stage, exact
Node test command, complete TAP result, aggregate count and four failure
records. It is not a later summary and no failure identity was reconstructed
from current tests.

The standalone extract retains the original top-level event type and exact
values of `payload.item.type`, `command`, `stdout`, `aggregated_output` and
`formatted_output`. The parent command is present in `command`; it is not
inserted into or reconstructed inside the original stdout.

## Historical command and aggregate

```text
parent command: npm run verify
npm lifecycle stage: test:rendered
node --test tests/rendered-html.test.mjs tests/shopping-cart-rendered.test.mjs tests/local-fulfillment-rendered.test.mjs tests/local-tracking-rendered.test.mjs tests/figmemento-fusion-shell-rendered.test.mjs

tests 11
pass 7
fail 4
cancelled 0
skipped 0
todo 0
duration_ms 295.589167
```

## Recovered failure records

### 1. Fusion shell and safe unavailable state

- Test location: `tests/figmemento-fusion-shell-rendered.test.mjs:15:1`
- Test name: `rendered real routes expose the Fusion shell and safe unavailable state`
- Historical duration: `97.361959ms`
- Historical status: **FAIL**
- Actual output:

  ```text
  [Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.] { digest: '718529982' }
  ```

- Cause supported by the artifact: a Server Components render failed; the
  production build intentionally omitted the underlying message and exposed
  digest `718529982`. No deeper root cause is asserted.

### 2. Unavailable Catalog safe state

- Test location: `tests/figmemento-fusion-shell-rendered.test.mjs:38:1`
- Test name: `rendered unavailable catalog keeps the existing safe state and no fixture substitution`
- Historical duration: `24.374ms`
- Historical status: **FAIL**
- Actual output:

  ```text
  [Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.] { digest: '1129843323' }
  ```

- Cause supported by the artifact: a Server Components render failed; the
  production build intentionally omitted the underlying message and exposed
  digest `1129843323`. No deeper root cause is asserted.

### 3. V2 routes shared shell and safe states

- Test location: `tests/rendered-html.test.mjs:33:1`
- Test name: `server-rendered V2 routes preserve the shared presentation shell and safe states`
- Historical duration: `27.722167ms`
- Historical status: **FAIL**
- Actual output:

  ```text
  [Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.] { digest: '2821852582' }
  ```

- Cause supported by the artifact: a Server Components render failed; the
  production build intentionally omitted the underlying message and exposed
  digest `2821852582`. No deeper root cause is asserted.

### 4. Local V1 customer and support entry surfaces

- Test location: `tests/rendered-html.test.mjs:77:1`
- Test name: `server-renders Local V1 customer and support entry surfaces`
- Historical duration: `111.495083ms`
- Historical status: **FAIL**
- Actual output:

  ```text
  [Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.] { digest: '1080760043' }
  ```

- Cause supported by the artifact: a Server Components render failed; the
  production build intentionally omitted the underlying message and exposed
  digest `1080760043`. No deeper root cause is asserted.

## Historical status versus present-day status

All four records above were failures at the `2026-09-10T06:04:49.629Z`
historical baseline. Present-day rendered validation is a separate fact and
must not rewrite those historical statuses. A current `11/11` pass demonstrates
the current tree only; it is not used to infer the historical failures or their
resolution path.

## Search reconciliation

The earlier repository evidence audit correctly found only aggregate references
in checked-in evidence, Git history/objects and retained report directories.
The individual records were subsequently recovered from the contemporaneous
local Codex command-execution event above. Unrelated `7 pass / 4 fail` suites
were excluded unless their retained command was exactly `npm run test:rendered`.

No application code, business authority, schema, migration, fixture, remote
service or production system was modified or accessed for this recovery.
