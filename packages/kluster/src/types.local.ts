import type { KlusterConfig } from './types.js'
import { ServerContext } from '@owlmeans/server-context'

export type Config = KlusterConfig

export type Context = ServerContext<Config>
