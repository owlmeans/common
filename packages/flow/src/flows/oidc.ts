import type { ShallowFlow } from '../types.js'
import { STD_OIDC_FLOW } from '../consts.js'

export enum OidcAuthStep {
  Disaptch = 'dispatch',
  Authen = 'authen',
  PostAuthen = 'post-authen',
  Payment = 'payment',
  Success = 'success',
  Target = 'target'
}

// OwlMeans OIDC Based Auth Flow 
export const stdOidcFlow: ShallowFlow = {
  // naming - preserve space in serialized state
  flow: STD_OIDC_FLOW,
  initialStep: OidcAuthStep.Disaptch,

  steps: {

    [OidcAuthStep.Disaptch]: {
      index: 0,
      step: OidcAuthStep.Disaptch,
      service: '$auth',
      initial: true,
      module: '$auth.choice',
      transitions: {
        [OidcAuthStep.Authen]: {
          transition: OidcAuthStep.Authen,
          step: OidcAuthStep.Authen,
        },
        [OidcAuthStep.Target]: {
          transition: OidcAuthStep.Target,
          step: OidcAuthStep.Target,
        },
      },
    },

    [OidcAuthStep.Authen]: {
      index: 1,
      step: OidcAuthStep.Authen,
      service: '$iam',
      module: '$iam.authen',
      transitions: {
        [OidcAuthStep.PostAuthen]: {
          transition: OidcAuthStep.PostAuthen,
          step: OidcAuthStep.PostAuthen,
        },
      }
    },
    
    [OidcAuthStep.PostAuthen]: {
      index: 2,
      step: OidcAuthStep.PostAuthen,
      service: '$auth',
      module: '$auth.flow',
      transitions: {
        [OidcAuthStep.Payment]: {
          transition: OidcAuthStep.Payment,
          step: OidcAuthStep.Payment,
        },
        [OidcAuthStep.Target]: {
          transition: OidcAuthStep.Target,
          step: OidcAuthStep.Target,
        },
      }
    },

    [OidcAuthStep.Payment]: {
      index: 3,
      step: OidcAuthStep.Payment,
      service: '$payment',
      module: '$payment.plan',
      transitions: {
        [OidcAuthStep.Success]: {
          transition: OidcAuthStep.Success,
          step: OidcAuthStep.Success,
        }
      }
    },

    [OidcAuthStep.Success]: {
      index: 4,
      step: OidcAuthStep.Success,
      service: '$payment',
      module: '$payment.success',
      transitions: {
        [OidcAuthStep.Target]: {
          transition: OidcAuthStep.Target,
          step: OidcAuthStep.Target,
        }
      }
    },

    [OidcAuthStep.Target]: {
      index: 5,
      step: OidcAuthStep.Target,
      service: '$auth',
      module: '$dispatcher',
      transitions: {}
    }

  }
}
