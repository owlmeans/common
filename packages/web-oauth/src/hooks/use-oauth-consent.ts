import { useCallback, useEffect, useRef, useState } from 'react'
import { useContext, useNavigate } from '@owlmeans/client'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import type { AuthService } from '@owlmeans/auth-common'
import { DISPATCHER } from '@owlmeans/auth'
import { suspendFlow } from '@owlmeans/client-flow'
import { makeFlowModel } from '@owlmeans/flow'
import { ResilientError } from '@owlmeans/error'
import {
  makeOAuthProtocols, oauthFlow, OAuthFlowStep, OAUTH_PAYLOAD_KIND, OAUTH_PAYLOAD_REF
} from '@owlmeans/oauth'
import type { ConsentView, OAuthEntrypointOptions } from '@owlmeans/oauth'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { OAUTH_SUSPEND_TTL_MS } from '../consts.js'

export type ConsentStage = 'checking' | 'signing-in' | 'loading' | 'ready' | 'deciding' | 'done' | 'error'

/** Why the screen cannot go on — the screen phrases each kind as ONE sentence, never the wire text. */
export type ConsentErrorKind = 'missing' | 'not-found' | 'expired' | 'forbidden' | 'failed'

export interface UseOAuthConsent {
  stage: ConsentStage
  view: ConsentView | null
  /** The raw failure, for a log; what a person reads is `errorKind`. */
  error: string | null
  errorKind: ConsentErrorKind | null
  approve: () => Promise<void>
  deny: () => Promise<void>
  /** Sign the current session out and go through the sign-in again, returning to this request. */
  switchAccount: () => Promise<void>
}

const errorKindOf = (message: string): ConsentErrorKind =>
  message.includes('request-expired') ? 'expired'
    : message.includes('request-not-found') ? 'not-found'
      : message.includes('forbidden') ? 'forbidden'
        : 'failed'

/**
 * The whole consent screen's logic, headless — so the rendered component stays a thin shell over
 * whatever a consuming app's own primitives look like, the same split `@owlmeans/web-auth-token`
 * draws between its panel and its hook.
 *
 * `ref` is whatever the URL query named: a code grant's request id, or a device grant's user
 * code — `resolveRequestRef` on the server sorts out which. `aliases` lets an app that mounted
 * these entrypoints under a different parent still reach them; the defaults are what
 * `oauthEntrypoints` binds.
 */
export const useOAuthConsent = (ref: string | null, aliases?: OAuthEntrypointOptions): UseOAuthConsent => {
  const context = useContext()
  const nav = useNavigate()
  const protocols = makeOAuthProtocols(aliases)

  const [stage, setStage] = useState<ConsentStage>('checking')
  const [view, setView] = useState<ConsentView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<ConsentErrorKind | null>(null)
  const suspending = useRef(false)

  const fail = (e: unknown): void => {
    const message = ResilientError.ensure(e instanceof Error ? e : String(e)).message
    setError(message)
    setErrorKind(errorKindOf(message))
    setStage('error')
  }

  /**
   * Suspend the consent flow at its `sign-in` step and leave for the dispatcher. Suspending AT
   * that step is what makes resuming land back on `consent` with the same ref.
   */
  const leaveForSignIn = async (target: string): Promise<void> => {
    const model = await makeFlowModel(oauthFlow)
    model.updatePayload({ [OAUTH_PAYLOAD_REF]: target })
    model.transit(OAuthFlowStep.SignIn, true)
    await suspendFlow(context, model, { expiresAt: Date.now() + OAUTH_SUSPEND_TTL_MS })

    const dispatcher = await context.entrypoint<ClientEntrypoint<string>>(DISPATCHER).url()
    window.location.href = dispatcher
  }

  useEffect(() => {
    if (ref == null || ref === '') {
      setError('Nothing to approve.')
      setErrorKind('missing')
      setStage('error')

      return
    }

    let cancelled = false
    void (async () => {
      const auth = context.service<AuthService>(AUTH_SERVICE)
      const token = await auth.authenticated()

      if (token == null || token === '') {
        if (suspending.current) return
        suspending.current = true
        setStage('signing-in')

        await leaveForSignIn(ref)

        return
      }

      setStage('loading')
      try {
        const loaded = await context.entrypoint(protocols.load).call({ params: { ref } })
        if (!cancelled) {
          setView(loaded)
          setStage('ready')
        }
      } catch (e) {
        if (!cancelled) fail(e)
      }
    })()

    return () => { cancelled = true }
  }, [ref])

  const decide = useCallback(async (action: 'approve' | 'deny') => {
    if (ref == null) return
    setStage('deciding')
    try {
      const protocol = action === 'approve' ? protocols.approve : protocols.deny
      const result = await context.entrypoint(protocol).call({ params: { ref } })
      if (result.redirect != null) {
        window.location.href = result.redirect

        return
      }
      // Device grant: nothing to redirect to — the poller catches up on its own. `approve` and
      // `deny` both lead to `done` from `consent`; asking the flow for that step's module is what
      // keeps this in step with the shared definition instead of hardcoding the destination.
      const model = await makeFlowModel(oauthFlow)
      model.updatePayload({ [OAUTH_PAYLOAD_KIND]: view?.kind ?? '', [OAUTH_PAYLOAD_REF]: ref })
      model.transit(action, true)
      const destination = model.step()
      setStage('done')
      await nav.navigate(
        context.entrypoint<ClientEntrypoint<string>>(destination.module!), { query: model.payload() }
      )
    } catch (e) {
      fail(e)
    }
  }, [ref, view])

  const switchAccount = useCallback(async () => {
    if (ref == null || ref === '') return
    try {
      await context.service<AuthService>(AUTH_SERVICE).update(undefined)
      await leaveForSignIn(ref)
    } catch (e) {
      fail(e)
    }
  }, [ref])

  return {
    stage, view, error, errorKind,
    approve: () => decide('approve'),
    deny: () => decide('deny'),
    switchAccount,
  }
}
