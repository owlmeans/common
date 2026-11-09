import { AuthenFailed } from '@owlmeans/auth'
import { PluginMissconfigured } from '@owlmeans/config'
import type { CaptchaPolicyModel, CaptchaPolicyRecord, CaptchaResponse } from './types.js'
import { policyUtils } from './utils/policy.js'

/**
 * The lenient policy of the reCAPTCHA sign-in plugin: every field of the record is optional, and an
 * empty one is no check (a checkbox answer without a score passes any score floor).
 */
export const makeCaptchaPolicyModel = (record: CaptchaPolicyRecord): CaptchaPolicyModel => {
  const { listOf, hostOf, hostAllowed } = policyUtils

  const hostnames = (): string[] => listOf(record.hostnames).map(hostOf).filter(host => host !== '')

  const minScore = (): number | null => {
    const value = record.minScore
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      return null
    }
    const score = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      throw new PluginMissconfigured('minScore')
    }

    return score
  }

  const actions = (): string[] => listOf(record.actions)

  const assert = (response: CaptchaResponse): void => {
    if (response.success !== true) {
      const codes = Array.isArray(response['error-codes']) ? response['error-codes'] : []
      throw new AuthenFailed('recaptcha:' + (codes.length > 0 ? codes.join(',') : 'unknown'))
    }

    const allowed = hostnames()
    if (allowed.length > 0 && !hostAllowed(allowed, response.hostname)) {
      throw new AuthenFailed('recaptcha:hostname')
    }

    const floor = minScore()
    if (floor != null && typeof response.score === 'number' && response.score < floor) {
      throw new AuthenFailed('recaptcha:score')
    }

    const named = actions()
    if (named.length > 0 && (typeof response.action !== 'string' || !named.includes(response.action))) {
      throw new AuthenFailed('recaptcha:action')
    }
  }

  return { record, hostnames, minScore, actions, assert }
}
