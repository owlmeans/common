# Queues

`packages/queue/**`, `packages/redis-queue/**`, and the QUEUE half of `packages/route`,
`packages/server-api`, `packages/redis`.

## The shape

Contracts in `@owlmeans/queue`, broker in `@owlmeans/redis-queue` (BullMQ). A queued call is an
ordinary entrypoint call: the route names `RouteProtocols.QUEUE`, the transport registered under
`transportAlias(protocol)` takes it, and the caller writes `ep.call(...)`. That is the whole point —
moving a service-to-service call onto the broker is one declaration change, not a sweep of call
sites, and the call survives a process restart.

Declaring a queue and consuming it are deliberately separate statements. `declareQueue` goes in the
SHARED backend package so producer and consumer agree; `listenQueues` goes in the individual
process's config and is what makes that process a worker. A worker that bound whatever it could
serve would turn every deployment of a shared binary into a consumer of everything it imports.

## Facts that cost time to rediscover

- **`canServeModule` must exclude every non-HTTP protocol.** SOCKET and QUEUE are both excluded; a
  QUEUE route left mounted on Fastify answers the same call twice.
- **`req.original` is Fastify-only.** `server-api`'s `handleBody`/`handleParams` read the
  request-scoped context from `req.original._ctx`. A queued request is rebuilt from an envelope and
  has no raw request, so the bridge supplies `original: { _ctx }` and the helper reads it
  optionally. Any future transport owes the same.
- **Blocking connections cannot be shared.** `Worker` and `QueueEvents` block on reads and get their
  own clients from `RedisDbService.options()`; `Queue` and `FlowProducer` may share the pooled one.
- **Never set ioredis `keyPrefix` for queue connections** — BullMQ builds its own keys. Pass the
  prefix as BullMQ's `prefix`, derived from `cfg.dbs[].schema`, which is what keeps slots sharing
  one Redis isolated.
- **Cluster is refused** (`UnsupportedArgumentError('redis-queue:cluster')`): BullMQ needs a
  hash-tagged prefix to keep a queue's keys in one slot, and the prefix here is shared with the
  record namespace. Failing at connect beats failing per-command with CROSSSLOT.
- **Valkey works** — RESP only, no modules, no TTLs, nothing depending on eviction.

## Rules a processor lives by

`touch()` in every long loop, or the lock expires and the job is re-run while it is still going.
Children RETURN a domain failure and throw only for infrastructure, so a refusal is not retried.
Retries default to one attempt because this work mostly talks to a model. Every processor must be
safe to run twice — the lock expiring is a normal event, not an exception.

## Where a broker is narrower than `Resource`

`create` with a repeated `opts.id` returns the existing job instead of throwing `RecordExists` —
that idempotency is what makes an admission step retry-safe. `WriteOptions.ttl` is refused.
`update`/`save` reach only `data`. These are stated on `QueueResource` and enforced by the driver.

`close()` on the resource and `hooks()` on the worker are contract members, not driver extras: a
producer that waited on a job holds a blocking events connection and will not exit without
`close()`, and `onJobDead` is where an application releases the lock its admission step took.

## Release note

Publishing common is not "installable" until npm serves it — see the `publishing` skill. Integration
specs for queue behaviour live in `redis-queue`, never in `queue`, which has no broker to test.

Related: [[entrypoints]] (transport seam, elevation), [[resources]] (criteria and paging the job
list follows), [[context]] (middleware stages — the worker starts at Ready).
