
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import type { AuthServiceAppend } from '@owlmeans/client-auth'

export interface Config extends ClientConfig { }

export interface Context<C extends Config = Config> extends ClientContext<C>
  , AuthServiceAppend {
}
