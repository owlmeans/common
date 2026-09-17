---
name: scheduled-jobs
description: Recurring background work on OwlMeans queues — declareSchedule in @owlmeans/queue, reconciled into BullMQ job schedulers by @owlmeans/redis-queue when a listening worker starts. Covers interval vs cron schedules, the processor a sweep runs, overlap and restart semantics, renaming and removing a schedule, multi-replica and rolling-deploy behaviour, and testing. Use when adding a nightly or periodic job, replacing a platform CronJob or a setInterval with a schedule, or diagnosing a schedule that does not run.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Scheduled jobs

**Layer:** Infra · **Packages:** `@owlmeans/queue` (lead — the declaration), `@owlmeans/redis-queue`
(the reconciliation)

A schedule is a declaration that makes the broker produce an ordinary job on an interval or a cron
pattern. A worker that consumes the queue runs it with a processor. There is no second scheduler
process, no cron table and no timer in application code.

## When a schedule is the answer

| Situation | Answer |
|---|---|
| Periodic sweep, reconciliation, digest, retention delete, rollup | A schedule on a queue a worker consumes |
| "Remind this user in 20 minutes" | `JobOptions.delay` on one job — a schedule is not per record |
| A far-future or cancellable per-record deadline | A row with a due date, swept by one schedule |
| A deployment that runs no worker | A platform `CronJob` calling a guarded entrypoint |
| A `setInterval` inside a request handler or a long-lived service | A schedule — the interval dies with the process and runs once per replica |

Whether the work belongs on a queue at all is `resource-choice`.

## Declaring

In the SHARED package every process loads, after the queue:

```typescript
declareQueue(cfg, APP_MAINTENANCE, ['app:maintenance:reconcile', 'app:maintenance:purge'], {
  worker: { concurrency: 1, lockDuration: 60_000 }
})
declareSchedule(cfg, {
  id: 'app-nightly-reconcile', queue: APP_MAINTENANCE, name: 'app:maintenance:reconcile',
  pattern: '17 3 * * *', tz: 'UTC', data: {},
})
declareSchedule(cfg, {
  id: 'app-purge-expired', queue: APP_MAINTENANCE, name: 'app:maintenance:purge', every: 15 * 60_000,
})
```

And only in the process that runs them: `listenQueues(cfg, APP_MAINTENANCE)` plus a processor per
job name, registered while the context is wired.

- **`pattern` for the calendar, `every` for a frequency.** A nightly job is a pattern with an
  explicit `tz`; "every quarter hour, whenever" is `every`. Pick an odd minute (`17 3 * * *`) so
  many applications' sweeps do not stampede one Redis at the top of the hour.
- **`every` runs at once** when the scheduler is created (unless `startDate` says otherwise); a
  pattern waits for its next match unless `immediately: true`, which fires only when the scheduler
  is created or its declaration changes — never on an unchanged restart.
- **The id is permanent.** It is the scheduler's identity in the broker: any other field changes in
  place, a renamed id is a removed schedule plus a new one. Prefix it with the application
  (`app-…`) — ids share one namespace per queue.
- **Declaration errors surface at boot.** `declareSchedule` throws `UnknownQueue`,
  `UnknownJobName` or `ScheduleMisdeclared` (`<id>:<reason>`) rather than letting the broker fail
  on every tick.
- **`opts` sets retries and retention for every run; `id` and `delay` are refused** — the broker
  names each run and places it on the schedule.

## Writing the processor

```typescript
worker.process<Record<string, never>, SweepReport>(APP_MAINTENANCE, 'app:maintenance:reconcile',
  async job => {
    const report = { scanned: 0, repaired: 0, failed: 0 }
    for await (const page of organizations({ size: 200 })) {
      await job.touch()
      for (const organization of page) {
        try {
          report.repaired += await reconcile(organization.entityId) ? 1 : 0
        } catch (error) {
          report.failed++
          console.error(`reconcile ${organization.entityId}`, error)
        }
        report.scanned++
      }
    }
    console.info(`[maintenance] ${job.scheduled}`, report)
    return report
  })
```

- **A scheduled run has no caller.** No credentials, no entity, no request: it is a processor job,
  never a guarded entrypoint. A step that must go through another service's guard calls that
  service with service credentials.
- **Idempotent per item, not per run.** A worker rolled out mid-sweep, a stalled lock or a manual
  re-run repeats the whole sweep; each item's repair must be a no-op the second time.
- **One item's failure is logged and counted, never thrown.** A thrown sweep is retried from the
  start, or dropped after its attempts — either way the other items pay for one bad record.
- **`touch()` per page.** A sweep over every organization outlives `lockDuration` easily; silence
  hands the job to another worker while this one is still going.
- **Return a small report.** It lands on the completed job, where an operator reads it.

## Overlap, replicas and deploys

- **One job per tick, whatever the replica count.** The broker produces one job; one worker takes
  it. Several replicas listening to the queue do not multiply runs.
- **Runs can overlap on a concurrent queue.** The next run is produced when the previous one
  starts, so a run that outlasts the interval meets its successor. Put sweeps on their own queue
  with `concurrency: 1`, apart from interactive lanes.
- **A schedule needs a consumer.** Only a listening worker creates the scheduler, and the next run
  is produced only when the previous one starts processing. A queue nothing consumes stops.
- **Every listener reconciles at start, from its own configuration.** It creates or updates what it
  declares and removes the schedules it owns (`owlmeans:` scheduler ids) that it does not. Every
  process listening to one queue must load the same schedule list; during a rolling deploy the
  newest process to start wins, and the old pods leave the broker alone after their own start.
- **Removing a schedule is deleting its declaration.** The next worker start removes the scheduler.
  So is a declaration whose job name the queue no longer accepts, or whose `endDate` has passed.
- **Scheduling never costs consumption.** A refused declaration or a broker failure while
  reconciling is logged and skipped; the worker keeps consuming. Look for
  `redis-queue-schedules:<queue>` in the worker's log when a schedule does not appear.

## Diagnosing "it never ran"

1. Is some process listening to the queue (`listenQueues`) and is its worker up?
2. Did that process's start log a `redis-queue-schedules:<queue>` refusal?
3. Does `new Queue(queue, { connection, prefix }).getJobSchedulers()` list `owlmeans:<id>` with the
   expected `pattern`/`every`, `tz` and `next`?
4. Is a processor registered for the job name? A run without one fails once as `UnknownJobName`
   and shows in the failed state.
5. Is a previous run still active on a `concurrency: 1` queue?

## Testing

- **The declaration** is category A in the application's own shared package: build the config,
  `assertSchedules(cfg)`, and pin ids and job names against the queue declaration.
- **The processor** is tested as a function over a fake `JobContext` or a real context — it is
  ordinary code with a `touch`.
- **Against a broker** (Redis-gated): the worker's Ready-stage start is not awaited by
  `context.init()`, so poll the broker (`getJobSchedulers`) or wait for the first run instead of
  asserting straight after boot. A queue's schedulers go with `obliterate()`.

## External docs

- https://docs.bullmq.io/guide/job-schedulers — `upsertJobScheduler(id, { every | pattern, tz,
  startDate, endDate, limit, immediately }, { name, data, opts })` creates or updates one scheduler
  per id and replaces its pending run; `getJobSchedulers()` / `removeJobScheduler(id)`. The next job
  is added when the previous one starts processing, so a worker must be consuming. Produced jobs
  carry `repeatJobKey` = the scheduler id.

## Related

- `queue` — `declareSchedule`, `JobContext.scheduled`, processor rules
- `redis-queue` — `syncSchedules`, the `owlmeans:` ownership prefix, the reconciliation rules
- `resource-choice` — whether recurring work belongs on a queue at all
