import { memoHelper, type BasicConfig, type BasicContext } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { PLANNING_SERVICE, type PlanningFacade, type PlanningScope, type PlanningService } from '@owlmeans/planning'
import type { PlanningHandlerOptions, PlanningHostService } from '../types.js'
import type { PlanningHandlerHelper } from './handler/types.js'
import { makeRequestScope } from './request.js'
import type { HandlerScope } from './types.js'

export const makePlanningHandlerHelper = (ctx: BasicContext<BasicConfig>): PlanningHandlerHelper => {
  const planningServiceOf = (opts?: Pick<PlanningHandlerOptions, 'service'>): PlanningService =>
    ctx.service<PlanningHostService>(opts?.service ?? PLANNING_SERVICE)

  const handlerScopeOf = async (req: AbstractRequest, opts?: PlanningHandlerOptions): Promise<HandlerScope> => {
    const planningService = planningServiceOf(opts)
    const extra = await opts?.scope?.(req, ctx)
    if (opts?.access == null) {
      return { facade: planningService.for(makeRequestScope(req).scopeOf(extra ?? undefined)) }
    }
    const access = await opts.access(req, ctx)

    return { facade: planningService.for(makeRequestScope(req).accessScopeOf(access, extra ?? undefined)), access }
  }

  const handlerFacade = async (req: AbstractRequest, opts?: PlanningHandlerOptions): Promise<PlanningFacade> =>
    (await handlerScopeOf(req, opts)).facade

  const planningFor = (
    req: AbstractRequest, extra?: Partial<PlanningScope>, opts?: Pick<PlanningHandlerOptions, 'service'>
  ): PlanningFacade => planningServiceOf(opts).for(makeRequestScope(req).scopeOf(extra))

  return { planningServiceOf, handlerScopeOf, handlerFacade, planningFor }
}

/** The handler helper of a context — one per context. */
export const planningHandlerOf = memoHelper.oncePer(makePlanningHandlerHelper)
