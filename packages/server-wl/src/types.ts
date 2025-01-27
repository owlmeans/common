import type { InitializedService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { ProvidedWL } from '@owlmeans/wled'

export interface WlProvider extends InitializedService {
  provide: (entityId: string) => Promise<ProvidedWL>
}

export interface WlEntityIdentifier extends InitializedService {
  identifyEntity: (identifier: string) => Promise<string | null>
}

export interface WlProviderAppend {
  wlProviders: string[]
  wlIdentifierService?: string
}

export interface Config extends ServerConfig, WlProviderAppend { }

export interface Context<C extends Config = Config> extends ServerContext<C> {
}
