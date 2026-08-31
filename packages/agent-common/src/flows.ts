import type { ShallowFlow } from '@owlmeans/flow'
import { AGENT_RUN_FLOW, AgentRunStep, AgentRunTransition } from './consts.js'

/**
 * The lifecycle of one agent run.
 *
 * Read it as "how far did this run get", not "what did it say". Everything conversational happens
 * inside `Working`; the steps exist so that a run interrupted anywhere can be told where to pick
 * up. `Fail` is reachable from every working step, and `Resume` re-enters `Working` from a
 * checkpoint.
 *
 * `service` is left as the flow name on every step. A flow step normally binds to a service or an
 * entrypoint, but an agent run is driven by whoever holds the model — there is no second party to
 * hand control to, and inventing one would put a name in the serialized state that nothing
 * resolves.
 *
 * Each working step keeps exactly ONE non-explicit outgoing transition, so `FlowModel.next()`
 * always has an unambiguous answer: that is what lets a driver advance the run without knowing the
 * vocabulary. `Fail` is marked explicit precisely so it never becomes that automatic answer.
 */
export const agentRunFlow: ShallowFlow = {
  flow: AGENT_RUN_FLOW,
  initialStep: AgentRunStep.Received,

  steps: {
    [AgentRunStep.Received]: {
      index: 0,
      step: AgentRunStep.Received,
      service: AGENT_RUN_FLOW,
      initial: true,
      transitions: {
        [AgentRunTransition.Prepare]: {
          transition: AgentRunTransition.Prepare,
          step: AgentRunStep.Prepared,
        },
        [AgentRunTransition.Fail]: {
          transition: AgentRunTransition.Fail,
          step: AgentRunStep.Failed,
          explicit: true,
        },
      },
    },

    [AgentRunStep.Prepared]: {
      index: 1,
      step: AgentRunStep.Prepared,
      service: AGENT_RUN_FLOW,
      transitions: {
        [AgentRunTransition.Work]: {
          transition: AgentRunTransition.Work,
          step: AgentRunStep.Working,
        },
        [AgentRunTransition.Fail]: {
          transition: AgentRunTransition.Fail,
          step: AgentRunStep.Failed,
          explicit: true,
        },
      },
    },

    [AgentRunStep.Working]: {
      index: 2,
      step: AgentRunStep.Working,
      service: AGENT_RUN_FLOW,
      transitions: {
        [AgentRunTransition.Finalize]: {
          transition: AgentRunTransition.Finalize,
          step: AgentRunStep.Finalizing,
        },
        [AgentRunTransition.Fail]: {
          transition: AgentRunTransition.Fail,
          step: AgentRunStep.Failed,
          explicit: true,
        },
      },
    },

    [AgentRunStep.Finalizing]: {
      index: 3,
      step: AgentRunStep.Finalizing,
      service: AGENT_RUN_FLOW,
      transitions: {
        [AgentRunTransition.Finish]: {
          transition: AgentRunTransition.Finish,
          step: AgentRunStep.Finished,
        },
        [AgentRunTransition.Fail]: {
          transition: AgentRunTransition.Fail,
          step: AgentRunStep.Failed,
          explicit: true,
        },
      },
    },

    [AgentRunStep.Finished]: {
      index: 4,
      step: AgentRunStep.Finished,
      service: AGENT_RUN_FLOW,
      transitions: {},
    },

    [AgentRunStep.Failed]: {
      index: 5,
      step: AgentRunStep.Failed,
      service: AGENT_RUN_FLOW,
      transitions: {
        [AgentRunTransition.Resume]: {
          transition: AgentRunTransition.Resume,
          step: AgentRunStep.Working,
          explicit: true,
        },
      },
    },
  },
}

/** Every flow this package declares, for a provider to serve. */
export const agentFlows: ShallowFlow[] = [agentRunFlow]
