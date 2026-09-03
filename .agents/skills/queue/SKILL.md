---
name: queue
description: How to use @owlmeans/queue — job queues as resources, the QUEUE route protocol that makes a queued call indistinguishable from an HTTP one, declaring queues and job names, the producer/consumer split, job graphs, and the rules a processor must follow. Auto-invoked when importing queue types or declaring a job route.
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
to a declaration, not to the ~100 places that call it, and a call that used to die with the
process now survives a restart.

## Declaring

Queues and the jobs they accept live in the SHARED backend package, so producers and consumers
read one list:

```typescript
declareQueue(cfg, AGENT_WORK, ['agent:story:develop', 'agent:story:code'], {
  worker: { concurrency: 3, lockDuration: 60_000 }
})
```

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
as the job is taken, which is what a long pipeline wants. The default is to wait for the value.

## Jobs are records

`ctx.jobs<D, R>(queue)` returns a `QueueResource<D, R>` — a `Resource<JobRecord<D, R>>` plus
pub/sub. So inspecting a queue is the resource contract you already know: `create` enqueues,
`get`/`load`/`list`/`count` inspect, `delete`/`take` cancel, `purge` bulk-cancels. Only what the
base contract cannot express is added: `wait(id, { timeout })`, `flow(root)`, `counts()`.

Give `JobOptions.id` a value derived from what the job is ABOUT (`develop:<storyId>`) and a
duplicate enqueue becomes a no-op. That is what makes an admission step safe to retry.

## Writing a processor

```typescript
worker.process(AGENT_WORK, 'agent:story:code', async job => {
  for (const screen of screens) {
    await job.touch()        // ← not optional
    await develop(screen)
  }
  return { ok: true }
})
```

Three rules, each of which has a failure mode attached:

- **`touch()` in every long loop.** The broker judges liveness by the lock. Silence for longer
  than `lockDuration` is indistinguishable from a dead worker, so the job is handed to someone
  else while this one is still working — you get two runs, not one.
- **Children report, parents decide.** A child returns `{ ok: false, error }` for a DOMAIN
  failure; it does not throw. Throwing means "infrastructure broke, retry me". Children never set
  `failParentOnFailure` — the parent reads `children()` / `failedChildren()` and decides.
- **Retries default to one attempt.** These jobs mostly talk to a model, and a blind retry
  re-spends the tokens that just failed. Raise `attempts` per queue only where jobs are cheap and
  idempotent.

## Being restartable

A worker can die mid-job; the lock expires and the step re-runs. So a processor has to be safe to
run twice — skip work already recorded, delete the rows a previous attempt created, or accept
regenerating over a baseline. Decide this per job and say so in a comment; there is no way to make
it automatic.

## Errors cross the hop as classes

A refusal the caller must recognise — `ContentRefused`, `AgentLocked` — is marshalled into the
reply and rebuilt on the producer side as its own class, so `catch (e) { if (e instanceof ...) }`
keeps working across the broker. Only broker- and connection-level faults propagate as throws,
because those are the only ones a retry can fix.

## What runs where

`queueWorkerMiddleware()` starts the worker at the **Ready** stage — processors register while the
application wires up, and binding earlier would take jobs the process cannot yet run. A process
that listens to nothing registers no worker and pays nothing.

`canServe` in `@owlmeans/server-api` excludes QUEUE routes, the same way it excludes sockets: the
worker takes those jobs off the broker, and mounting them on the HTTP server too would answer
every call twice.

## Key exports

| Export | Description |
|--------|-------------|
| `declareQueue` / `listenQueues` / `queueOf` | Configuration — what exists, what this process consumes |
| `QueueResource<D, R>` | A queue addressed as a resource, plus `wait` / `flow` / `counts` |
| `JobRecord<D, R>` / `JobState` / `JobEvent` | The record shape and lifecycle |
| `QueueWorkerService` | `process(queue, name, fn)`, `start`, `stop`, `listening` |
| `JobContext<D>` | What a processor gets: `data`, `signal`, `touch`, `progress`, `children` |
| `appendQueueTransport` | Binds the QUEUE protocol so `call()` routes through the broker |
| `queueWorkerMiddleware` | Starts the worker at Ready stage |
| `handleJob` / `servedJobs` / `entrypointProcessor` | The bridge a driver dispatches through |
| `QueueHooks` | `onJobResult`, `onJobStalled`, `onJobDead` — the compensation seam |

## Depends On

- `@owlmeans/context` — service registration and the middleware stage
- `@owlmeans/entrypoint` — the transport seam and the served-entrypoint dispatch
- `@owlmeans/route` — `RouteProtocols.QUEUE` and the `job()` builder
- `@owlmeans/resource` — the `Resource` contract jobs are read through
- `@owlmeans/error` — marshalling a refusal across the hop

## Related

- `redis-queue` — the BullMQ driver; integration tests for queue behaviour live there
- `server-job` / `client-job` — exposing a queue's jobs to an application's UI (list, cancel,
  progress over a socket), without touching the contracts here
- `entrypoint` — declarations, elevation, and the transport lookup
- `resource` — the criteria and paging semantics `list` follows
