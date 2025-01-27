
import type { InitializedService } from '@owlmeans/context'
import type { ProvidedWL } from '@owlmeans/wled'
import type {AppConfig, AppContext} from '@owlmeans/web-client'

export interface WlWebService extends InitializedService {
  load: <T extends {} = {}>(entityId: string, resource?: string) => Promise<ProvidedWLSet<T>>
  extract <T extends {} = {}>(key: string, set: ProvidedWLSet<any>): ProvidedWL<T>
}

export interface ProvidedWLSet<T extends {} = {}> {
  [key: string]: ProvidedWL<T>
}

export interface Config extends AppConfig {
}

export interface Context<C extends Config = Config> extends AppContext<C> {
}
