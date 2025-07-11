
import type { ShallowFlow } from '../types.js'
import { STD_OIDP_FLOW, TARGET_SERVICE } from '../consts.js'

export enum OidpAuthStep {
  Unknown = 'unknown',

  CreateId = 'create-id',

  Auth = 'auth',
  PostAuth = 'post-auth',
  LinkId = 'link-id',
  Denied = 'denied',
  Dispatch = 'dispatch',

  Target = 'target',

  // Compatibility
  // MasterAuth = 'authentication',
  // MasterReg = 'registration',
}

export const stdOidpFlow: ShallowFlow = {
  flow: STD_OIDP_FLOW,
  initialStep: OidpAuthStep.Unknown,

  steps: {
    [OidpAuthStep.Unknown]: {
      index: 0,
      step: OidpAuthStep.Unknown,
      service: '$auth',
      module: '$auth.interaction',
      initial: true,
      transitions: {
        [OidpAuthStep.Dispatch]: {
          transition: OidpAuthStep.Dispatch,
          step: OidpAuthStep.Dispatch,
        },
        [OidpAuthStep.Auth]: {
          transition: OidpAuthStep.Auth,
          step: OidpAuthStep.Auth,
        },
        [OidpAuthStep.LinkId]: {
          transition: OidpAuthStep.LinkId,
          step: OidpAuthStep.LinkId,
        },
        [OidpAuthStep.Denied]: {
          transition: OidpAuthStep.LinkId,
          step: OidpAuthStep.LinkId,
        },
        [OidpAuthStep.CreateId]: {
          transition: OidpAuthStep.CreateId,
          step: OidpAuthStep.CreateId,
        },
      },
      payloadMap: {
        ["uid"]: 0
      }
    },

    [OidpAuthStep.CreateId]: {
      index: 1,
      step: OidpAuthStep.CreateId,
      service: '$auth',
      module: '$auth.interaction',
      initial: true,
      transitions: {
        [OidpAuthStep.Dispatch]: {
          transition: OidpAuthStep.Dispatch,
          step: OidpAuthStep.Dispatch,
        },
        // [OidpAuthStep.MasterReg]: {
        //   transition: OidpAuthStep.MasterReg,
        //   step: OidpAuthStep.MasterReg,
        //   explicit: true,
        // }
      },
      payloadMap: {
        ["uid"]: 0
      }
    },

    // [OidpAuthStep.MasterReg]: {
    //   index: 2,
    //   step: OidpAuthStep.MasterReg,
    //   service: '$auth',
    //   module: '$auth.interaction',
    //   initial: true,
    //   transitions: {
    //     [OidpAuthStep.Dispatch]: {
    //       transition: OidpAuthStep.Dispatch,
    //       step: OidpAuthStep.Dispatch,
    //     },
    //     [OidpAuthStep.MasterAuth]: {
    //       transition: OidpAuthStep.MasterAuth,
    //       step: OidpAuthStep.MasterAuth,
    //       explicit: true,
    //     }
    //   },
    //   payloadMap: {
    //     ["uid"]: 0
    //   }
    // },

    [OidpAuthStep.Auth]: {
      index: 2,
      step: OidpAuthStep.Auth,
      service: '$auth',
      module: '$auth.interaction',
      transitions: {
        // In case of owlmeans.net classic idp chaining
        [OidpAuthStep.PostAuth]: {
          transition: OidpAuthStep.PostAuth,
          step: OidpAuthStep.PostAuth,
        },
        // In case of successfull authentication
        [OidpAuthStep.Dispatch]: {
          transition: OidpAuthStep.Dispatch,
          step: OidpAuthStep.Dispatch,
        },
        // In case new account is created an resitration denied
        [OidpAuthStep.Denied]: {
          transition: OidpAuthStep.Denied,
          step: OidpAuthStep.Denied,
        },
      }
    },

    [OidpAuthStep.PostAuth]: {
      index: 3,
      step: OidpAuthStep.PostAuth,
      service: '$auth',
      module: '$auth.int-with-flow',
      transitions: {
        [OidpAuthStep.Dispatch]: {
          transition: OidpAuthStep.Dispatch,
          step: OidpAuthStep.Dispatch,
        },
        [OidpAuthStep.LinkId]: {
          transition: OidpAuthStep.LinkId,
          step: OidpAuthStep.LinkId,
        },
        [OidpAuthStep.Denied]: {
          transition: OidpAuthStep.Denied,
          step: OidpAuthStep.Denied,
        }
      }
    },

    [OidpAuthStep.LinkId]: {
      index: 4,
      step: OidpAuthStep.LinkId,
      service: '$auth',
      module: '$auth.interaction',
      transitions: {
        [OidpAuthStep.Dispatch]: {
          transition: OidpAuthStep.Dispatch,
          step: OidpAuthStep.Dispatch,
        },
      }
    },

    [OidpAuthStep.Denied]: {
      index: 5,
      step: OidpAuthStep.Denied,
      service: '$auth',
      module: '$auth.interaction',
      transitions: {
      }
    },

    [OidpAuthStep.Dispatch]: {
      index: 6,
      step: OidpAuthStep.Dispatch,
      service: '$auth',
      module: '$auth.interaction',
      transitions: {
        [OidpAuthStep.Target]: {
          transition: OidpAuthStep.Target,
          step: OidpAuthStep.Target,
        },
        // It's unclear if these transitions are really required
        [OidpAuthStep.LinkId]: {
          transition: OidpAuthStep.LinkId,
          step: OidpAuthStep.LinkId,
        },
        [OidpAuthStep.Denied]: {
          transition: OidpAuthStep.Denied,
          step: OidpAuthStep.Denied,
        }
      },
      payloadMap: {
        ["uid"]: 0
      }
    },

    [OidpAuthStep.Target]: {
      index: 7,
      step: OidpAuthStep.Target,
      service: TARGET_SERVICE,
      module: '$dispatcher',
      transitions: {}
    }
  }
}
