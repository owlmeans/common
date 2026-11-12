# @owlmeans/client-job

Browser state and React hooks for the sanitized application-job contract from @owlmeans/job: a
dedicated job store, live job queries and one socket feed per screen. A web app uses it to show the
status of background operations. This package has no queue dependency and never receives transport
records, credentials, ownership fields, stack traces or internal payloads; the server side that
exposes jobs under an explicit policy is @owlmeans/server-job.

## Installation

```bash
bun add @owlmeans/client-job@^0.2.0-alpha.0
```

Peer dependency: `react`.

## Concepts

- **`JobView` only** — the store holds the public view from `@owlmeans/job` (`id`, `kind`,
  `status`, `progress`, `summary`, `metadata`, `result`, `error`, `cancellable`, timestamps). Do not
  reconstruct queue names, raw ids or technical payload fields in browser code.
- **Dedicated store** — `appendJobs(context, alias?)` registers a separate `JobView` store (`JOBS`
  by default). Opaque job ids are their own namespace, so they never collide with an application
  resource id. It is idempotent: a second call keeps what the store already collected.
- **Seed, then stream** — `useJobFeed(opts?)` seeds the store from the list entrypoint with one
  `replace` (a job removed elsewhere leaves the store) and then applies `JobViewEvent` socket frames.
  The socket comes from `@owlmeans/client-auth`'s `useWs`, which puts the current token on the
  connection; the server derives ownership from that token.
- **Readers** — `useJob(id)` and `useJobs(filter)` read safe public views from the store. `useJob`
  returns an empty model for an id the store has not seen rather than throwing; `useJobs` sorts
  newest first (`createdAt` desc) unless told otherwise.
- **Feed state** — `seeded` tells "no jobs" from "not loaded yet", `error` is the list failure and
  `connected` reports the watch socket.
- **Event fold** — `applyJobEvent(store, event)` is the public-view fold for a custom feed: an
  `upsert` replaces the row with the complete sanitized view (and writes one for an unseen id, so an
  operation started in another tab shows up), a `remove` deletes the opaque id.

## Usage

### 1. Register the store in `makeContext`

```typescript
import { appendJobs } from '@owlmeans/client-job'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendJobs<C, T>(context)
  return context
}
```

### 2. Mount the feed once and read the store

```tsx
import { JobViewStatus } from '@owlmeans/job'
import { useJobFeed, useJobs } from '@owlmeans/client-job'

export const Operations = () => {
  const { seeded, error } = useJobFeed({ root: REPORTS, query: { size: 50 } })
  const running = useJobs({ status: JobViewStatus.Running })

  if (error != null) return <p>Operations could not be loaded.</p>
  if (!seeded) return <Spinner />
  return <ul>{running.map(model => <li key={model.id}>{model.record.summary}</li>)}</ul>
}
```

`REPORTS` is the alias root the job group was declared under with `@owlmeans/job`; omit `root` for
`DEFAULT_JOB_ROOT` (`'jobs'`). Components below the feed read one job with `useJob(id)` and need no
connection of their own.

### 3. Fold events from a custom feed

```typescript
import type { JobViewEvent } from '@owlmeans/job'
import { applyJobEvent, JOB_EVENT, JOBS } from '@owlmeans/client-job'

const store = context.getStateResource(JOBS)
const unsubscribe = connection.observe<JobViewEvent>(JOB_EVENT, async message => {
  await applyJobEvent(store, message.payload)
})
```

## API

| Export | Kind | Purpose |
|---|---|---|
| `appendJobs(context, alias?)` | function | Register the dedicated `JobView` store (idempotent) |
| `useJob(id?, resource?)` | hook → `StateModel<JobView>` | One job, live; empty model for an unseen id |
| `useJobs(filter?, opts?)` | hook → `StateModel<JobView>[]` | Live query over the store; newest first by default |
| `useJobFeed(opts?)` | hook → `JobFeed` | Seed from the list entrypoint and apply `JobViewEvent` socket frames; one socket per call |
| `applyJobEvent(store, event)` | function | Fold one `JobViewEvent` (`upsert` / `remove`) into a store |
| `JOBS` | const | Default store alias (`'job-state'`) every hook reads |
| `DEFAULT_JOB_ROOT`, `JOB_EVENT`, `jobEntrypointAliases(root?)` | re-export from `@owlmeans/job` | `'jobs'`, `'job-event'`, and the `base` / `list` / `get` / `cancel` / `watch` aliases of a root |
| `JobFeed` | type | `{ connected, seeded, error }` |
| `JobFeedOptions` | type | `root?`, `resource?`, `query?` (`JobListQuery`) |
| `UseJobsOptions` | type | `sort?`, `resource?` |
| `JobFilter` | type | `Criteria<JobView>` — the resource criteria `useJobs` takes |
| `Config`, `Context` | type | The client config and context this package extends |

## Common pitfalls

- Mount `useJobFeed` once per screen. Every call opens its own socket, and two feeds make the
  server fan the same events out twice.
- Public filtering is limited to `status`, `kind`, `page` and `size` (the feed's `query`).
- A server must expose the matching routes through an explicit `@owlmeans/server-job` policy, under
  the same alias root the client passes as `root`.
- A store registered under a custom alias must be passed as `resource` to `useJobFeed`, `useJob` and
  `useJobs`; they read `JOBS` otherwise.
- The feed re-seeds when the `query` changes by content, not by identity — a fresh object literal
  per render does not re-fetch.

## Related packages

- [`@owlmeans/job`](../job) — `JobView`, `JobViewEvent`, schemas and entrypoint declarations
- [`@owlmeans/server-job`](../server-job) — the policy-enforced server bridge that exposes jobs
- [`@owlmeans/state`](../state) — `appendStateResource`, `StateAlias`, `StateModel`
- [`@owlmeans/client`](../client) — `useStoreModel`, `useStoreList` and the client context
- [`@owlmeans/client-auth`](../client-auth) — `useWs`, the authenticated socket the feed opens

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
