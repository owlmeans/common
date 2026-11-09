import { memoHelper } from '@owlmeans/context'
import { AUTH_SESSION_TTL } from '@owlmeans/server-auth-session'
import { AUTH_SRV_KEY } from './consts.js'
import type { AuthSettings, AuthSettingsTarget } from './settings/types.js'

export const makeAuthSettings = (context: AuthSettingsTarget): AuthSettings => {
  const named = (value: string | undefined): value is string => value != null && value !== ''

  const tokenKey = (): string => {
    const key = context.cfg.auth?.tokenKey

    return named(key) ? key : context.cfg.alias ?? context.cfg.service
  }

  const authKey = (): string => {
    const key = context.cfg.auth?.authKey

    return named(key) ? key : AUTH_SRV_KEY
  }

  const sessionTtl = (): number => {
    const ttl = context.cfg.auth?.sessionTtl
    if (ttl == null) {
      return AUTH_SESSION_TTL
    }
    if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl <= 0) {
      throw new SyntaxError('auth:session-ttl')
    }

    return ttl
  }

  return { tokenKey, authKey, sessionTtl }
}

/** The effective authentication settings of a context — one per context. */
export const authSettingsOf = memoHelper.oncePer(makeAuthSettings)
