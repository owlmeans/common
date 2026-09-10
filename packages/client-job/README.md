# @owlmeans/client-job

The browser half of a job feed: a state store holding `JobRecord`s, hooks to read it, and one
socket subscription that keeps it current. It addresses the entrypoints
[`@owlmeans/server-job`](../server-job) declares.

## Overview

- `appendJobs(context, alias?)` — register the job store on the client context
- `useJob(id)` / `useJobs(filter)` — live reads over that store
- `useJobFeed(opts?)` — one socket plus one seeding list call; mount it ONCE per screen
- `applyJobEvent(store, event)` — the fold, for a feed of your own

## Installation

```bash
bun add @owlmeans/client-job@^0.1.18-rc.0
```

## Usage

```typescript
import { appendJobs } from '@owlmeans/client-job'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendJobs<C, T>(context)
  return context
}
```

```tsx
import { useJobFeed, useJobs } from '@owlmeans/client-job'
import { JobProgress, JobStatus, useJobToasts } from '@owlmeans/web-panel/jobs'
import { JobState } from '@owlmeans/queue'

export const Jobs: FC = () => {
  const { seeded } = useJobFeed({ root: REPORTS })
  const jobs = useJobs({ state: [JobState.Waiting, JobState.Active] })
  useJobToasts(jobs.map(job => job.record))

  return seeded
    ? <ul>{jobs.map(job => <li key={job.id}>
      <JobStatus job={job.record} /><JobProgress job={job.record} />
    </li>)}</ul>
    : <Spinner/>
}
```

## The one gotcha

`useJobFeed` opens a socket per call. Mount it once, high enough that everything showing jobs sits
under it, and read the store everywhere else — a second feed makes the server push every event
twice and doubles what the screen reacts to.

## Depends On

- [`@owlmeans/state`](../state) — the store; [`@owlmeans/client`](../client) — `useStoreModel` / `useStoreList`
- [`@owlmeans/client-auth`](../client-auth) — `useWs`, which puts the token on the socket query
- [`@owlmeans/queue`](../queue) — `JobRecord`, `JobEvent`, `JobState`

## Related

- [`@owlmeans/server-job`](../server-job) — the entrypoints this addresses
- [`@owlmeans/web-panel`](../web-panel) `./jobs` — the components to render what it collects

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
