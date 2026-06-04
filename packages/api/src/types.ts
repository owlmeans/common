import type { InitializedService } from '@owlmeans/context'
import type { EntrypointHandler } from '@owlmeans/entrypoint'

export interface ApiClient extends InitializedService {
  handler: EntrypointHandler
}
