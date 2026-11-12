# @owlmeans/server-job

Server bridge from technical `@owlmeans/queue` records to the sanitized `@owlmeans/job` domain
contract. Every binding requires an application-owned `JobExposurePolicy`; there is no permissive
default. A server app uses it when long-running queue work must report status and progress to the
user's screen: one `serveJobEntrypoints` call binds list, get, cancel and watch handlers to a job
entrypoint group. It does not declare those routes (that is `@owlmeans/job`), does not run or store
jobs (that is `@owlmeans/queue` with a driver such as `@owlmeans/redis-queue`) and does not hold job
state in the browser (that is `@owlmeans/client-job`).

## Installation

```bash
bun add @owlmeans/server-job@^0.2.0-alpha.1
```

## Concepts

- **The policy is the security boundary** — `JobExposurePolicy` is required on every binding; there
  is no default owner field, administrator bypass or raw-record response. Its parts:
  - `audience` derives the authenticated application scope from the request — never a body owner id.
  - `where` translates the closed public query into scoped technical criteria that always include
    that scope.
  - `lookup` resolves an opaque public id inside that scope.
  - `map` allowlists fields and returns only `JobView`; `jobViewHelper.jobViewOf` bounds and
    sanitizes JSON.
  - `cancel` is optional, and cancellation is denied unless it explicitly approves.
- **List, get, cancel and watch** all apply the same policy. List answers newest first; get and
  cancel answer `UnknownJob` for an absent id and for a foreign one alike, so existence outside the
  audience never leaks.
- **Watch** pushes `JOB_EVENT` frames down a socket. A queue `JobEvent` carries no owner, so each
  frame is reloaded inside the audience scope and emitted as a `JobViewEvent` (`upsert` with the
  mapped job, or `remove` with a public id seen earlier on that connection); an unattributable event
  is dropped rather than fanned out. Keep completed records long enough for watched completion events
  to be projected.
- **Public projection** — `jobViewOf` maps technical states (`Active` → running, `Completed` →
  succeeded, `Failed` → failed, anything else → queued) and timestamps, copies only the fields the
  application supplies, bounds JSON depth, item count and string length, strips prototype keys and
  non-JSON values, and never copies a raw failure.

## Usage

### 1. Declare the public contract

Declare the routes with `@owlmeans/job`, in the narrow package shared by the API and its client.
They are ordinary guarded HTTP/WS declarations and carry no queue name or broker option.

```typescript
import { declareJobEntrypoints } from '@owlmeans/job'

export const reportJobs = declareJobEntrypoints('report-jobs', {
  path: '/reports/jobs', parent: api.reports.base,
})
```

### 2. Bind the bridge with a policy

```typescript
import { jobViewHelper, serveJobEntrypoints } from '@owlmeans/server-job'

export const bindings = serveJobEntrypoints(reportJobs, {
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
    map: (record, audience) => jobViewHelper.jobViewOf(record, {
      id: publicIdOf(record),
      kind: publicKindOf(record),
      summary: publicSummaryOf(record),
      metadata: allowlistedMetadataOf(record),
      result: publicResultOf(record),
      cancellable: ownerIdOf(record) === audience.userId,
    }),
    cancel: (record, audience) => ownerIdOf(record) === audience.userId,
  },
})
```

`serveJobEntrypoints` returns the bindings for the group's base, list, watch, get and cancel
aliases; register them with the rest of the service's handlers. The helpers named in the policy
(`requireUserId`, `publicIdOf`, …) are the application's own.

### 3. Report a failure safely

```typescript
map: record => jobViewHelper.jobViewOf(record, {
  id: publicIdOf(record),
  kind: publicKindOf(record),
  ...(record.state === JobState.Failed ? { error: jobViewHelper.publicJobError('export-failed') } : {}),
}),
```

`publicJobError(type?)` answers `{ type, message: 'The background operation failed.' }` (type
`'job-failed'` by default). Pass an application-safe message only when one is explicitly available.

### 4. Bind one handler yourself

Nothing is subclassed: an app that wants one handler of its own binds that alias itself, and can
still reuse the package's handlers for the rest.

```typescript
import { bind } from '@owlmeans/server-entrypoint'
import { getJob, listJobs } from '@owlmeans/server-job'

const opts = { queue: REPORT_QUEUE, policy: reportJobPolicy }

export const bindings = [
  bind(reportJobs.base),
  bind(reportJobs.list, listJobs(reportJobs.list, opts)),
  bind(reportJobs.get, getJob(reportJobs.get, opts)),
]
```

## API

| Export | Kind | Purpose |
|---|---|---|
| `serveJobEntrypoints(entrypoints, opts)` | function | Bind base, list, watch, get and cancel of a `declareJobEntrypoints` group under one policy |
| `listJobs(protocol, opts)` | function → handler | The audience's jobs, newest first, filtered by `where`; paging only when `size` is given |
| `getJob(protocol, opts)` | function → handler | One job via `lookup` + `map`; `UnknownJob` for absent and foreign ids |
| `cancelJob(protocol, opts)` | function → handler | Remove an approved job and answer its mapped final record; `UnknownJob` unless `cancel` approves |
| `watchJobs(protocol, opts)` | function → socket handler | Push `JobViewEvent` frames (`JOB_EVENT`) for the audience's jobs |
| `jobViewHelper` | object | `jobViewOf(record, fields)`, `sanitizeJobJson(value)`, `publicJobError(type?)` |
| `createJobViewHelper()` | factory → `JobViewHelper` | Builds a `jobViewHelper` |
| `makeJobPolicyHelper(opts)` | factory → `JobPolicyHelper` | `jobsOf(ctx)` (the options' queue, else the context's sole queue) and `readExposedJob(resource, id, audience)` |
| `JobExposurePolicy<A>` | interface | `audience`, `where`, `lookup`, `map`, optional `cancel` |
| `JobHandlerOptions<A>` | interface | `{ queue?, policy }` |
| `JobAudience` | type | `Record<string, unknown>` — the shape an application's audience satisfies |
| `JobViewFields` | interface | What `jobViewOf` copies: `id`, `kind`, `summary?`, `metadata?`, `result?`, `error?`, `cancellable?` |
| `JobViewHelper`, `JobPolicyHelper` | interface | The two helper objects' contracts |
| `Config`, `Context` | interface | Server config with `queue`; server context with the API server and `jobs()` appended |
| `JobEntrypoints`, `JobListQuery` | type | Re-exported from `@owlmeans/job` |

`jobViewOf` limits: JSON depth 8, 100 items per array or object, strings 16 384 characters; `kind`
128, `summary` 2048, error `type` 128 and `message` 2048, progress `message` 512 characters.

## Common pitfalls

- `jobViewOf`, `sanitizeJobJson` and `publicJobError` are methods of `jobViewHelper`, not separate
  exports.
- `where` must scope by audience even for an empty query: watch reloads every event's record with
  `where(audience, {})`.
- Deriving `audience` from the request body or query instead of the authenticated request lets a
  caller read someone else's jobs.
- A watched queue configured with `removeOnComplete` loses its completion events: the record they
  would be attributed by is gone, so the event is dropped.
- Without `cancel`, every cancel answers `UnknownJob`; and `cancellable` in the view is `false`
  unless `map` sets it.
- Cancellation is deletion in the queue contract: the job and its children leave the broker, a
  finished job cancels to its final record, and a running processor is not interrupted — it keeps
  its lock until it notices its own `signal`.
- A list `page` without a `size` is refused by the queue resource rather than silently windowed.
- Never put `failedReason`, stacks or raw payloads into a view; use `publicJobError()`.
- Name `queue` when the context declares more than one queue; it defaults to the sole one.

## Related packages

- [`@owlmeans/job`](../job) — `declareJobEntrypoints`, `JobView`, `JobViewEvent`, `JOB_EVENT`
- [`@owlmeans/client-job`](../client-job) — browser state over `JobView`
- [`@owlmeans/queue`](../queue) — `QueueResource`, `JobRecord`, `JobState`, `UnknownJob`
- [`@owlmeans/redis-queue`](../redis-queue) — the Redis-backed queue driver
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — `bind` for manual bindings

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.2
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
