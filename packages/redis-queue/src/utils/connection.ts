import type { RedisDbService } from '@owlmeans/redis-resource'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import { QUEUE_KEY_SUFFIX } from '../consts.js'
import type { QueueConnection } from './types.js'
import type { QueueConnectionHelper } from './connection/types.js'

export const createQueueConnectionHelper = (): QueueConnectionHelper => {
  const queuePrefix = (prefix: string): string =>
    `${prefix.replaceAll(/\W+/g, '_')}-${QUEUE_KEY_SUFFIX}`

  const queueConnection = async (
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

  return { queuePrefix, queueConnection }
}

export const queueConnectionHelper = createQueueConnectionHelper()

/** @deprecated compat:factory-refactor — use `queueConnectionHelper.queuePrefix(…)` */
export const queuePrefix = (prefix: string): string => queueConnectionHelper.queuePrefix(prefix)
