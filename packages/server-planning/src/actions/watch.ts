import { logger } from '@owlmeans/log'
import { PLANNING_COMMIT_EVENT } from '@owlmeans/planning'
import type { CommitEvent, CommitFeedQuery, PlanningProtocols } from '@owlmeans/planning'
import { connection } from '@owlmeans/server-socket'
import type { EventMessage } from '@owlmeans/socket'
import { MessageType } from '@owlmeans/socket'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

const log = logger('planning:watch')

const text = (value: unknown): string | undefined =>
  value == null || value === '' ? undefined : `${value}`

/**
 * The notify tool: push the caller's entity's commits down a socket as `planning-commit` frames.
 *
 * The subscription is filtered by the authenticated entity (never a query value) and optionally by
 * `project`/`card`. A frame without `record` — what a cross-process bus delivers — gets the card as
 * it reads now (`null` once deleted), so a subscriber never re-reads per frame.
 */
export const watchCommits = (
  protocol: PlanningProtocols['commit']['events'], opts?: PlanningHandlerOptions
): RequestHandler => connection<typeof protocol, Context>(protocol, async (conn, ctx, req) => {
  const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)
  const query = (req.query ?? {}) as CommitFeedQuery
  const frame = opts?.event ?? PLANNING_COMMIT_EVENT
  const filter = {
    ...(text(query.project) != null ? { project: text(query.project) } : {}),
    ...(text(query.card) != null ? { card: text(query.card) } : {}),
  }

  const unsubscribe = await facade.commits.subscribe(async (event: CommitEvent) => {
    try {
      const enriched = event.record !== undefined ? event : { ...event, record: await facade.cards.load(event.card) }
      await conn.notify(frame, enriched)
    } catch (e) {
      log.warn('Planning commit notify failed', e)
    }
  }, filter)

  conn.listen(async message => {
    if (typeof message !== 'object') {
      return
    }
    const msg = message as EventMessage<void>
    if (msg.type === MessageType.System && msg.event === 'close') {
      try {
        unsubscribe()
      } catch (e) {
        log.warn('Planning commit unsubscribe failed', e)
      }
    }
  })
})
