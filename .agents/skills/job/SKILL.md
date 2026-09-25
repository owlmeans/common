---
name: job
description: How to model UI-visible application jobs with the browser-safe @owlmeans/job contract, schemas and abstract HTTP/WS entrypoints. Auto-invoked when sharing job status between a server and browser without exposing queue mechanics.
user-invocable: false
---

# @owlmeans/job

**Layer:** Shared domain contract
**Install:** `"@owlmeans/job": "^0.1.18-rc.8"` in `dependencies`

Use this package only when jobs are part of the application's domain—for example, an operator
screen that manages imports or an account screen that follows an export. It is not a queue API.

## Boundary

`JobView` is the only shape allowed across the browser boundary. It contains:

- opaque `id` and application-owned `kind`;
- normalized `JobViewStatus`;
- bounded public progress, summary, metadata, result and error;
- `cancellable` and public timestamps.

It deliberately has no queue name, processor name, technical id, payload, ownership field,
credential, retry/lock option, driver state or stack trace. Its schemas are closed against extra
top-level fields.

## Entrypoints

```typescript
import { declareJobEntrypoints } from '@owlmeans/job'

export const reportJobs = declareJobEntrypoints('report-jobs', {
  path: '/reports/jobs',
  parent: api.reports.base,
})
```

The returned `base`, `list`, `get`, `cancel` and `watch` declarations use only ordinary guarded
HTTP/WS routes. They carry no queue transport options. Aliases are derived with
`jobEntrypointAliases(root)` so client and server agree without importing backend code.

Public list filters are closed to `status`, `kind`, `page` and `size`. Do not add arbitrary
criteria or technical fields to the shared query. A product-specific filter belongs in a safe
domain field and must be translated by the server policy.

## Required halves

- Bind the declarations with `@owlmeans/server-job` and a mandatory `JobExposurePolicy` that
  authenticates, scopes, resolves opaque ids, allowlists output and approves cancellation.
- Consume them with `@owlmeans/client-job`, which stores only `JobView` and `JobViewEvent`.
- Keep `@owlmeans/queue` and its driver in backend packages only.

## Key exports

| Export | Purpose |
|---|---|
| `JobView` / `JobViewStatus` | Public application job model |
| `JobViewSchema` / `JobViewListSchema` | Closed response validation |
| `JobListQuery` / `JobListQuerySchema` | Closed public filtering |
| `JobViewEvent` / `JOB_EVENT` | Sanitized socket frames |
| `declareJobEntrypoints` | Abstract HTTP/WS protocol group |
| `jobEntrypointAliases` | Stable derived aliases |

## Related

- `server-job` — backend mapper and policy bridge
- `client-job` — browser store and hooks
- `route` — generic routes remain transport-agnostic
