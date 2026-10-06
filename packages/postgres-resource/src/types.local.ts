import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export interface PgDriverError {
  code?: string
  detail?: string
  hint?: string
  severity?: string
  constraint?: string
  table?: string
  column?: string
  message?: string
}

export type Config = ServerConfig

export type Context<C extends Config = Config> = ServerContext<C>
