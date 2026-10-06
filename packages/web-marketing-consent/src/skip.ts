import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import type { AuthService } from '@owlmeans/auth-common'
import type { LoginContext } from '@owlmeans/client-auth/login'
import { memoHelper } from '@owlmeans/context'
import { MARKETING_CONSENT_SKIP_STORAGE } from './consts.js'
import type { MarketingConsentSkipHelper } from './skip/types.js'

export const makeMarketingConsentSkipHelper = (ctx: LoginContext): MarketingConsentSkipHelper => {
  /** A key naming THIS sign-in, for the skip marker. `null` while signed out. */
  const skipKey = async (): Promise<string | null> => {
    const auth = ctx.service<AuthService>(AUTH_SERVICE)
    const token = await auth.authenticated()
    if (token == null) {
      return null
    }

    return auth.user()?.sessionId ?? token
  }

  const isSkipped = async (): Promise<boolean> => {
    const key = await skipKey()
    if (key == null) {
      return false
    }
    try {
      return window.localStorage.getItem(MARKETING_CONSENT_SKIP_STORAGE) === key
    } catch {
      // Storage unavailable (private modes, blocked cookies): the safe direction is to ask again.
      return false
    }
  }

  const markSkipped = async (): Promise<void> => {
    const key = await skipKey()
    if (key == null) {
      return
    }
    try {
      window.localStorage.setItem(MARKETING_CONSENT_SKIP_STORAGE, key)
    } catch { /* nothing to remember if storage was never available */ }
  }

  return { isSkipped, markSkipped }
}

export const marketingConsentSkipOf = memoHelper.oncePer(makeMarketingConsentSkipHelper)
