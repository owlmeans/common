import type { ClientConfig, ClientContext } from '@owlmeans/client-context'

export type Config = ClientConfig

export interface Context<C extends Config = Config> extends ClientContext<C> { }
