import type { ShallowFlow } from '../types.js'
import { STD_AUTH_FLOW } from '../consts.js'

export enum StdAuthStep {
  Choice = 'choice',
  Signup = 'signup',
  Signin = 'signin',
  New = 'new',
  Existing = 'existing',
  Payment = 'payment',
  Success = 'success',
  Target = 'target'
}

// OwlMeans Authentication Standard Flow 
export const stdAuthFlow: ShallowFlow = {
  // naming - preserve space in serialized state
  flow: STD_AUTH_FLOW,
  initialStep: StdAuthStep.Choice,

  steps: {

    [StdAuthStep.Choice]: {
      index: 0,
      step: StdAuthStep.Choice,
      service: '$auth',
      initial: true,
      module: '$auth.choice',
      transitions: {
        [StdAuthStep.Signup]: {
          transition: StdAuthStep.Signup,
          step: StdAuthStep.Signup,
          explicit: true,
          reversible: true
        },
        [StdAuthStep.Signin]: {
          transition: StdAuthStep.Signin,
          step: StdAuthStep.Signin,
          explicit: true,
          reversible: true
        },
      },
    },

    [StdAuthStep.Signup]: {
      index: 1,
      step: StdAuthStep.Signup,
      service: '$auth',
      module: '$auth.flow',
      initial: true,
      transitions: {
        [StdAuthStep.New]: {
          transition: StdAuthStep.New,
          step: StdAuthStep.New,
          explicit: true,
          reversible: true,
        },
        [StdAuthStep.Existing]: {
          transition: StdAuthStep.Existing,
          step: StdAuthStep.Existing,
          explicit: true,
          reversible: true
        },
        [StdAuthStep.Signin]: {
          transition: StdAuthStep.Signin,
          step: StdAuthStep.Signin,
          explicit: true,
          reversible: true
        },
      }
    },

    [StdAuthStep.Signin]: {
      index: 2,
      step: StdAuthStep.Signin,
      service: '$auth',
      module: '$auth.flow',
      initial: true,
      transitions: {
        [StdAuthStep.Target]: {
          transition: StdAuthStep.Target,
          step: StdAuthStep.Target,
        }
      }
    },

    [StdAuthStep.New]: {
      index: 3,
      step: StdAuthStep.New,
      service: '$auth',
      module: '$auth.flow',
      initial: true,
      transitions: {
        [StdAuthStep.Payment]: {
          transition: StdAuthStep.Payment,
          step: StdAuthStep.Payment,
        }
      }
    },

    [StdAuthStep.Existing]: {
      index: 4,
      step: StdAuthStep.Existing,
      service: '$auth',
      module: '$auth.flow',
      transitions: {
        [StdAuthStep.Payment]: {
          transition: StdAuthStep.Payment,
          step: StdAuthStep.Payment,
        }
      }
    },

    [StdAuthStep.Payment]: {
      index: 5,
      step: StdAuthStep.Payment,
      service: '$payment',
      module: '$payment.plan',
      transitions: {
        [StdAuthStep.Success]: {
          transition: StdAuthStep.Success,
          step: StdAuthStep.Success,
        }
      }
    },

    [StdAuthStep.Success]: {
      index: 6,
      step: StdAuthStep.Success,
      service: '$payment',
      module: '$payment.success',
      transitions: {
        [StdAuthStep.Target]: {
          transition: StdAuthStep.Target,
          step: StdAuthStep.Target,
        }
      }
    },

    // @TODO This doesn't work anymore
    // The auth dispatcher will require an additional step to proceed
    [StdAuthStep.Target]: {
      index: 7,
      step: StdAuthStep.Target,
      service: '$auth',
      module: '$dispatcher',
      transitions: {}
    }

  }
}
