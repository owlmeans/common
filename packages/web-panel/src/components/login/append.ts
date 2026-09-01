import type { ComponentType, ReactNode } from 'react'
import { ensureLoginService } from '@owlmeans/client-auth/login'
import type { LoginScreenProps } from '@owlmeans/client-auth/login'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { LocalizedLoginScreen } from './screen.js'

export interface LoginScreenSetup extends Omit<LoginScreenProps, 'translate'> {
  /** The one thing an application is expected to supply. */
  Logo?: ComponentType<{ className?: string }> | ReactNode
}

/**
 * Give this context the shadcn sign-in screen, with the application's own logo and copy on it.
 *
 * Registered on the login SERVICE rather than imported by a dispatcher, because a relying party
 * (`web-oidc-rp`, `mui-oidc-rp`) must never depend on a UI family — that edge would make every
 * relying party pick one, and there are two. The dispatcher asks `login().screen()` and falls back
 * to the plain screen `@owlmeans/client-auth` ships, so an app that never calls this still gets a
 * chooser rather than an auto-redirect.
 *
 * Idempotent: called by `makeContext` with defaults, and again by the app with its own logo.
 */
export const appendLoginScreen = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T, setup?: LoginScreenSetup
): T => {
  const service = ensureLoginService(ctx)
  service.registerScreen(
    setup == null || Object.keys(setup).length < 1
      ? LocalizedLoginScreen
      : props => LocalizedLoginScreen({ ...setup, ...props })
  )

  return ctx
}
