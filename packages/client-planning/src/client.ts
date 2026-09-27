import { bindAll } from '@owlmeans/client-entrypoint'
import { createLazyService, MiddlewareStage, MiddlewareType } from '@owlmeans/context'
import type { EntrypointTree } from '@owlmeans/entrypoint'
import {
  DEFAULT_PLUGIN_ORDER, makeSchemaRegistry, PLANNING_SERVICE, PlanningUnsupported,
} from '@owlmeans/planning'
import type { PlanningFacade, PlanningPlugin, PlanningSchemaRegistry } from '@owlmeans/planning'
import { makeRemoteCommitSource } from './commits.js'
import { makeRemoteFacade } from './facade.js'
import { planningStoresOf } from './stores.js'
import type {
  Config, Context, PlanningClientOptions, PlanningClientService, WithPlanningClient,
} from './types.js'

/**
 * The client planning service: a remote facade factory under the SAME alias the server registers
 * its service under, so `context.planning().for(scope)` is one call on both sides.
 *
 * What only a server can do is refused rather than faked: a client runs no middleware and folds
 * nothing, so `store()`, `committed()` and a plugin carrying hooks or a store answer
 * `PlanningUnsupported`. A plugin carrying only schemas is accepted — it layers over the server's
 * bundle.
 */
export const makePlanningClientService = <C extends Config, T extends Context<C>>(
  context: T, options: PlanningClientOptions
): PlanningClientService => {
  const registry = makeSchemaRegistry()
  const plugins: PlanningPlugin[] = []
  const stores = () => planningStoresOf(context)

  const commits = makeRemoteCommitSource(context, options.protocols, {
    socket: options.socket, poll: options.poll, timeout: options.timeout, stores,
  })

  const layerPlugins = (): void => plugins.forEach(plugin => {
    plugin.schemas?.flows?.forEach(registry.registerFlow)
    plugin.schemas?.types?.forEach(registry.registerType)
  })

  let loaded = false
  let loading: Promise<PlanningSchemaRegistry> | null = null

  const loadSchemas: PlanningClientService['loadSchemas'] = async opts => {
    if (loaded && opts?.force !== true) {
      return registry
    }
    if (loading == null || opts?.force === true) {
      const attempt = (async () => {
        const bundle = await context.entrypoint(options.protocols.schema.list).call({ timeout: options.timeout })
        registry.load(bundle)
        layerPlugins()
        loaded = true

        return registry
      })()
      loading = attempt
      // A failed load is forgotten, so the next caller asks again instead of inheriting the error.
      attempt.catch(() => {
        if (loading === attempt) {
          loading = null
        }
      })
    }

    return await loading
  }

  const facadeFor = (scope: Parameters<PlanningClientService['for']>[0]): PlanningFacade =>
    makeRemoteFacade(context, options.protocols, { ...options.scope, ...scope }, {
      commits, schemas: registry, loadSchemas, timeout: options.timeout, stores,
    })

  let fallback: PlanningFacade | null = null

  // Lazy, like the server's host: `context.planning()` answers before the context initializes.
  return createLazyService<PlanningClientService>(PLANNING_SERVICE, {
    schemas: registry,

    commits,

    loadSchemas,

    use: plugin => {
      if (plugin.before != null || plugin.after != null || plugin.store != null || plugin.mintCode != null) {
        throw new PlanningUnsupported(`client:plugin:${plugin.name}`)
      }
      const existing = plugins.findIndex(candidate => candidate.name === plugin.name)
      if (existing >= 0) {
        plugins.splice(existing, 1)
      }
      plugins.push(plugin)
      plugins.sort((left, right) => (left.order ?? DEFAULT_PLUGIN_ORDER) - (right.order ?? DEFAULT_PLUGIN_ORDER))
      layerPlugins()
    },

    plugins: () => [...plugins],

    store: () => {
      throw new PlanningUnsupported('client:store')
    },

    for: scope => scope == null ? (fallback ??= facadeFor({})) : facadeFor(scope),

    committed: async () => {
      throw new PlanningUnsupported('client:committed')
    },

    close: async () => await commits.close(),
  })
}

/**
 * Wire the planning client into a client context: bind the protocol tree as client entrypoints
 * (unless `bind: false`), register the service under `PLANNING_SERVICE`, and add
 * `context.planning()`.
 *
 * The tree must be the one the server mounted — the same `makePlanningProtocols` options, alias for
 * alias. When its commit feed hangs under a `socketBase`, that base belongs to the host and must be
 * bound by the host too: a parent a registry cannot resolve fails the whole context at init.
 *
 * The schema bundle is fetched in the background once the context is READY, and a failure there is
 * swallowed — a browser that is not signed in yet cannot read it, and a context must not fail over
 * data it can fetch later. `model()` and `loadSchemas()` load it on first use regardless.
 */
export const appendPlanningClient = <C extends Config, T extends Context<C>>(
  context: T, options: PlanningClientOptions
): T & WithPlanningClient => {
  const ctx = context as T & WithPlanningClient

  if (options.bind !== false) {
    ctx.registerEntrypoints(bindAll(options.protocols as unknown as EntrypointTree))
  }

  const service = makePlanningClientService<C, T>(context, options)
  ctx.registerService(service)
  ctx.planning = () => ctx.service<PlanningClientService>(PLANNING_SERVICE)

  if (options.schemas !== false) {
    ctx.registerMiddleware({
      type: MiddlewareType.Context,
      stage: MiddlewareStage.Ready,
      apply: async () => {
        try {
          await service.loadSchemas()
        } catch {
          // Best effort by design — see above.
        }
      },
    })
  }

  return ctx
}
