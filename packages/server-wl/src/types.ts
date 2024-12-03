import type { InitializedService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export interface WlProvider extends InitializedService {
  provide: (entityId: string) => Promise<ProvidedWL>
}

export interface WlEntityIdentifier extends InitializedService {
  identifyEntity: (identifier: string) => Promise<string | null>
}

export type ProvidedWL<T extends {} = {}> = T & {
  type: string
  exists: boolean | null
}

export interface WlProviderAppend {
  wlProviders: string[]
  wlIdentifierService?: string
}

export interface Config extends ServerConfig, WlProviderAppend {}

export interface Context<C extends Config = Config> extends ServerContext<C> { 
}
