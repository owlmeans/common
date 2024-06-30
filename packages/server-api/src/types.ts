
import type { InitializedService, Layer } from '@owlmeans/context'

export interface ApiServer extends InitializedService {
  layers: [Layer.System]
}
