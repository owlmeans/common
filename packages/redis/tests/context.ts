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
 *
 * A spec that walks the namespace — `list`, `count`, `purge` — boots under its own resource
 * alias, because a resource's keys are namespaced by `<schema>-<alias>` and the walk sees every
 * key of the alias it belongs to, including the ones an earlier test in the same file left.
 */
export const makeSuite = (label: string): RedisSuite => {
  const base = process.env.REDIS_TEST_KEY_PREFIX ?? 'omt'
  const prefix = randomNamespace(`${base}_${label}`)
  const resources: Array<RedisResource<TestRecord>> = []

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
    const booted = context.resource<RedisResource<TestRecord>>(alias)
    resources.push(booted)

    return { context, resource: booted }
  }

  /**
   * Every key the suite wrote, matched as `<prefix>*` rather than `<prefix>:*`: a resource
   * namespaces its keys as `<schema>-<alias>:<id>`, so the schema is followed by a dash, not
   * by the separator. SCAN for the same reason the resource uses it — KEYS blocks the server.
   */
  const teardown = async (): Promise<void> => {
    if (gate.skip) {
      return
    }
    for (const resource of resources) {
      const client = resource.db?.client
      if (client == null) continue
      try {
        const keys: string[] = []
        let cursor = '0'
        do {
          const [next, batch] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500)
          cursor = next
          keys.push(...batch)
        } while (cursor !== '0')
        if (keys.length > 0) {
          await client.del(keys)
        }
      } catch {
        // A connection already gone takes its keys' cleanup with it — the prefix is unique
        // per run, so anything left behind never collides with another suite.
      }
      await client.quit().catch(() => undefined)
    }
    resources.length = 0
  }

  return { prefix, boot, teardown }
}
