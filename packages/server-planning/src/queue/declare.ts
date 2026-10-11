import { declareQueue, type Config } from '@owlmeans/queue'
import { PLANNING_PROJECT_JOB, PLANNING_PROJECTION_QUEUE } from './consts.js'
import type { PlanningQueueOptions } from './types.js'

/** Declare the shared projection address; each process separately chooses whether to listen. */
export const declarePlanningQueue = <C extends Config>(cfg: C, opts?: PlanningQueueOptions): C =>
  declareQueue(cfg, PLANNING_PROJECTION_QUEUE, [PLANNING_PROJECT_JOB], opts)
