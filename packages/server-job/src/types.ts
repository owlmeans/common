import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { QueueAppend, QueueConfig } from '@owlmeans/queue'
import type { ApiServerAppend } from '@owlmeans/server-api'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export interface Config extends ServerConfig {
  queue?: QueueConfig
}

export interface Context<C extends Config = Config> extends ServerContext<C>,
  ApiServerAppend, QueueAppend { }

/** The alias every entrypoint of one job group answers under, derived from the group's root. */
export interface JobEntrypointAliases {
  base: string
  list: string
  get: string
  cancel: string
  watch: string
}

export interface JobEntrypointOptions {
  /** The path segment the group answers under. Defaults to `/jobs`. */
  path?: string
  /** The entrypoint the group hangs under — an app's API base. Top level when omitted. */
  parent?: string
  /** The service route the group answers on, when it is not this app's own. */
  service?: string
  /**
   * The guard the group's base carries, and every entrypoint under it inherits.
   *
   * `DEFAULT_GUARD` unless told otherwise, because ownership is derived from the authenticated
   * subject and an unguarded declaration has no subject to derive it from. Pass `null` only for a
   * group that is scoped some other way — its handlers then answer `AuthorizationError`.
   */
  guard?: string | null
}

/** The list entrypoint's query, as it travels on the wire. */
export interface JobListQuery {
  state?: string
  name?: string
  page?: number
  size?: number
}

/**
 * A request that may read the queue unscoped.
 *
 * A predicate rather than a permission name: which permission, gate or role means "operator" is
 * the application's decision, and hardcoding one here would make every deployment that names it
 * differently patch this package.
 */
export interface JobAdminCheck {
  (req: AbstractRequest, ctx: BasicContext<BasicConfig>): boolean | Promise<boolean>
}

export interface JobHandlerOptions {
  /** Which declared queue these handlers read. The context's sole queue when omitted. */
  queue?: string
  /** The field inside `JobRecord.data` that names the owner. Defaults to `owner`. */
  ownerField?: string
  /** The escape hatch — see {@link JobAdminCheck}. Nothing is unscoped without one. */
  admin?: JobAdminCheck
}
