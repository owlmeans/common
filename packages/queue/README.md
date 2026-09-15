# @owlmeans/queue

Job queues as resources, plus the route protocol that makes a queued call look like any other call.
Use it when work must outlive the request. Three cases qualify: the user would otherwise wait more
than about five seconds, accepted work must survive a process restart, or the work is retried
against a third party (payment capture, provider sync, bulk mail, report generation, model
pipelines). A request that finishes in under about two seconds and makes no external call should
not queue: do it inline. Check for a smaller fix first, such as an index, a batch write or a cached
aggregate. The framework has no scheduler, so recurring work is triggered by a platform cron that
calls an entrypoint or enqueues a job.

This package is contracts only and carries no broker code. A driver implements them
(`@owlmeans/redis-queue` does, over BullMQ). Depend on this package from a shared contract package,
and on the driver only where the application wires itself up.

## Installation

```bash
bun add @owlmeans/queue@^0.1.18-rc.19
```

## Concepts

- **Queue declaration**: `declareQueue(cfg, name, jobs, opts?)` in the shared backend config. It
  names a queue, the job names it accepts, and its worker and default job options. It is an
  address, not a deployment.
- **Listen**: `listenQueues(cfg, ...names)` in one process's own config says which queues *that
  process* consumes. A process that listens to nothing is a producer only.
- **Queued protocol**: an immutable entrypoint protocol whose route uses `job()` instead of
  `backend()` (`RouteProtocols.QUEUE`). Callers use `ctx.entrypoint(protocol).call(...)` unchanged,
  and the QUEUE transport carries the call through the broker.
- **Job record**: `ctx.jobs(queue)` returns a `QueueResource`, the ordinary `Resource<JobRecord>`
  contract plus `wait`, `flow`, `counts` and `close`. `create` enqueues, `list` inspects and `take`
  cancels.
- **Processor**: a function registered with `QueueWorkerService.process(queue, name, fn)` that gets
  a `JobContext`. It must be safe to run twice and must `touch()` in long loops.
- **Single-flight id**: a `JobOptions.id` derived from what the job is about (`develop:<storyId>`).
  A duplicate enqueue then returns the existing job instead of a second one.

## Usage

### Declare queues in the shared backend config

```ts
import { declareQueue } from '@owlmeans/queue'

// Split lanes by how long work takes, not by topic: a one-second read queued behind
// a thirty-minute job is a UI that looks broken.
declareQueue(cfg, APP_OPS, [appProtocols.files.get.alias, appProtocols.report.build.alias], {
  worker: { concurrency: 16, lockDuration: 30_000 }
})

declareQueue(cfg, APP_BILLING, [appProtocols.invoice.capture.alias], {
  worker: { concurrency: 4, lockDuration: 30_000 },
  defaults: { attempts: 3, backoff: { type: 'exponential', delay: 250 } }
})
```

The worker process names what it consumes, in its own config:

```ts
import { listenQueues } from '@owlmeans/queue'

listenQueues(cfg, APP_OPS, APP_BILLING)   // the api process omits this and only produces
```

Both processes build their context through the same backend factory, which wires the driver once:

```ts
import { appendRedisQueue } from '@owlmeans/redis-queue'

appendRedis<C, T>(context)
appendRedisQueue(context, { hooks: billingQueueHooks(context) })
```

### Declare a queued entrypoint

```ts
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { backend, job, route } from '@owlmeans/route'

const aliases = { base: 'app:report', build: 'app:report:build' } as const
const reportBase = protocol(route(aliases.base, '/reports', backend({ service: APP_WORKER })), contract())

export const appProtocols = {
  report: {
    base: reportBase,
    build: protocol(
      route(aliases.build, '/:id/build',
        job({ parent: reportBase, service: APP_WORKER, queue: APP_OPS, timeout: 30_000 })),
      contract.request({ params: typed<ReportParams>(ReportParamsSchema) }, typed<ReportResult>()),
    ),
  },
} as const
```

The worker process serves it like any backend entrypoint; the HTTP server skips QUEUE routes. A
producer calls it with no knowledge of the broker:

```ts
const result = await context.entrypoint(appProtocols.report.build).call({ params: { id } })
```

Add `reply: false` to the `job()` options to resolve `Accepted` with `{ id, queue }` as soon as the
broker has taken the job.

### Enqueue with broker options and wait

When a producer needs a job id, a delay or retries, pass the same protocol object to the typed
helpers. Never pass its alias.

```ts
import { enqueueProtocol, waitForProtocol } from '@owlmeans/queue'

const queued = await enqueueProtocol(context, appProtocols.invoice.capture, {
  body: { invoiceId },
}, {
  id: `capture:${invoiceId}:${attemptSequence}`,   // derived from what the job is about
  delay: 250, attempts: 3, backoff: { type: 'exponential', delay: 250 },
})

const receipt = await waitForProtocol(context, appProtocols.invoice.capture, queued, { timeout: 120_000 })
```

`queueJobOf(req)` gives a protocol handler `{ id, name, queue, attempt, touch }` when it must compare
the broker job with a claim it persisted.

### Processors, hooks and job graphs

```ts
import { DEFAULT_ALIAS } from '@owlmeans/queue'
import type { QueueWorkerService } from '@owlmeans/queue'

const worker = context.service<QueueWorkerService>(DEFAULT_ALIAS)

worker.process(APP_OPS, 'app:import:rows', async job => {
  for (const chunk of chunks(job.data.fileId)) {
    await job.touch()                     // renew the lock on every iteration
    await importChunk(chunk)              // idempotent: skips rows already imported
  }
  return { ok: true }
})

worker.hooks({
  onJobDead: async (record, reason) => {  // retries exhausted: compensate
    await imports.patch({ id: record.data.importId, status: 'failed', error: reason })
  }
})

// children complete before the parent; siblings run in parallel
await context.jobs(APP_OPS).flow({
  name: 'app:import:finalize', data: ref, children: [
    { name: 'app:import:validate', data: ref, children: [{ name: 'app:import:rows', data: ref }] }
  ]
})
```

### Jobs are records

```ts
import { JobState } from '@owlmeans/queue'

const jobs = context.jobs<ImportInput, ImportResult>(APP_OPS)

const failed = await jobs.list({ state: JobState.Failed }, { size: 20 })
const counts = await jobs.counts()
await jobs.take(jobId)                    // cancel and return
```

## Processor rules

- **`touch()` in every long loop.** The broker judges liveness by the lock. Silence longer than
  `lockDuration` looks like a dead worker, so the job is re-run elsewhere while this one is still
  going.
- **Children report, parents decide.** A child returns `{ ok: false, error }` for a domain failure.
  Throwing means "infrastructure broke, retry me". Parents read `children()` / `failedChildren()`.
- **Retries default to one attempt** (`DEFAULT_ATTEMPTS`), because a blind retry of model work
  re-spends the tokens that just failed. Raise `attempts` per queue for cheap idempotent work.
- **`job.signal` is not an interrupt.** An orderly stop closes workers first and waits for jobs in
  flight to return.

## Guards and errors

`handleJob` rebuilds the request from the envelope and runs the entrypoint's guards the way the
HTTP boundary does, attaching the entity. A guarded queued entrypoint therefore needs the
producer's credentials in the envelope `headers`. `cfg.queue.envelopeTtl` (seconds) bounds how long
after `enqueuedAt` an envelope is still accepted; past it, the job answers `EnvelopeExpired`.

A refusal the caller must recognise is carried in the reply and rebuilt on the producing side as its
own class, so `instanceof` keeps working across the broker. `QueueTimeout` means the WAIT ended,
not the job, so read the job back to learn what became of it.

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `declareQueue(cfg, name, jobs, opts?)` | function | Declare a queue and the job names it accepts; re-declaring replaces |
| `listenQueues(cfg, ...names)` | function | Name the queues this process consumes |
| `queueOf(cfg, name)`, `queueOfJob(cfg, job)`, `isListening(cfg, name)` | function | Read declarations back; `queueOf` throws `UnknownQueue` |
| `enqueueProtocol(ctx, protocol, request, options?)` | function | Enqueue a QUEUE protocol with `JobOptions`, typed by the protocol |
| `waitForProtocol(ctx, protocol, job, { timeout }?)` | function | Wait for that job and unwrap the typed reply |
| `queueJobOf(request)` | function | `QueueJobMeta` of the broker job behind a handler's request, or `null` |
| `appendQueueTransport(ctx, alias?)`, `makeQueueTransport(alias?)` | function | Register the QUEUE transport so `call()` routes through the broker |
| `queueWorkerMiddleware(alias?)` | function | Start the worker at the Ready stage, only in a process that listens |
| `handleJob(ctx, job)`, `entrypointProcessor(ctx)`, `servedJobs(ctx)` | function | The bridge a driver dispatches entrypoint jobs through |
| `requestOf(envelope)`, `assertFresh(envelope, ttl?)` | function | Rebuild a request from an envelope; enforce `envelopeTtl` |
| `QueueConfig`, `QueueDeclaration`, `QueueWorkerOptions`, `JobOptions` | type | Configuration shapes |
| `QueueResource<D, R>` | type | A queue as a resource, plus `queue`, `wait`, `flow`, `counts`, `close` |
| `JobRecord<D, R>`, `JobEvent<R>`, `FlowSpec<D>` | type | A job as a record, a lifecycle event, a graph node |
| `QueueWorkerService` | type | `process`, `start`, `stop`, `listening`, `hooks` |
| `JobContext<D>`, `JobProcessor<D, R>` | type | What a processor receives; the processor signature |
| `QueueHooks` | type | `wrapHandler`, `onJobResult`, `onJobStalled`, `onJobDead` |
| `QueueJobMeta`, `JobEnvelope`, `JobReply<T>` | type | Broker identity for a handler, the call envelope, the reply shape |
| `QueueAppend`, `QueueDriver` | type | The `ctx.jobs(queue?)` mixin a driver installs; what a driver supplies |
| `Config`, `Context`, `QueueTransportRequest`, `QueueTransportResponse` | type | Context, config and transport types |
| `JobState`, `JobEventType` | enum | Job lifecycle states and event types |
| `isSettled(state?)` | function | Whether a state is final |
| `DEFAULT_ALIAS`, `DEFAULT_JOB_TIMEOUT`, `DEFAULT_ATTEMPTS` | const | `'queue'`, `60_000` ms, `1` |
| `QueueError`, `QueueTimeout`, `UnknownJob`, `UnknownJobName`, `UnknownQueue`, `QueueNotListening`, `JobNotServed`, `EnvelopeExpired` | class | Error family |

## Common pitfalls

- **Queueing work the request could finish.** It adds a second process to deploy and a place to fail.
- **Passing alias strings to `enqueueProtocol`/`waitForProtocol`.** They take the protocol object and
  reject strings and non-QUEUE declarations.
- **Enqueueing a job name the queue did not declare.** It throws `UnknownJobName` rather than
  parking a job nothing can process.
- **Registering a processor in a process that does not `listen`.** It throws `QueueNotListening`.
- **Putting `listen` in the shared declaration.** Every deployment of that binary would then
  consume everything.
- **Random job ids on an admission step.** Derive the id from the subject, or a retried request
  enqueues twice.
- **Long loops without `touch()`**, or processors that are not safe to run twice.
- **Throwing from a child for a domain failure.** Return `{ ok: false, error }` instead.
- **Equal child ids across queues in one flow.** `children()` is keyed by bare id and collapses them.
- **A self-re-enqueueing job as a cron.** Use a platform `CronJob`. `delay` defers a single job once.
- **Calling `ctx.jobs()` with no name once a second queue exists.** It throws `UnknownQueue`.

## Related packages

- [`@owlmeans/redis-queue`](../redis-queue): the BullMQ driver, and where queue integration tests live
- [`@owlmeans/route`](../route): `RouteProtocols.QUEUE` and the `job()` builder
- [`@owlmeans/entrypoint`](../entrypoint): protocol declarations and the transport seam
- [`@owlmeans/resource`](../resource): the `Resource` contract jobs are read through
- [`@owlmeans/server-job`](../server-job) / [`@owlmeans/client-job`](../client-job): listing,
  cancelling and following jobs from an application's UI

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.27
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
