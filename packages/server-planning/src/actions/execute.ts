import { handlers } from '@owlmeans/server-api'
import { DEFAULT_COMMIT_TIMEOUT, MAX_COMMIT_POLL, TransitionAction } from '@owlmeans/planning'
import type {
  ExecuteOptions, ExecuteRequest, PlanningProtocols, PlanningScope, TransitionExecution, TransitionReceiptView,
} from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { concealed, handlerFacade } from '../utils/index.js'

/**
 * What a wire execution may say. `actor` is dropped — the scope names the writer — and a create's
 * `createdBy` is the authenticated subject, whatever the body claimed.
 */
export const wireExecution = (body: ExecuteRequest, scope: PlanningScope): TransitionExecution => {
  const { wait: _wait, timeout: _timeout, actor: _actor, ...exec } = body
  if (exec.action === TransitionAction.Create && exec.card != null && typeof exec.card === 'object') {
    const { createdBy: _createdBy, ...draft } = exec.card
    const subject = scope.profileId ?? scope.userId
    exec.card = subject != null ? { ...draft, createdBy: subject } : draft
  }
  return exec
}

/** `wait`/`timeout` as a server grants them: the timeout never holds a request past `maxPoll`. */
export const executeOptionsOf = (body: Pick<ExecuteRequest, 'wait' | 'timeout'>, maxPoll: number): ExecuteOptions => {
  const ceiling = maxPoll * 1000
  if (body.wait !== true) {
    return {}
  }
  const asked = Number(body.timeout ?? DEFAULT_COMMIT_TIMEOUT)
  return { wait: true, timeout: Math.min(Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_COMMIT_TIMEOUT, ceiling) }
}

/** The one write route. */
export const executePlanning = (
  protocol: PlanningProtocols['execute'], opts?: PlanningHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['request']> =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async (): Promise<TransitionReceiptView> => {
    const facade = await handlerFacade(ctx, req, opts)
    const body = (req.body ?? {}) as ExecuteRequest
    const receipt = await facade.execute(
      wireExecution(body, facade.scope), executeOptionsOf(body, opts?.maxPoll ?? MAX_COMMIT_POLL)
    )

    return receipt.card !== undefined
      ? { transition: receipt.transition, card: receipt.card }
      : { transition: receipt.transition }
  }))
