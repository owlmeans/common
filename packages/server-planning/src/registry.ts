import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { ResilientError } from '@owlmeans/error'
import { DEFAULT_PLUGIN_ORDER, PlanningRefused } from '@owlmeans/planning'
import type {
  CommitEvent, PlanningExecContext, PlanningHookContext, PlanningPlugin, PlanningSchemaRegistry,
  PlanningStore, TransitionExecution, WorkcardDraft,
} from '@owlmeans/planning'
import type { StoreRoute } from './store/types.js'

export interface PluginRegistry {
  /** Register, or replace the plugin of the same `name`. Its schemas are contributed now. */
  use: (plugin: PlanningPlugin) => void
  /** Every plugin, `order` ascending (registration order among equals). */
  plugins: () => PlanningPlugin[]
  /** The owning plugins that supply a store, in plugin order, each store resolved once. */
  routes: (ctx?: BasicContext<BasicConfig>) => StoreRoute[]
  /** The first owning plugin's store for a type, else `fallback`. */
  storeFor: (type: string | undefined, fallback: PlanningStore, ctx?: BasicContext<BasicConfig>) => PlanningStore
  /** The first plugin answering a code wins. */
  mintCode: (
    draft: WorkcardDraft, taken: (code: string) => Promise<boolean>, contextOf: (plugin: PlanningPlugin) => PlanningExecContext
  ) => Promise<string | undefined>
  /** The `before` chain; answers the execution the chain left. */
  before: (
    exec: TransitionExecution, contextOf: (plugin: PlanningPlugin) => PlanningExecContext
  ) => Promise<TransitionExecution>
  /** The `after` chain; a failing hook is logged and the chain goes on. */
  after: (event: CommitEvent, contextOf: (plugin: PlanningPlugin) => PlanningHookContext) => Promise<void>
  /** Bumps on every `use` — what a cached composite store is keyed by. */
  version: () => number
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : `${error}`

/**
 * The plugin chain of one planning service.
 *
 * Ordering is `order ?? DEFAULT_PLUGIN_ORDER` ascending, lower first; a plugin registered under a
 * name already present replaces it in place. A store factory is resolved once per plugin object and
 * handed to `onStore` (the service binds its `committed` there).
 */
export const makePluginRegistry = (
  schemas: PlanningSchemaRegistry, onStore?: (store: PlanningStore) => void
): PluginRegistry => {
  const registered: PlanningPlugin[] = []
  const stores = new WeakMap<PlanningPlugin, PlanningStore>()
  let version = 0

  const ordered = (): PlanningPlugin[] => registered
    .map((plugin, index) => ({ plugin, index }))
    .sort((left, right) => (left.plugin.order ?? DEFAULT_PLUGIN_ORDER) - (right.plugin.order ?? DEFAULT_PLUGIN_ORDER)
      || left.index - right.index)
    .map(entry => entry.plugin)

  const storeOf = (plugin: PlanningPlugin, ctx?: BasicContext<BasicConfig>): PlanningStore | undefined => {
    if (plugin.store == null) {
      return undefined
    }
    let store = stores.get(plugin)
    if (store == null) {
      store = typeof plugin.store === 'function' ? plugin.store(ctx as BasicContext<BasicConfig>) : plugin.store
      stores.set(plugin, store)
      onStore?.(store)
    }
    return store
  }

  const registry: PluginRegistry = {
    use: plugin => {
      const at = registered.findIndex(entry => entry.name === plugin.name)
      if (at < 0) {
        registered.push(plugin)
      } else {
        registered[at] = plugin
      }
      plugin.schemas?.flows?.forEach(schemas.registerFlow)
      plugin.schemas?.types?.forEach(schemas.registerType)
      version++
    },

    plugins: ordered,

    routes: ctx => ordered()
      .filter(plugin => plugin.owns != null && plugin.store != null)
      .map(plugin => ({ owns: plugin.owns!, store: storeOf(plugin, ctx)! })),

    storeFor: (type, fallback, ctx) => {
      if (type == null) {
        return fallback
      }
      const owner = ordered().find(plugin => plugin.store != null && plugin.owns?.(type) === true)
      return owner == null ? fallback : storeOf(owner, ctx)!
    },

    mintCode: async (draft, taken, contextOf) => {
      for (const plugin of ordered()) {
        if (plugin.mintCode == null) {
          continue
        }
        const code = await plugin.mintCode(draft, taken, contextOf(plugin))
        if (code != null) {
          return code
        }
      }
      return undefined
    },

    before: async (exec, contextOf) => {
      let current = exec
      for (const plugin of ordered()) {
        if (plugin.before == null) {
          continue
        }
        try {
          current = await plugin.before(current, contextOf(plugin)) ?? current
        } catch (error) {
          if (error instanceof ResilientError) {
            throw error
          }
          throw new PlanningRefused(`${plugin.name}:${messageOf(error)}`)
        }
      }
      return current
    },

    after: async (event, contextOf) => {
      for (const plugin of ordered()) {
        if (plugin.after == null) {
          continue
        }
        try {
          await plugin.after(event, contextOf(plugin))
        } catch (error) {
          console.error(`planning: after hook of ${plugin.name} failed on ${event.transition}:`, error)
        }
      }
    },

    version: () => version,
  }

  return registry
}
