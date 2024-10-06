import type { InitializedService } from '@owlmeans/context'
import type { ModuleHandler } from '@owlmeans/module'

export interface ApiClient extends InitializedService {
  handler: ModuleHandler
}
