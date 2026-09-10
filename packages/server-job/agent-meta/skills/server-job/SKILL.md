---
name: server-job
description: How to use @owlmeans/server-job — declaring and elevating the list/get/cancel/watch entrypoints over a queue, the ownership rule that scopes them to the authenticated subject, the admin escape hatch, and the socket that pushes JobEvent frames. Auto-invoked when exposing queue jobs to an application's UI or importing job entrypoint helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-job

**Layer:** Server
**Install:** `"@owlmeans/server-job": "^0.1.18-rc.0"` in `dependencies`

The READ side of a queue. `@owlmeans/queue` and its driver enqueue and process; this package turns
what they leave behind into four entrypoints an application elevates, so that "a long job reports
progress to the user's screen" is wiring rather than code.

## Key Exports

| Export | Description |
|--------|-------------|
| `declareJobEntrypoints(root, opts?)` | The four declarations of one job group, for the SHARED package |
| `jobEntrypointAliases(root)` | `{ base, list, get, cancel, watch }` — the alias shape both halves use |
| `serveJobEntrypoints(entrypoints, root, opts?)` | Elevate the group with this package's handlers |
| `listJobs(opts?)` / `getJob(opts?)` / `cancelJob(opts?)` | The HTTP handlers, for elevating by hand |
| `watchJobs(opts?)` | The socket handler — pushes `JobEvent` frames under `JOB_EVENT` |
| `jobOwnerOf(req)` / `requireJobOwner(req)` / `jobViewer(req, ctx, opts?)` | Who a request reads as |
| `jobScope(viewer, opts?)` / `owns(record, viewer, opts?)` / `readOwnedJob(...)` | Applying that to records |
| `ownerFieldOf(opts?)` / `ownerOf(record, opts?)` | The configured owner field, and what one record says its owner is |
| `jobsOf(ctx, opts?)` | The `QueueResource` a group reads |
| `JobListQuerySchema` | The list query's ajv schema, for a filter of your own |
| `JobEntrypointAliases` / `JobEntrypointOptions` / `JobHandlerOptions` / `JobAdminCheck` / `JobListQuery` | The alias and option shapes |
| Constants | `DEFAULT_JOB_ROOT` (`jobs`), `DEFAULT_JOB_PATH` (`/jobs`), `DEFAULT_OWNER_FIELD` (`owner`), `DEFAULT_JOB_SORT` (`createdAt`), `JOB_EVENT` (`job-event`) |

## Declaring, once, in the shared package

A group is a root alias plus a path. Everything under it is derived, so a target app declares it in
the package its API and its browser both import, and neither side ever writes a path:

```typescript
import { declareJobEntrypoints } from '@owlmeans/server-job'

export const REPORTS = 'reports'
export const entrypoints = [
  ...declareJobEntrypoints(REPORTS, { path: '/reports/jobs', parent: app.api.base }),
]
```

Aliases are `<root>`, `<root>:list`, `<root>:get`, `<root>:cancel`, `<root>:watch`. **That shape,
and the `job-event` frame name, are the whole contract with `@owlmeans/client-job`** — the two
packages restate them instead of sharing a module, because this one pulls fastify in and a browser
bundle must not.

The guard rides on the base alone and the other four inherit it. It defaults to `DEFAULT_GUARD`
because ownership is derived from the authenticated subject, and an unguarded group has no subject
to derive it from — `guard: null` is for a group scoped some other way, and its handlers then
answer `AuthorizationError`. `service` points the group at another app's route; `path` moves it.

`/watch` is declared before `/:id` so the static branch reads first. Declaring a second group is
the same call with another root.

## Serving

```typescript
import { serveJobEntrypoints } from '@owlmeans/server-job'
import { appendRedisQueue } from '@owlmeans/redis-queue'

appendRedisQueue(context)
serveJobEntrypoints(entrypoints, REPORTS, { queue: REPORT_QUEUE })
context.registerEntrypoints(entrypoints)
```

`elevate` replaces in place, so an app wanting one handler of its own elevates that alias again
afterwards. `queue` names which declared queue the group reads; omitted, `ctx.jobs()` answers with
the sole declared queue and refuses to guess once there are two. Passing an array that carries no
group under that root is a `SyntaxError` — the declarations and the serving call must name the same
root, and they usually do because both read it from one exported constant.

## The ownership rule

**A caller sees only the jobs it owns**, and ownership lives in the job's own payload — a
`JobRecord` has no owner column, so the producer writes it:

```typescript
await context.jobs(REPORT_QUEUE).create({
  name: 'report:build',
  data: { owner: req.auth!.profileId ?? req.auth!.userId, target: id },
})
```

Reads filter on `data.owner` (`ownerField` renames it) against `auth.profileId ?? auth.userId` —
profile first, the same subject `@owlmeans/server-socket` addresses a connection by, so one profile
of a multi-profile account does not see another's work.

A job that exists but belongs to someone else answers **`UnknownJob`, exactly as an absent one
does**. Telling the two apart is what turns a broker id space into an enumeration oracle.

The escape hatch is a predicate, never a permission name — which permission, gate or role means
"operator" is the application's decision:

```typescript
serveJobEntrypoints(entrypoints, REPORTS, {
  queue: REPORT_QUEUE,
  admin: req => req.auth?.scopes?.includes('ops') === true,
})
```

Absent an `admin` check every read is scoped and an anonymous request is refused, so a group wired
with no options at all is closed rather than open.

## What each handler answers

| Alias | Method | Answers |
|---|---|---|
| `<root>:list` | GET `/` | `ListResult<JobRecord>`, newest first by `createdAt`. `state`, `name`, `page`, `size` in the query. Paging is opt-in and driven by `size` (1–200): without one the whole scoped list comes back and a `page` alone counts for nothing, since a broker has no default page size. `state` and `name` are plain strings, so a driver state this package does not know still narrows the list |
| `<root>:get` | GET `/:id` | One `JobRecord`, or `UnknownJob` |
| `<root>:cancel` | DELETE `/:id` | The record that was removed. Cancellation IS deletion in the queue contract; it does not interrupt a processor mid-run |
| `<root>:watch` | SOCKET `/watch` | `JobEvent` frames under `job-event`, as the queue publishes them. The subscription is released on the socket's system `close` frame, so a dropped browser stops the queue subscription behind it |

## The one gotcha

**A `JobEvent` carries no owner.** `watchJobs` attributes each frame by reading its job back and
remembers the ids that answered for the life of the connection. A queue configured with
`removeOnComplete` therefore loses its completion events here — the record they would be
attributed by is gone by the time the event arrives, and an unattributable frame is dropped rather
than fanned out to everyone. **Leave completed jobs in place on any queue that is watched.**

## Depends On

- `@owlmeans/queue` — `ctx.jobs(queue)`, `JobRecord`, `JobEvent`, `JobState`, `UnknownJob`
- `@owlmeans/server-api` — `handleRequest`, `handleParams`
- `@owlmeans/server-socket` — `handleConnection`, and the guard enforcement that fills `req.auth`
- `@owlmeans/server-entrypoint` — `elevate`
- `@owlmeans/auth-common` — `DEFAULT_GUARD`

## Related

- `queue` — declaring queues, writing processors, and `job.progress()` (there is nothing to watch
  without it)
- `redis-queue` — the driver, its shutdown rule and its retention options
- `client-job` — the browser half; `web-panel` — `./jobs` renders what it collects
