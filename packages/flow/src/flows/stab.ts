import type { ShallowFlow } from '../types.js'
import { STD_STAB_FLOW } from '../consts.js'

export const stdStabFlow: ShallowFlow = {
  flow: STD_STAB_FLOW,
  initialStep: STD_STAB_FLOW,
  steps: {
    [STD_STAB_FLOW]: {
      index: 0,
      step: STD_STAB_FLOW,
      service: STD_STAB_FLOW,
      module: STD_STAB_FLOW,
      initial: true,
      transitions: {}
    }
  }
}
