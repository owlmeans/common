import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { criteriaOf, PLANNING_SERVICE } from '@owlmeans/planning'
import type { Relationship, RelationshipQuery, Unsubscribe } from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import { applyCards, applyCommitEvent } from './events.js'
import { planningStoresOf, syncCards, syncLinks } from './stores.js'
import type { PlanningClientService, PlanningFeed, PlanningFeedOptions, PlanningFeedState } from './types.js'
import { clean } from './utils/record.js'

const linkCriteriaOf = (query: RelationshipQuery): Criteria<Relationship> =>
  clean({ from: query.from, to: query.to, type: query.type }) as Criteria<Relationship>

/**
 * Keep the state mirror current: subscribe to commits FIRST, then seed from the list, then fold
 * every frame — and, with `refresh`, re-seed on an interval as the authoritative backstop to a
 * socket that can drop frames. React-free: a hook wraps it, a Node process uses it as it is.
 *
 * The seed is `syncCards` over `where` (default `criteriaOf(query)`), never `replace()`: the store
 * holds every kind, and a board's list must not drop the projects beside it. A card a frame wrote
 * while the list was in flight is kept even when the list does not name it yet. A PAGED seed only
 * writes — a page cannot say what does not exist.
 *
 * Without a socket opener the feed is a seed plus its refresh; `commits.wait` still long-polls.
 *
 * @throws {SyntaxError} when the context has no planning client or no planning stores
 */
export const makePlanningFeed = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, opts: PlanningFeedOptions = {}
): PlanningFeed => {
  const stores = planningStoresOf(context)
  if (stores == null) {
    throw new SyntaxError('Planning feed needs appendPlanningStores(context)')
  }
  const service = context.service<PlanningClientService>(PLANNING_SERVICE)
  const facade = service.for(opts.scope)

  const state: PlanningFeedState = { connected: false, seeded: false, error: null }
  const report = (patch: Partial<PlanningFeedState>): void => {
    const next = { ...state, ...patch }
    if (next.connected === state.connected && next.seeded === state.seeded && next.error === state.error) {
      return
    }
    Object.assign(state, next)
    opts.onChange?.({ ...state })
  }

  const paged = opts.query?.size != null && opts.query.size > 0
  const where = opts.where ?? criteriaOf(opts.query)
  const touched = new Set<string>()
  let seeding = 0
  let stopped = false
  let unsubscribe: Unsubscribe | null = null
  let timer: ReturnType<typeof setInterval> | undefined

  const seed = async (): Promise<void> => {
    if (stopped) {
      return
    }
    seeding += 1
    try {
      const answer = await facade.cards.list(paged ? opts.query : { ...opts.query, size: 0 })
      if (stopped) {
        return
      }
      if (paged) {
        await applyCards(stores, answer.items)
      } else {
        await syncCards(stores.cards, answer.items, where, { keep: touched })
      }
      if (opts.links != null) {
        const links = await facade.relationships.list({ ...opts.links, size: opts.links.size ?? 0 })
        if (!stopped) {
          await syncLinks(stores.links, links.items, linkCriteriaOf(opts.links))
        }
      }
      report({ seeded: true, error: null })
    } catch (e) {
      if (!stopped) {
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
      const stop = await service.commits.subscribe(async event => {
        if (seeding > 0) {
          touched.add(event.card)
        }
        try {
          await applyCommitEvent(stores, event, facade)
        } catch (e) {
          console.error('Planning feed apply error:', e)
        }
      }, opts.filter)
      if (stopped) {
        stop()
        return
      }
      unsubscribe = stop
      report({ connected: service.commits.connected() })
    } catch (e) {
      report({ error: e as Error })
    }
    await seed()
    if (!stopped && opts.refresh != null && opts.refresh > 0) {
      timer = setInterval(() => { void seed() }, opts.refresh)
    }
  })()

  return {
    get connected() { return state.connected },
    get seeded() { return state.seeded },
    get error() { return state.error },
    ready,
    refresh: seed,
    stop: async () => {
      stopped = true
      if (timer != null) {
        clearInterval(timer)
      }
      unsubscribe?.()
      unsubscribe = null
    },
  }
}
