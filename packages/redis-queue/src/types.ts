import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { QueueConfig, QueueHooks, QueueResource, QueueWorkerService } from '@owlmeans/queue'

export interface Config extends ServerConfig {
  queue?: QueueConfig
}

export interface Context<C extends Config = Config> extends ServerContext<C> { }

/**
 * Named aliases for the contract types. Releasing connections (`close`) and registering hooks
 * (`hooks`) are part of `@owlmeans/queue` itself, so an application binds to the contract and
 * these exist only to spell the driver's own return types.
 */
export interface RedisQueueResource<D = unknown, R = unknown> extends QueueResource<D, R> { }

export interface RedisQueueWorkerService extends QueueWorkerService { }

export interface RedisQueueOptions {
  /** The alias the worker service is registered under. Defaults to the queue package's own. */
  alias?: string
  /** Which configured db carries the queues. Defaults to `cfg.queue.db`, then to the redis one. */
  db?: string
  /** The redis service alias to take connections from. */
  service?: string
  hooks?: QueueHooks
}
