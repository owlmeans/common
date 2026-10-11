import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export type Config = ServerConfig

export type Context<C extends Config = Config> = ServerContext<C>
