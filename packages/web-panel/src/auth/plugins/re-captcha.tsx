import type { AuthenticationControl, AuthenticationRenderer } from '@owlmeans/client-auth/manager'

import { AuthenticationStage, AuthorizationError, CMOD_RECAPTCHA, DISPATCHER, GUEST_ID } from '@owlmeans/auth'
import { useValue } from '@owlmeans/client'
import { PLUGINS } from '@owlmeans/client-context'
import ReCAPTCHA from 'react-google-recaptcha'
import { useCallback, useState } from 'react'
import { PanelContext } from '@owlmeans/client-panel'
import { Text } from '../../components/text.js'
import { Progress } from '@/components/ui/progress'
import type { AppContext, Module } from '@owlmeans/web-client'
import { useContext } from '@owlmeans/web-client'
import type { AuthRequest } from '@owlmeans/auth-common'

export const ReCaptchaAuthUIPlugin: AuthenticationRenderer = ({ stage, control }) => {
  const context = useContext()
  const [loading, setLoading] = useState(true)
  const config = useValue(() => context.getConfigResource(PLUGINS).get(CMOD_RECAPTCHA), [])
  const finish = useCallback(createFinish(context, control), [])

  const content = () => {
    switch (config?.value != null ? stage : null) {
      case AuthenticationStage.Authenticate:
        return (
          <div className="flex flex-col items-center justify-center max-w-full md:max-w-[50%]">
            <Text name="guideline" center />
            <div className="pt-4">
              <ReCAPTCHA sitekey={config?.value as string ?? ''} onChange={finish}
                asyncScriptOnLoad={() => setLoading(false)} />
            </div>
          </div>
        )
      default:
        return <Progress className="w-full md:w-1/2" />
    }
  }

  return <PanelContext ns="lib" prefix="re-captcha" resource="client-panel-auth">
    <div className="flex flex-col items-center justify-center">
      {content()}
      {loading && <Progress className="w-full md:w-1/2" />}
    </div>
  </PanelContext>
}

const createFinish = (context: AppContext, control: AuthenticationControl) => async (token: string | null) => {
  if (token == null) {
    throw new AuthorizationError('re-captcha-token')
  }
  const authToken = await control.authenticate({ credential: token, userId: GUEST_ID })

  if (authToken.token === '') {
    console.timeLog('empty token')
    return
  }
  const [url] = await context.module<Module<string, AuthRequest>>(DISPATCHER)
    .call({ query: authToken })

  control.setStage?.(control.stage = AuthenticationStage.Authenticated)

  // Give some time - that is really not cenessary - actually we need 
  // to do it on the layout finished its stuff.
  // @TODO fix it for react native (we need some other solution for redirects context indepedent)
  setTimeout(() => window.location.href = url, 100)
}
