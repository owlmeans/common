import type { RedisClient } from '@owlmeans/redis-resource'
import type { RedisOptions } from 'ioredis'
import type { JobOptions } from '@owlmeans/queue'
import type { JobSchedulerTemplateOptions } from 'bullmq'

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

export interface DeclaredJob {
  name: string
  opts: JobOptions
}

/** What every run of a schedule is enqueued as. */
export interface ScheduleTemplate {
  name: string
  data: unknown
  opts: JobSchedulerTemplateOptions
}
