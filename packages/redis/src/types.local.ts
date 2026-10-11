import type { Redis } from 'ioredis'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'

export type Config = ServerConfig

export interface Context<C extends Config = Config> extends ServerContext<C> { }

/** One line of `CLUSTER NODES`, parsed. */
export interface NodeInfo {
  nodeId: string
  addr: string
  flags: string[]
  master: string
  state: string
  slots: number[][] | null
}

export interface ClusterNode {
  node: Redis
  info: NodeInfo
}
