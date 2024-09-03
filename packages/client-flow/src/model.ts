import type { ClientContext, Navigator } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientModule } from '@owlmeans/client-module'
import type { ResolvedServiceRoute } from '@owlmeans/route'
import { FlowStepMissconfigured, FlowTargetError } from '@owlmeans/flow'
import type { FlowModel } from '@owlmeans/flow'
import { ResilientError } from '@owlmeans/error'
import type { FlowClient, FlowService, StateResource } from './types.js'
import { DEFAULT_ALIAS, FLOW_STATE } from './consts.js'

export const createFlowModel = <C extends ClientConfig, T extends ClientContext<C>>(context: T, nav: Navigator): FlowClient => {
  const flow = context.service<FlowService>(DEFAULT_ALIAS)

  let state: FlowModel

  const _model: FlowClient = {
    boot: async (target, from) => {
      await flow.ready()
      let model = await flow.state()
      if (model == null) {
        if (context.hasResource(FLOW_STATE)) {
          const resource = context.resource<StateResource>(FLOW_STATE)
          const _state = await resource.load(FLOW_STATE)
          if (_state != null) {
            model = await flow.begin(_state.flow)
            model.setState(_state)
            if (target == null) {
              target = _state.service
            }
          }
        }
        if (model == null) {
          model = await flow.begin(undefined, from)
        }
        
        if (target == null) {
          throw new FlowTargetError('no')
        }
        let service: ResolvedServiceRoute
        try {
          service = context.serviceRoute(target) as ResolvedServiceRoute
        } catch (e) {
          const err = ResilientError.ensure(e as Error)
          const error = new FlowTargetError(target)
          error.oiriginalStack = err.stack

          throw error
        }
        model.target(service.service)
      }

      state = model

      return _model
    },

    flow: () => state,

    service: () => context.serviceRoute(state.state().service) as ResolvedServiceRoute,

    proceed: async (transition, req) => {
      const step = state.step(transition.step)
      if (step.module == null) {
        throw new FlowStepMissconfigured(step.step)
      }

      state.transit(transition.transition, true)

      // @TODO Properly use target service - as a way to build the redirect URL
      const module = context.module<ClientModule>(step.module)
      const [url] = await module.call<string>()

      if (url.startsWith('http')) {
        await flow.proceed(req)
      } else {
        await nav.navigate(module)
      }
    },

    persist: async () => {
      if (context.hasResource(FLOW_STATE)) {
        const resource = context.resource<StateResource>(FLOW_STATE)
        const _state = state.state()
        await resource.save({ ..._state, id: FLOW_STATE })

        return true
      }

      return false
    }
  }

  return _model
}