import { handlers } from '@owlmeans/server-api'
import { MAX_COMMIT_POLL } from '@owlmeans/planning'
import type {
  ExecuteOptions, ExecuteRequest, PlanningFacade, PlanningProtocols, PlanningScope, TransitionExecution,
  TransitionReceiptView,
} from '@owlmeans/planning'
import type { Context, PlanningAccess, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import { executionHelper } from './execution.js'
import type { RequestHandler } from './types.js'

/** The one write route. */
export const executePlanning = (
  protocol: PlanningProtocols['execute'], opts?: PlanningHandlerOptions
): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.concealed(async (): Promise<TransitionReceiptView> => {
    const { facade, access } = await planningHandlerOf(ctx).handlerScopeOf(req, opts)
    const body = (req.body ?? {}) as ExecuteRequest
    const exec = executionHelper.wireExecution(body, facade.scope)
    await executionHelper.assertExecutionGranted(facade, exec, access)
    const receipt = await facade.execute(exec, executionHelper.executeOptionsOf(body, opts?.maxPoll ?? MAX_COMMIT_POLL))

    return receipt.card !== undefined
      ? { transition: receipt.transition, card: receipt.card }
      : { transition: receipt.transition }
  }))

/** @deprecated compat:factory-refactor — use `executionHelper.wireExecution(…)` */
export const wireExecution = (body: ExecuteRequest, scope: PlanningScope): TransitionExecution =>
  executionHelper.wireExecution(body, scope)

/** @deprecated compat:factory-refactor — use `executionHelper.executeOptionsOf(…)` */
export const executeOptionsOf = (body: Pick<ExecuteRequest, 'wait' | 'timeout'>, maxPoll: number): ExecuteOptions =>
  executionHelper.executeOptionsOf(body, maxPoll)

/** @deprecated compat:factory-refactor — use `executionHelper.assertExecutionWrites(…)` */
export const assertExecutionWrites = async (
  facade: PlanningFacade, exec: TransitionExecution, access?: PlanningAccess
): Promise<void> => await executionHelper.assertExecutionWrites(facade, exec, access)

/** @deprecated compat:factory-refactor — use `executionHelper.assertExecutionGranted(…)` */
export const assertExecutionGranted = async (
  facade: PlanningFacade, exec: TransitionExecution, access?: PlanningAccess
): Promise<void> => await executionHelper.assertExecutionGranted(facade, exec, access)
