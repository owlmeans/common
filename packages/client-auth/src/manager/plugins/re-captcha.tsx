import { AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import type { AuthenticationPlugin } from './types.js'
import { useEffect } from 'react'

export const reCaptchaPlugin: AuthenticationPlugin = {
  type: AuthenticationType.ReCaptcha,

  Implementation: Renderer => ({ type, stage, control, params }) => {
    Renderer = Renderer ?? reCaptchaPlugin.Renderer

    // ReCaptcha authentication requests allowance unconditionally 
    // (no input or additional challenges required)
    useEffect(() => {
      if (control.stage === AuthenticationStage.Init) {
        void control.requestAllowence({ type, source: control.source })
      }
    }, [type])

    if (Renderer == null) {
      throw new SyntaxError('Renderer is not defined for ReCaptcha plugin')
    }

    return <Renderer type={type} stage={stage} control={control} params={params} />
  },

  /**
   * Actually we don't need to do anything here cause ReCaptcha server
   * did it for us.
   */
  authenticate: async () => ({ token: '' })
}
