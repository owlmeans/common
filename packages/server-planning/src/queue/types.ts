import type { JobOptions, QueueWorkerOptions } from '@owlmeans/queue'

/** What one projection job folds. */
export interface ProjectionRequest {
  cardId: string
  entityId: string
  /** The transition that requested projection; it is a hint rather than a fold bound. */
  transition?: string
}

export interface PlanningQueueOptions {
  worker?: QueueWorkerOptions
  defaults?: JobOptions
}
