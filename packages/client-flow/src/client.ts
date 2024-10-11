import type { ClientContext, Navigator } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientModule } from '@owlmeans/client-module'
import { module, stab } from '@owlmeans/client-module'
import type { ResolvedServiceRoute } from '@owlmeans/route'
import { route, frontend } from '@owlmeans/route'
import { FlowStepMissconfigured, FlowTargetError, TARGET_SERVICE } from '@owlmeans/flow'
import type { FlowModel } from '@owlmeans/flow'
import { ResilientError } from '@owlmeans/error'
import type { FlowClient, FlowService, StateResource } from './types.js'
import { DEFAULT_ALIAS, FLOW_STATE, REHACK_MOD } from './consts.js'
import { DISPATCHER_PATH } from '@owlmeans/auth-common'

export const createFlowClient = <C extends ClientConfig, T extends ClientContext<C>>(context: T, nav: Navigator): FlowClient => {
  const service = context.service<FlowService>(DEFAULT_ALIAS)

  let model: FlowModel

  const _client: FlowClient = {
    boot: async (targetAlias, from) => {
      console.log('^^ starting flow boot')
      await service.ready()
      console.log('^^ flow ready to boot')
      let _model = await service.state()
      if (_model == null) {
        if (context.hasResource(FLOW_STATE)) {
          const resource = context.resource<StateResource>(FLOW_STATE)
          const record = await resource.load(FLOW_STATE)
          if (record != null) {
            _model = await service.begin(record.flow)
            _model.setState(record)
            if (targetAlias == null) {
              targetAlias = record.service
            }
          }
        }
        if (_model == null) {
          _model = await service.begin(undefined, from)
        }
        
        if (targetAlias == null) {
          throw new FlowTargetError('no')
        }
        let target: ResolvedServiceRoute
        try {
          target = context.serviceRoute(targetAlias) as ResolvedServiceRoute
        } catch (e) {
          const err = ResilientError.ensure(e as Error)
          const error = new FlowTargetError(targetAlias)
          error.oiriginalStack = err.stack

          throw error
        }
        _model.target(target.service)
      }

      model = _model

      return _client
    },

    flow: () => model,

    service: () => context.serviceRoute(model.state().service) as ResolvedServiceRoute,

    proceed: async (transition, req) => {
      const step = model.step(transition.step)
      if (step.module == null) {
        throw new FlowStepMissconfigured(step.step)
      }

      // @TODO Such payload pass may duplicate some query paramters in some 
      // case. But in general payloadMaping should protect from most of issues.
      // In general we may stop to pass any params outside the flow state.
      model.transit(transition.transition, true, {...req?.params, ...req?.query} as Record<string, string>)

      let redirectTo: ClientModule<string>
      // @TODO Properly use target service - as a way to build the redirect URL
      if (step.service === TARGET_SERVICE) {
        context.registerModule(module(
          route(REHACK_MOD, DISPATCHER_PATH, frontend({ service: model.state().service })), stab
        ))
        redirectTo = context.module<ClientModule<string>>(REHACK_MOD)
        await redirectTo.resolve()
        step.module = REHACK_MOD
      } else {
        redirectTo = context.module<ClientModule>(step.module)
      }

      const [url] = await redirectTo.call<string>()

      console.log('We try to go', model.state(), url)

      if (url.startsWith('http')) {
        await service.proceed(req)
      } else {
        await nav.navigate(redirectTo)
      }
    },

    persist: async () => {
      if (context.hasResource(FLOW_STATE)) {
        const resource = context.resource<StateResource>(FLOW_STATE)
        const _state = model.state()
        await resource.save({ ..._state, id: FLOW_STATE })

        return true
      }

      return false
    }
  }

  return _client
}
