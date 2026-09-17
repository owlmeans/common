import type { BasicConfig, BasicContext, LazyService } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type {
  AnyTypeSchema, PlanningPlugin, PlanningScope, PlanningService, PlanningStore, StatusFlowSchema,
  WithPlanningService,
} from '@owlmeans/planning'
import type { ApiServerAppend } from '@owlmeans/server-api'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export interface Config extends ServerConfig { }

export interface Context<C extends Config = Config> extends ServerContext<C>, ApiServerAppend, WithPlanningService { }

export interface PlanningServiceOptions {
  /** The default store — every type no plugin owns. An in-memory store when omitted. */
  store?: PlanningStore
  plugins?: PlanningPlugin[]
  /** Schemas registered before any plugin's. */
  schemas?: { types?: AnyTypeSchema[], flows?: StatusFlowSchema[] }
  /** Run the `after` chain in this process. Default `true`. */
  hooks?: boolean
  /** Card ids when the store mints none. */
  ids?: () => string
  /** ISO-8601 timestamps. */
  now?: () => string
}

/**
 * The registered host. Lazy on purpose: a plugin package reaches it with `ensurePlanningService`
 * from an application's `makeContext`, before the context initializes, and `context.service()`
 * refuses an uninitialized non-lazy service.
 */
export interface PlanningHostService extends PlanningService, LazyService { }

/** Extra scope a deployment derives from the request — typically the write `channel`. */
export interface PlanningScopeExtractor {
  (req: AbstractRequest, ctx: BasicContext<BasicConfig>): Partial<PlanningScope> | Promise<Partial<PlanningScope>>
}

export interface PlanningHandlerOptions {
  /** The planning service alias. `PLANNING_SERVICE` when omitted. */
  service?: string
  /** The socket frame name commit events are pushed under. `PLANNING_COMMIT_EVENT` when omitted. */
  event?: string
  /** The longest single long poll, in seconds — clamps `commit.get`'s `wait` and `execute`'s `timeout`. */
  maxPoll?: number
  scope?: PlanningScopeExtractor
}
