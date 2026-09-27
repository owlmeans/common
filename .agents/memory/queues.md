# Queues

`packages/queue/**`, `packages/redis-queue/**`, and the QUEUE half of `packages/route`,
`packages/server-api`, `packages/redis`.

## The shape

Contracts in `@owlmeans/queue`, broker in `@owlmeans/redis-queue` (BullMQ). A queued call is an
immutable protocol object whose route names `RouteProtocols.QUEUE`. Ordinary transport calls use
`ctx.entrypoint(protocol).call(request)`. Calls that need a job id, delay, retries, backoff or
retention use `enqueueProtocol(ctx, protocol, request, options)` and
`waitForProtocol(ctx, protocol, job)`: both infer exact I/O and reject raw aliases, non-QUEUE
protocols and queue mismatches.

Declaring a queue and consuming it are deliberately separate statements. `declareQueue` goes in the
SHARED backend package so producer and consumer agree; `listenQueues` goes in the individual
process's config and is what makes that process a worker. A worker that bound whatever it could
serve would turn every deployment of a shared binary into a consumer of everything it imports.

The job read surface follows the same split: `declareJobEntrypoints()` returns a named protocol
group in the shared tree, while `serveJobEntrypoints(protocols.jobs, opts)` returns server-local
bindings. Pass the group itself, never a flattened list or a root alias, so queue-backed interactions
remain protocol declarations end-to-end.

## Facts that cost time to rediscover

- **`canServeModule` must exclude every non-HTTP protocol.** SOCKET and QUEUE are both excluded; a
  QUEUE route left mounted on Fastify answers the same call twice.
- **`req.original` is Fastify-only.** Typed `handlers<Context>()` callbacks read the
  request-scoped context from `req.original._ctx`. A queued request is rebuilt from an envelope and
  has no raw request, so the bridge supplies `original: { _ctx }` and the helper reads it
  optionally. Any future transport owes the same.
- **Broker identity has one boundary helper.** The bridge attaches `{ id, name, queue, attempt }`
  and `queueJobOf(request)` reads it. A handler uses this only to compare a queued run with an
  atomic admission claim; ordinary business handlers never inspect transport metadata.
- **Blocking connections cannot be shared.** `Worker` and `QueueEvents` block on reads and get their
  own clients from `RedisDbService.options()`; `Queue` and `FlowProducer` may share the pooled one.
- **Never set ioredis `keyPrefix` for queue connections** — BullMQ builds its own keys. Pass the
  prefix as BullMQ's `prefix`, derived from `cfg.dbs[].schema`, which is what keeps slots sharing
  one Redis isolated.
- **Cluster is refused** (`UnsupportedArgumentError('redis-queue:cluster')`): BullMQ needs a
  hash-tagged prefix to keep a queue's keys in one slot, and the prefix here is shared with the
  record namespace. Failing at connect beats failing per-command with CROSSSLOT.
- **`enqueueProtocol` builds an UNSIGNED envelope.** The auth middleware that adds the guard's
  header wraps only `entrypoint.invoke`/`call`, so a hand-enqueued job for an entrypoint whose
  served side carries a guard (Ed25519 service-to-service) fails at the bridge as
  `auth:authorization:queue:<alias>` — no retry, nothing in a detached producer's log. A guarded
  route is reached through `call()` where it is bound as a CLIENT; in the process that SERVES it the
  binding has no `call`, so a producer there asks the guards' `authenticated(req)` for the header
  itself and passes it in the envelope's `headers` (viable's `enqueueSigned`), and waits for the
  reply the way the transport does when it needs the outcome (viable's `invokeSigned`). A server
  binding has `handle` only — `invoke` and `call` are undefined in the serving process.
- **Valkey works** — RESP only, no modules, no TTLs, nothing depending on eviction.
- **Schedules are BullMQ job schedulers** (bullmq ≥ 5.78: `upsertJobScheduler` /
  `getJobSchedulers` / `removeJobScheduler`), id `owlmeans:<schedule id>`, reconciled by
  `syncSchedules` inside the worker's `start()` for listened queues only. Rules: `scheduled-jobs`.
- **The Ready-stage middleware is fired, not awaited, by `context.init()`** (`void applyMiddlewares`)
  — worker start and schedule reconciliation complete after `init()` resolves; specs poll.
- **`ctx.service(alias)` throws for an un-initialized non-lazy service**, so a processor cannot be
  registered on the worker before `init()`; register at the Loading stage or after init.
- **An unchanged upsert is not a no-op in BullMQ**: it replaces the pending run, re-fires
  `immediately`, and a pattern upsert collides (`-10`) with a run of the same slot in progress —
  hence the compare-before-upsert.
- **The next scheduled run is produced when the previous one starts processing**
  (`moveToActive`), so no consumer ⇒ no further runs.

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

For per-entity single flight, admission first claims an opaque job id in the entity's projection.
Scheduled/running writes advance its dirty revision and reuse the claim. `onJobResult` releases it
with a job-id/revision compare-and-set and schedules at most one follow-up; `onJobDead` releases or
fails it so the next read/write recovers. Queue concurrency remains available across entities.

## Release note

Publishing common is not "installable" until npm serves it — see the `publishing` skill. Integration
specs for queue behaviour live in `redis-queue`, never in `queue`, which has no broker to test.

Related: [[entrypoints]] (transport seam, binding), [[resources]] (criteria and paging the job
list follows), [[context]] (middleware stages — the worker starts at Ready).
