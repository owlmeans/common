---
name: client-job
description: How to use @owlmeans/client-job — appendJobs() to register the job store, useJob/useJobs to read it, and useJobFeed() to mount the socket subscription and seed it from the list entrypoint. Auto-invoked when showing queue job progress in a browser client or importing job hooks.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-job

**Layer:** Client
**Install:** `"@owlmeans/client-job": "^0.1.18-rc.0"` in `dependencies`

The browser half of a job feed. It holds `JobRecord`s in a `@owlmeans/state` store, keeps that
store current from the entrypoints `@owlmeans/server-job` declares, and hands screens the ordinary
state hooks. Rendering is `@owlmeans/web-panel/jobs`.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendJobs(context, alias?)` | Register the job store on the client context |
| `useJob(id, resource?)` | One job, live — an unknown id yields an `empty` model, never a throw |
| `useJobs(filter?, opts?)` | A live query over the store, newest first unless `opts.sort` says otherwise |
| `useJobFeed(opts?)` | Mount the socket and seed the store. **Once per screen** |
| `applyJobEvent(store, event)` | The fold one `JobEvent` performs, for a feed of your own |
| `jobEntrypointAliases(root?)` | `{ base, list, get, cancel, watch }` — the same shape the server declares |
| `JOBS` | The store's alias (`job-state`), typed as `StateAlias<JobRecord>` |
| Constants | `DEFAULT_JOB_ROOT` (`jobs`), `JOB_EVENT` (`job-event`) |

## Wiring

```typescript
import { appendJobs } from '@owlmeans/client-job'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendJobs<C, T>(context)
  return context
}
```

Jobs get a store of their own rather than the context's default one: a job id is the broker's, and
sharing an id space with the app's records is how a completed job overwrites an unrelated row.
`appendJobs` is idempotent like every `append*`.

## Reading

```tsx
const { seeded, connected } = useJobFeed({ root: REPORTS })

const running = useJobs({ state: [JobState.Waiting, JobState.Active] })
const mine = useJobs({ 'data.target': projectId })
const one = useJob(id)
```

The criteria language is the resource one, so a filter written for the list entrypoint means the
same thing applied locally, and a dotted key reaches into the payload. `seeded` is what tells "no
jobs" apart from "not loaded yet" — `useJob` answers an `empty` model for an id the store has not
seen, which is a loading state and not an error.

## What `useJobFeed` does

1. Opens the watch socket through `@owlmeans/client-auth`'s `useWs`, which puts the current token
   on the connection query — the watch entrypoint is guarded, and the server derives ownership
   from that token.
2. Calls the list entrypoint once and writes the answer with **`store.replace`**, not a run of
   saves: it is the server saying what exists, so a job cancelled from another tab has to LEAVE the
   store, and one write wakes the subscribers once instead of once per record.
3. Folds each `JobEvent` frame in with `applyJobEvent` — merged over the record the store holds,
   because an event carries only what changed while `save` replaces.

Two details the fold gets right and a hand-written one usually does not: a progress frame never
moves a settled job back to `Active` (the completion and the last progress ping race), and an empty
`JobEvent.name` never overwrites a known one (the contract sends empty when the job is already
gone).

## The one gotcha

**`useJobFeed` opens a socket per call.** Mount it once, high enough that everything showing jobs
sits under it, and read the store everywhere else. Two feeds make the server push every event twice
and re-seed over each other.

## Depends On

- `@owlmeans/state` — the store, `replace` and the `StateModel` commit rules
- `@owlmeans/client` — `useStoreModel`, `useStoreList`, `useContext`
- `@owlmeans/client-auth` — `useWs` (the token-carrying socket)
- `@owlmeans/queue` — `JobRecord`, `JobEvent`, `JobState`, `isSettled`

## Related

- `server-job` — the entrypoints this addresses, and the ownership rule that decides what arrives
- `state` — the store contract; `client-socket` — how the connection is addressed
- `web-panel` — `./jobs` (`JobProgress`, `JobStatus`, `useJobToasts`)
