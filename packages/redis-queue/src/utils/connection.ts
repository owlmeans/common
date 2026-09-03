import type { RedisClient, RedisDbService } from '@owlmeans/redis-resource'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { RedisOptions } from 'ioredis'
import { QUEUE_KEY_SUFFIX } from '../consts.js'

/**
 * The key namespace a queue lives under: the db's own prefix, normalised the way
 * `@owlmeans/redis-resource` normalises it, plus the suffix that keeps a queue's structures out of
 * the record namespace an ordinary resource walks with SCAN.
 */
export const queuePrefix = (prefix: string): string =>
  `${prefix.replaceAll(/\W+/g, '_')}-${QUEUE_KEY_SUFFIX}`

export interface QueueConnection {
  /**
   * The pooled client, for everything that only issues commands and returns. Handing bullmq an
   * existing instance also tells it the connection is shared, so closing a queue leaves it alive
   * for the rest of the process.
   */
  client: RedisClient
  /**
   * Settings for a connection of one's own. `Worker` and `QueueEvents` block on a read for the
   * whole time they wait, so they cannot take turns on a pooled client, and bullmq refuses one
   * that would give up after a fixed number of retries — a blocking read has to survive a
   * reconnect rather than fail the worker.
   */
  blocking: RedisOptions
  prefix: string
}

/**
 * Everything a queue needs from the redis service, resolved once.
 *
 * @throws {UnsupportedArgumentError} against a cluster: bullmq keeps one queue's keys on one node
 * by hash-tagging the prefix, and this driver's prefix is shared with the record namespace, so a
 * clustered deployment would fail per command with CROSSSLOT rather than at configuration time.
 */
export const queueConnection = async (
  redis: RedisDbService, dbAlias?: string
): Promise<QueueConnection> => {
  await redis.ready()

  const options = redis.options(dbAlias)
  if (options.single == null) {
    throw new UnsupportedArgumentError('redis-queue:cluster')
  }

  return {
    client: await redis.client(dbAlias),
    // The db index, the password and everything else configured stays as it is — only the two
    // settings that make a connection usable for blocking reads are forced.
    blocking: { ...options.single, maxRetriesPerRequest: null, enableReadyCheck: false },
    prefix: queuePrefix(options.prefix)
  }
}
