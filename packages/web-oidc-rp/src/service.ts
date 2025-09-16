import type { Config, Context, OidcAuthService, OidcInteraction } from './types.js'
import type { FlowService } from '@owlmeans/client-flow'

import { assertContext, createService, HOME } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import { UserManager } from 'oidc-client-ts'
import { DEFAULT_ALIAS as FLOW_SERVICE } from '@owlmeans/client-flow'
import { FlowStepMissconfigured, OidcAuthStep, STD_OIDC_FLOW, UnknownFlow } from '@owlmeans/flow'
import type { Module } from '@owlmeans/web-client'
import { DISPATCHER_OIDC, DISPATCHER_OIDC_INIT, OIDC_CODE_QUERY } from '@owlmeans/oidc'
import type { Auth, AuthToken } from '@owlmeans/auth'
import { AUTH_RESOURCE, USER_ID } from '@owlmeans/client-auth'
import type { ClientAuthResource } from '@owlmeans/client-auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'

export const makeOidcAuthService = (alias: string = DEFAULT_ALIAS): OidcAuthService => {
  const store = (context: Context) => context.auth().store<OidcInteraction>()
  const storeKey = '_oidc-client-interaction'

  const service: OidcAuthService = createService<OidcAuthService>(alias, {
    /**
     * This method performs when the IdP returns authentication params.
     */
    dispatch: async params => {
      /**
       * 1. Check if there are parameters in the URL for the server side OIDC authentication (e.g. code)
       * 2. Send paramters to finalize authentication (proxy request to the auth server?)
       * 3. If the authentication successful set user state using authentication service
       */
      if (params[OIDC_CODE_QUERY] == null) {
        return false
      }

      const ctx = service.assertCtx<Config, Context>()

      params.authUrl = (await store(ctx).get(storeKey)).authUrl

      const [authToken] = await ctx.module<Module<AuthToken>>(DISPATCHER_OIDC)
        .call({ body: params })

      if (authToken.token != null && authToken.token !== '') {
        const authResource = ctx.resource<ClientAuthResource>(AUTH_RESOURCE)
        await authResource.save({ id: USER_ID, token: authToken.token })

        const [, authorization] = authToken.token.split(' ')
        const envelope = makeEnvelopeModel<Auth>(authorization, EnvelopeKind.Token)

        ctx.auth().auth = envelope.message()
        ctx.auth().token = authToken.token

        return true
      }

      return false
    },

    authenticate: async (flow, params) => {
      /**
       * 1. Kick of OIDC authentication if we receive some hints about who or for what organization we'd like to authenticate
       * 2. Request OIDC authentication params from the server using these entity and profile id
       * 3. The server should return an URL to redirect user to
       * 4. Return this user to the component for the further processing (redirection)
       */
      const state = flow.state()
      if (state.flow !== STD_OIDC_FLOW || state.step !== OidcAuthStep.Ephemeral) {
        return null
      }
      if (params.entity == null && state.entityId == null) {
        return null
      }
      params.entity ??= state.entityId!

      const ctx = service.assertCtx<Config, Context>()

      const [redirectTo] = await ctx.module<Module<string>>(DISPATCHER_OIDC_INIT)
        .call({ body: params })
      
      const context = service.assertCtx<Config, Context>()
      await store(context).save({ id: storeKey, authUrl: redirectTo })

      return redirectTo
    },

    proceedToRedirectUrl: async extras => {
      const context = assertContext<Config, Context>(service.ctx as Context)

      const flow = context.service<FlowService>(FLOW_SERVICE)
      const flowModel = await flow.state()
      if (flowModel == null) {
        throw new UnknownFlow('oidc.dispatch')
      }

      const authorityTransition = flowModel.next()
      flowModel.transit(authorityTransition.transition, true, { purpose: extras.purpose })

      // @TODO I'm not sure that this dirty hack is a correct approach
      if (extras.alias === HOME) {
        const redirectTransition = flowModel.next()
        flowModel.transit(redirectTransition.transition, true, { purpose: extras.purpose })
      }

      const redirectUrl = await flow.proceed({ params: { uid: extras.uid } }, true)

      return redirectUrl
    },

    /**
     * This is client-side only OIDC implementation. It's under constructuion.
     * We stoped on the try to redirect to OIDC provider, but it requires browser integrated
     * cryptography under ssl/tls.
     * @TODO Finish client-side only implementation one day
     */
    dispatchClientOnly: async () => {
      const context = assertContext<Config, Context>(service.ctx as Context)

      const flow = context.service<FlowService>(FLOW_SERVICE)

      const flowModel = await flow.state()
      if (flowModel == null) {
        throw new UnknownFlow('oidc.dispatch')
      }

      const authorityTransition = flowModel.next()
      flowModel.transit(authorityTransition.transition, true)
      const authorityStep = flowModel.step()
      if (authorityStep.module == null) {
        throw new FlowStepMissconfigured(authorityStep.step)
      }
      const [authorityUrl] = await context.module<Module>(authorityStep.module).call<string>()

      const redirectTransition = flowModel.next()
      flowModel.transit(redirectTransition.transition, true)

      const redirectUrl = await flow.proceed(undefined, true)

      // @TODO To proceed we need to provide client_id some way
      const manager = new UserManager({
        // client_id: context.cfg.oidc.consumer?.clientId ?? '',
        client_id: '',
        redirect_uri: redirectUrl,
        authority: authorityUrl,
      })

      await manager.signinRedirect({ state: flowModel.serialize() })
    }
  })

  return service
}
