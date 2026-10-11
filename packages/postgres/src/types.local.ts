import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export type Config = ServerConfig

export interface Context<C extends Config = Config> extends ServerContext<C> { }
