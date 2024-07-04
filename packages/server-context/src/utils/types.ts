
export type { Context as BasicContext } from '@owlmeans/context'
import type { Config as ServerConfig } from '@owlmeans/server-config'
import type { Config as ClientConfig } from '@owlmeans/client-config'

export interface BasicConfig extends ServerConfig, ClientConfig {}
