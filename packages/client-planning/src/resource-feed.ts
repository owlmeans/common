import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { mentionHelper, PLANNING_SERVICE, type PlanningRecord } from '@owlmeans/planning'
import type { ListResult } from '@owlmeans/resource'
import { planningContextOf } from './helper.js'
import type { PlanningClientService, PlanningFeed, PlanningFeedState, PlanningResourceFeedOptions } from './types.js'

/** Refresh separate resources into the stock stores; a stopped/changed-tenant feed cannot publish. */
export const makePlanningResourceFeed = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, opts: PlanningResourceFeedOptions = {}
): PlanningFeed => {
  const stores = planningContextOf(context).stores()
  if (stores == null) throw new SyntaxError('Planning feed needs appendPlanningStores(context)')
  const service = context.service<PlanningClientService>(PLANNING_SERVICE)
  const { lifecycle } = service
  const operation = lifecycle.capture()
  const active = () => !stopped && operation.active()
  const facade = service.for(opts.scope)
  const state: PlanningFeedState = { connected: false, seeded: false, error: null }
  let stopped = false
  let pending: Promise<void> | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  const refresh = async (): Promise<void> => {
    if (!active()) return
    if (pending != null) return await pending
    pending = (async () => {
      try {
        for (const name of ['assignees', 'teams', 'comments', 'mentions'] as const) {
          const query = opts[name]
          if (query == null) continue
          const store = stores[name]
          const { page: _page, size: _size, sort: _sort, ids, nickname, authentication, ...where } = query as Record<string, any>
          const matches = { ...where, ...(ids != null ? { id: { $in: ids } } : {}),
            ...(nickname != null ? { nicknameKey: mentionHelper.nicknameKey(nickname) } : {}),
            ...(authentication != null ? { 'authentication.provider': authentication.provider, 'authentication.externalId': authentication.externalId } : {}),
            ...(opts.scope?.entityId != null ? { entityId: opts.scope.entityId } : {}) }
          // Capture prior versions before the request: a local mutation/new row arriving while
          // the seed is in flight must survive an older snapshot's absence.
          const snapshot = (await operation.wait<ListResult<PlanningRecord>>(store.list(matches as never, { size: 0 }))).items
          operation.check()
          const rows = await operation.wait<ListResult<PlanningRecord>>(facade[name].list(query as never))
          if (!active()) return
          const named = new Set(rows.items.map(row => row.id))
          await lifecycle.mutate(operation, async () => {
            if (!(query.size != null && query.size > 0)) {
              for (const row of snapshot) if (!named.has(row.id)) {
                const current = await store.load(row.id!)
                if (current?.version === row.version) await store.delete(row.id!)
              }
            }
            for (const row of rows.items as PlanningRecord[]) {
              const previous = await store.load(row.id!)
              if (previous == null || previous.version <= row.version) await store.save(row as never)
            }
          })
        }
        if (active()) Object.assign(state, { seeded: true, error: null })
      } catch (error) { if (active()) state.error = error as Error }
      if (active()) opts.onChange?.({ ...state })
    })()
    try { await pending } finally { pending = undefined }
  }
  const ready = refresh().then(() => {
    if (active() && (opts.refresh ?? 5000) > 0) timer = setInterval(() => { void refresh() }, opts.refresh ?? 5000)
  })
  let unregister: (() => void) | undefined
  const feed: PlanningFeed = {
    get connected() { return state.connected }, get seeded() { return state.seeded }, get error() { return state.error },
    ready, refresh,
    stop: async () => {
      stopped = true; operation.cancel(); unregister?.()
      if (timer != null) clearInterval(timer)
      await lifecycle.drain()
      operation.release()
    },
  }
  unregister = service.registerFeed(feed)
  return feed
}
