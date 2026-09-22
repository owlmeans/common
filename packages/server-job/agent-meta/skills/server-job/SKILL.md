---
name: server-job
description: How to expose technical queue work as sanitized application JobView data through a mandatory authenticated policy. Auto-invoked when binding @owlmeans/server-job or building UI-visible application job status.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-job

**Layer:** Server
**Install:** `"@owlmeans/server-job": "^0.1.18-rc.23"` in `dependencies`

This package is the boundary between technical `@owlmeans/queue` records and the safe
`@owlmeans/job` contract. `serveJobEntrypoints` requires a `JobExposurePolicy`; there is no default
owner field, administrator bypass or raw-record response.

## Declare the public contract

Declare routes with `@owlmeans/job`, in the narrow package shared by this API and its client:

```typescript
import { declareJobEntrypoints } from '@owlmeans/job'

export const reportJobs = declareJobEntrypoints('report-jobs', {
  path: '/reports/jobs', parent: api.reports.base,
})
```

These are ordinary guarded HTTP/WS declarations. They carry no queue name or broker option.

## Bind the bridge

```typescript
import { jobViewOf, serveJobEntrypoints } from '@owlmeans/server-job'

export const reportJobBindings = serveJobEntrypoints(reportJobs, {
  queue: REPORT_QUEUE,
  policy: {
    audience: req => ({ userId: requireUserId(req) }),
    where: (audience, query) => ({
      $and: [
        { 'data.ownerId': audience.userId },
        ...(query.kind == null ? [] : [{ name: internalNameOf(query.kind) }]),
      ],
    }),
    lookup: async (id, audience, resource) =>
      resource.load({ publicId: id, 'data.ownerId': audience.userId }),
    map: record => jobViewOf(record, {
      id: publicIdOf(record),
      kind: publicKindOf(record),
      summary: publicSummaryOf(record),
      metadata: allowlistedMetadataOf(record),
      result: publicResultOf(record),
    }),
    cancel: (record, audience) => ownerIdOf(record) === audience.userId,
  },
})
```

Every policy part is load-bearing:

| Part | Rule |
|---|---|
| `audience` | Derive authenticated application scope; never trust a body owner id |
| `where` | Translate the closed public query into criteria that always include that scope |
| `lookup` | Resolve an opaque public id only inside the same scope |
| `map` | Explicitly allowlist public fields and return `JobView` |
| `cancel` | Optional; absence or `false` denies cancellation |

`jobViewOf` maps technical states and timestamps, copies only fields the application supplies,
bounds JSON depth/item/string size, strips prototype keys and non-JSON values, and never copies a
raw failure. Use `publicJobError()` unless an application-safe message is explicitly available.

List, get, cancel and watch all use the same policy. A foreign id answers the same as an absent
one. Watch reloads each event inside the audience scope and emits only `JobViewEvent`; an event that
cannot be attributed is dropped. Keep completed records long enough for their completion event to
be projected.

## Key exports

| Export | Purpose |
|---|---|
| `serveJobEntrypoints` | Bind list/get/cancel/watch using a mandatory policy |
| `listJobs` / `getJob` / `cancelJob` / `watchJobs` | Bind one handler manually |
| `jobViewOf` | Safe record-to-view mapper |
| `sanitizeJobJson` / `publicJobError` | Bounded JSON and safe failure helpers |
| `JobExposurePolicy` / `JobHandlerOptions` | Application policy contracts |

## Related

- `job` — the safe shared contract
- `client-job` — browser state over `JobView`
- `queue` and `redis-queue` — backend-only execution and storage
