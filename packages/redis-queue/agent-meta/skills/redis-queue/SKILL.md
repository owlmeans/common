---
name: redis-queue
description: How to use @owlmeans/redis-queue — the BullMQ-over-Redis driver for @owlmeans/queue, its key prefixing and connection rules, appendRedisQueue wiring, what a broker cannot do that the Resource contract implies, shutdown, and where queue integration tests live. Auto-invoked when wiring queues into a server app or writing queue specs.
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
```

That single call registers a `QueueResource` factory, the QUEUE entrypoint transport, the Ready
stage worker middleware, and `ctx.jobs<D, R>(queue)`. It is idempotent. A process that lists no
queues in `cfg.queue.listen` gets no worker at all, so a producer pays nothing.

Declaring queues and choosing which to consume is the `queue` package's job — see that skill.

## Connections

Two kinds, and the split is not optional. `Queue` and `FlowProducer` share the pooled client from
`@owlmeans/redis`. `Worker` and `QueueEvents` each get their OWN connection, built from
`RedisDbService.options()` plus `maxRetriesPerRequest: null` and `enableReadyCheck: false` —
they block on reads, so a shared client would stall everything else using it.

Keys are prefixed `<redis prefix>-queue`, passed as BullMQ's own `prefix` option. Never set
ioredis' `keyPrefix` for these connections: BullMQ builds keys itself and a client-level prefix
corrupts them. Because the prefix comes from `cfg.dbs[].schema`, slots sharing one Redis stay
isolated without needing separate databases.

**Cluster is refused,** with `UnsupportedArgumentError('redis-queue:cluster')`. BullMQ needs a
hash-tagged prefix to keep one queue's keys in one slot, and this prefix is shared with the record
namespace — so a cluster would fail per-command with `CROSSSLOT` at runtime instead. Refusing at
connection time is the honest failure.

**Valkey works — verified, not assumed.** The full suite passes 23/23 against
`valkey/valkey:8` (reporting `valkey_version 8.1.10`, `redis_version 7.2.4`) started as
`docker run -d -p 6399:6379 valkey/valkey:8 valkey-server --requirepass <pw> --maxmemory-policy
noeviction`, then `REDIS_URL='redis://:<pw>@127.0.0.1:6399/0' bun test`. Password auth, the BullMQ
Lua/EVALSHA paths, stalled-job reclaim, flows and QueueEvents all behave as on Redis.

That holds because the driver is RESP-only — standard commands plus BullMQ's bundled Lua — with no
Redis modules and no Stack/Enterprise assumptions. `password` (and `username`, when `DbConfig.user`
is set) reaches every connection, including the blocking ones. Nothing here sets a TTL or relies on
eviction, so `noeviction` is safe. Keep those three properties and a pod-local Valkey sidecar stays
a drop-in; break any of them and this stops being true.

## Where a broker is narrower than `Resource`

The queue contract says this too, but it is the driver that enforces it:

- `create` with a repeated `opts.id` returns the EXISTING job. It does not throw `RecordExists` —
  that idempotency is what makes an admission step safe to retry.
- `WriteOptions.ttl` is refused (`UnsupportedArgumentError('create:ttl')`). Job lifetime is
  `removeOnComplete` / `removeOnFail` — deletion after finishing, not expiry while waiting.
- `update` / `save` rewrite only `data` (`UnsupportedMethodError('update:data-only')` otherwise).
  The rest of a job belongs to the broker.
- `purge({})` is refused, like every other resource — bulk-cancel needs a criteria.

## Shutdown

`worker.stop()` closes the workers, draining what is in flight. The `QueueEvents` consumer belongs
to the RESOURCE, so a producer that waited on jobs must call `resource.close()` or the process will
not exit — `appendRedisQueue` binds both to SIGTERM. Library code never calls `process.exit`.

Give the deployment a `terminationGracePeriodSeconds` longer than the longest job you are willing
to let finish, or draining is pointless.

## Hooks

```typescript
context.service<QueueWorkerService>(alias).hooks({
  onJobDead: async (job, reason) => { await releaseLock(job); await markFailed(job, reason) }
})
```

`onJobDead` fires when attempts are exhausted. It is where the application COMPENSATES — the lock
an admission step took is not released by the broker, and without this it is only freed when its
TTL expires.

## Tests

Queue integration specs live HERE, not in `queue` — the contract package has no broker to test
against. They are gated by `redisGate` from `@owlmeans/test-integration` and need `REDIS_URL`;
each suite namespaces its own prefix and `obliterate()`s its queues on teardown, so a run leaves no
keys behind. Check that with `--scan --pattern '<prefix>*'` after a run.

`touch()` cannot be observed through stalling, because BullMQ auto-renews the lock at
`lockDuration / 2` and there is no `skipLockRenewal` option — assert it against the lock key's
`PTTL` directly.

## Depends On

- `@owlmeans/queue` — the contracts, the transport and the entrypoint bridge
- `@owlmeans/redis` — the connection service and `options()`
- `@owlmeans/resource` — the criteria/paging engine `list` runs jobs through
- `bullmq` — the broker

## Related

- `queue` — declaring queues, writing processors, the rules a processor must follow
- `redis` — connection configuration, key prefixes, database index
- `testing-integration` — how gated specs are written and run
