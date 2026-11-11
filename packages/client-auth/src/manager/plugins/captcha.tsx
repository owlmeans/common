import { AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import type { AuthenticationPlugin } from './types.js'
import { useEffect } from 'react'

/**
 * The captcha guest sign-in, as a step inside another flow. Which provider's challenge is shown is
 * the `Renderer`'s business: a panel package assigns one that renders the registered captcha
 * client's widget (`@owlmeans/web-captcha`).
 */
export const captchaPlugin: AuthenticationPlugin = {
  type: AuthenticationType.Captcha,

  // A STEP inside another flow, never a way to sign in — so it is registered and never offered.
  method: { hidden: true },

  // Its widget is a `Renderer` a panel package assigns. `hidden` already keeps it off the sign-in
  // screen; this is what the flow that DOES drive it can check before handing it a stage.
  requiresRenderer: true,

  Implementation: Renderer => ({ type, stage, control, params }) => {
    Renderer = Renderer ?? captchaPlugin.Renderer

    // The captcha sign-in requests its allowance unconditionally (no input or additional
    // challenges required).
    useEffect(() => {
      if (control.stage === AuthenticationStage.Init) {
        void control.requestAllowence({ type, source: control.source })
      }
    }, [type])

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for the captcha plugin')
    }

    return <Renderer type={type} stage={stage} control={control} params={params} />
  },

  /** Nothing to sign here: the server's captcha provider judged the token. */
  authenticate: async () => ({ token: '' })
}
