import { DISPATCHER } from '@owlmeans/auth'
import { HOME } from '@owlmeans/context'
import type { ShallowFlow } from '@owlmeans/flow'
import { INTENT_FLOW, INTENT_PAYLOAD_REF, intent, IntentFlowStep } from './consts.js'

const payloadMap = { [INTENT_PAYLOAD_REF]: 0 }

/**
 * The hand-off flow both sides walk.
 *
 * `compose` runs on the public site: the prompt is stashed and `handoff` carries the reference to
 * `land`, whose module is the platform's landing screen — so the site redirects to
 * `land`'s address with the payload as query. The landing then enters at `land` FRESH (the
 * reference arrives as `?ref=`, never as a serialized token, which the platform's own sign-in
 * parses from `?flow=` on every page), and either goes on to `review` (signed in) or parks the flow
 * with `suspendFlow` at `sign-in`, whose non-explicit way forward is `review` — the home screen —
 * so whichever sign-in method finishes lands there.
 *
 * The steps address CONCRETE entrypoint aliases, never `$`-prefixed references: this flow is never
 * the live `FlowService` model and nothing here needs `configureFlows`.
 */
export const intentFlow: ShallowFlow = {
  flow: INTENT_FLOW,
  initialStep: IntentFlowStep.Compose,
  steps: {
    [IntentFlowStep.Compose]: {
      index: 0,
      step: IntentFlowStep.Compose,
      service: '',
      initial: true,
      payloadMap,
      transitions: {
        handoff: { transition: 'handoff', step: IntentFlowStep.Land },
      },
    },
    [IntentFlowStep.Land]: {
      index: 1,
      step: IntentFlowStep.Land,
      service: '',
      module: intent.landing,
      initial: true,
      payloadMap,
      transitions: {
        review: { transition: 'review', step: IntentFlowStep.Review },
        'sign-in': { transition: 'sign-in', step: IntentFlowStep.SignIn, explicit: true },
      },
    },
    [IntentFlowStep.SignIn]: {
      index: 2,
      step: IntentFlowStep.SignIn,
      service: '',
      module: DISPATCHER,
      payloadMap,
      transitions: {
        next: { transition: 'next', step: IntentFlowStep.Review },
      },
    },
    [IntentFlowStep.Review]: {
      index: 3,
      step: IntentFlowStep.Review,
      service: '',
      module: HOME,
      payloadMap,
      transitions: {},
    },
  },
}
