# @owlmeans/queue

Job queues as resources, and the route protocol that lets a queued call look like any other call.

## Overview

This package is contracts only — it carries no broker code. A driver implements them
(`@owlmeans/redis-queue` does, over BullMQ); depend on this package from a shared contract
package, and on the driver only where the application wires itself up.

The point of it: a route that names `RouteProtocols.QUEUE` is taken by the queue transport, so the
caller writes `ep.call(...)` exactly as it would for HTTP. Moving a service-to-service call onto
the broker is a change to one declaration rather than to every call site, and a call that used to
die with the process survives a restart.

## Installation

```bash
bun add @owlmeans/queue@^0.1.18-rc.8
```

## Declaring queues

Queues and the job names they accept belong in the shared backend package, so producer and
consumer read the same list:

```typescript
import { declareQueue, listenQueues } from '@owlmeans/queue'

declareQueue(cfg, AGENT_WORK, ['agent:story:develop', 'agent:story:code'], {
  worker: { concurrency: 3, lockDuration: 60_000 }
})
```

Which queues a given process consumes is a separate, process-local statement:

```typescript
listenQueues(cfg, AGENT_WORK, AGENT_OPS)   // absent ⇒ this process only produces
```

A declaration is an address; `listen` is a deployment fact. Keeping them apart is what lets the
same binary run as a producer in one deployment and a worker in another.

## Declaring a queued entrypoint

```typescript
import { job } from '@owlmeans/route'

entrypoint(
  route(agent.story.develop, '/:id/develop',
    job({ parent: agent.story.base, service: AGENT, queue: AGENT_WORK, timeout: 30_000 })),
  filter(params(StoryParamsSchema))
)
```

It is served with `elevate(...)` and called with `call()` like any backend entrypoint. Add
`reply: false` to return as soon as the job is accepted — the call resolves `Accepted` with
`{ id, queue }`, which is what a long pipeline wants.

## Jobs are records

```typescript
const jobs = ctx.jobs<DevelopInput, DevelopResult>(AGENT_WORK)

const queued = await jobs.create({ queue: AGENT_WORK, name: 'agent:story:code', data: input })
const result = await jobs.wait(queued.id, { timeout: 120_000 })

const failed = await jobs.list({ state: JobState.Failed })
await jobs.take(queued.id)          // cancel and return
```

`QueueResource<D, R>` is a `Resource<JobRecord<D, R>>` composed with `PubSubResource<JobEvent<R>>`,
so criteria, sorting and paging behave as they do for every other backend. Only what the base
contract cannot express is added: `wait`, `flow` and `counts`.

Deriving `JobOptions.id` from what the job is about (`develop:<storyId>`) makes a duplicate
enqueue a no-op, which is what makes an admission step safe to retry.

## Processors

```typescript
worker.process(AGENT_WORK, 'agent:story:code', async job => {
  for (const screen of screens) {
    await job.touch()
    await develop(screen)
  }
  return { ok: true }
})
```

`touch()` is not optional in a long loop. The broker judges liveness by the lock, so going quiet
for longer than `lockDuration` is indistinguishable from a dead worker and the job is re-run
elsewhere while this one is still going.

A child job reports a domain failure by RETURNING `{ ok: false, error }`. Throwing means
"infrastructure broke, retry me". Parents read `children()` and decide — children never fail
their parent directly.

Retries default to a single attempt: this work mostly talks to a model, and a blind retry
re-spends the tokens that just failed.

## Job graphs

```typescript
await jobs.flow({
  name: 'story:finalize', data: ref, children: [
    { name: 'story:gate', data: ref, children: [{ name: 'story:code', data: ref }] }
  ]
})
```

Nesting is sequence, siblings are parallel, and a parent reading `children()` is the join.

## Errors

A refusal the caller must recognise travels in the reply and is rebuilt on the producing side as
its own class, so `instanceof` keeps working across the broker. `QueueTimeout` means the WAIT
ended, not the job — read the job back to learn what became of it.

## Related Packages

- [`@owlmeans/redis-queue`](../redis-queue) — the BullMQ driver, and where queue integration tests live
- [`@owlmeans/route`](../route) — `RouteProtocols.QUEUE` and the `job()` builder
- [`@owlmeans/entrypoint`](../entrypoint) — declarations and the transport seam
- [`@owlmeans/resource`](../resource) — the `Resource` contract jobs are read through

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
