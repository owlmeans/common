import { requireEntityKey } from '@owlmeans/auth-common'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { PLANNING_SERVICE } from '@owlmeans/planning'
import type { PlanningFacade, PlanningScope, PlanningService, TransitionActor } from '@owlmeans/planning'
import type { PlanningHandlerOptions, PlanningHostService } from '../types.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value != null && value !== '')) as T

/** The authenticated subject of a request, as a transition names it. */
export const actorOf = (req: AbstractRequest): TransitionActor => clean({
  profileId: req.auth?.profileId,
  userId: req.auth?.userId,
})

/**
 * The scope a request reads and writes as.
 *
 * `entityId` is `requireEntityKey(req)` — the resolved organization id, never a value from the
 * body or the query — and `extra` cannot replace it; `extra` adds what the deployment derives
 * (a `channel`, a `service`). The actor is the authenticated subject plus that channel.
 *
 * @throws {AuthorizationError} when the request carries no organization
 */
export const scopeOf = (req: AbstractRequest, extra?: Partial<PlanningScope>): PlanningScope => {
  const entityId = requireEntityKey(req)
  const subject = actorOf(req)
  const channel = extra?.channel ?? extra?.actor?.channel

  return clean({
    ...extra,
    ...subject,
    entityId,
    channel,
    actor: clean({ ...extra?.actor, ...subject, channel }),
  }) as PlanningScope
}

export const planningServiceOf = (
  ctx: BasicContext<BasicConfig>, opts?: Pick<PlanningHandlerOptions, 'service'>
): PlanningService => ctx.service<PlanningHostService>(opts?.service ?? PLANNING_SERVICE)

/** The facade a handler works through: the request's scope plus what `opts.scope` derives. */
export const handlerFacade = async (
  ctx: BasicContext<BasicConfig>, req: AbstractRequest, opts?: PlanningHandlerOptions
): Promise<PlanningFacade> => {
  const extra = await opts?.scope?.(req, ctx)

  return planningServiceOf(ctx, opts).for(scopeOf(req, extra ?? undefined))
}
