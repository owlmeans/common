---
name: queue
description: How to use @owlmeans/queue — job queues as resources, the QUEUE route protocol that makes a queued call indistinguishable from an HTTP one, declaring queues and job names, the producer/consumer split, job graphs, envelope freshness, and the rules a processor must follow. Auto-invoked when importing queue types or declaring a job route.
user-invocable: false
---

# @owlmeans/queue

**Layer:** Infra
**Install:** `"@owlmeans/queue": "^0.1.18-rc.8"` in `dependencies`

Contracts only. It carries no broker code — a driver package (`@owlmeans/redis-queue`) implements
them. Depend on this one from a shared contract package; depend on the driver only where the
application wires itself up.

## The one idea

A queued call is an ordinary entrypoint call. The route names `RouteProtocols.QUEUE`, the
transport registered under that protocol takes it, and the caller writes `ep.call(...)` exactly as
for HTTP. Nothing at a call site says "queue".

That is what makes it worth having: moving a service-to-service call onto the broker is a change
to a declaration, not to the places that call it, and the broker holds the work across a restart of
either side — which an in-process call cannot.

## Declaring

Queues and the jobs they accept live in the SHARED backend package, so producers and consumers
read one list:

```typescript
declareQueue(cfg, AGENT_WORK, ['agent:story:develop', 'agent:story:code'], {
  worker: { concurrency: 3, lockDuration: 60_000 }
})
```

The job list is enforced, not documentation: enqueueing a name the queue does not declare throws
`UnknownJobName` instead of parking a job nothing can ever process. Re-declaring a name replaces,
so a helper that runs once per composed app is safe to call twice.

Which queues a process CONSUMES is separate, and lives in that process's own config:

```typescript
listenQueues(cfg, AGENT_WORK, AGENT_OPS)   // absent ⇒ producer only
```

Keep them apart. A declaration is an address; `listen` is a deployment fact. If a worker bound
whatever it could serve, every deployment of the same binary would consume everything it imports.

A queued entrypoint is declared like any other, with `job()` in place of `backend()`:

```typescript
entrypoint(
  route(agent.story.develop, '/:id/develop',
    job({ parent: agent.story.base, service: AGENT, queue: AGENT_WORK, timeout: 30_000 })),
  filter(params(StoryParamsSchema))
)
```

`reply: false` makes it fire-and-forget: the call resolves `Accepted` with `{ id, queue }` as soon
as the BROKER has accepted the enqueue — before any worker has picked the job up, so the resolution
says the job exists and nothing about it having started. That is what a long pipeline wants; watch
the job by its id for anything further. The default is to wait for the value, for
`req.timeout ?? route.timeout ?? DEFAULT_JOB_TIMEOUT` (60 s).

## Jobs are records

`ctx.jobs<D, R>(queue)` returns a `QueueResource<D, R>` — a `Resource<JobRecord<D, R>>` plus
pub/sub. So inspecting a queue is the resource contract you already know: `create` enqueues,
`get`/`load`/`list`/`count` inspect, `delete`/`take` cancel, `purge` bulk-cancels. Only what the
base contract cannot express is added: `wait(id, { timeout })`, `flow(root)`, `counts()`, and
`close()` for the connections a producer that waited holds.

Called with no queue name it answers the SOLE declared queue and throws `UnknownQueue` once there
are two — an application that grows a second queue is told to name one rather than quietly served
the wrong backlog. A queue nothing declared throws the same error at the call site.

Give `JobOptions.id` a value derived from what the job is ABOUT (`develop:<storyId>`) and a
duplicate enqueue becomes a no-op returning the job already there — no `RecordExists`. That is
what makes an admission step safe to retry.

## Writing a processor

```typescript
const worker = context.service<QueueWorkerService>(DEFAULT_ALIAS)

worker.process(AGENT_WORK, 'agent:story:code', async job => {
  for (const screen of screens) {
    await job.touch()        // ← not optional
    await develop(screen)
  }
  return { ok: true }
})
```

Registering against a queue this process does not `listen` to throws `QueueNotListening` — the
question is a deployment one, so it is answered at wiring time rather than when a job arrives.

Three rules, each of which has a failure mode attached:

- **`touch()` in every long loop.** The broker judges liveness by the lock. Silence for longer
  than `lockDuration` is indistinguishable from a dead worker, so the job is handed to someone
  else while this one is still working — you get two runs, not one. `progress(value)` reports
  without renewing, and the value must be JSON-carryable.
- **Children report, parents decide.** A child returns `{ ok: false, error }` for a DOMAIN
  failure; it does not throw. Throwing means "infrastructure broke, retry me". A child that
  exhausts its attempts does not fail its parent: the parent runs and reads `children()` /
  `failedChildren()` — both keyed by bare job id — and decides. Give the children of a flow that
  spans queues distinct ids, because that re-keying collapses two ids that are equal across queues.
- **Retries default to one attempt** (`DEFAULT_ATTEMPTS`). These jobs mostly talk to a model, and
  a blind retry re-spends the tokens that just failed. Raise `attempts` per queue only where jobs
  are cheap and idempotent.

`job.signal` is the queue's abort signal, and it is NOT an interrupt. The driver stops by closing
every worker first — which waits for the jobs in flight to return — and aborts only afterwards, so
a processor cannot bail out on it and does not need to. An orderly stop drains; an outright kill is
covered by the rule below.

## Being restartable

A worker can die mid-job; the lock expires and the step re-runs. So a processor has to be safe to
run twice — skip work already recorded, delete the rows a previous attempt created, or accept
regenerating over a baseline. Decide this per job and say so in a comment; there is no way to make
it automatic.

## A queued call is still a guarded call

`handleJob` rebuilds the request from the envelope and runs the entrypoint as the HTTP boundary
would: the declared guards are tried in order, the first that matches authorizes, the entity is
attached, and only then does the handler run. A queued entrypoint with guards therefore needs the
producer's credentials on the envelope's `headers`, and an unauthorized job answers
`AuthorizationError`. An alias this process does not serve answers `JobNotServed` — the job was
taken by a worker that has no handler for it.

Set `cfg.queue.envelopeTtl` (seconds) to bound how long a job envelope stays acceptable. The age is
measured from the envelope's `enqueuedAt` — when the PRODUCER enqueued it, not when a worker picked
it up — so a captured envelope stops being replayable, and so does a job that sat behind a backlog
longer than the window: it answers `EnvelopeExpired` at pickup rather than running late. Size the
window against the longest backlog you are willing to let run, and leave `envelopeTtl` unset — the
default — for a queue whose jobs may legitimately wait.

## Errors cross the hop as classes

A refusal the caller must recognise — `ContentRefused`, `AgentLocked` — is marshalled into the
reply and rebuilt on the producer side as its own class, so `catch (e) { if (e instanceof ...) }`
keeps working across the broker. Only broker- and connection-level faults propagate as throws,
because those are the only ones a retry can fix.

## What runs where

`queueWorkerMiddleware()` starts the worker at the **Ready** stage — processors register while the
application wires up, and binding earlier would take jobs the process cannot yet run. A process
that listens to nothing registers no worker and pays nothing.

`canServeModule` in `@owlmeans/server-api/utils` excludes QUEUE routes, the same way it excludes
sockets: the worker takes those jobs off the broker, and mounting them on the HTTP server too would
answer every call twice. `servedJobs` is the mirror image — the entrypoints this process both serves and
listens to, grouped by queue, which is what a driver binds.

## Key exports

| Export | Description |
|--------|-------------|
| `declareQueue` / `listenQueues` | Configuration — what exists, and what this process consumes |
| `queueOf` / `queueOfJob` / `isListening` | Reading it back; `queueOf` throws `UnknownQueue` |
| `QueueConfig` / `QueueDeclaration` / `QueueWorkerOptions` / `JobOptions` | The configuration shapes |
| `QueueResource<D, R>` | A queue addressed as a resource, plus `wait` / `flow` / `counts` / `close` |
| `JobRecord<D, R>` / `JobState` / `isSettled` / `JobEvent` / `JobEventType` | The record shape and lifecycle |
| `FlowSpec<D>` | A graph node — `name`, optional `queue`, `data`, `opts`, `children` |
| `QueueWorkerService` | `process(queue, name, fn)`, `start`, `stop`, `listening`, `hooks` |
| `JobContext<D>` | What a processor gets: `id`, `name`, `queue`, `attempt`, `data`, `signal`, `touch`, `progress`, `children`, `failedChildren` |
| `QueueHooks` | `wrapHandler`, `onJobResult`, `onJobStalled`, `onJobDead` — the compensation seam |
| `QueueAppend` | The `ctx.jobs(queue?)` mixin a driver installs; `QueueDriver` is what a driver supplies |
| `appendQueueTransport` / `makeQueueTransport` | Binds the QUEUE protocol so `call()` routes through the broker |
| `queueWorkerMiddleware` | Starts the worker at Ready stage |
| `handleJob` / `servedJobs` / `entrypointProcessor` | The bridge a driver dispatches through |
| `requestOf` / `assertFresh` / `JobEnvelope` / `JobReply` | The envelope, and rebuilding a request from it |
| Errors | `QueueError`, `QueueTimeout`, `UnknownJob`, `UnknownJobName`, `UnknownQueue`, `QueueNotListening`, `JobNotServed`, `EnvelopeExpired` |
| Constants | `DEFAULT_ALIAS` (`queue`), `DEFAULT_JOB_TIMEOUT` (60 000 ms), `DEFAULT_ATTEMPTS` (1) |

## Depends On

- `@owlmeans/context` — service registration and the middleware stage
- `@owlmeans/entrypoint` — the transport seam and the served-entrypoint dispatch
- `@owlmeans/route` — `RouteProtocols.QUEUE` and the `job()` builder
- `@owlmeans/resource` — the `Resource` contract jobs are read through
- `@owlmeans/auth` / `@owlmeans/auth-common` — guarding a queued call and attaching its entity
- `@owlmeans/error` — marshalling a refusal across the hop

## Related

- `redis-queue` — the BullMQ driver; integration tests for queue behaviour live there
- `server-job` / `client-job` — exposing a queue's jobs to an application's UI (list, cancel,
  progress over a socket), without touching the contracts here
- `entrypoint` — declarations, elevation, and the transport lookup
- `resource` — the criteria and paging semantics `list` follows
