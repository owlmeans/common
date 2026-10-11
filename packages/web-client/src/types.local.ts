import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

export interface Perked extends ClientEntrypoint<unknown> {
  _auth_web_middleware_applied?: boolean
}
