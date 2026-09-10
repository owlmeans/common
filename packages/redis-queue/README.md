# @owlmeans/redis-queue

BullMQ-over-Redis driver for the queue contracts declared in [`@owlmeans/queue`](../queue).

## Overview

- `appendRedisQueue(context, opts?)` — registers the queue resources, the queue transport, the
  worker (only where the process consumes something) and the `ctx.jobs(queue)` accessor
- `makeRedisQueueResource(queue, dbAlias?, serviceAlias?)` — one queue as a `QueueResource`
- `makeRedisQueueWorker(alias?, dbAlias?, serviceAlias?)` — the consuming half
- Connections come from [`@owlmeans/redis`](../redis) — the same `dbs` configuration every other
  redis-backed package reads

## Installation

```bash
bun add @owlmeans/redis-queue@^0.1.18-rc.2
```

## Usage

Declare the queues once, in the package both halves import. A declaration says a queue exists and
what it accepts; it never says where it runs.

```typescript
import { declareQueue, listenQueues } from '@owlmeans/queue'

declareQueue(cfg, 'generation', ['generate-app', 'render-page'], {
  worker: { concurrency: 2, lockDuration: 120_000 },
  defaults: { attempts: 2, backoff: { type: 'exponential', delay: 5_000 } },
})

// Only in the deployment that consumes it — this is what turns the binary into a worker.
listenQueues(cfg, 'generation')
```

Wire the driver:

```typescript
import { appendRedisQueue } from '@owlmeans/redis-queue'
import { appendRedis } from '@owlmeans/redis'

appendRedis(context)
appendRedisQueue(context)
```

Produce:

```typescript
const jobs = context.jobs<GenerateApp, GeneratedApp>('generation')

const record = await jobs.create({ name: 'generate-app', data: { specId } })
const result = await jobs.wait(record.id, { timeout: 300_000 })
```

Consume — registered before the context reaches its `Ready` stage, which is when the worker binds:

```typescript
const worker = context.service<QueueWorkerService>('queue')

worker.process<GenerateApp, GeneratedApp>('generation', 'generate-app', async job => {
  for (const step of plan) {
    await job.touch()              // renew the lock, or the job is re-run elsewhere
    await job.progress(step.name)
  }

  return build(job.data)
})
```

Graphs — children complete before their parent:

```typescript
const root = await jobs.flow({
  name: 'assemble', data: { specId },
  children: [
    { name: 'render-page', data: { page: 'home' } },
    { name: 'render-page', data: { page: 'about' } },
  ]
})
```

## Queued entrypoints

A backend route declared with `job()` is called exactly like any other entrypoint. `appendRedisQueue`
registers the transport, so `ep.call(...)` enqueues, the worker runs the same handler with the same
guards and filter, and the answer comes back to the caller.

```typescript
import { job, route } from '@owlmeans/route'

route('generate-app', 'generate', job({ queue: 'generation', timeout: 300_000 }))
```

`reply: false` on the route resolves as soon as the job is accepted, with the job's identity as the
value. A handler's `ResilientError` crosses the hop as its own class, not as a string.

## Keys and connections

Queues live under `<schema>-queue`, where `<schema>` is the redis db's own prefix normalised the way
`@owlmeans/redis-resource` normalises it. That suffix keeps a queue's lists, hashes and streams out
of the namespace an ordinary redis resource walks with `SCAN`. It is passed to BullMQ as its
`prefix` option — never as ioredis' `keyPrefix`, which BullMQ refuses.

| Object | Connection |
|---|---|
| `Queue`, `FlowProducer`, `QueueEventsProducer` | the redis service's pooled client |
| `Worker`, `QueueEvents` | one of their own, with `maxRetriesPerRequest: null` and `enableReadyCheck: false` |

A blocking consumer holds its connection for the whole time it waits, so it cannot take turns on a
pooled client. Everything else is a command and a reply. The configured db index, password and host
are used as they are.

Connections open on first use, never at registration: a process that declares ten queues and
produces into one holds one connection. `RedisQueueResource.close()` releases them — the events
consumer's blocking connection is what otherwise keeps a process from exiting — and the driver binds
`close` and the worker's `stop` to `SIGTERM`.

**Cluster is refused** (`UnsupportedArgumentError('redis-queue:cluster')`). BullMQ keeps one queue's
keys on one node by hash-tagging the prefix, and this driver's prefix is shared with the record
namespace, so a clustered deployment would fail per command with `CROSSSLOT` instead of at
configuration time.

Plain RESP over ioredis throughout — BullMQ's own Lua scripts and standard commands only, so a
Valkey server answers it exactly as Redis does. Nothing here relies on eviction or on a TTL for
correctness.

## Reads

`get(id)`, `load(id)`, `delete(id)` and `take(id)` are one round trip. `load({ ... })`, `get({ ... })`,
`list`, `count` and `purge` enumerate the queue **state by state** — one `getJobs` per state rather
than one read per job — and evaluate the criteria in memory with the same matcher every other
backend uses. That is right for inspecting a queue and wrong as a data access path: a backlog large
enough to need a query belongs in `@owlmeans/mongo-resource` or `@owlmeans/postgres-resource`.

Listings are **unpaged** by default: `list(where)` with no `size` returns every match, and
`list(where, { page })` without a `size` throws `UnsupportedArgumentError('page-without-size')`.
`ListResult.total` always counts every match.

## What differs from an ordinary resource

| Method | Behaviour |
|---|---|
| `create` | Enqueues. A job whose `opts.id` is already in the queue is **not** an error — the id is what makes an admission step safe to retry, so the job already there is returned. `opts.ttl` is refused. |
| `update` | Rewrites the job's `data` only. State, result and attempts belong to the broker; a record with no `data` throws `UnsupportedMethodError('update:data-only')`. |
| `save` | Enqueues an unknown id, rewrites the payload of a known one. |
| `delete` / `take` | Cancel. A job the worker has locked cannot be removed and the broker says so. |
| `purge` | Refuses an empty criteria object — emptying a queue is `obliterate`'s job. |
| `publish` | Puts a `JobEvent` on the queue's event stream under this driver's **own** event name. A synthetic `completed` would settle every `wait()` watching that job, so the broker's names are never reused. A `channel` is refused: a queue has one event stream. |
| `subscribe` | Carries `completed` / `failed` / `progress` off `QueueEvents`, plus whatever `publish` wrote. Returns an `Unsubscribe`; `once` and `ttl` behave as they do on a redis resource. |

### `wait(id, { timeout })`

Resolves with the processor's return value; a domain failure is rebuilt as its **original class**
because the worker marshals a `ResilientError` into the failure reason. A wait that elapses throws
`QueueTimeout` and leaves the job alone.

It survives a job that finished before the wait began — BullMQ subscribes first and then reads the
finished state. It cannot survive a job **removed** after finishing: the result is gone with it. So
this driver leaves completed jobs in place (BullMQ's own default) and a queue that sets
`removeOnComplete` is choosing not to be waited on after the fact.

## The worker

`start()` binds one worker per queue in `cfg.queue.listen` and dispatches by job name: first a
processor registered with `process()`, then an entrypoint this process both **serves** and
**listens to**. A name neither answers fails as BullMQ's `UnrecoverableError` carrying a marshalled
`UnknownJobName` — nothing here can ever run it, so a retry only moves the same failure down the
backlog.

`process()` on a queue this process does not consume throws `QueueNotListening`: which queues a
process consumes is configuration, so that is a deployment question rather than a code one.

| Worker option | Default |
|---|---|
| `concurrency` | BullMQ's (`1`) |
| `lockDuration` | `60000` |
| `stalledInterval` | `30000` |
| `maxStalledCount` | `2` |

`stop()` closes the workers — which drains the jobs in flight — and is bound to `SIGTERM`. Nothing
here calls `process.exit`; when to leave is the application's decision.

### Hooks

`QueueHooks` is declared in `@owlmeans/queue` but nothing there registers a set, so the driver that
binds the workers takes them:

```typescript
appendRedisQueue(context, {
  hooks: {
    onJobResult: event => metrics.record(event),
    onJobStalled: (meta, phase) => log.warn(meta, phase),
    // Retries exhausted, or refused outright — where an application compensates.
    onJobDead: (job, reason) => release(job.data.lockId, reason),
  }
})
```

A hook that throws is reported, never allowed to fail the job it reports on.

## Testing

`tests/` drives a real broker behind `redisGate` from `@owlmeans/test-integration` — set `REDIS_URL`
(and optionally `REDIS_TEST_KEY_PREFIX`) and the specs run; without it they skip. Every suite owns a
random key namespace and obliterates its queues on teardown.

## API

### `appendRedisQueue<C, T>(context, opts?): T`

Idempotent — it is a mixin and may run more than once. `opts`: `alias` (the worker service alias,
default `'queue'`), `db` (defaults to `cfg.queue.db`, then to the redis alias), `service` (the redis
service alias) and `hooks`.

### `makeRedisQueueResource<D, R>(queue, dbAlias?, serviceAlias?): RedisQueueResource<D, R>`

`QueueResource<D, R>` plus `close()`.

### `makeRedisQueueWorker(alias?, dbAlias?, serviceAlias?): RedisQueueWorkerService`

`QueueWorkerService` plus `hooks(hooks)`.

### Constants

- `QUEUE_KEY_SUFFIX` — `'queue'`
- `DEFAULT_LOCK_DURATION` / `DEFAULT_STALLED_INTERVAL` / `DEFAULT_MAX_STALLED_COUNT`
- `LISTED_STATES` — the BullMQ states a listing enumerates

## Requirements

Redis 5.0 or newer (BullMQ needs streams), or a Valkey server that answers the same commands.
`bullmq` is a direct dependency; `ioredis` arrives with `@owlmeans/redis`.

## Related Packages

- [`@owlmeans/queue`](../queue) — the contracts this package implements
- [`@owlmeans/redis`](../redis) — the connection service
- [`@owlmeans/redis-resource`](../redis-resource) — records in the same redis, under the neighbouring namespace
- [`@owlmeans/resource`](../resource) — the `Resource<T>` base and the criteria engine

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
