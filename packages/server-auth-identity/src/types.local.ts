import type { BasicContext } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { OrgEntityRef } from '@owlmeans/auth-common'

export type Context = BasicContext<any>

export type ResolverContext = ServerContext<ServerConfig>

export interface CacheEntry {
  entity: OrgEntityRef | null
  at: number
}

export type ServiceContext = ServerContext<ServerConfig>
