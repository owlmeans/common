import type { ShallowFlow } from '../types.js'
import { STD_OIDC_FLOW, TARGET_SERVICE } from '../consts.js'
import { AUTH_QUERY } from '@owlmeans/auth'

export enum OidcAuthStep {
  Dispatch = 'dispatch',
  Authen = 'authen',
  PostAuthen = 'post-authen',
  OrgChoice = 'org-choice',
  Payment = 'payment',
  Success = 'success',
  Target = 'target',
  Ephemeral = 'ephemeral'
}

export const PURPOSE_PAYLOAD = 'purpose'

// OwlMeans OIDC Based Auth Flow 
export const stdOidcFlow: ShallowFlow = {
  // naming - preserve space in serialized state
  flow: STD_OIDC_FLOW,
  initialStep: OidcAuthStep.Dispatch,

  steps: {

    [OidcAuthStep.Dispatch]: {
      index: 0,
      step: OidcAuthStep.Dispatch,
      service: '$auth',
      initial: true,
      module: '$auth.choice',
      transitions: {
        [OidcAuthStep.Authen]: {
          transition: OidcAuthStep.Authen,
          step: OidcAuthStep.Authen,
        },
        [OidcAuthStep.Ephemeral]: {
          transition: OidcAuthStep.Ephemeral,
          step: OidcAuthStep.Ephemeral,
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
      module: '$auth.flow-param',
      transitions: {
        [OidcAuthStep.OrgChoice]: {
          transition: OidcAuthStep.OrgChoice,
          step: OidcAuthStep.OrgChoice,
        },
        [OidcAuthStep.Payment]: {
          transition: OidcAuthStep.Payment,
          step: OidcAuthStep.Payment,
        },
        [OidcAuthStep.Target]: {
          transition: OidcAuthStep.Target,
          step: OidcAuthStep.Target,
        },
      },
      payloadMap: { [PURPOSE_PAYLOAD]: 0 }
    },

    [OidcAuthStep.OrgChoice]: {
      index: 3,
      step: OidcAuthStep.OrgChoice,
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
      },
      payloadMap: { 
        [AUTH_QUERY]: 0,
        [PURPOSE_PAYLOAD]: 1,
      }
    },

    [OidcAuthStep.Payment]: {
      index: 4,
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
      index: 5,
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
      index: 6,
      step: OidcAuthStep.Target,
      service: '$auth',
      module: '$auth.flow',
      transitions: {
        [OidcAuthStep.Ephemeral]: {
          transition: OidcAuthStep.Ephemeral,
          step: OidcAuthStep.Ephemeral,
        }
      }
    },

    [OidcAuthStep.Ephemeral]: {
      index: 7,
      step: OidcAuthStep.Ephemeral,
      service: TARGET_SERVICE,
      module: '$dispatcher',
      transitions: {}
    }

  }
}
