import { declareQueue } from '@owlmeans/queue'
import type { Config, JobOptions, QueueWorkerOptions } from '@owlmeans/queue'

/**
 * The projection queue — a separate subpath so a browser bundle importing `@owlmeans/planning`
 * never pulls `@owlmeans/queue`.
 *
 * The projection is a BARE processor, not a queued entrypoint: a queued entrypoint names one
 * service, and the same queue is served by every process that folds.
 */
export const PLANNING_PROJECTION_QUEUE = 'planning-projection'

/** The one job the projection queue accepts. */
export const PLANNING_PROJECT_JOB = 'planning:project'

/** What one projection job folds. */
export interface ProjectionRequest {
  cardId: string
  entityId: string
  /** The transition that asked for it — a hint, never the fold's bound. */
  transition?: string
}

export interface PlanningQueueOptions {
  worker?: QueueWorkerOptions
  defaults?: JobOptions
}

/** Declare the projection queue in the SHARED config; `listenQueues` stays each process's own. */
export const declarePlanningQueue = <C extends Config>(cfg: C, opts?: PlanningQueueOptions): C =>
  declareQueue(cfg, PLANNING_PROJECTION_QUEUE, [PLANNING_PROJECT_JOB], opts)
