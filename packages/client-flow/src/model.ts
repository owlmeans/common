import type { ClientContext,  Navigator } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientModule } from '@owlmeans/client-module'
import type { ResolvedServiceRoute } from '@owlmeans/route'
import { FlowStepMissconfigured, FlowTargetError } from '@owlmeans/flow'
import type { FlowModel } from '@owlmeans/flow'
import { ResilientError } from '@owlmeans/error'
import type { FlowClient, FlowService } from './types.js'
import { DEFAULT_ALIAS } from './consts.js'

export const createFlowModel = <C extends ClientConfig, T extends ClientContext<C>>(context: T, nav: Navigator): FlowClient => {
  const flow = context.service<FlowService>(DEFAULT_ALIAS)

  let state: FlowModel

  const _model: FlowClient = {
    boot: async (target, from) => {
      await flow.ready()
      let model = await flow.state()
      if (model == null) {
        model = await flow.begin(undefined, from)
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

      const module = context.module<ClientModule>(step.module)
      const [url] = await module.call<string>()
      
      if (url.startsWith('http')) {
        await flow.proceed(req)
      } else {
        await nav.navigate(module)
      }
    }
  }

  return _model
}