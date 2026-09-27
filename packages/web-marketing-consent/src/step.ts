import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import type { AuthService } from '@owlmeans/auth-common'
import { resolveTerms } from '@owlmeans/client-auth/login'
import type { LoginContext, LoginStep } from '@owlmeans/client-auth/login'
import type { CommonConfig } from '@owlmeans/config'
import { MARKETING_CONSENT_LOGIN_STEP, MARKETING_CONSENT_SKIP_STORAGE } from './consts.js'
import type { MarketingConsentClientService } from './service.js'

export interface MarketingConsentStepOptions {
  /**
   * The Terms confirmation lives on THIS step instead of the sign-in screen — `LoginStep` is
   * declared `confirmsTerms`/`required`, and `pending` also becomes true whenever the server's
   * recorded terms version does not match the resolved configuration (or the status could not be
   * read at all — a broken read must show the step, never wave a Terms confirmation through).
   */
  confirmsTerms?: boolean
}

/** A key naming THIS sign-in, for the skip marker. `null` while signed out. */
const skipKeyOf = async (ctx: LoginContext): Promise<string | null> => {
  const auth = ctx.service<AuthService>(AUTH_SERVICE)
  const token = await auth.authenticated()
  if (token == null) {
    return null
  }

  return auth.user()?.sessionId ?? token
}

/**
 * Whether THIS sign-in already skipped the step. Read by `pending`; never written by it — only
 * `markMarketingConsentSkipped` (the screen's "Skip" action) writes the marker.
 */
export const isMarketingConsentSkipped = async (ctx: LoginContext): Promise<boolean> => {
  const key = await skipKeyOf(ctx)
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

/** Record that THIS sign-in skipped the step. */
export const markMarketingConsentSkipped = async (ctx: LoginContext): Promise<void> => {
  const key = await skipKeyOf(ctx)
  if (key == null) {
    return
  }
  try {
    window.localStorage.setItem(MARKETING_CONSENT_SKIP_STORAGE, key)
  } catch { /* nothing to remember if storage was never available */ }
}

/**
 * The post-sign-in step.
 *
 * Ordinarily pending while this person's marketing-consent status has anything to collect
 * (`consentStatus`'s own `pending` — a brand-new consent, or one whose wording/mode changed under
 * them) AND this sign-in has not skipped it. A fetch failure fails OPEN here (not pending) — a
 * broken read must never block sign-in on a screen nobody can get past.
 *
 * With `confirmsTerms`, the rule is STRICT instead: also pending whenever the server's recorded
 * terms version does not match the resolved configuration, and a broken status read counts as
 * pending rather than not — the Terms confirmation moved here on purpose to be the one thing this
 * step never waves through unconfirmed. Reads the terms configuration fresh from `ctx.cfg` on every
 * call (never captured once at `appendMarketingConsent` time), because `apiConfigMiddleware` can
 * still be merging it in when this step is registered.
 */
export const marketingConsentStep = (
  client: MarketingConsentClientService, entrypointAlias: string, opts: MarketingConsentStepOptions = {},
): LoginStep => ({
  alias: MARKETING_CONSENT_LOGIN_STEP,
  entrypoint: entrypointAlias,
  confirmsTerms: opts.confirmsTerms === true,
  required: opts.confirmsTerms === true,
  pending: async ctx => {
    const status = await client.status({ fresh: true })

    if (opts.confirmsTerms === true) {
      const resolved = resolveTerms((ctx.cfg as CommonConfig).security?.auth?.login?.terms)
      if (resolved != null && (status == null || status.terms?.version !== resolved.version)) {
        return true
      }
    }

    if (status?.pending !== true) {
      return false
    }

    return !(await isMarketingConsentSkipped(ctx))
  },
})
