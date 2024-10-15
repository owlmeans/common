import { FlowStepError, UnknownFlow, UnknownFlowStep, UnknownTransition } from './errors.js'
import type { FlowModel, FlowProvider, FlowState, ShallowFlow } from './types.js'
import { serializeState, unserializeState } from './utils/flow.js'

export const makeFlowModel = async (flow: string | ShallowFlow, provider?: FlowProvider): Promise<FlowModel> => {
  let state: FlowState | null = null
  if (typeof flow === 'string') {
    if (provider == null) {
      throw new UnknownFlow('_provider')
    }
    try {
      flow = await provider(flow)
      state = {
        flow: flow.flow,
        step: flow.initialStep,
        service: '',
        ok: true
      }
    } catch {
      state = await unserializeState(flow as string, provider)
      flow = await provider(state.flow)
    }
  } else {
    state = {
      flow: flow.flow,
      step: flow.initialStep,
      service: '',
      ok: true
    }
  }

  const model: FlowModel = {
    target: service => {
      state!.service = service
      return model
    },

    entity: entityId => {
      state!.entityId = entityId

      return model
    },

    state: () => state!,

    setState: _state => {
      state = _state
      return model 
    },

    payload: () => state!.payload ?? {} as any,

    step: step => flow.steps[step ?? state!.step],

    enter: step => {
      step = step ?? flow.initialStep
      const info = flow.steps[step]
      if (info.initial !== true) {
        throw new FlowStepError(`initial:${step}`)
      }

      state!.step = step
      return model
    },

    steps: enter => {
      if (enter == null) {
        return Object.values(flow.steps)
      }
      if (enter) {
        return Object.values(flow.steps).filter(s => s.initial)
      }

      return Object.values(flow.steps).filter(s => !s.initial)
    },

    transitions: explicit => {
      if (explicit == null) {
        return Object.values(flow.steps[state!.step].transitions)
      }
      if (explicit) {
        return Object.values(flow.steps[state!.step].transitions).filter(t => t.explicit)
      }

      return Object.values(flow.steps[state!.step].transitions).filter(t => !t.explicit)
    },

    transition: transition => {
      const t = flow.steps[state!.step].transitions[transition]
      if (t == null) {
        throw new UnknownTransition(transition)
      }

      return t
    },

    next: () => {
      const transition = model.transitions().find(t => t.explicit !== true)
      if (transition == null) {
        throw new UnknownFlowStep('next')
      }

      return transition
    },

    transit: (transition, ok, message, payload) => {
      const t = model.transition(transition)
      state!.previous = state!.step

      if (t.reversible !== true) {
        delete state!.previous
      }

      state!.step = t.step
      state!.ok = ok
      if (typeof message !== 'string') {
        payload = message
        message = undefined
      }
      if (message != null) {
        state!.message = message
      } else if (state!.message != null) {
        delete state!.message
      }
      if (payload != null) {
        state!.payload = payload
      } else if (state!.payload != null) {
        delete state!.payload
      }

      return serializeState(flow, state!)
    },

    serialize: () => serializeState(flow, state!)
  }

  return model
}
