import type { Config, Context, OidcAuthService } from './types.js'
import type { FlowService } from '@owlmeans/client-flow'

import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import { UserManager } from 'oidc-client-ts'
import { DEFAULT_ALIAS as FLOW_SERVICE } from '@owlmeans/client-flow'
import { FlowStepMissconfigured, UnknownFlow } from '@owlmeans/flow'
import { Module } from '@owlmeans/web-client'

export const makeOidcAuthService = (alias: string = DEFAULT_ALIAS): OidcAuthService => {
  let first = true
  const service: OidcAuthService = createService<OidcAuthService>(alias, {
    proceedToRedirectUrl: async () => {
      // @TODO Figure out another way to make the flow remounting safe
      if (!first) {
        return ''
      }
      first = false
      const context = assertContext<Config, Context>(service.ctx as Context)

      const flow = context.service<FlowService>(FLOW_SERVICE)

      const flowModel = await flow.state()
      if (flowModel == null) {
        throw new UnknownFlow('oidc.dispatch')
      }

      const authorityTransition = flowModel.next()
      // flowModel.transit(authorityTransition.transition, true)
      // const authorityUrl = await flow.proceed(undefined, true)
      flowModel.transit(authorityTransition.transition, true)
      console.log('initial transition', authorityTransition.transition)
      // const authorityStep = flowModel.step()
      // if (authorityStep.module == null) {
      //   throw new FlowStepMissconfigured(authorityStep.step)
      // }
      // console.log('authority step', authorityStep.step, authorityStep.module)
      // const [authorityUrl] = await context.module<Module>(authorityStep.module).call<string>()

      const redirectTransition = flowModel.next()
      flowModel.transit(redirectTransition.transition, true)

      const redirectUrl = await flow.proceed(undefined, true)

      return redirectUrl
    },

    dispatch: async () => {
      // @TODO Figure out another way to make the flow remounting safe
      if (!first) {
        return
      }
      first = false
      const context = assertContext<Config, Context>(service.ctx as Context)

      const flow = context.service<FlowService>(FLOW_SERVICE)

      const flowModel = await flow.state()
      if (flowModel == null) {
        throw new UnknownFlow('oidc.dispatch')
      }

      const authorityTransition = flowModel.next()
      // flowModel.transit(authorityTransition.transition, true)
      // const authorityUrl = await flow.proceed(undefined, true)
      flowModel.transit(authorityTransition.transition, true)
      console.log('initial transition', authorityTransition.transition)
      const authorityStep = flowModel.step()
      if (authorityStep.module == null) {
        throw new FlowStepMissconfigured(authorityStep.step)
      }
      console.log('authority step', authorityStep.step, authorityStep.module)
      const [authorityUrl] = await context.module<Module>(authorityStep.module).call<string>()

      const redirectTransition = flowModel.next()
      flowModel.transit(redirectTransition.transition, true)

      const redirectUrl = await flow.proceed(undefined, true)

      const manager = new UserManager({
        client_id: context.cfg.oidc.consumer?.clientId ?? '',
        redirect_uri: redirectUrl,
        authority: authorityUrl,
      })

      console.log('dispatching with manager', manager.settings)

      await manager.signinRedirect({ state: flowModel.serialize() })
    }
  }, service => async () => {
    service.initialized = true
  })

  return service
}
