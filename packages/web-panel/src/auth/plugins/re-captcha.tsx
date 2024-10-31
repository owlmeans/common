import type { AuthenticationControl, AuthenticationRenderer } from '@owlmeans/client-auth/manager'

import LinearProgress from '@mui/material/LinearProgress'
import { AuthenticationStage, AuthorizationError, CMOD_RECAPTCHA, DISPATCHER, GUEST_ID } from '@owlmeans/auth'
import { useValue } from '@owlmeans/client'
import { PLUGINS } from '@owlmeans/client-context'
import ReCAPTCHA from 'react-google-recaptcha'
import { useCallback, useState } from 'react'
import { PanelContext } from '@owlmeans/client-panel'
import { Text } from '../../components/text.js'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import type { SxProps } from '@mui/material/styles'
import type { AppContext, Module } from '@owlmeans/web-client'
import { useContext } from '@owlmeans/web-client'
import type { AuthRequest } from '@owlmeans/auth-common'

export const ReCaptchaAuthUIPlugin: AuthenticationRenderer = ({ stage, control }) => {
  const context = useContext()
  const [loading, setLoading] = useState(true)
  const config = useValue(() => context.getConfigResource(PLUGINS).get(CMOD_RECAPTCHA), [])
  const finish = useCallback(createFinish(context, control), [])

  const style: SxProps = {
    maxWidth: { xs: '100%', sm: '100%', md: '50%' }
  }
  const loadingStyle: SxProps = {
    width: { xs: '100%', sm: '100%', md: '50%' }
  }

  const content = () => {
    switch (config?.value != null ? stage : null) {
      case AuthenticationStage.Authenticate:
        return <Stack direction="column" sx={style} justifyContent="center" alignItems="center">
          <Text name="guideline" center />
          <Box sx={{ pt: 2 }}>
            <ReCAPTCHA sitekey={config?.value as string ?? ''} onChange={finish}
              asyncScriptOnLoad={() => setLoading(false)} />
          </Box>
        </Stack>
      default:
        return <LinearProgress sx={loadingStyle} />
    }
  }

  return <PanelContext ns="lib" prefix="re-captcha" resource="client-panel-auth">
    <Stack direction="column" justifyContent="center" alignItems="center">
      {content()}
      {loading && <LinearProgress sx={loadingStyle} />}
    </Stack>
  </PanelContext>
}

const createFinish = (context: AppContext, control: AuthenticationControl) => async (token: string | null) => {
  console.log('we are foinishing')
  if (token == null) {
    console.log('null token')
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

  console.log('goto url')
  // Give some time - that is really not cenessary - actually we need 
  // to do it on the layout finished its stuff.
  // @TODO fix it for react native (we need some other solution for redirects context indepedent)
  setTimeout(() => window.location.href = url, 100)
}
