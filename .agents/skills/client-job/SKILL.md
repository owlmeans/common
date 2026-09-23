---
name: client-job
description: How to consume sanitized application JobView projections in a browser with appendJobs, useJob/useJobs and one useJobFeed subscription. Auto-invoked when rendering application job status or importing @owlmeans/client-job.
user-invocable: false
---

# @owlmeans/client-job

**Layer:** Client
**Install:** `"@owlmeans/client-job": "^0.1.18-rc.24"` in `dependencies`

This package stores and streams `JobView` from `@owlmeans/job`. It has no dependency on
`@owlmeans/queue`; raw transport records, internal payloads, credentials, ownership fields and
stack traces must never reach it.

## Wiring

```typescript
import { appendJobs } from '@owlmeans/client-job'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendJobs<C, T>(context)
  return context
}
```

`appendJobs` registers a dedicated `StateAlias<JobView>` and is idempotent. The separate store
prevents an opaque operation id from colliding with an application resource id.

## Reading

```tsx
import { JobViewStatus } from '@owlmeans/job'
import { useJobFeed, useJobs } from '@owlmeans/client-job'

const { seeded, connected, error } = useJobFeed({
  root: REPORTS,
  query: { status: JobViewStatus.Running, size: 50 },
})
const running = useJobs({ status: JobViewStatus.Running })
const one = useJob(id)
```

- Mount `useJobFeed` once per screen. Each call owns a socket.
- `seeded` distinguishes an empty list from one not loaded yet.
- `error` is the list failure; `connected` reports the watch connection.
- Public query fields are `status`, `kind`, `page` and `size` only.
- `useJob` yields an empty model for an unseen id rather than throwing.
- `applyJobEvent` replaces a row with the complete sanitized view or removes its opaque id.

The server must expose the same alias root through `@owlmeans/job` declarations and an explicit
`@owlmeans/server-job` policy. Do not reconstruct queue names, raw ids or technical payload fields
in browser code.

## Key exports

| Export | Purpose |
|---|---|
| `appendJobs` | Register the `JobView` state resource |
| `useJob` / `useJobs` | Read public job views |
| `useJobFeed` | Seed list plus sanitized event subscription |
| `applyJobEvent` | Fold a `JobViewEvent` into a store |
| `JOBS` | Default store alias |

## Related

- `job` — safe contracts, schemas and route declarations
- `server-job` — policy-enforced technical-to-domain bridge
- `state` and `client-socket` — local storage and authenticated socket transport
