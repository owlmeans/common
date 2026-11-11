import type { AuthenticationControl, AuthenticationRenderer } from '@owlmeans/client-auth/manager'

import LinearProgress from '@mui/material/LinearProgress'
import { AuthenticationStage, AuthorizationError, DISPATCHER, GUEST_ID } from '@owlmeans/auth'
import { useValue } from '@owlmeans/client'
import { PLUGINS } from '@owlmeans/client-context'
import { logger } from '@owlmeans/log'
import { captchaClients } from '@owlmeans/web-captcha'
import type { CaptchaWidgetClient } from '@owlmeans/web-captcha/react'
import { useCallback, useState } from 'react'
import { PanelContext } from '@owlmeans/client-panel'
import { Text } from '../../components/text.js'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import type { SxProps } from '@mui/material/styles'
import type { AppContext, Module } from '@owlmeans/web-client'
import { useContext } from '@owlmeans/web-client'
import type { AuthRequest } from '@owlmeans/auth-common'

const log = logger('mui-panel:captcha')

/**
 * The captcha guest sign-in's screen: the widget of the page's only registered captcha client
 * (`captchaClients` of `@owlmeans/web-captcha`, registered by a provider package), asked with the site
 * key of the client config record the client names. A client without a widget — or no client, or no
 * site key — renders nothing: there is no built-in captcha to fall back to.
 */
export const CaptchaAuthUIPlugin: AuthenticationRenderer = ({ stage, control }) => {
  const context = useContext()
  const [loading, setLoading] = useState(true)
  const client = captchaClients.get() as CaptchaWidgetClient | null
  const Widget = client?.widget
  const config = useValue(async () => client?.siteKeyRecord != null
    ? await context.getConfigResource(PLUGINS).get(client.siteKeyRecord) : null, [client])
  const siteKey = typeof config?.value === 'string' ? config.value : ''
  const finish = useCallback(createFinish(context, control), [])

  if (Widget == null) {
    log.warn('The captcha sign-in has no widget to render', { client: client?.id ?? null })
    return null
  }

  const style: SxProps = {
    maxWidth: { xs: '100%', sm: '100%', md: '50%' }
  }
  const loadingStyle: SxProps = {
    width: { xs: '100%', sm: '100%', md: '50%' }
  }

  const content = () => {
    switch (siteKey !== '' ? stage : null) {
      case AuthenticationStage.Authenticate:
        return <Stack direction="column" sx={{ ...style, justifyContent: 'center', alignItems: 'center' }}>
          <Text name="guideline" center />
          <Box sx={{ pt: 2 }}>
            <Widget siteKey={siteKey} onToken={finish} onReady={() => setLoading(false)} />
          </Box>
        </Stack>
      default:
        return <LinearProgress sx={loadingStyle} />
    }
  }

  return <PanelContext ns="lib" prefix="captcha" resource="client-panel-auth">
    <Stack direction="column" sx={{ justifyContent: 'center', alignItems: 'center' }}>
      {content()}
      {loading && <LinearProgress sx={loadingStyle} />}
    </Stack>
  </PanelContext>
}

const createFinish = (context: AppContext, control: AuthenticationControl) => async (token: string | null) => {
  if (token == null) {
    throw new AuthorizationError('captcha-token')
  }
  const authToken = await control.authenticate({ credential: token, userId: GUEST_ID })

  if (authToken.token === '') {
    log.debug('The captcha sign-in answered no token')
    return
  }
  const url = await context.entrypoint<Module<string, AuthRequest>>(DISPATCHER)
    .url({ query: authToken })

  control.setStage?.(control.stage = AuthenticationStage.Authenticated)

  // Give some time - that is really not cenessary - actually we need 
  // to do it on the layout finished its stuff.
  // @TODO fix it for react native (we need some other solution for redirects context indepedent)
  setTimeout(() => window.location.href = url, 100)
}
