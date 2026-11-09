import type { FC } from 'react'
import { useContext } from '@owlmeans/client'
import type { AuthenticationRendererProps } from '@owlmeans/client-auth/manager'
import { EMAIL_LOGIN_SERVICE } from '@owlmeans/auth-email'
import type { EmailLoginClientService } from '../types.js'
import { LocalizedEmailLoginScreen } from './screen.js'

/**
 * What the e-mail method's authentication route renders: the screen registered for this context
 * (`appendEmailLogin({ screen })`, or a replacement from `registerEmailLoginScreen`), else the
 * package's own.
 */
export const EmailLoginRoute: FC<Partial<AuthenticationRendererProps>> = () => {
  const ctx = useContext()
  const Screen = ctx.hasService(EMAIL_LOGIN_SERVICE)
    ? ctx.service<EmailLoginClientService>(EMAIL_LOGIN_SERVICE).screen() ?? LocalizedEmailLoginScreen
    : LocalizedEmailLoginScreen

  return <Screen />
}
