import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { PLANNING_SERVICE, type PlanningService, type PlanningStore } from '@owlmeans/planning'
import { PLANNING_PROJECT_JOB, PLANNING_PROJECTION_QUEUE } from './queue/consts.js'
import type { ProjectionRequest } from './queue/types.js'
import type { JobProcessor, QueueHooks } from '@owlmeans/queue'
import { foldHelper } from './store/fold.js'
import type { PlanningHostService, ProjectionOptions } from './types.js'
import type { CommitHub, FoldResult } from './store/types.js'

const serviceOf = (ctx: BasicContext<BasicConfig>, opts?: ProjectionOptions): PlanningService =>
  ctx.service<PlanningHostService>(opts?.service ?? PLANNING_SERVICE)

const storeOf = (service: PlanningService, opts?: ProjectionOptions): PlanningStore =>
  opts?.store?.(service) ?? service.store()

const publisherOf = (store: PlanningStore, opts?: ProjectionOptions) =>
  opts?.publish ?? (store.commits as Partial<CommitHub> | undefined)?.publish

/**
 * The body of a projection job: fold one card with the service's `committed` as the commit
 * listener, so the `after` chain runs in the process that took the job.
 *
 * Register it only where the process listens to `PLANNING_PROJECTION_QUEUE`; a durable store adds
 * its own admission and release around it.
 */
export const makeProjectionProcessor = (
  ctx: BasicContext<BasicConfig>, opts?: ProjectionOptions
): JobProcessor<ProjectionRequest, FoldResult> => async job => {
  const service = serviceOf(ctx, opts)
  const store = storeOf(service, opts)
  const publish = publisherOf(store, opts)

  return await foldHelper.foldPending(store, job.data.cardId, job.data.entityId, {
    touch: job.touch,
    onCommitted: async event => { await service.committed(event) },
    ...(publish != null ? { publish } : {}),
  })
}

/**
 * `onJobDead` for the projection queue: every pending transition of the card is marked failed and a
 * failed event is published — otherwise `execute({ wait: true })` and `commits.wait` hang to their
 * timeout. Merge it into the queue driver's hooks.
 */
export const makePlanningQueueHooks = (ctx: BasicContext<BasicConfig>, opts?: ProjectionOptions): QueueHooks => ({
  onJobDead: async (job, reason) => {
    if (job.queue !== PLANNING_PROJECTION_QUEUE || job.name !== PLANNING_PROJECT_JOB) {
      return
    }
    const request = job.data as ProjectionRequest
    const store = storeOf(serviceOf(ctx, opts), opts)
    const publish = publisherOf(store, opts)
    await foldHelper.failPending(store, request.cardId, request.entityId, reason, publish != null ? { publish } : {})
  },
})

/** @deprecated compat:factory-refactor — use `makePlanningQueueHooks(…)` */
export const planningQueueHooks = (ctx: BasicContext<BasicConfig>, opts?: ProjectionOptions): QueueHooks =>
  makePlanningQueueHooks(ctx, opts)
