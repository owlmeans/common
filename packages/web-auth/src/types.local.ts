import type { CommonConfig } from '@owlmeans/config'

export interface DebugCarrier {
  cfg: {
    debug?: { all?: boolean, supervisor?: boolean }
    security?: CommonConfig['security']
  }
}
