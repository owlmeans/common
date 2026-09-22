# @owlmeans/client-job

Browser state and hooks for the sanitized application-job contract from `@owlmeans/job`. This
package has no queue dependency and never receives transport records, credentials, ownership
fields, stack traces or internal payloads.

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

- `appendJobs(context, alias?)` registers a dedicated `JobView` store.
- `useJob(id)` and `useJobs(filter)` read safe public views.
- `useJobFeed(opts?)` seeds from list and applies `JobViewEvent` socket frames.
- `applyJobEvent(store, event)` is the public-view fold for a custom feed.

Mount `useJobFeed` once per screen; every call owns a socket. Public filtering is limited to
`status`, `kind`, `page` and `size`. A server must expose the matching routes through an explicit
`@owlmeans/server-job` policy.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.34
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
