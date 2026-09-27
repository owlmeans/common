import { afterAll, describe, expect, test } from 'bun:test'
import {
  declareQueue, declareSchedule, DEFAULT_ALIAS as QUEUE_ALIAS, UnknownJobName
} from '@owlmeans/queue'
import type { Config as QueueConfig, QueueWorkerService, ScheduleDeclaration } from '@owlmeans/queue'
import { Queue } from 'bullmq'
import { SCHEDULE_PREFIX, syncSchedules } from '@owlmeans/redis-queue'
import type { Context } from '@owlmeans/redis-queue'
import { gate, makeSuite, pause, until } from './context.js'
import type { BootOptions, Booted } from './context.js'

/** The scheduler ids a queue holds, sorted — ours and anybody else's. */
const schedulerKeys = async (booted: Booted, queue: string): Promise<string[]> => {
  const bull = new Queue(queue, { connection: booted.client, prefix: booted.keys })
  try {
    return (await bull.getJobSchedulers(0, -1)).map(scheduler => scheduler.key).sort()
  } finally {
    await bull.close()
  }
}

/** Only the schedulers this driver owns. */
const ours = async (booted: Booted, queue: string): Promise<string[]> =>
  (await schedulerKeys(booted, queue)).filter(key => key.startsWith(SCHEDULE_PREFIX))

/** Far enough away that a pattern schedule never produces a run while the suite is alive. */
const YEARLY = '0 0 1 1 *'

/**
 * Schedules against a real broker.
 *
 * What only a broker can show: a scheduled run reaches its processor carrying the schedule id, a
 * restart reconciles rather than duplicates, a schedule deleted from the code is removed while a
 * scheduler somebody else owns is not, and a refused declaration never costs the worker its queue.
 */
describe('@owlmeans/redis-queue — schedules', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('schedule')
  /** Every run a processor received, labelled with the boot whose worker took it. */
  const runs: Array<{ boot: number, name: string, scheduled?: string }> = []
  let boots = 0

  const tick: ScheduleDeclaration = { id: 'tick', queue: 'maintenance', name: 'tick', every: 1_000 }
  const retired: ScheduleDeclaration = {
    id: 'retired', queue: 'maintenance', name: 'report', pattern: YEARLY, tz: 'UTC',
  }

  const register = (context: Context): void => {
    const boot = ++boots
    const worker = context.service<QueueWorkerService>(QUEUE_ALIAS)
    for (const name of ['tick', 'sweep', 'report']) {
      worker.process<unknown, string>('maintenance', name, async job => {
        runs.push({ boot, name, scheduled: job.scheduled })
        return name
      })
    }
  }

  const options = (overrides: Partial<BootOptions> = {}): BootOptions => ({
    queues: [
      { name: 'maintenance', jobs: ['tick', 'sweep', 'report'] },
      // Declared so teardown obliterates it; nothing listens, `syncSchedules` is driven by hand.
      { name: 'direct', jobs: ['yearly'] },
    ],
    listen: ['maintenance'],
    schedules: [tick],
    setup: register,
    ...overrides,
  })

  /** A tick taken by the CURRENT boot's worker — that worker has started, and so has its sync. */
  const tickedByThisBoot = async (): Promise<void> => {
    const boot = boots
    await until(async () => runs.some(run => run.boot === boot && run.name === 'tick'), 15_000)
  }

  afterAll(async () => {
    await suite.teardown()
  })

  test('an interval schedule produces a run that knows its schedule', async () => {
    const booted = await suite.boot(options())

    await tickedByThisBoot()
    expect(runs.find(run => run.name === 'tick')?.scheduled).toBe('tick')

    const queue = booted.jobs<unknown, string>('maintenance')
    const sweep = await queue.create({ name: 'sweep', data: {} })
    expect(await queue.wait(sweep.id as string, { timeout: 20_000 })).toBe('sweep')
    expect(runs.find(run => run.name === 'sweep')?.scheduled).toBeUndefined()
  }, 30_000)

  test('a restart reconciles the scheduler instead of adding a second', async () => {
    await suite.boot(options())
    const restarted = await suite.reboot(options())
    await tickedByThisBoot()

    expect(await ours(restarted, 'maintenance')).toEqual([`${SCHEDULE_PREFIX}tick`])
  }, 30_000)

  test('a schedule removed from the code is removed; a foreign scheduler survives', async () => {
    const withRetired = await suite.reboot(options({ schedules: [tick, retired] }))
    await until(async () => (await ours(withRetired, 'maintenance')).length === 2)

    const bull = new Queue('maintenance', { connection: withRetired.client, prefix: withRetired.keys })
    try {
      await bull.upsertJobScheduler('foreign-yearly', { pattern: YEARLY }, { name: 'report' })
    } finally {
      await bull.close()
    }

    const without = await suite.reboot(options({ schedules: [tick] }))
    await until(async () => !(await ours(without, 'maintenance')).includes(`${SCHEDULE_PREFIX}retired`))

    expect(await schedulerKeys(without, 'maintenance'))
      .toEqual(['foreign-yearly', `${SCHEDULE_PREFIX}tick`])
  }, 30_000)

  test('an undeclared job name is refused while the rest is scheduled and consumed', async () => {
    const ghost = { id: 'ghost', queue: 'maintenance', name: 'nothing-runs-this', every: 1_000 }
    expect(() => declareSchedule(options().queues.reduce(
      (cfg, queue) => declareQueue(cfg, queue.name, queue.jobs), { queue: {} } as QueueConfig
    ), ghost)).toThrow(UnknownJobName)

    // Written past `declareSchedule`, so only the driver stands between it and the broker. `retired`
    // comes back beside it: seeing it appear is what proves the sync ran with the ghost refused.
    const booted = await suite.reboot(options({
      schedules: [tick, retired],
      setup: context => {
        register(context)
        context.cfg.queue?.schedules?.push(ghost)
      },
    }))
    await until(async () => (await ours(booted, 'maintenance')).includes(`${SCHEDULE_PREFIX}retired`))

    expect(await ours(booted, 'maintenance'))
      .toEqual([`${SCHEDULE_PREFIX}retired`, `${SCHEDULE_PREFIX}tick`])

    const queue = booted.jobs<unknown, string>('maintenance')
    const report = await queue.create({ name: 'report', data: {} })
    expect(await queue.wait(report.id as string, { timeout: 20_000 })).toBe('report')
  }, 30_000)

  test('an unchanged declaration writes nothing; a changed one is updated in place', async () => {
    const booted = await suite.boot(options())
    const yearly: ScheduleDeclaration = {
      id: 'yearly', queue: 'direct', name: 'yearly', pattern: YEARLY, data: { scope: 'all' },
      opts: { attempts: 2, backoff: { type: 'fixed', delay: 100 } },
    }
    const cfg = (schedule: ScheduleDeclaration) => declareSchedule(
      declareQueue({ queue: {} } as QueueConfig, 'direct', ['yearly']), schedule
    )

    const bull = new Queue('direct', { connection: booted.client, prefix: booted.keys })
    try {
      expect((await syncSchedules(bull, cfg(yearly), 'direct')).upserted).toEqual(['yearly'])
      expect((await syncSchedules(bull, cfg(yearly), 'direct')).unchanged).toEqual(['yearly'])

      const moved = await syncSchedules(bull, cfg({ ...yearly, pattern: '0 0 2 1 *' }), 'direct')
      expect(moved.upserted).toEqual(['yearly'])
      const schedulers = await bull.getJobSchedulers(0, -1)
      expect(schedulers.map(scheduler => [scheduler.key, scheduler.pattern]))
        .toEqual([[`${SCHEDULE_PREFIX}yearly`, '0 0 2 1 *']])

      const dropped = await syncSchedules(bull, declareQueue({ queue: {} } as QueueConfig, 'direct', ['yearly']), 'direct')
      expect(dropped.removed).toEqual(['yearly'])
    } finally {
      await bull.close()
    }
  }, 30_000)
})

/** A process that only produces never touches the broker's schedulers. */
describe('@owlmeans/redis-queue — schedules in a producer', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('schedule_producer')

  afterAll(async () => {
    await suite.teardown()
  })

  test('a producer-only boot creates no scheduler', async () => {
    const booted = await suite.boot({
      queues: [{ name: 'produced', jobs: ['tick'] }],
      schedules: [{ id: 'tick', queue: 'produced', name: 'tick', every: 1_000 }],
    })

    // Nothing to wait for: without a worker there is no start, and so no sync, ever.
    expect(booted.context.hasService(QUEUE_ALIAS)).toBe(false)
    await pause(500)
    expect(await schedulerKeys(booted, 'produced')).toEqual([])
  }, 30_000)
})
