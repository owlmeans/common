import type { ClientDbService } from '@owlmeans/client-resource'
import type { InitializedService } from '@owlmeans/context'

export interface NativeDbService extends InitializedService, ClientDbService {
  
}
