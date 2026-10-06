import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '../types.js'

export type Config = ClientConfig

export interface Context<C extends Config = Config> extends ClientContext<C> { }
