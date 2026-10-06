import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { Config as ApiConfig } from '../types.js'

export type Config = ServerConfig

export interface Context<C extends Config = Config> extends ServerContext<C> { }

export type Severity = 'debug' | 'info' | 'warn' | 'error'

export type ServerConfig2 = ApiConfig

export type ServerContext2 = ServerContext<ServerConfig2>
