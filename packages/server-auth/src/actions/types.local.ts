import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { AuthServiceAppend } from '../types.js'

export type Config = ServerConfig

export interface Context extends ServerContext<Config>, AuthServiceAppend {}
