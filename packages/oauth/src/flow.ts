import { DISPATCHER } from '@owlmeans/auth'
import { UnknownFlow } from '@owlmeans/flow'
import type { Flow, FlowProvider, ShallowFlow } from '@owlmeans/flow'
import { OAUTH_FLOW } from './consts.js'
import { oauth } from './consts.js'

/** Step names, exported so a screen can `model.step(OAuthFlowStep.X)` without a literal. */
export enum OAuthFlowStep {
  Verify = 'verify',
  Consent = 'consent',
  SignIn = 'sign-in',
  Done = 'done',
}

/** Payload keys, kept short because a flow's payload is CSV-joined with no escaping. */
export const OAUTH_PAYLOAD_KIND = 'kind'
export const OAUTH_PAYLOAD_REF = 'ref'

/**
 * The consent flow: verify a device's user code, or land on consent directly for the code grant;
 * sign in through the platform's own dispatcher when nobody is; land on `done`.
 *
 * This flow is never the live model on `/dispatcher` and never carries `?flow=` there — it is
 * suspended into a side-band record before the `sign-in` step redirects, and resumed by whatever
 * the sign-in eventually lands on (`@owlmeans/client-flow`'s `suspendFlow`/`resumeSuspendedFlow`).
 * Its steps therefore address CONCRETE entrypoint aliases, never `$`-prefixed references —
 * nothing here needs `configureFlows`.
 */
export const oauthFlow: ShallowFlow = {
  flow: OAUTH_FLOW,
  initialStep: OAuthFlowStep.Consent,
  steps: {
    [OAuthFlowStep.Verify]: {
      index: 0,
      step: OAuthFlowStep.Verify,
      service: '',
      module: oauth.deviceScreen,
      initial: true,
      payloadMap: { [OAUTH_PAYLOAD_KIND]: 0, [OAUTH_PAYLOAD_REF]: 1 },
      transitions: {
        next: { transition: 'next', step: OAuthFlowStep.Consent },
      },
    },
    [OAuthFlowStep.Consent]: {
      index: 1,
      step: OAuthFlowStep.Consent,
      service: '',
      module: oauth.consentScreen,
      initial: true,
      payloadMap: { [OAUTH_PAYLOAD_KIND]: 0, [OAUTH_PAYLOAD_REF]: 1 },
      transitions: {
        'sign-in': { transition: 'sign-in', step: OAuthFlowStep.SignIn, explicit: true },
        approve: { transition: 'approve', step: OAuthFlowStep.Done },
        deny: { transition: 'deny', step: OAuthFlowStep.Done, explicit: true },
      },
    },
    [OAuthFlowStep.SignIn]: {
      index: 2,
      step: OAuthFlowStep.SignIn,
      service: '',
      module: DISPATCHER,
      payloadMap: { [OAUTH_PAYLOAD_KIND]: 0, [OAUTH_PAYLOAD_REF]: 1 },
      transitions: {
        next: { transition: 'next', step: OAuthFlowStep.Consent },
      },
    },
    [OAuthFlowStep.Done]: {
      index: 3,
      step: OAuthFlowStep.Done,
      service: '',
      module: oauth.doneScreen,
      payloadMap: { [OAUTH_PAYLOAD_KIND]: 0, [OAUTH_PAYLOAD_REF]: 1 },
      transitions: {},
    },
  },
}

/**
 * A minimal `FlowProvider` for exactly one flow.
 *
 * `makeFlowModel(token, provider)` needs a provider to restore a serialized state, because the
 * token names its flow rather than carrying it — and a browser's own flow service resolves flows
 * from config records, which this side-band flow deliberately never becomes one of (see
 * `flow.ts`'s top comment). This is the same shape as `@owlmeans/agent`'s `makeStaticFlowProvider`,
 * copied rather than depended on: pulling in the whole LLM/agent stack for one map lookup would be
 * a strange price for a browser bundle to pay.
 */
export const oauthFlowProvider: FlowProvider = async name => {
  if (name !== OAUTH_FLOW) {
    // `makeFlowModel` treats a string argument as a flow name first and only re-reads it as a
    // token once the provider throws — the throw is part of the contract.
    throw new UnknownFlow(name)
  }

  return { ...oauthFlow, config: {}, prefabs: {} } as Flow
}
