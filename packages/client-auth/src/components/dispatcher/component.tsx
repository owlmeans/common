import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DispatcherRendererProps, TDispatcherHOC } from './types.js'
import { AUTH_QUERY, DISPATCHER } from '@owlmeans/auth'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { HOME } from '@owlmeans/context'
import { DEFAULT_ALIAS, DEFAULT_ENTITY } from '../../consts.js'
import type { AuthService } from '@owlmeans/auth-common'
import { useNavigate } from '@owlmeans/client'
import { type FlowService, DEFAULT_ALIAS as FLOW_SERVICE } from '@owlmeans/client-flow'
import { FLOW_PLACEHOLDER, OidcAuthStep, STD_OIDC_FLOW } from '@owlmeans/flow'
import { SERVICE_PARAM } from '@owlmeans/web-flow'
import { loginLandingOf } from '../../login/land.js'
import { loginFailureHelper } from '../../login/failure.js'
import { LoginFailureView } from '../../login/failure-view.js'
import { makeAuthTranslate } from '../../login/translate.js'
import { ensureLoginService } from '../../login/service.js'
import type { LoginFailure } from '../../login/failure/types.js'
import { logger } from '@owlmeans/log'
import type { StateToken } from './types.local.js'

const log = logger('client-auth:dispatcher')

export const DispatcherHOC: TDispatcherHOC = Renderer => ({ context, params, alias, query, payload }) => {
  const [forwarding, setForwarding] = useState<StateToken | undefined>()
  // How the exchange of a supplied token ended, when it did not sign anyone in. Rendered here, in
  // place of the renderer, so no renderer is left on its "loading" line forever.
  const [failure, setFailure] = useState<LoginFailure | null>(null)

  const navigator = useNavigate()

  const fail = useCallback((error: unknown) => {
    const failed = loginFailureHelper.failureOf(error)
    if (failed.refused) {
      // The person's condition, not a fault: the server said so on purpose.
      log.warn('Sign-in refused', { kind: failed.kind, incidentId: failed.incidentId }, { event: 'auth.refused' })
    } else {
      log.error('Authentication failed', error, { event: 'auth.refused' })
    }
    setFailure(failed)
  }, [])

  // Back to the start of signing in — the dispatcher with nothing to exchange. A supplied token is
  // single-use, so sending it again could only fail again. A full load where there is a document,
  // so the renderer starts from scratch; an in-app hop elsewhere.
  const restart = useCallback(() => {
    void (async () => {
      if (ensureLoginService(context).env().hasWindow) {
        window.location.replace(await loginLandingOf(context).landingUrl({ alias: DISPATCHER }))
        return
      }
      setFailure(null)
      setForwarding(undefined)
      await navigator.navigate(context.entrypoint<ClientEntrypoint<string>>(DISPATCHER), { params: {}, query: {} })
    })().catch((error: unknown) => {
      log.warn('The sign-in screen could not be reopened', error)
    })
  }, [])

  const translate = useMemo(() => failure != null ? makeAuthTranslate(context.cfg) : undefined, [failure])
  const navigate = useCallback(async () => {
    if (alias == null || alias === DISPATCHER) {
      // A sign-in that started elsewhere — a device or authorization-code consent screen, most
      // commonly — suspended itself here before leaving, or a registered step still has
      // something to collect (a marketing-consent screen, say). `landAfterLogin` is the whole
      // post-sign-in landing decision (steps, landing hooks, the suspended flow, then HOME) and
      // takes priority over the ordinary HOME landing, resolved BEFORE `alias` is overwritten,
      // because once it is `HOME` there is no way back to tell the cases apart.
      const landing = await loginLandingOf(context).landAfterLogin()
      if (landing.alias !== HOME) {
        await navigator.navigate(
          context.entrypoint<ClientEntrypoint<string>>(landing.alias),
          { params: landing.params, query: landing.query }
        )
        return
      }
      alias = HOME
    } else {
      // A concrete destination already exists (an OIDC `?code=` return, etc.) — a registered step
      // still gets to interject, but `resumeSuspendedFlow` must not run a second time: this
      // branch already has somewhere to go.
      query = { ...forwarding?.query, ...query }
      if (query != null && AUTH_QUERY in query) {
        delete query[AUTH_QUERY]
      }
      const landing = await loginLandingOf(context).landAfterLogin(
        { fallback: { alias, params, query }, resume: false }
      )
      await navigator.navigate(
        context.entrypoint<ClientEntrypoint<string>>(landing.alias),
        { params: landing.params, query: landing.query }
      )
      return
    }
    const module = context.entrypoint<ClientEntrypoint<string>>(alias)
    params = {}
    query = {}
    await navigator.navigate(module, { params, query })
  }, [forwarding])

  useEffect(() => {
    if (forwarding?.token != null) {
      if (forwarding.token.token === '') {
        const flow = context.service<FlowService>(FLOW_SERVICE)
        // @TODO: Make sure that the provided flow is compatible with OIDC flow or provide custom from step
        flow.ready().then(async () => {
          // We do nothing if we are in the middle of a flow
          if (await flow.supplied) {
            const state = await flow.state()
            // If the flow we are in already has a target, it means this is some flow 
            // that is really happening and we do not need to override it with our own.
            // It's MAY BE required on the auth manager service side, cause this 
            // component is actually reused by both service and identity providers of OwlMeans.
            if (state?.state().service !== '') {
              return
            }
          }
          const cfg = context.cfg.security?.auth
          const model = await flow.begin(cfg?.flow ?? STD_OIDC_FLOW, cfg?.enter)
          const target = (
            SERVICE_PARAM in params ? params[SERVICE_PARAM] : context.cfg.shortAlias
          ) as string | undefined
          if (target != null) {
            model.target(target)
            if (payload != null) {
              model.updatePayload(payload)
            }
          } else if (model.state().flow === STD_OIDC_FLOW) {
            const target = model.step().service
            model.target(target)
            const entity = model.state().entityId
            if (entity == null) {
              model.entity(DEFAULT_ENTITY)
            }
            if (target === FLOW_PLACEHOLDER) {
              model.transit(OidcAuthStep.Ephemeral, true)
            }
          }
          await flow.proceed()
        }).catch(fail)
      } else {
        const auth = context.service<AuthService>(DEFAULT_ALIAS)
        // A refused or failed exchange ends in the failure view; a navigation that fails after a
        // successful one is only logged — the person IS signed in by then.
        auth.authenticate(forwarding.token).then(async () => {
          return await navigate()
        }, fail).catch((e: unknown) => {
          log.error('Navigation after sign-in failed', e)
        })
      }
    }
  }, [forwarding?.token])

  const provideToken = useCallback<DispatcherRendererProps["provideToken"]>((token, query) => {
    setForwarding({ token, query })
  }, [])

  if (failure != null) {
    return <LoginFailureView failure={failure} translate={translate} onAction={restart} page />
  }

  return <Renderer provideToken={provideToken} navigate={navigate} />
}

