import { AuthenFailed, AuthUnavailable } from '@owlmeans/auth'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import { captchaResolverOf } from './resolver.js'
import type { CaptchaCheck, CaptchaSettings } from './types.js'
import { policyUtils } from './utils/policy.js'

const log = logger('captcha')

/**
 * The strict, challenge-less check of a score-based token, for a route that acts on its own (sends
 * a mail, checks a password) rather than signing a captcha guest in.
 *
 * Unlike the lenient sign-in policy nothing is optional once settings are given: the provider must
 * be registered, the score is required, the hostname list must not be empty and every call names
 * the exact action its token must carry. The provider is resolved through the context's captcha host
 * — there is no built-in provider: a check whose provider is missing fails closed, and
 * `assertReady` (called at boot) turns that into a boot error.
 */
export const makeCaptchaCheck = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, settings: CaptchaSettings | null
): CaptchaCheck => {
  const { listOf, hostOf, hostAllowed } = policyUtils
  const resolver = captchaResolverOf(context)

  const textOf = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

  /** A score floor of 0…1 from a number or a numeric string; `null` when absent or invalid. */
  const scoreOf = (value: unknown): number | null => {
    if (typeof value === 'string' && value.trim() === '') {
      return null
    }
    const score = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN

    return Number.isFinite(score) && score >= 0 && score <= 1 ? score : null
  }

  const source = settings?.hostnames
  const hosts = (Array.isArray(source) ? source.flatMap(listOf) : listOf(source))
    .map(hostOf).filter(host => host !== '')
  const floor = scoreOf(settings?.minScore)

  let reported = false

  const refuse = (reason: string, action: string): never => {
    log.debug('Captcha refused', { reason, action })
    throw new AuthenFailed(`captcha:${reason}`)
  }

  const enabled: CaptchaCheck['enabled'] = () => settings != null

  const clientSettings: CaptchaCheck['clientSettings'] = () =>
    settings != null ? resolver.provider(settings.provider).clientSettings() : null

  const assertReady: CaptchaCheck['assertReady'] = () => {
    if (settings != null) {
      resolver.provider(settings.provider)
    }
  }

  const assert: CaptchaCheck['assert'] = async request => {
    if (settings == null) {
      return
    }
    const provider = resolver.find(settings.provider)
    const siteKey = textOf(provider?.clientSettings().siteKey)
    if (provider == null || siteKey === '' || hosts.length === 0 || floor == null) {
      if (!reported) {
        reported = true
        const invalid = [
          provider == null ? 'provider' : null, provider != null && siteKey === '' ? 'siteKey' : null,
          hosts.length === 0 ? 'hostnames' : null, floor == null ? 'minScore' : null,
        ].filter(field => field != null)
        log.error('Captcha check misconfigured', { invalid, provider: settings.provider ?? null }, { event: 'auth.captcha.config' })
      }
      throw new AuthUnavailable('captcha:config')
    }

    const { action } = request
    const token = textOf(request.token)
    if (token === '') {
      refuse('missing', action)
    }

    const remoteIp = textOf(request.remoteIp)
    const verdict = await provider.verify(token, { action, ...(remoteIp !== '' ? { remoteIp } : {}) })

    if (verdict.success !== true) {
      const codes = Array.isArray(verdict.errors) ? verdict.errors : []
      refuse(codes.length > 0 ? codes.join(',') : 'unknown', action)
    }
    if (typeof verdict.score !== 'number' || !Number.isFinite(verdict.score) || verdict.score < floor) {
      refuse('score', action)
    }
    if (!hostAllowed(hosts, verdict.hostname)) {
      refuse('hostname', action)
    }
    if (typeof action !== 'string' || action === '' || verdict.action !== action) {
      refuse('action', action)
    }
  }

  return { enabled, clientSettings, assertReady, assert }
}
