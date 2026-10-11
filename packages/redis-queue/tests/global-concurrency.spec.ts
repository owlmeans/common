import { afterAll, describe, expect, test } from 'bun:test'
import { makeRedisQueueWorker } from '@owlmeans/redis-queue'
import type { RedisQueueWorkerService } from '@owlmeans/redis-queue'
import { gate, makeSuite, pause } from './context.js'

describe('queue global concurrency across workers', () => {
  if (gate.skip) { test.skip(gate.reason ?? 'Redis unavailable', () => {}); return }
  const suite = makeSuite('media-concurrency')
  let second: RedisQueueWorkerService | undefined
  afterAll(async () => { await second?.stop(); await suite.teardown() })

  test('two workers collectively run at most five media jobs', async () => {
    let active = 0
    let peak = 0
    const process = async (): Promise<number> => {
      active++
      peak = Math.max(peak, active)
      try { await pause(150); return active } finally { active-- }
    }
    const booted = await suite.boot({ queues: [{ name: 'media', jobs: ['capture'], globalConcurrency: 5, worker: { concurrency: 5 } }], listen: ['media'],
      setup: context => context.service<RedisQueueWorkerService>('queue').process('media', 'capture', process) })
    second = makeRedisQueueWorker('second-media')
    second.ctx = booted.context
    second.process('media', 'capture', process)
    await second.start()
    const jobs = booted.jobs('media')
    const enqueued = await Promise.all(Array.from({ length: 20 }, () => jobs.create({ name: 'capture', data: {} })))
    await Promise.all(enqueued.map(job => jobs.wait(job.id!, { timeout: 20_000 })))
    expect(peak).toBe(5)
    expect(active).toBe(0)
  }, 30_000)
})
