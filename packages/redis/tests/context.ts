import { redisGate, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, RedisEnv } from '@owlmeans/test-integration'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { ResourceRecord } from '@owlmeans/resource'
import { makeRedisResource } from '@owlmeans/redis-resource'
import type { RedisResource } from '@owlmeans/redis-resource'
import { appendRedis, DEFAULT_ALIAS } from '@owlmeans/redis'

export const gate: IntegrationGate<RedisEnv> = redisGate()

export interface TestRecord extends ResourceRecord {
  id: string
  value?: string
}

export interface RedisSuite {
  /** Key prefix this suite owns end to end. Flushed by {@link teardown}. */
  prefix: string
  boot: (alias?: string) => Promise<{
    context: ServerContext<ServerConfig>
    resource: RedisResource<TestRecord>
  }>
  teardown: () => Promise<void>
}

/**
 * One key prefix per suite, dropped by that suite's own `afterAll` — Bun runs every spec
 * file of a package in one process, so a process-global cleanup queue would let the first
 * file to finish flush the keys of the files still to come.
 */
export const makeSuite = (label: string): RedisSuite => {
  const base = process.env.REDIS_TEST_KEY_PREFIX ?? 'omt'
  const prefix = randomNamespace(`${base}_${label}`)
  const contexts: Array<ServerContext<ServerConfig>> = []

  const boot = async (alias = 'test-records'): Promise<{
    context: ServerContext<ServerConfig>
    resource: RedisResource<TestRecord>
  }> => {
    const url = new URL(gate.env.REDIS_URL as string)
    const cfg: ServerConfig = config('redis-test', {
      dbs: [{
        service: DEFAULT_ALIAS,
        alias: DEFAULT_ALIAS,
        host: url.hostname,
        port: url.port !== '' ? Number(url.port) : 6379,
        user: url.username !== '' ? url.username : undefined,
        secret: decodeURIComponent(url.password),
        schema: prefix,
      }]
    } as Partial<ServerConfig>)

    const context = makeServerContext(cfg) as ServerContext<ServerConfig>
    appendRedis(context)
    const resource = makeRedisResource<TestRecord>(alias)
    context.registerResource(resource as never)

    context.configure()
    await context.init()
    contexts.push(context)

    return { context, resource: context.resource<RedisResource<TestRecord>>(alias) }
  }

  const teardown = async (): Promise<void> => {
    if (gate.skip) {
      return
    }
    for (const context of contexts) {
      const resource = context.resource<RedisResource<TestRecord>>('test-records')
      const client = resource.db?.client
      if (client == null) continue
      const keys = await client.keys(`${prefix}:*`).catch(() => [] as string[])
      if (keys.length > 0) {
        await client.del(...keys).catch(() => undefined)
      }
      await client.quit().catch(() => undefined)
    }
    contexts.length = 0
  }

  return { prefix, boot, teardown }
}
