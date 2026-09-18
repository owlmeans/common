import { afterAll, describe, expect, test } from 'bun:test'
import { JobState } from '@owlmeans/queue'
import { gate, makeSuite, pause } from './context.js'

/**
 * The consuming half against a real broker.
 *
 * Three things are asserted here and nothing else can stand in for them: a registered processor
 * actually receives the job, a job name nothing can run is refused ONCE rather than retried, and
 * `touch()` puts time back on the lock — which is the only reason a long processor survives.
 */
describe('@owlmeans/redis-queue — worker', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('worker')

  /** Short enough that the lock's remaining time moves visibly inside one processor. */
  const lockDuration = 4_000

  const boot = async () => await suite.boot({
    queues: [{
      name: 'work',
      jobs: ['echo', 'orphan', 'slow'],
      worker: { lockDuration, concurrency: 1 }
    }],
    listen: ['work']
  })

  afterAll(async () => {
    await suite.teardown()
  })

  test('a registered processor receives the job and its value reaches the caller', async () => {
    const booted = await boot()
    booted.worker().process<{ value: string }, { echoed: string }>(
      'work', 'echo', async job => ({ echoed: job.data.value })
    )

    const queue = booted.jobs<{ value: string }, { echoed: string }>('work')
    const record = await queue.create({ name: 'echo', data: { value: 'round-trip' } })

    expect(await queue.wait(record.id as string, { timeout: 20_000 }))
      .toEqual({ echoed: 'round-trip' })
  })

  test('the worker reports the queues it actually consumes', async () => {
    const booted = await boot()

    expect(booted.worker().listening()).toEqual(['work'])
  })

  test('processing a queue this process does not consume is a deployment error', async () => {
    const booted = await boot()

    expect(() => booted.worker().process('elsewhere', 'echo', async () => undefined))
      .toThrow(/not-listening/)
  })

  test('a job name nothing can run fails once, as its own error class', async () => {
    const booted = await boot()
    const queue = booted.jobs<{ value: string }, unknown>('work')

    const record = await queue.create({
      name: 'orphan', data: { value: 'nobody-runs-this' }, opts: { attempts: 3 }
    })

    await expect(queue.wait(record.id as string, { timeout: 20_000 }))
      .rejects.toThrow(/unknown-job-name/)

    const failed = await queue.get(record.id as string)
    expect(failed.state).toBe(JobState.Failed)
    // Three attempts were allowed and one was spent: nothing in this process can ever run the
    // name, so retrying would only move the same failure down the backlog.
    expect(failed.attempts).toBe(1)
  })

  test('touch puts time back on the lock', async () => {
    const booted = await boot()
    const observed: number[] = []

    booted.worker().process<{ value: string }, string>('work', 'slow', async job => {
      const lock = `${booted.keys}:work:${job.id}:lock`
      observed.push(await booted.client.pttl(lock))
      await pause(800)
      observed.push(await booted.client.pttl(lock))
      await job.touch()
      observed.push(await booted.client.pttl(lock))

      return 'held'
    })

    const queue = booted.jobs<{ value: string }, string>('work')
    const record = await queue.create({ name: 'slow', data: { value: 'hold-the-lock' } })

    expect(await queue.wait(record.id as string, { timeout: 20_000 })).toBe('held')

    const [taken, elapsed, renewed] = observed
    expect(taken).toBeGreaterThan(lockDuration - 500)
    expect(elapsed).toBeLessThan(taken - 500)
    expect(renewed).toBeGreaterThan(elapsed + 500)
  })
})
