import { createElement, type FC } from 'react'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { authPluginHelper } from '@owlmeans/client-auth/manager/plugins'
import { ensureLoginService } from '@owlmeans/client-auth/login'
import { EMAIL_LOGIN_SERVICE } from '@owlmeans/auth-email'
import { LocalizedEmailLoginScreen } from './components/screen.js'
import { makeEmailLoginPlugin } from './plugin.js'
import { appendEmailLoginClient } from './service.js'
import { emailOfferStep } from './step.js'
import type {
  EmailLoginAppendOptions, EmailLoginClientService, EmailLoginScreenComponent, EmailLoginScreenProps,
  EmailLoginScreenSetup,
} from './types.js'
import './i18n.js'

/** The default screen, dressed with the application's setup; a host's own props still win. */
const screenOf = (setup?: EmailLoginScreenSetup): EmailLoginScreenComponent => {
  if (setup == null || Object.keys(setup).length < 1) {
    return LocalizedEmailLoginScreen
  }
  const Configured: FC<EmailLoginScreenProps> = props =>
    createElement(LocalizedEmailLoginScreen, { ...setup, ...props })

  return Configured
}

/**
 * Wire e-mail sign-in into a web app — the whole of it beyond binding the protocol tree (`bindAll`)
 * and `emailAuthEntrypoints(protocols)` in the application's entrypoint list:
 *
 * - the client service `EMAIL_LOGIN_SERVICE` over `protocols`;
 * - the `email` authentication plugin — "Continue with email" on the chooser, its card at
 *   `/authentication/login/email` (`opts.screen` dresses it, `opts.method` the button);
 * - the post-sign-in "set a password" step, below marketing consent (`opts.offer !== false`);
 * - the `auth-email` strings and `login.method.email` in eight languages.
 *
 * Explicit by design: importing this package registers no plugin.
 */
export const appendEmailLogin = <C extends ClientConfig, T extends ClientContext<C>>(
  context: T, opts: EmailLoginAppendOptions,
): T => {
  appendEmailLoginClient(context, opts.protocols, { screen: screenOf(opts.screen) })
  authPluginHelper.registerAuthPlugin(makeEmailLoginPlugin(opts.method))

  if (opts.offer !== false) {
    const client = context.service<EmailLoginClientService>(EMAIL_LOGIN_SERVICE)
    ensureLoginService(context).registerStep(emailOfferStep(client, opts.protocols.offer.alias))
  }

  return context
}

/**
 * Replace the screen the e-mail route renders — a whole new card built on `useEmailLogin()`, for an
 * application whose sign-in looks nothing like the chooser. Call it after `appendEmailLogin`.
 */
export const registerEmailLoginScreen = <C extends BasicConfig>(
  context: BasicContext<C>, screen: EmailLoginScreenComponent,
): void => {
  if (!context.hasService(EMAIL_LOGIN_SERVICE)) {
    throw new SyntaxError('auth-email: call appendEmailLogin before registerEmailLoginScreen')
  }
  context.service<EmailLoginClientService>(EMAIL_LOGIN_SERVICE).registerScreen(screen)
}
