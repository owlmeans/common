import { createLazyService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { makeSchemaRegistry, PlanningError } from '@owlmeans/planning'
import type { PlanningService, PlanningStore, Transition, WithPlanningService } from '@owlmeans/planning'
import { DEFAULT_ALIAS } from './consts.js'
import { makeStoreFacade } from './facade.js'
import { makePluginRegistry } from './registry.js'
import type { PluginRegistry } from './registry.js'
import { makeCompositeStore } from './store/composite.js'
import { makeMemoryPlanningStore } from './store/memory.js'
import type { BindablePlanningStore } from './store/types.js'
import type { PlanningHostService, PlanningServiceOptions } from './types.js'

export type PlanningServiceApi = Pick<PlanningService, 'use' | 'plugins' | 'schemas' | 'store' | 'for' | 'committed'>

/** What the facade and the executor reach the service through. */
export interface PlanningRuntime {
  service: () => PlanningService
  registry: PluginRegistry
  options: PlanningServiceOptions
  context: () => BasicContext<BasicConfig> | undefined
  /** The composite store reads and commits go through. */
  reader: () => PlanningStore
  /** Every distinct store: the default one first, then each plugin's. */
  stores: () => PlanningStore[]
}

const contextOf = (service: PlanningService): BasicContext<BasicConfig> | undefined =>
  (service as Partial<PlanningHostService>).ctx as BasicContext<BasicConfig> | undefined

/**
 * The service body, without context registration — spread it into a specialised service; `self`
 * is late-bound for exactly that case.
 *
 * A store receives the service's `committed` through its `bind` the first time the service resolves
 * it, so the store that folds runs the `after` chain in its own process.
 */
export const planningServiceApi = (
  options: PlanningServiceOptions, self: () => PlanningService
): PlanningServiceApi & { runtime: PlanningRuntime } => {
  const schemas = makeSchemaRegistry(options.schemas)
  const bound = new WeakSet<PlanningStore>()
  const bind = (store: PlanningStore): void => {
    if (bound.has(store)) {
      return
    }
    bound.add(store)
    ;(store as BindablePlanningStore).bind?.(async event => { await self().committed(event) })
  }

  const registry = makePluginRegistry(schemas, bind)
  const fallback = options.store ?? makeMemoryPlanningStore({ ids: options.ids, now: options.now })
  bind(fallback)

  let reader: { version: number, store: PlanningStore } | undefined

  const runtime: PlanningRuntime = {
    service: self,
    registry,
    options,
    context: () => contextOf(self()),
    reader: () => {
      if (reader == null || reader.version !== registry.version()) {
        reader = { version: registry.version(), store: makeCompositeStore(registry.routes(runtime.context()), fallback) }
      }
      return reader.store
    },
    stores: () => [...new Set([fallback, ...registry.routes(runtime.context()).map(route => route.store)])],
  }

  options.plugins?.forEach(registry.use)

  return {
    runtime,

    schemas,

    use: plugin => registry.use(plugin),

    plugins: () => registry.plugins(),

    store: type => registry.storeFor(type, fallback, runtime.context()),

    for: scope => {
      if (scope?.entityId == null || scope.entityId === '') {
        throw new PlanningError('malformed:scope-without-entity')
      }
      return makeStoreFacade(runtime, scope)
    },

    committed: async event => {
      if (options.hooks === false || !registry.plugins().some(plugin => plugin.after != null)) {
        return
      }
      const store = self().store(event.type)
      let transition: Transition | undefined
      try {
        transition = await store.transitions?.get(event.transition) ?? undefined
      } catch {
        transition = undefined
      }
      const context = runtime.context() as BasicContext<BasicConfig>
      // The hook acts as this process's service, never as whoever wrote the transition.
      const facade = self().for({
        entityId: event.entityId,
        ...(context?.cfg?.service != null ? { service: context.cfg.service } : {}),
      })

      await registry.after(event, plugin => ({
        context, schemas, store, plugin, facade, ...(transition != null ? { transition } : {}),
      }))
    },
  }
}

export const makePlanningService = (
  options: PlanningServiceOptions = {}, alias: string = DEFAULT_ALIAS
): PlanningHostService => {
  const service: PlanningHostService = createLazyService<PlanningHostService>(
    alias, planningServiceApi(options, () => service) as unknown as Partial<PlanningHostService>
  )

  return service
}

/**
 * Register the planning service and `context.planning()`.
 *
 * The default store's commits and every plugin store's run this service's `after` chain in the
 * process that folds them; `hooks: false` makes this process fold without running it.
 */
export const appendPlanningService = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T, options: PlanningServiceOptions = {}, alias: string = DEFAULT_ALIAS
): T & WithPlanningService => {
  const context = ctx as T & WithPlanningService

  context.registerService(makePlanningService(options, alias))
  context.planning = () => context.service<PlanningHostService>(alias)

  return context
}

/**
 * The planning service on a context, registering one with defaults when there is none — the
 * `ensureRouterService` shape. A plugin package calls it before `use`, from `makeContext`.
 */
export const ensurePlanningService = (
  ctx: BasicContext<any>, alias: string = DEFAULT_ALIAS
): PlanningService => {
  if (!ctx.hasService(alias)) {
    appendPlanningService(ctx, {}, alias)
  } else if ((ctx as Partial<WithPlanningService>).planning == null && alias === DEFAULT_ALIAS) {
    (ctx as unknown as WithPlanningService).planning = () => ctx.service<PlanningHostService>(alias)
  }

  return ctx.service<PlanningHostService>(alias)
}
