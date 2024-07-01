import { InitializedService } from '@owlmeans/context'
import { ModuleHandler } from '@owlmeans/module'

export interface ApiClient extends InitializedService {
  handler: ModuleHandler
}
