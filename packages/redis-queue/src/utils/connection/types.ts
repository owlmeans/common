import type { RedisDbService } from '@owlmeans/redis-resource'
import type { QueueConnection } from '../types.js'

/** Where a queue lives in redis and how it connects there. */
export interface QueueConnectionHelper {
  /**
   * The key namespace a queue lives under: the db's own prefix, normalised the way
   * `@owlmeans/redis-resource` normalises it, plus the suffix that keeps a queue's structures out of
   * the record namespace an ordinary resource walks with SCAN.
   */
  queuePrefix: (prefix: string) => string
  /**
   * Everything a queue needs from the redis service, resolved once.
   *
   * @throws {UnsupportedArgumentError} against a cluster: bullmq keeps one queue's keys on one node
   * by hash-tagging the prefix, and this driver's prefix is shared with the record namespace, so a
   * clustered deployment would fail per command with CROSSSLOT rather than at configuration time.
   */
  queueConnection: (redis: RedisDbService, dbAlias?: string) => Promise<QueueConnection>
}
