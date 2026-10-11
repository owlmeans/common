import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import { PLANNING_SERVICE, queryHelper, type Relationship, type RelationshipQuery, type Unsubscribe } from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import { planningMirrorOf } from './events.js'
import { planningContextOf } from './helper.js'
import { syncHelper } from './sync.js'
import type { PlanningClientService, PlanningFeed, PlanningFeedOptions, PlanningFeedState } from './types.js'
import { recordUtils } from './utils/record.js'

const log = logger('client-planning')

const linkCriteriaOf = (query: RelationshipQuery): Criteria<Relationship> =>
  recordUtils.clean({ from: query.from, to: query.to, type: query.type }) as Criteria<Relationship>

/**
 * Keep the state mirror current: subscribe to commits FIRST, then seed from the list, then fold
 * every frame — and, with `refresh`, re-seed on an interval as the authoritative backstop to a
 * socket that can drop frames. React-free: a hook wraps it, a Node process uses it as it is.
 *
 * The seed is `syncHelper.syncCards` over `where` (default `queryHelper.criteriaOf(query)`), never
 * `replace()`: the store holds every kind, and a board's list must not drop the projects beside it. A
 * card a frame wrote while the list was in flight is kept even when the list does not name it yet. A
 * PAGED seed only writes — a page cannot say what does not exist.
 *
 * Without a socket opener the feed is a seed plus its refresh; `commits.wait` still long-polls.
 *
 * @throws {SyntaxError} when the context has no planning client or no planning stores
 */
export const makePlanningFeed = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, opts: PlanningFeedOptions = {}
): PlanningFeed => {
  const stores = planningContextOf(context).stores()
  if (stores == null) {
    throw new SyntaxError('Planning feed needs appendPlanningStores(context)')
  }
  const service = context.service<PlanningClientService>(PLANNING_SERVICE)
  const { lifecycle } = service
  const operation = lifecycle.capture()
  const facade = service.for(opts.scope)
  const mirror = planningMirrorOf(stores)

  const state: PlanningFeedState = { connected: false, seeded: false, error: null }
  const report = (patch: Partial<PlanningFeedState>): void => {
    if (!active()) return
    const next = { ...state, ...patch }
    if (next.connected === state.connected && next.seeded === state.seeded && next.error === state.error) {
      return
    }
    Object.assign(state, next)
    opts.onChange?.({ ...state })
  }

  const paged = opts.query?.size != null && opts.query.size > 0
  const where = opts.where ?? queryHelper.criteriaOf(opts.query)
  const touched = new Set<string>()
  let seeding = 0
  let stopped = false
  const active = () => !stopped && operation.active()
  let unsubscribe: Unsubscribe | null = null
  let timer: ReturnType<typeof setInterval> | undefined

  const seed = async (): Promise<void> => {
    if (!active()) {
      return
    }
    seeding += 1
    try {
      const answer = await operation.wait(facade.cards.list(paged ? opts.query : { ...opts.query, size: 0 }))
      if (!active()) {
        return
      }
      if (paged) {
        await mirror.applyCards(answer.items, { lifecycle, operation })
      } else {
        await lifecycle.mutate(operation, async () => await syncHelper.syncCards(stores.cards, answer.items, where, { keep: touched }))
      }
      if (opts.links != null) {
        const links = await operation.wait(facade.relationships.list({ ...opts.links, size: opts.links.size ?? 0 }))
        if (active()) {
          const criteria = linkCriteriaOf(opts.links)
          await lifecycle.mutate(operation, async () => await syncHelper.syncLinks(stores.links, links.items, criteria))
        }
      }
      report({ seeded: true, error: null })
    } catch (e) {
      if (active()) {
        report({ error: e as Error })
      }
    } finally {
      seeding -= 1
      if (seeding === 0) {
        touched.clear()
      }
    }
  }

  const ready = (async () => {
    try {
      const subscribing = Promise.resolve(service.commits.subscribe(async event => {
        if (!active()) return
        if (seeding > 0) {
          touched.add(event.card)
        }
        try {
          await mirror.applyCommitEvent(event, facade, { lifecycle, operation })
        } catch (e) {
          if (active()) log.warn('Planning feed apply failed', { card: event.card, error: e })
        }
      }, opts.filter))
      void subscribing.then(stop => { if (!active()) stop() }, () => {})
      const stop = await operation.wait(subscribing)
      if (!active()) {
        stop()
        return
      }
      unsubscribe = stop
      report({ connected: service.commits.connected() })
    } catch (e) {
      report({ error: e as Error })
    }
    await seed()
    if (active() && opts.refresh != null && opts.refresh > 0) {
      timer = setInterval(() => { void seed() }, opts.refresh)
    }
  })()

  let unregister: (() => void) | undefined
  const feed: PlanningFeed = {
    get connected() { return state.connected },
    get seeded() { return state.seeded },
    get error() { return state.error },
    ready,
    refresh: seed,
    stop: async () => {
      stopped = true
      operation.cancel()
      unregister?.()
      if (timer != null) {
        clearInterval(timer)
      }
      unsubscribe?.()
      unsubscribe = null
      await lifecycle.drain()
      operation.release()
    },
  }
  unregister = service.registerFeed(feed)
  return feed
}
