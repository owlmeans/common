# @owlmeans/server-job

The read side of a queue, as entrypoints an application elevates: list, get, cancel and a socket
that pushes lifecycle events. Jobs themselves are enqueued and processed through
[`@owlmeans/queue`](../queue) and its driver — nothing here produces or consumes work.

## Overview

- `declareJobEntrypoints(root, opts?)` — the four declarations, for the app's SHARED package
- `serveJobEntrypoints(entrypoints, root, opts?)` — elevate them with this package's handlers
- `listJobs` / `getJob` / `cancelJob` / `watchJobs` — the handlers, when an app elevates by hand
- A caller sees only the jobs it owns; the escape hatch is an option, not a hardcoded permission

## Installation

```bash
bun add @owlmeans/server-job@^0.1.18-rc.0
```

## Usage

Declare the group once, in the package both halves import:

```typescript
import { declareJobEntrypoints } from '@owlmeans/server-job'

export const REPORTS = 'reports'
export const entrypoints = [
  ...declareJobEntrypoints(REPORTS, { path: '/reports/jobs', parent: app.api.base }),
]
```

Serve it in the API process, alongside the queue driver it already wires:

```typescript
import { serveJobEntrypoints } from '@owlmeans/server-job'
import { appendRedisQueue } from '@owlmeans/redis-queue'

appendRedisQueue(context)
serveJobEntrypoints(entrypoints, REPORTS, { queue: REPORT_QUEUE })
context.registerEntrypoints(entrypoints)
```

Enqueue with the owner in the payload — that is what every read here filters on:

```typescript
await context.jobs<ReportJob, ReportResult>(REPORT_QUEUE).create({
  name: 'report:build',
  data: { owner: req.auth!.profileId ?? req.auth!.userId, target: id },
})
```

And report progress from the processor, so there is something to watch:

```typescript
worker.process(REPORT_QUEUE, 'report:build', async job => {
  for (const [done, page] of pages.entries()) {
    await job.touch()
    await job.progress({ done, total: pages.length })
    await render(page)
  }
  return { url }
})
```

## Ownership

`data.owner` (rename it with `ownerField`) is compared against `auth.profileId ?? auth.userId`.
A job that exists but belongs to someone else answers exactly as an absent one: `UnknownJob`.

An operator console passes a predicate instead of a permission name:

```typescript
serveJobEntrypoints(entrypoints, REPORTS, {
  queue: REPORT_QUEUE,
  admin: req => req.auth?.scopes?.includes('ops') === true,
})
```

## The one gotcha

A `JobEvent` carries no owner, so `watchJobs` attributes each frame by reading its job back. A
queue configured with `removeOnComplete` has nothing left to read when the completion arrives, and
an unattributable frame is dropped rather than fanned out. Leave completed jobs in place on any
queue that is watched.

## Depends On

- [`@owlmeans/queue`](../queue) — `ctx.jobs(queue)`, `JobRecord`, `JobEvent`, `UnknownJob`
- [`@owlmeans/server-api`](../server-api) — `handleRequest` / `handleParams`
- [`@owlmeans/server-socket`](../server-socket) — `handleConnection`
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `elevate`
- [`@owlmeans/auth-common`](../auth-common) — `DEFAULT_GUARD`

## Related

- [`@owlmeans/client-job`](../client-job) — the browser half that addresses these entrypoints
- [`@owlmeans/web-panel`](../web-panel) `./jobs` — `JobProgress`, `JobStatus`, `useJobToasts`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
