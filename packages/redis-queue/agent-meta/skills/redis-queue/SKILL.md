---
name: redis-queue
description: How to use @owlmeans/redis-queue — the BullMQ-over-Redis driver for @owlmeans/queue, appendRedisQueue wiring, its key prefixing and connection rules, worker defaults and dispatch, what a broker cannot do that the Resource contract implies, shutdown, hooks, and where queue integration tests live. Auto-invoked when wiring queues into a server app or writing queue specs.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/redis-queue

**Layer:** Infra
**Install:** `"@owlmeans/redis-queue": "^0.1.18-rc.3"` in `dependencies`

The driver behind `@owlmeans/queue`, on BullMQ over the existing Redis connection. Contracts live
in `queue`; nothing here belongs in an application's imports beyond the wiring call.

## Wiring

```typescript
import { appendRedisQueue } from '@owlmeans/redis-queue'

appendRedisQueue(context)          // producer AND, when cfg.queue.listen is set, worker
appendRedisQueue(context, { db: 'queue-db', hooks: { onJobDead } })
```

That single call registers a `QueueResource` per declared queue, the QUEUE entrypoint transport,
the Ready stage worker middleware, and `ctx.jobs<D, R>(queue)`. It is idempotent — a context that
already carries `jobs` is returned untouched, so mixins compose without ending up with two workers
on one queue. A process that lists no queues in `cfg.queue.listen` gets no worker at all, so a
producer pays nothing.

`RedisQueueOptions` picks the pieces apart: `alias` names the worker service (default the queue
package's own), `service` the redis service to take connections from, and `db` the configured db —
falling back to `cfg.queue.db`, then to the redis alias. `hooks` seeds the worker's hooks.

Declaring queues and choosing which to consume is the `queue` package's job — see that skill.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendRedisQueue(context, opts?)` | The whole wiring. Everything else exists for tests and tooling |
| `makeRedisQueueResource(queue, dbAlias?, serviceAlias?)` | One queue as a resource, when registering it by hand |
| `makeRedisQueueWorker(alias?, dbAlias?, serviceAlias?)` | The consuming service |
| `queueResourceAlias(queue)` | `queue:<name>` — the resource alias one queue is registered under |
| `queuePrefix(prefix)` / `queueConnection(redis, dbAlias?)` | The key namespace, and everything a queue needs from the redis service |
| `RedisQueueOptions` / `RedisQueueResource` / `RedisQueueWorkerService` | The option shape and the driver's named contract aliases |
| Constants | `QUEUE_KEY_SUFFIX`, `DEFAULT_LOCK_DURATION` (60 000 ms), `DEFAULT_STALLED_INTERVAL` (30 000 ms), `DEFAULT_MAX_STALLED_COUNT` (2), `LISTED_STATES`, `PUBLISHED_EVENT`, `PUBLISHED_EVENT_MAX`, `WAIT_TIMEOUT_MARKER`, `STALLED_FAILURE` |

## Connections

Two kinds, and the split is not optional. `Queue`, `FlowProducer` and the event PRODUCER share the
pooled client from `@owlmeans/redis`. `Worker` and `QueueEvents` each get their OWN connection,
built from `RedisDbService.options()` plus `maxRetriesPerRequest: null` and
`enableReadyCheck: false` — they block on reads, so a shared client would stall everything else
using it. Connections are opened on first use, never at registration: a process that declares ten
queues and produces into one holds one connection.

Keys are prefixed `<redis prefix>-queue`, passed as BullMQ's own `prefix` option. Never set
ioredis' `keyPrefix` for these connections: BullMQ builds keys itself and a client-level prefix
corrupts them. Because the prefix comes from `cfg.dbs[].schema`, slots sharing one Redis stay
isolated without needing separate databases, and the `-queue` suffix keeps a queue's lists, hashes
and streams out of the namespace `@owlmeans/redis-resource` walks with SCAN.

**Cluster is refused,** with `UnsupportedArgumentError('redis-queue:cluster')`. BullMQ needs a
hash-tagged prefix to keep one queue's keys in one slot, and this prefix is shared with the record
namespace — so a cluster would fail per-command with `CROSSSLOT` at runtime instead. Refusing at
connection time is the honest failure.

**Valkey works — verified, not assumed.** The whole suite passes against `valkey/valkey:8` started
as `docker run -d -p 6399:6379 valkey/valkey:8 valkey-server --requirepass <pw> --maxmemory-policy
noeviction`, then `REDIS_URL='redis://:<pw>@127.0.0.1:6399/0' bun test`. Password auth, the BullMQ
Lua/EVALSHA paths, stalled-job reclaim, flows and QueueEvents all behave as on Redis.

That holds because the driver is RESP-only — standard commands plus BullMQ's bundled Lua — with no
Redis modules and no Stack/Enterprise assumptions. `password` (and `username`, when `DbConfig.user`
is set) reaches every connection, including the blocking ones. Nothing here sets a TTL or relies on
eviction, so `noeviction` is safe. Keep those three properties and a pod-local Valkey sidecar stays
a drop-in; break any of them and this stops being true.

## The worker

One BullMQ worker per queue named in `cfg.queue.listen`, dispatching by job name — to a processor
registered with `process()`, or to an entrypoint this process both serves and listens to. Which
entrypoints those are is read ONCE, when the worker starts: an alias elevated afterwards is not
part of what this process promised.

A name neither answers fails as an `UnrecoverableError` carrying a marshalled `UnknownJobName`, so
BullMQ spends one attempt however many the job allows, and the producer's `wait()` still rebuilds
the error as its own class. `start()` is idempotent — a queue already bound is left alone.

Worker options come from the declaration's `worker` block over these defaults, which deliberately
differ from BullMQ's: `lockDuration` 60 s rather than 30 (a model call that neither answers nor
fails for half a minute is ordinary), `maxStalledCount` 2 rather than 1 (a worker rolled out
mid-job leaves its jobs stalled once through no fault of the job), `stalledInterval` 30 s.
`concurrency` is written only when declared, and `autorun` is off — `start()` binds, so nothing is
consumed while processors are still registering.

## Where a broker is narrower than `Resource`

The queue contract says this too, but it is the driver that enforces it:

- `create` with a repeated `opts.id` returns the EXISTING job. It does not throw `RecordExists` —
  that idempotency is what makes an admission step safe to retry.
- `WriteOptions.ttl` is refused (`UnsupportedArgumentError('create:ttl')`). Job lifetime is
  `removeOnComplete` / `removeOnFail` — deletion after finishing, not expiry while waiting.
- `update` / `save` rewrite only `data` (`UnsupportedMethodError('update:data-only')` otherwise).
  The rest of a job belongs to the broker.
- `purge({})` is refused, like every other resource — bulk-cancel needs a criteria.
- `list`, `count`, `purge` and a criteria `load` enumerate the queue state by state and evaluate
  in memory, because a queue has no index. Affordable for inspecting a backlog, wrong as a data
  access path. `page` without `size` is refused; without a `size` every match comes back.
- `wait(id)` needs the job to still exist. A queue that removes jobs on completion has thrown the
  result away by the time anyone asks, so leave completed jobs in place on a queue anyone waits on
  or watches.
- `subscribe` and `publish` refuse a `channel`: a queue has exactly one event stream. A published
  event travels under this driver's own event name rather than `completed`, because a synthetic
  broker event would settle every `wait()` watching that job. A completion event carries an empty
  `name` when the job is already gone — subscribe for the id and the outcome, never the name.

## Shutdown

`worker.stop()` closes the workers, draining what is in flight, then aborts the processors' signals
and closes the queues it opened. The `QueueEvents` consumer belongs to the RESOURCE, so a producer
that waited on jobs must call `resource.close()` or the process will not exit — `appendRedisQueue`
binds both to SIGTERM. Library code never calls `process.exit`.

Give the deployment a `terminationGracePeriodSeconds` longer than the longest job you are willing
to let finish, or draining is pointless.

## Hooks

```typescript
context.service<QueueWorkerService>(alias).hooks({
  onJobDead: async (job, reason) => { await releaseLock(job); await markFailed(job, reason) }
})
```

Registering merges, so parts of a composed application each contribute what they care about, and a
hook that throws is logged rather than failing the job it reports on. `onJobResult` fires on every
completion and failure; `onJobStalled` fires when BullMQ reclaims a job (`'stalled'`) and again
when it gives up on one (`'failed'`); `wrapHandler` wraps every dispatch.

`onJobDead` fires when the job is finished for good — attempts exhausted, an unrecoverable failure,
or stalled past the limit. It is where the application COMPENSATES: the lock an admission step took
is not released by the broker, and without this it is only freed when its TTL expires.

## Tests

Queue integration specs live HERE, not in `queue` — the contract package has no broker to test
against. They are gated by `redisGate` from `@owlmeans/test-integration` and need `REDIS_URL`;
each suite namespaces its own prefix and `obliterate()`s its queues on teardown, so a run leaves no
keys behind. Check that with `--scan --pattern '<prefix>*'` after a run. Bun runs a package's spec
files in one process, so cleanup belongs to each suite's own `afterAll`, never to a shared global.

`touch()` cannot be observed through stalling: BullMQ renews the lock on its own at `lockRenewTime`
(half `lockDuration`), and this driver exposes no way to turn that off. Assert it against the lock
key's `PTTL` instead — take it inside the processor, wait, take it again, `touch()`, take it a
third time.

## Depends On

- `@owlmeans/queue` — the contracts, the transport and the entrypoint bridge
- `@owlmeans/redis` — the connection service and `options()`
- `@owlmeans/redis-resource` — `DEFAULT_DB_ALIAS`, `RedisDbService`, `RedisClient`
- `@owlmeans/resource` — the criteria/paging engine `list` runs jobs through
- `@owlmeans/server-context` — the config and context this driver binds to
- `bullmq` — the broker

## Related

- `queue` — declaring queues, writing processors, the rules a processor must follow
- `redis` — connection configuration, key prefixes, database index
- `testing-integration` — how gated specs are written and run
