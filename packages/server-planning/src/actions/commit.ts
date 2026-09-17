import { handlers } from '@owlmeans/server-api'
import { CommitState, MAX_COMMIT_POLL } from '@owlmeans/planning'
import type { CommitStatus, PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { clampSeconds, concealed, handlerFacade } from '../utils/index.js'

/**
 * The poll tool: a commit's status, held open up to `wait` seconds (clamped to `maxPoll`).
 *
 * status → settled or no wait: answer → subscribe → poll again (a commit landing between the two
 * reads is caught by the subscription) → race the subscription against the timer → answer the
 * status as it is then, still `pending` when nothing landed.
 *
 * @throws {WorkcardNotFound} for another entity's transition
 */
export const getCommit = (
  protocol: PlanningProtocols['commit']['get'], opts?: PlanningHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['request']> =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async (): Promise<CommitStatus> => {
    const facade = await handlerFacade(ctx, req, opts)
    const transition = `${req.params.transition}`

    let status = await facade.commits.status(transition)
    const wait = clampSeconds(req.query?.wait, opts?.maxPoll ?? MAX_COMMIT_POLL)
    if (status.state !== CommitState.Pending || wait <= 0) {
      return status
    }

    let landed = false
    let wake: () => void = () => { landed = true }
    const unsubscribe = await facade.commits.subscribe(event => {
      if (event.transition === transition && event.state !== CommitState.Pending) {
        wake()
      }
    })
    try {
      status = await facade.commits.status(transition)
      if (status.state === CommitState.Pending) {
        if (!landed) {
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, wait * 1000)
            wake = () => {
              clearTimeout(timer)
              resolve()
            }
          })
        }
        status = await facade.commits.status(transition)
      }
    } finally {
      unsubscribe()
    }

    return status
  }))
