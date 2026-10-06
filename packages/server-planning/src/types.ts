import type { BasicConfig, BasicContext, LazyService } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { AnyTypeSchema, PlanningPlugin, PlanningScope, PlanningService, PlanningStore, StatusFlowSchema, WithPlanningService, PlanningSchemaRegistry, SchemaStore, ScopedSchemaRegistry, CommitEvent, PlanningExecContext, PlanningHookContext, TransitionExecution, WorkcardDraft } from '@owlmeans/planning'
import type { ApiServerAppend } from '@owlmeans/server-api'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { StoreRoute } from './store/types.js'


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

/**
 * A grant: `true` for everything the request can see, a list for those project cards only (the
 * parent of a created project, the deleted project, the schema layer).
 */
export type PlanningGrant = boolean | string[]

export interface PlanningAccessGrants {
  /** Create a project — at the root only with `true`; a list names the parent projects. */
  createProjects?: PlanningGrant
  /** Delete a project — a list names the projects. */
  deleteProjects?: PlanningGrant
  /** Write data-defined types and flows — the organization-wide layer only with `true`. */
  defineSchemas?: PlanningGrant
}

/** What a hosting application decides about one request. */
export interface PlanningAccess {
  /** The organization the request acts in — the only source of it once a resolver is given. */
  entityId: string
  /** Narrows every read and write to these project cards. Every project when omitted. */
  projects?: string[]
  /**
   * The project cards the request may WRITE in: `execute` on a card, specification or link inside
   * one of them (the same rule a narrowed read admits — the project, the cards whose `parents` name
   * it, a specification through its parent card), and `schema.define` of a project layer. A project
   * outside `projects` is still unreachable. Omitted — writes reach every project `projects` admits;
   * present — anything else is refused with `PlanningForbidden` (403). Creating a project is
   * `grants.createProjects`' alone; the organization-wide schema layer is `grants.defineSchemas`'.
   */
  writes?: string[]
  /**
   * Gates the writes above. Omitted — nothing is gated; present — a flag it leaves out is refused
   * with `PlanningForbidden`.
   */
  grants?: PlanningAccessGrants
}

/**
 * Resolves a request's access. A throw is the request's answer (an `AuthForbidden` answers 403
 * like any other guard refusal).
 */
export interface PlanningAccessResolver {
  (req: AbstractRequest, ctx: BasicContext<BasicConfig>): Promise<PlanningAccess>
}

export interface PlanningHandlerOptions {
  /** The planning service alias. `PLANNING_SERVICE` when omitted. */
  service?: string
  /** The socket frame name commit events are pushed under. `PLANNING_COMMIT_EVENT` when omitted. */
  event?: string
  /** The longest single long poll, in seconds — clamps `commit.get`'s `wait` and `execute`'s `timeout`. */
  maxPoll?: number
  scope?: PlanningScopeExtractor
  /**
   * The hosting application's access decision per request. Without it the organization is the
   * request's own (`requireEntityKey`) and nothing is narrowed or gated.
   */
  access?: PlanningAccessResolver
}

export interface SchemaViewsOptions {
  /** The code registry every layer starts from. */
  code: () => PlanningSchemaRegistry
  /** Bumps whenever the code registry changes (a plugin's `use`). */
  version: () => number
  /** The schema port, when the store has one. */
  port: () => SchemaStore | undefined
  /** How many resolved layers are kept. */
  limit?: number
}

export interface SchemaViews {
  /** The code registry itself without a port; the resolved layer with one. */
  of: (entityId: string, project?: string) => Promise<PlanningSchemaRegistry>
  /** @throws {PlanningUnsupported} without a port */
  scoped: (entityId: string, project?: string) => Promise<ScopedSchemaRegistry>
}

export interface ProjectionOptions {
  /** The planning service alias. */
  service?: string
  /** The store the queue folds — the service's default store when omitted. */
  store?: (service: PlanningService) => PlanningStore
  /** Where events go — the store's commit hub `publish` when it has one. */
  publish?: (event: CommitEvent) => Promise<void>
}

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

export interface PlanningServiceApi extends Pick<PlanningService, 'use' | 'plugins' | 'schemas' | 'store' | 'for' | 'committed'> {}

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
  /** The default store's data-defined schema port, when it has one. */
  schemaStore: () => SchemaStore | undefined
  /**
   * The registry a card of this organization (and project) resolves through. Without a schema
   * port it is the service's code registry itself — the very same object.
   */
  schemasFor: (entityId: string, project?: string) => Promise<PlanningSchemaRegistry>
  /** The resolved layer. @throws {PlanningUnsupported} without a schema port */
  scopedSchemas: (entityId: string, project?: string) => Promise<ScopedSchemaRegistry>
}
