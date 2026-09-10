import { randomNamespace, redisGate } from '@owlmeans/test-integration'
import type { IntegrationGate, RedisEnv } from '@owlmeans/test-integration'
import { config, makeServerContext } from '@owlmeans/server-context'
import { appendRedis, DEFAULT_ALIAS as REDIS_ALIAS } from '@owlmeans/redis'
import type { RedisClient, RedisDbService } from '@owlmeans/redis-resource'
import { declareQueue, listenQueues, DEFAULT_ALIAS as QUEUE_ALIAS } from '@owlmeans/queue'
import type {
  JobOptions, QueueAppend, QueueHooks, QueueResource, QueueWorkerOptions, QueueWorkerService
} from '@owlmeans/queue'
import type { BasicEntrypoint } from '@owlmeans/context'
import { Queue } from 'bullmq'
import { appendRedisQueue, queuePrefix, queueResourceAlias } from '@owlmeans/redis-queue'
import type { Config, Context, RedisQueueResource, RedisQueueWorkerService } from '@owlmeans/redis-queue'

export const gate: IntegrationGate<RedisEnv> = redisGate()

export interface DeclaredQueue {
  name: string
  jobs: string[]
  worker?: QueueWorkerOptions
  defaults?: JobOptions
}

export interface BootOptions {
  queues: DeclaredQueue[]
  /** The queues this test process consumes. Absent means a producer-only suite. */
  listen?: string[]
  entrypoints?: BasicEntrypoint[]
  hooks?: QueueHooks
}

export interface QueueSuite {
  /** Key prefix this suite owns end to end. Obliterated by {@link QueueSuite.teardown}. */
  prefix: string
  boot: (opts: BootOptions) => Promise<Booted>
  teardown: () => Promise<void>
}

export interface Booted {
  context: Context
  client: RedisClient
  /** The bullmq key prefix the suite's queues actually live under. */
  keys: string
  jobs: <D = unknown, R = unknown>(queue: string) => QueueResource<D, R>
  worker: () => RedisQueueWorkerService
}

/**
 * One key prefix per suite, obliterated by that suite's own `afterAll` — bun runs every spec file
 * of a package in one process, so a process-global cleanup would let the first file to finish drop
 * the keys of the files still to come.
 *
 * A suite boots once: a queue is enumerated whole by `list`, `count` and `purge`, so two contexts
 * sharing a queue name would see each other's jobs. Tests that walk a queue take a queue of their
 * own instead.
 */
export const makeSuite = (label: string): QueueSuite => {
  const base = process.env.REDIS_TEST_KEY_PREFIX ?? 'omt'
  const prefix = randomNamespace(`${base}_${label}`)

  let booted: Booted | undefined
  let declared: string[] = []

  const boot = async (opts: BootOptions): Promise<Booted> => {
    if (booted != null) {
      return booted
    }

    const url = new URL(gate.env.REDIS_URL as string)
    const cfg = config<Config>('redis-queue-test', {
      dbs: [{
        service: REDIS_ALIAS,
        alias: REDIS_ALIAS,
        host: url.hostname,
        port: url.port !== '' ? Number(url.port) : 6379,
        user: url.username !== '' ? url.username : undefined,
        secret: decodeURIComponent(url.password),
        schema: prefix,
      }]
    })

    opts.queues.forEach(queue => declareQueue(cfg, queue.name, queue.jobs, {
      worker: queue.worker, defaults: queue.defaults
    }))
    if (opts.listen != null) {
      listenQueues(cfg, ...opts.listen)
    }
    declared = opts.queues.map(queue => queue.name)

    const context = makeServerContext<Config, Context>(cfg)
    appendRedis(context)
    opts.entrypoints?.forEach(entrypoint => context.registerEntrypoint(entrypoint))
    appendRedisQueue(context, { hooks: opts.hooks })

    context.configure()
    await context.init()

    booted = {
      context,
      client: await context.service<RedisDbService>(REDIS_ALIAS).client(),
      keys: queuePrefix(prefix),
      // Through the mixin the applications use, not through the registry behind it — the accessor
      // is what refuses an undeclared queue.
      jobs: <D, R>(queue: string) => (context as unknown as QueueAppend).jobs<D, R>(queue),
      worker: () => context.service<RedisQueueWorkerService>(QUEUE_ALIAS),
    }

    return booted
  }

  /**
   * Workers first, then the resources' own connections, then the keys. `obliterate` needs the
   * queue quiet — a worker still consuming would be handed jobs while they are being dropped.
   */
  const teardown = async (): Promise<void> => {
    if (booted == null) {
      return
    }
    const { context, client, keys } = booted

    if (context.hasService(QUEUE_ALIAS)) {
      await context.service<QueueWorkerService>(QUEUE_ALIAS).stop()
    }
    for (const name of declared) {
      await context.resource<RedisQueueResource>(queueResourceAlias(name)).close()
    }
    for (const name of declared) {
      const queue = new Queue(name, { connection: client, prefix: keys })
      try {
        await queue.obliterate({ force: true })
      } finally {
        await queue.close()
      }
    }
    await client.quit().catch(() => undefined)

    booted = undefined
    declared = []
  }

  return { prefix, boot, teardown }
}

/** Poll until `check` holds, so a spec waits for the broker rather than for a fixed delay. */
export const until = async (
  check: () => Promise<boolean>, timeout = 10_000, step = 50
): Promise<void> => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, step))
  }

  throw new Error(`condition not met within ${timeout}ms`)
}

export const pause = async (ms: number): Promise<void> =>
  await new Promise(resolve => setTimeout(resolve, ms))
