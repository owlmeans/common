import { AuthenFailed, AuthUnavailable } from '@owlmeans/auth'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import { CAPTCHA_VERIFIER } from './consts.js'
import type { CaptchaCheck, CaptchaSettings, CaptchaVerifierService } from './types.js'
import { policyUtils } from './utils/policy.js'
import { createCaptchaVerifierService } from './verifier.js'

const log = logger('captcha')

/**
 * The strict, challenge-less check of a score-based (v3) token, for a route that acts on its own
 * (sends a mail, checks a password) rather than signing a reCAPTCHA guest in.
 *
 * Unlike the lenient sign-in policy nothing is optional once a site key is set: the score is
 * required, the hostname list must not be empty and every call names the exact action its token
 * must carry. An enabled check whose settings are incomplete fails closed with
 * `AuthUnavailable('recaptcha:config')`. The verifier is the context's `CAPTCHA_VERIFIER` service
 * when one is registered, the default siteverify call otherwise.
 */
export const makeCaptchaCheck = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, settings: CaptchaSettings | null
): CaptchaCheck => {
  const { listOf, hostOf, hostAllowed } = policyUtils

  const textOf = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

  /** A score floor of 0…1 from a number or a numeric string; `null` when absent or invalid. */
  const scoreOf = (value: unknown): number | null => {
    if (typeof value === 'string' && value.trim() === '') {
      return null
    }
    const score = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN

    return Number.isFinite(score) && score >= 0 && score <= 1 ? score : null
  }

  const key = textOf(settings?.siteKey)
  const secret = textOf(settings?.secret)
  const source = settings?.hostnames
  const hosts = (Array.isArray(source) ? source.flatMap(listOf) : listOf(source))
    .map(hostOf).filter(host => host !== '')
  const floor = scoreOf(settings?.minScore)

  let reported = false
  let fallback: CaptchaVerifierService | undefined

  const verifier = (): CaptchaVerifierService => {
    if (context.hasService(CAPTCHA_VERIFIER)) {
      return context.service<CaptchaVerifierService>(CAPTCHA_VERIFIER)
    }
    fallback ??= createCaptchaVerifierService()

    return fallback
  }

  const refuse = (reason: string, action: string): never => {
    log.debug('Captcha refused', { reason, action })
    throw new AuthenFailed(`recaptcha:${reason}`)
  }

  const enabled: CaptchaCheck['enabled'] = () => key !== ''

  const siteKey: CaptchaCheck['siteKey'] = () => key !== '' ? key : null

  const assert: CaptchaCheck['assert'] = async request => {
    if (key === '') {
      return
    }
    if (secret === '' || hosts.length === 0 || floor == null) {
      if (!reported) {
        reported = true
        const invalid = [
          secret === '' ? 'secret' : null, hosts.length === 0 ? 'hostnames' : null, floor == null ? 'minScore' : null,
        ].filter(field => field != null)
        log.error('Captcha check misconfigured', { invalid }, { event: 'auth.recaptcha.config' })
      }
      throw new AuthUnavailable('recaptcha:config')
    }

    const { action } = request
    const token = textOf(request.token)
    if (token === '') {
      refuse('missing', action)
    }

    const remoteip = textOf(request.remoteip)
    const answer = await verifier().verify({ secret, response: token, ...(remoteip !== '' ? { remoteip } : {}) })

    if (answer.success !== true) {
      const codes = Array.isArray(answer['error-codes']) ? answer['error-codes'] : []
      refuse(codes.length > 0 ? codes.join(',') : 'unknown', action)
    }
    if (typeof answer.score !== 'number' || !Number.isFinite(answer.score) || answer.score < floor) {
      refuse('score', action)
    }
    if (!hostAllowed(hosts, answer.hostname)) {
      refuse('hostname', action)
    }
    if (typeof action !== 'string' || action === '' || answer.action !== action) {
      refuse('action', action)
    }
  }

  return { enabled, siteKey, assert }
}
