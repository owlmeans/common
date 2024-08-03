import type { InitializedService } from '@owlmeans/context'
import type { ApiServer } from '@owlmeans/server-api'

export interface SocketService extends InitializedService {
  update: (api: ApiServer) => Promise<void>
}

