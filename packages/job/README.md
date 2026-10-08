# @owlmeans/job

Browser-safe application job contracts. The package defines a closed `JobView`, public query and
event schemas, and ordinary HTTP/WS entrypoint declarations. It has no queue dependency and carries
no queue address, transport payload, ownership field, credential or raw failure. An app uses it when
jobs are part of its domain — an operator screen that manages imports, an account screen that
follows an export — and declares the job surface once in its shared (common) package. It is not a
queue API: enqueueing and processing work is `@owlmeans/queue` on the backend, and a backend-only
job that no screen shows needs no `@owlmeans/job` at all. The package's skill is `job`.

## Installation

```bash
bun add @owlmeans/job@^0.1.18-rc.18
```

Install `ajv` alongside it when the schemas are compiled in the consuming process.

## Concepts

- **Job view** — `JobView`, the only job shape allowed across the browser boundary: opaque `id`,
  application-owned `kind`, normalized `JobViewStatus`, bounded progress/summary/metadata/result,
  a public `error`, `cancellable` and ISO timestamps.
- **Closed schema** — `JobViewSchema` rejects every top-level field it does not name, so a broker
  payload, stack trace or ownership field has nowhere to land.
- **Job entrypoints** — one guarded group per root: `base` (open protocol carrying the guard),
  `list` (`GET /`), `get` (`GET /:id`), `cancel` (`DELETE /:id`) and `watch` (socket `/watch`).
- **Aliases** — derived from the root by `jobEntrypointAliases(root)` (`<root>`, `<root>:list`, …),
  so client and server agree without importing each other.
- **Job event** — `JobViewEvent`, a socket frame sent under `JOB_EVENT`: `upsert` with the whole
  view, or `remove` with the opaque id.

## Usage

### Declare the job surface in the shared package

```typescript
import { declareJobEntrypoints } from '@owlmeans/job'

export const reportJobs = declareJobEntrypoints('report-jobs', {
  path: '/reports/jobs',
  parent: api.reports.base,
})
```

`JobEntrypointOptions` takes `path` (default `DEFAULT_JOB_PATH`, `'/jobs'`), `parent`, `service`
and `guard`. The guard defaults to `DEFAULT_GUARD` from `@owlmeans/auth-common`; pass another guard
alias to change it, or `null` to declare the group unguarded.

### Bind it on the server

The server half maps technical queue records into views through a mandatory exposure policy in
`@owlmeans/server-job`:

```typescript
import { serveJobEntrypoints } from '@owlmeans/server-job'

export const reportJobHandlers = serveJobEntrypoints(reportJobs, { policy: reportJobPolicy })
```

### Consume it in the browser

`@owlmeans/client-job` stores only `JobView` and applies `JobViewEvent` frames:

```tsx
import { JobViewStatus } from '@owlmeans/job'
import { useJobFeed, useJobs } from '@owlmeans/client-job'

const { seeded, connected, error } = useJobFeed({
  root: 'report-jobs',
  query: { status: JobViewStatus.Running, size: 50 },
})
const running = useJobs({ status: JobViewStatus.Running })
```

### Validate a view

```typescript
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { JobViewSchema, JobViewStatus } from '@owlmeans/job'

const validate = addFormats(new Ajv({ strict: false })).compile(JobViewSchema)

validate({
  id: 'opaque-1', kind: 'report', status: JobViewStatus.Running,
  progress: { percent: 40, message: 'Rendering' }, cancellable: true,
  createdAt: '2026-09-18T10:00:00.000Z', updatedAt: '2026-09-18T10:01:00.000Z',
}) // true — the same object with a `queue` or `data` field is rejected
```

## API

### Functions

| Symbol | Purpose |
|---|---|
| `declareJobEntrypoints(root?, opts?)` | `JobEntrypoints` group: `base`, `list`, `get`, `cancel`, `watch` (root defaults to `DEFAULT_JOB_ROOT`) |
| `jobEntrypointAliases(root?)` | `JobEntrypointAliases` derived from the root |

### Schemas

| Symbol | Purpose |
|---|---|
| `JobViewSchema` | Closed `JSONSchemaType<JobView>` |
| `JobViewListSchema` | `ListResult<JobView>` envelope built with `createListSchema` |
| `JobListQuerySchema` | Closed query: `status`, `kind`, `page` (≥ 0), `size` (1–100) |

### Constants

| Symbol | Value |
|---|---|
| `DEFAULT_JOB_ROOT` | `'jobs'` |
| `DEFAULT_JOB_PATH` | `'/jobs'` |
| `JOB_EVENT` | `'job-event'` — socket event name for `JobViewEvent` frames |
| `JobViewStatus` | enum: `Queued`, `Running`, `Succeeded`, `Failed`, `Cancelled` |

### Types

| Symbol | Purpose |
|---|---|
| `JobView` | The public job record (extends `ResourceRecord`) |
| `JobProgressView` | `{ percent?, done?, total?, message? }` |
| `PublicJobError` | `{ type, message }` — never a raw failure |
| `JobJson` | JSON value allowed in `metadata` and `result` |
| `JobViewEvent` | `{ type: 'upsert', job }` \| `{ type: 'remove', id }` |
| `JobListQuery` | Public list filter |
| `JobEntrypoints`, `JobEntrypointAliases`, `JobEntrypointOptions` | The declared group, its aliases, declaration options |

## Common pitfalls

- Do not widen `JobListQuery` with arbitrary criteria or technical fields; a product-specific filter
  belongs in a safe domain field that the server policy translates.
- Do not put queue names, processor names, technical ids, payloads or credentials into `metadata` or
  `result` — the schema is closed at the top level only, and those two are free-form JSON.
- Keep `@owlmeans/queue` and its driver out of browser and shared packages; this package is the only
  job dependency a shared package needs.
- Client and server must use the same root, or the derived aliases will not meet.

## Related packages

- [`@owlmeans/server-job`](../server-job) — binds the group to handlers through a `JobExposurePolicy`
- [`@owlmeans/client-job`](../client-job) — browser store, `useJobFeed`, `useJob`, `useJobs`
- [`@owlmeans/queue`](../queue) — the backend queue whose records the server maps into views
- [`@owlmeans/route`](../route) — the transport-agnostic routes the declarations use
- [`@owlmeans/entrypoint`](../entrypoint) — `protocol` / `contract` declarations
- [`@owlmeans/resource`](../resource) — `ListResult` and `createListSchema`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
