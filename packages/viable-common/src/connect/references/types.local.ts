import type { EntrypointReference } from '@owlmeans/context'
import type { RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'

export interface ConnectReference<Request extends RequestShape, Response>
  extends EntrypointReference<RegisteredEntrypoint<Request, Response>> {}
