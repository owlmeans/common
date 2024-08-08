
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'

export interface Config extends ClientConfig { }

export interface Context<C extends Config = Config> extends ClientContext<C> { }
