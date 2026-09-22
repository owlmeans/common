import { declareQueue } from '@owlmeans/queue'
import type { Config, JobOptions, QueueWorkerOptions } from '@owlmeans/queue'

/** The server-side queue used to project planning transitions. */
export const PLANNING_PROJECTION_QUEUE = 'planning-projection'

/** The processor name accepted by the planning projection queue. */
export const PLANNING_PROJECT_JOB = 'planning:project'

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

/** Declare the shared projection address; each process separately chooses whether to listen. */
export const declarePlanningQueue = <C extends Config>(cfg: C, opts?: PlanningQueueOptions): C =>
  declareQueue(cfg, PLANNING_PROJECTION_QUEUE, [PLANNING_PROJECT_JOB], opts)
